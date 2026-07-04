import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";

async function assertCore(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: core role required");
}

export type SubCalendarRow = {
  id: string;
  key: string;
  name: string;
  color_token: string;
  sort_order: number;
  is_active: boolean;
  source: "system" | "pco_team" | "custom";
  pco_group_id: string | null;
  owner_user_id: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
};

export const listSubCalendars = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubCalendarRow[]> => {
    const { data, error } = await context.supabase
      .from("calendar_sub_calendars")
      .select("*, owner:profiles!owner_user_id(id, full_name, email)")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      color_token: r.color_token,
      sort_order: r.sort_order,
      is_active: r.is_active,
      source: r.source,
      pco_group_id: r.pco_group_id,
      owner_user_id: r.owner_user_id,
      owner_name: r.owner?.full_name ?? null,
      owner_email: r.owner?.email ?? null,
    }));
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/).optional(),
  name: z.string().min(1).max(120),
  color_token: z.string().min(1).max(120),
  sort_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
  owner_user_id: z.string().uuid().nullable().optional(),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `sub_${Date.now().toString(36)}`;
}

export const createSubCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.key ?? slugify(data.name);
    const { data: row, error } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .insert({
        key,
        name: data.name,
        color_token: data.color_token,
        sort_order: data.sort_order ?? 100,
        is_active: data.is_active ?? true,
        owner_user_id: data.owner_user_id ?? null,
        source: "custom",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateSubCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      color_token: z.string().min(1).max(120).optional(),
      sort_order: z.number().int().min(0).max(9999).optional(),
      is_active: z.boolean().optional(),
      owner_user_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSubCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .select("key, source")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Not found");
    if (row.source === "system") throw new Error("System sub-calendars can't be deleted; deactivate instead.");
    const { count } = await supabaseAdmin
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("sub_calendar", row.key);
    if ((count ?? 0) > 0) {
      throw new Error(`Can't delete — ${count} event(s) still use this sub-calendar. Reassign them first.`);
    }
    const { error } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSubCalendarSuggestions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCore(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("calendar_sub_calendar_suggestions")
      .select("*")
      .eq("dismissed", false)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Filter out any already-approved (pco_group_id already exists in sub_calendars)
    const groupIds = (data ?? []).map((r: any) => r.pco_group_id);
    if (groupIds.length === 0) return [];
    const { data: existing } = await context.supabase
      .from("calendar_sub_calendars")
      .select("pco_group_id")
      .in("pco_group_id", groupIds);
    const taken = new Set((existing ?? []).map((r: any) => r.pco_group_id).filter(Boolean));
    return (data ?? []).filter((r: any) => !taken.has(r.pco_group_id));
  });

export const approveSubCalendarSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      pco_group_id: z.string().min(1),
      name: z.string().min(1).max(120),
      color_token: z.string().min(1).max(120).default("var(--cal-general)"),
      owner_user_id: z.string().uuid().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = `pco_${data.pco_group_id}`;
    const { data: row, error } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .insert({
        key,
        name: data.name,
        color_token: data.color_token,
        source: "pco_team",
        pco_group_id: data.pco_group_id,
        owner_user_id: data.owner_user_id ?? null,
        sort_order: 200,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("calendar_sub_calendar_suggestions")
      .update({ dismissed: true })
      .eq("pco_group_id", data.pco_group_id);
    return row;
  });

export const dismissSubCalendarSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pco_group_id: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("calendar_sub_calendar_suggestions")
      .update({ dismissed: true })
      .eq("pco_group_id", data.pco_group_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertSubCalendarSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      groups: z.array(z.object({
        pco_group_id: z.string().min(1),
        group_name: z.string().min(1).max(200),
      })).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    if (data.groups.length === 0) return { ok: true, count: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = data.groups.map((g) => ({
      pco_group_id: g.pco_group_id,
      group_name: g.group_name,
      last_seen_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin
      .from("calendar_sub_calendar_suggestions")
      .upsert(rows, { onConflict: "pco_group_id" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const listStaffProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// Palette of default colors auto-assigned to newly synced serve team sub-calendars.
const AUTO_COLOR_PALETTE = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f43f5e", "#ef4444",
  "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#6366f1",
  "#a855f7", "#d946ef", "#78716c", "#64748b", "#0f766e",
];

/**
 * Auto-create a sub-calendar for every Serve Team led by someone in the
 * Serve Leaders list. Existing sub-calendars (by pco_group_id) are left
 * untouched — this is additive.
 */
export const syncServeTeamSubCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCore(context.supabase, context.userId);
    const { fetchCareList } = await import("@/server/pco.server");
    const { listLeaderServeTeamsForPerson } = await import("@/server/pco-groups.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Serve Leaders list — same list ID used by the Serve Leaders module.
    const SERVE_LEADERS_LIST_ID = "4135471";
    const people = await fetchCareList({
      list_id: SERVE_LEADERS_LIST_ID,
      field_ids: [],
      bypass_cache: true,
    });

    // Collect unique { id, name } across all leaders.
    const teams = new Map<string, string>();
    for (const p of people) {
      try {
        const groups = await listLeaderServeTeamsForPerson(String(p.id));
        for (const g of groups) {
          if (!teams.has(g.id)) teams.set(g.id, g.name);
        }
      } catch (e) {
        // Individual leader failures don't block the sync.
        console.error("[sync-teams] person error", p.id, e);
      }
    }

    if (teams.size === 0) {
      return { ok: true, created: 0, skipped: 0, total: 0 };
    }

    // Find existing pco_team sub-calendars so we skip them.
    const groupIds = Array.from(teams.keys());
    const { data: existing } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .select("pco_group_id")
      .in("pco_group_id", groupIds);
    const taken = new Set((existing ?? []).map((r: any) => r.pco_group_id).filter(Boolean));

    const toInsert: any[] = [];
    let colorIdx = 0;
    // Seed color rotation from current count so new syncs don't all start blue.
    const { count: currentCount } = await supabaseAdmin
      .from("calendar_sub_calendars")
      .select("id", { count: "exact", head: true });
    colorIdx = (currentCount ?? 0) % AUTO_COLOR_PALETTE.length;

    for (const [gid, name] of teams) {
      if (taken.has(gid)) continue;
      toInsert.push({
        key: `pco_${gid}`,
        name,
        color_token: AUTO_COLOR_PALETTE[colorIdx % AUTO_COLOR_PALETTE.length],
        source: "pco_team",
        pco_group_id: gid,
        sort_order: 200,
        is_active: true,
      });
      colorIdx++;
    }

    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin
        .from("calendar_sub_calendars")
        .insert(toInsert);
      if (error) throw new Error(error.message);
    }

    // Clean up any lingering suggestions for teams we just created (or already had).
    await supabaseAdmin
      .from("calendar_sub_calendar_suggestions")
      .update({ dismissed: true })
      .in("pco_group_id", groupIds);

    return {
      ok: true,
      created: toInsert.length,
      skipped: teams.size - toInsert.length,
      total: teams.size,
    };
  });

