import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { assertMeetingRole, resolveSince } from "./pco-forms.server";

export type ConnectCardField = { label: string; value: string };

export type ConnectCardSubmission = {
  id: string;
  submitted_by: string | null;
  created_at: string;
  photos: string[];
  fields: ConnectCardField[];
};

export type ConnectCardsResponse = {
  submissions: ConnectCardSubmission[];
  since: string;
  sinceLabel: string;
  error?: string;
};

/**
 * Interpret the raw `checked_items` jsonb rows stored by the Sunday Ops
 * form renderer: photo items carry uploaded image URLs, everything else
 * is a label/answer pair.
 */
function parseCheckedItems(raw: unknown): { photos: string[]; fields: ConnectCardField[] } {
  const photos: string[] = [];
  const fields: ConnectCardField[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, any>;
    if (it.type === "photo") {
      const urls = Array.isArray(it.urls) ? it.urls : [];
      for (const u of urls) if (typeof u === "string" && u) photos.push(u);
      continue;
    }
    const label = String(it.label ?? it.question ?? "Field");
    const rawValue =
      it.value ?? it.answer ?? it.text ??
      (Array.isArray(it.selected) ? it.selected.join(", ") : it.selected) ??
      "";
    const value = String(rawValue).trim();
    if (value) fields.push({ label, value });
  }
  return { photos, fields };
}

export const listConnectCardSubmissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ meetingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConnectCardsResponse> => {
    await assertMeetingRole(context.supabase, context.userId);
    const { since, sinceLabel } = await resolveSince(data.meetingId);

    const rawUrl = process.env.SUNDAY_OPS_CONNECT_CARDS_URL;
    if (!rawUrl) {
      return {
        submissions: [],
        since,
        sinceLabel,
        error: "Connect card endpoint not configured yet.",
      };
    }
    const secret = process.env.STAFF_HUB_SHARED_SECRET;
    if (!secret) {
      return { submissions: [], since, sinceLabel, error: "Sunday Ops shared secret not configured." };
    }

    try {
      const u = new URL(rawUrl);
      u.searchParams.delete("since");
      u.searchParams.set("since", since);
      const res = await fetch(u.toString(), {
        method: "GET",
        headers: { "x-shared-secret": secret },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Sunday Ops ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      const submissions: ConnectCardSubmission[] = (json?.submissions ?? []).map((s: any) => {
        const { photos, fields } = parseCheckedItems(s?.checked_items);
        return {
          id: String(s?.id ?? ""),
          submitted_by: s?.submitted_by ?? null,
          created_at: s?.created_at ?? "",
          photos,
          fields,
        };
      });
      return { submissions, since, sinceLabel };
    } catch (e: any) {
      return {
        submissions: [],
        since,
        sinceLabel,
        error: e?.message ?? "Failed to load connect card submissions.",
      };
    }
  });
