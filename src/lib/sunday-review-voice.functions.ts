import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({
  audioBase64: z.string().min(100).max(20_000_000),
  mimeType: z.string().min(3).max(100),
  currentForm: z.object({
    worship_notes: z.string().max(4000),
    confession_notes: z.string().max(4000),
    connect_notes: z.string().max(4000),
    sermon_notes: z.string().max(4000),
    wins: z.string().max(4000),
    opportunities: z.string().max(4000),
  }),
});

type AiResult = {
  worship_notes?: string;
  confession_notes?: string;
  connect_notes?: string;
  sermon_notes?: string;
  wins?: string;
  opportunities?: string;
  tasks?: Array<{ title: string; notes?: string }>;
};

function mimeToFormat(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  return "webm";
}

export const processSundayReviewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { supabase, userId } = context;

    const systemPrompt = `You are an assistant for a church staff member filling out their Sunday Service Review form. The user will speak freeform notes about the service. Listen carefully and:

1. Categorize their feedback into the correct form sections.
2. Extract any concrete follow-up tasks (e.g. "the sound board freaked out" -> task to diagnose sound board issue).

Form sections:
- worship_notes: thoughts on the musical worship
- confession_notes: thoughts on the call to worship / confession
- connect_notes: thoughts on the connect moment / core values / ministry highlight
- sermon_notes: thoughts on the sermon
- wins: things that went well
- opportunities: opportunities for improvement

Rules:
- Only include sections the user actually spoke about. Leave others as empty string.
- Write in clean prose (not bullet lists), faithful to what they said, gently cleaned up. Don't invent details.
- For tasks: only include actionable items needing follow-up. Title should be short and imperative ("Diagnose sound board issue"). Notes can add brief context.
- If they didn't mention anything actionable, return empty tasks array.

Respond with ONLY a JSON object matching this shape:
{ "worship_notes": "", "confession_notes": "", "connect_notes": "", "sermon_notes": "", "wins": "", "opportunities": "", "tasks": [{"title": "...", "notes": "..."}] }`;

    const existingContext = Object.entries(data.currentForm)
      .filter(([, v]) => v.trim().length > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const userText = existingContext
      ? `Existing notes already in the form (don't duplicate, but you may expand/refine):\n${existingContext}\n\nTranscribe and process the audio.`
      : "Transcribe and process the attached audio note.";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "input_audio",
                input_audio: { data: data.audioBase64, format: mimeToFormat(data.mimeType) },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error("AI gateway error", aiResp.status, errText);
      if (aiResp.status === 429) throw new Error("Rate limit exceeded. Try again in a moment.");
      if (aiResp.status === 402) throw new Error("AI credits exhausted. Please add credits.");
      throw new Error(`Voice processing failed (${aiResp.status})`);
    }

    const payload = await aiResp.json();
    const content: string = payload?.choices?.[0]?.message?.content ?? "{}";
    let parsed: AiResult = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    // Insert tasks
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.filter((t) => t?.title?.trim()) : [];
    const createdTasks: Array<{ id: string; title: string }> = [];
    if (tasks.length > 0) {
      const rows = tasks.slice(0, 20).map((t) => ({
        title: t.title.trim().slice(0, 500),
        notes: t.notes ? `${t.notes.trim().slice(0, 2000)}\n\n(From Sunday Review voice note)` : "From Sunday Review voice note",
        created_by: userId,
        assignee_id: userId,
      }));
      const { data: inserted, error } = await supabase
        .from("action_items")
        .insert(rows)
        .select("id,title");
      if (error) {
        console.error("Task insert error", error);
      } else if (inserted) {
        createdTasks.push(...inserted);
      }
    }

    return {
      fields: {
        worship_notes: parsed.worship_notes ?? "",
        confession_notes: parsed.confession_notes ?? "",
        connect_notes: parsed.connect_notes ?? "",
        sermon_notes: parsed.sermon_notes ?? "",
        wins: parsed.wins ?? "",
        opportunities: parsed.opportunities ?? "",
      },
      createdTasks,
    };
  });
