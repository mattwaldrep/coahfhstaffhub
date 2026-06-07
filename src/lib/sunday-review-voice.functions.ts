import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ratingSchema = z.number().int().min(1).max(5).nullable();

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
  currentRatings: z.object({
    worship_rating: ratingSchema,
    confession_rating: ratingSchema,
    connect_rating: ratingSchema,
    sermon_rating: ratingSchema,
  }),
});

type AiResult = {
  worship_notes?: string;
  confession_notes?: string;
  connect_notes?: string;
  sermon_notes?: string;
  wins?: string;
  opportunities?: string;
  worship_rating?: number | null;
  confession_rating?: number | null;
  connect_rating?: number | null;
  sermon_rating?: number | null;
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

function clampRating(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r;
}

export const processSundayReviewVoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { supabase, userId } = context;

    const systemPrompt = `You are an assistant helping a church staff member fill out their Sunday Service Review form from a voice ramble. Listen carefully and:

1. Categorize feedback into the correct form sections.
2. Infer a 1-5 rating for each section the user gave any qualitative signal about.
3. Extract concrete follow-up tasks.

Form sections (each has free-text notes; the first four also have a 1-5 rating):
- worship (musical worship)
- confession (call to worship / confession)
- connect (connect moment / core values / ministry highlight)
- sermon
- wins: things that went well overall
- opportunities: opportunities for improvement overall

CRITICAL writing rules for notes:
- DO NOT transcribe the user verbatim. The user is rambling stream-of-consciousness; your job is to distill.
- Write tight, concise bullet-style observations in clean prose. Strip filler ("um", "you know", "I think maybe"), false starts, repetition, and tangents.
- 1-3 short sentences per section. Punchy and actionable. Third-person staff-note voice (e.g. "Band tight on the second song; transition into the bridge dragged"), not first-person ramble.
- Only include sections the user actually spoke about. Leave others as empty string.
- Don't invent details or sentiment the user didn't express.

Rating rules (1=poor, 2=below average, 3=solid, 4=great, 5=outstanding):
- Only set a rating when the user gave a clear qualitative signal (e.g. "worship was awesome" → 5; "sermon was solid but the intro dragged" → 4; "confession felt flat" → 2). If they didn't comment evaluatively on a section, leave its rating null.
- If they explicitly said a number ("I'd give the sermon a 4"), use that.

Task rules:
- Only actionable follow-ups (e.g. "sound board freaked out" → "Diagnose sound board issue"). Imperative short title. Empty array if nothing actionable.

Respond with ONLY a JSON object:
{
  "worship_notes": "", "confession_notes": "", "connect_notes": "", "sermon_notes": "",
  "wins": "", "opportunities": "",
  "worship_rating": null, "confession_rating": null, "connect_rating": null, "sermon_rating": null,
  "tasks": [{"title": "...", "notes": "..."}]
}`;

    const existingNotes = Object.entries(data.currentForm)
      .filter(([, v]) => v.trim().length > 0)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const existingRatings = Object.entries(data.currentRatings)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");

    const contextParts: string[] = [];
    if (existingNotes) contextParts.push(`Existing notes (don't duplicate; you may refine):\n${existingNotes}`);
    if (existingRatings) contextParts.push(`Existing ratings already set (don't overwrite unless user clearly re-rates):\n${existingRatings}`);
    const userText = contextParts.length
      ? `${contextParts.join("\n\n")}\n\nTranscribe and process the audio.`
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
      ratings: {
        worship_rating: clampRating(parsed.worship_rating),
        confession_rating: clampRating(parsed.confession_rating),
        connect_rating: clampRating(parsed.connect_rating),
        sermon_rating: clampRating(parsed.sermon_rating),
      },
      createdTasks,
    };
  });
