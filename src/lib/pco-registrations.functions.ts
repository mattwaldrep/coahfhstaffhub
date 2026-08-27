import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

export type PcoSignupQueueItem = {
  signup_time_id: string;
  signup_id: string;
  name: string;
  description: string | null;
  registration_url: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  session_index: number;
  session_count: number;
  status: "new" | "imported" | "dismissed";
  event_id: string | null;
  sub_calendar: string | null;
};

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["core", "meeting"]);
  if (!data || data.length === 0) throw new Error("Forbidden: staff role required");
}

/**
 * Pull every upcoming Planning Center sign-up session, tag it with whether it's
 * already on our calendar (or dismissed), and refresh linked events so PCO stays
 * the source of truth for title / time / location.
 */
export const listPcoSignupQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refresh: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<PcoSignupQueueItem[]> => {
    await assertStaff(context.supabase, context.userId);
    const { fetchUpcomingSignupSessions } = await import("@/server/pco-registrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sessions = await fetchUpcomingSignupSessions({ bypass_cache: !!data.refresh });
    const ids = sessions.map((s) => s.signup_time_id);

    const [{ data: linked }, { data: ignored }] = await Promise.all([
      supabaseAdmin
        .from("calendar_events")
        .select("id, sub_calendar, pco_signup_time_id, title, start_at, end_at, location")
        .not("pco_signup_time_id", "is", null),
      supabaseAdmin.from("pco_signup_ignores").select("signup_time_id"),
    ]);

    const linkedMap = new Map((linked ?? []).map((e: any) => [e.pco_signup_time_id as string, e]));
    const ignoredSet = new Set((ignored ?? []).map((r: any) => r.signup_time_id as string));

    // Keep linked events in sync with Planning Center.
    for (const s of sessions) {
      const ev = linkedMap.get(s.signup_time_id);
      if (!ev) continue;
      const title = titleFor(s);
      const patch: {
        title?: string;
        start_at?: string;
        end_at?: string | null;
        location?: string;
        pco_synced_at?: string;
      } = {};
      if (ev.title !== title) patch.title = title;
      if (ev.start_at !== s.starts_at) patch.start_at = s.starts_at;
      if ((ev.end_at ?? null) !== (s.ends_at ?? null)) patch.end_at = s.ends_at;
      if (s.location && ev.location !== s.location) patch.location = s.location;
      if (Object.keys(patch).length > 0) {
        patch.pco_synced_at = new Date().toISOString();
        await supabaseAdmin.from("calendar_events").update(patch).eq("id", ev.id);
      }
    }

    void ids;
    return sessions.map((s) => {
      const ev = linkedMap.get(s.signup_time_id);
      return {
        ...s,
        status: ev ? "imported" : ignoredSet.has(s.signup_time_id) ? "dismissed" : "new",
        event_id: ev?.id ?? null,
        sub_calendar: ev?.sub_calendar ?? null,
      } as PcoSignupQueueItem;
    });
  });

function titleFor(s: { name: string; session_index: number; session_count: number }) {
  return s.session_count > 1 ? `${s.name} (${s.session_index} of ${s.session_count})` : s.name;
}

export const importPcoSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        signup_time_ids: z.array(z.string().min(1)).min(1).max(100),
        sub_calendar: z.string().min(1).max(64),
        category: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { fetchUpcomingSignupSessions } = await import("@/server/pco-registrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sessions = await fetchUpcomingSignupSessions();
    const wanted = new Set(data.signup_time_ids);
    const picked = sessions.filter((s) => wanted.has(s.signup_time_id));
    if (picked.length === 0) return { imported: 0 };

    const { data: existing } = await supabaseAdmin
      .from("calendar_events")
      .select("pco_signup_time_id")
      .in("pco_signup_time_id", [...wanted]);
    const already = new Set((existing ?? []).map((r: any) => r.pco_signup_time_id as string));

    const rows = picked
      .filter((s) => !already.has(s.signup_time_id))
      .map((s) => ({
        title: titleFor(s),
        description: s.description,
        start_at: s.starts_at,
        end_at: s.ends_at,
        all_day: s.all_day,
        location: s.location,
        sub_calendar: data.sub_calendar,
        category: data.category ?? null,
        pco_registration: true,
        pco_signup_id: s.signup_id,
        pco_signup_time_id: s.signup_time_id,
        pco_signup_url: s.registration_url,
        pco_synced_at: new Date().toISOString(),
        created_by: context.userId,
      }));

    if (rows.length === 0) return { imported: 0 };
    const { error } = await supabaseAdmin.from("calendar_events").insert(rows);
    if (error) throw new Error(error.message);

    // An imported session is no longer "dismissed".
    await supabaseAdmin.from("pco_signup_ignores").delete().in("signup_time_id", [...wanted]);
    return { imported: rows.length };
  });

export const dismissPcoSignups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        signup_time_ids: z.array(z.string().min(1)).min(1).max(200),
        dismissed: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { fetchUpcomingSignupSessions } = await import("@/server/pco-registrations.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.dismissed) {
      const { error } = await supabaseAdmin
        .from("pco_signup_ignores")
        .delete()
        .in("signup_time_id", data.signup_time_ids);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const sessions = await fetchUpcomingSignupSessions();
    const byId = new Map(sessions.map((s) => [s.signup_time_id, s]));
    const rows = data.signup_time_ids
      .map((id) => {
        const s = byId.get(id);
        if (!s) return null;
        return {
          signup_time_id: id,
          signup_id: s.signup_id,
          signup_name: s.name,
          ignored_by: context.userId,
        };
      })
      .filter(Boolean) as any[];
    if (rows.length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("pco_signup_ignores")
      .upsert(rows, { onConflict: "signup_time_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Unlink an event from its sign-up (keeps the event, stops syncing). */
export const unlinkPcoSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("calendar_events")
      .update({ pco_signup_id: null, pco_signup_time_id: null, pco_synced_at: null })
      .eq("id", data.event_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
