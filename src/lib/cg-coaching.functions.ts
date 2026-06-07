import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/lib/admin.server";
import {
  listGroupTypes,
  listGroupsByType,
  listGroupLeaders,
  invalidateGroupsCache,
  type PcoGroup,
  type PcoGroupLeader,
} from "@/server/pco-groups.server";

async function assertCgCoach(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "cg_coach")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: CG Coach access required");
}

// ---- Config ----

export const getCgConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("cg_pco_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveCgConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ group_type_id: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { data: existing } = await supabaseAdmin
      .from("cg_pco_config")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = {
      group_type_id: data.group_type_id,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supabaseAdmin.from("cg_pco_config").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("cg_pco_config").insert(payload);
      if (error) throw new Error(error.message);
    }
    invalidateGroupsCache();
    return { ok: true };
  });

export const listPcoGroupTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCgCoach(context.supabase, context.userId);
    return listGroupTypes();
  });

// ---- Coaches ----

export const listCoaches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "cg_coach");
    const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
    if (ids.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    return (profs ?? [])
      .map((p: any) => ({ id: p.id, name: p.full_name || p.email || "Unknown" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// ---- Groups ----

export type CoachGroup = {
  id: string;
  name: string;
  coach_user_id: string | null;
  coach_name: string | null;
  leaders: PcoGroupLeader[];
};

export const listCoachGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refresh: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { data: cfg } = await context.supabase
      .from("cg_pco_config")
      .select("group_type_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.group_type_id) {
      return { configured: false, groups: [] as CoachGroup[] };
    }

    const [groups, { data: assignments }, { data: coachRoles }] = await Promise.all([
      listGroupsByType(cfg.group_type_id, { bypass_cache: data.refresh === true }),
      supabaseAdmin.from("cg_coach_assignments").select("group_id, coach_user_id"),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "cg_coach"),
    ]);

    const coachIds = Array.from(new Set((coachRoles ?? []).map((r: any) => r.user_id)));
    let coachNames: Record<string, string> = {};
    if (coachIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", coachIds);
      for (const p of (profs ?? []) as any[]) coachNames[p.id] = p.full_name || p.email || "Unknown";
    }

    const assignByGroup = new Map<string, string | null>();
    for (const a of (assignments ?? []) as any[]) assignByGroup.set(a.group_id, a.coach_user_id);

    // Fetch leaders in parallel
    const leadersByGroup = new Map<string, PcoGroupLeader[]>();
    await Promise.all(
      (groups as PcoGroup[]).map(async (g) => {
        try {
          const ls = await listGroupLeaders(g.id, { bypass_cache: data.refresh === true });
          leadersByGroup.set(g.id, ls);
        } catch {
          leadersByGroup.set(g.id, []);
        }
      }),
    );

    const result: CoachGroup[] = (groups as PcoGroup[]).map((g) => {
      const cid = assignByGroup.get(g.id) ?? null;
      return {
        id: g.id,
        name: g.name,
        coach_user_id: cid,
        coach_name: cid ? coachNames[cid] ?? null : null,
        leaders: leadersByGroup.get(g.id) ?? [],
      };
    });

    return { configured: true, groups: result };
  });

export const assignCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        group_id: z.string().min(1).max(50),
        group_name: z.string().max(255).nullable().optional(),
        coach_user_id: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    if (data.coach_user_id === null) {
      const { error } = await supabaseAdmin
        .from("cg_coach_assignments")
        .delete()
        .eq("group_id", data.group_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("cg_coach_assignments")
      .upsert(
        {
          group_id: data.group_id,
          group_name: data.group_name ?? null,
          coach_user_id: data.coach_user_id,
          assigned_by: context.userId,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: "group_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Touchpoints ----

export const logGroupTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        group_id: z.string().min(1).max(50),
        group_name: z.string().max(255).nullable().optional(),
        kind: z.enum(["text", "call", "email", "in_person", "other"]),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("cg_touchpoints")
      .insert({
        group_id: data.group_id,
        group_name: data.group_name ?? null,
        kind: data.kind,
        note: data.note ?? null,
        user_id: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listGroupTouchpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        group_id: z.string().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    let q = context.supabase
      .from("cg_touchpoints")
      .select("id, group_id, group_name, user_id, kind, note, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.group_id) q = q.eq("group_id", data.group_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let names: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) names[p.id] = p.full_name || p.email || "Unknown";
    }
    return (rows ?? []).map((r: any) => ({ ...r, user_name: names[r.user_id] ?? "Unknown" }));
  });

export const deleteGroupTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCgCoach(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("cg_touchpoints")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
