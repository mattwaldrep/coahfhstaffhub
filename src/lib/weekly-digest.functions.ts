import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { format } from "date-fns";

type DigestResult = { paragraph: string; generated_at: string };

const cache = new Map<string, { paragraph: string; generated_at: string }>();

function dayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

export const getThisWeekDigest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DigestResult> => {
    const { supabase, userId } = context;

    const cacheKey = `${userId}:${dayKey()}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    // Role
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = new Set((roleRows ?? []).map((r: any) => r.role));
    const isElder = roles.has("elder") || roles.has("elder_candidate");

    // Profile for personalization
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();
    const name = (prof?.full_name ?? "").split(" ")[0] || "";

    const nowISO = new Date().toISOString();
    const in7ISO = new Date(Date.now() + 7 * 86400000).toISOString();
    const todayDate = format(new Date(), "yyyy-MM-dd");
    const in14Date = format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd");

    const facts: string[] = [];

    // Upcoming events (next 7 days)
    const { data: events } = await supabase
      .from("calendar_events")
      .select("title, start_at, sub_calendar")
      .gte("start_at", nowISO)
      .lte("start_at", in7ISO)
      .order("start_at", { ascending: true })
      .limit(15);
    if (events && events.length) {
      facts.push(
        `Upcoming events (next 7 days, ${events.length} total): ` +
          events
            .slice(0, 8)
            .map((e: any) => `${e.title} on ${format(new Date(e.start_at), "EEE MMM d p")}`)
            .join("; "),
      );
    }

    // My open action items
    const { data: myActions } = await supabase
      .from("action_items")
      .select("title, due_date")
      .eq("assignee_id", userId)
      .eq("completed", false)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10);
    if (myActions && myActions.length) {
      const overdue = myActions.filter((a: any) => a.due_date && a.due_date < todayDate).length;
      facts.push(
        `Your open action items (${myActions.length}${overdue ? `, ${overdue} overdue` : ""}): ` +
          myActions
            .slice(0, 6)
            .map((a: any) => `${a.title}${a.due_date ? ` (due ${a.due_date})` : ""}`)
            .join("; "),
      );
    }

    // Missions
    const { data: trips } = await supabase
      .from("mission_trips")
      .select("church_name, status, start_date, end_date")
      .in("status", ["in_field", "pre_trip"]);
    if (trips && trips.length) {
      const inField = trips.filter((t: any) => t.status === "in_field");
      const upcoming = trips.filter(
        (t: any) => t.status === "pre_trip" && t.start_date && t.start_date > todayDate && t.start_date <= in14Date,
      );
      if (inField.length)
        facts.push(`Missions teams currently in field: ${inField.map((t: any) => t.church_name).join(", ")}.`);
      if (upcoming.length)
        facts.push(
          `Mission teams arriving in next 14 days: ${upcoming
            .map((t: any) => `${t.church_name} (${t.start_date})`)
            .join(", ")}.`,
        );
    }

    // Elder-only facts
    if (isElder) {
      try {
        const { getPastoralGaps } = await import("@/lib/pastoral-gaps.functions");
        const r: any = await (getPastoralGaps as any)({ context });
        // Server-fn-as-function call may not work without proper context; fall back gracefully
        if (r?.gaps) {
          const reds = r.gaps.filter((g: any) => g.level === "red");
          const ambers = r.gaps.filter((g: any) => g.level === "amber");
          if (reds.length || ambers.length) {
            facts.push(
              `Pastoral attention: ${reds.length} people with no contact in 60+ days, ${ambers.length} approaching that threshold.`,
            );
          }
        }
      } catch {
        /* noop */
      }

      const { data: motions } = await supabase
        .from("elder_motions")
        .select("title, status")
        .in("status", ["proposed", "discussion", "voting"])
        .limit(5);
      if (motions && motions.length) {
        facts.push(`Open elder motions: ${motions.map((m: any) => `${m.title} (${m.status})`).join("; ")}.`);
      }
    }

    if (facts.length === 0) {
      const empty = {
        paragraph: "Quiet week ahead — no urgent events, action items, or alerts surfaced. Good time to plan further out.",
        generated_at: new Date().toISOString(),
      };
      cache.set(cacheKey, empty);
      return empty;
    }

    // AI call
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    if (!LOVABLE_API_KEY) {
      const fallback = { paragraph: facts.join(" "), generated_at: new Date().toISOString() };
      cache.set(cacheKey, fallback);
      return fallback;
    }

    const systemPrompt =
      "You are a concise pastoral assistant for City On A Hill church staff. Write a single warm paragraph (3-5 sentences, under 110 words) summarizing what this person should pay attention to THIS WEEK. Lead with the top priority. Be direct, never preachy or generic. Don't list items mechanically — synthesize them. Address the reader as 'you'.";
    const userPrompt = `Reader: ${name || "team member"}${isElder ? " (elder)" : ""}.\n\nFacts:\n- ${facts.join("\n- ")}\n\nWrite the paragraph now.`;

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 400,
        }),
      });
      if (!resp.ok) throw new Error(`AI ${resp.status}`);
      const json = await resp.json();
      const paragraph: string =
        json?.choices?.[0]?.message?.content?.trim() || facts.join(" ");
      const result = { paragraph, generated_at: new Date().toISOString() };
      cache.set(cacheKey, result);
      return result;
    } catch {
      const fallback = { paragraph: facts.join(" "), generated_at: new Date().toISOString() };
      cache.set(cacheKey, fallback);
      return fallback;
    }
  });

export const refreshThisWeekDigest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    cache.delete(`${context.userId}:${dayKey()}`);
    return { ok: true };
  });
