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
