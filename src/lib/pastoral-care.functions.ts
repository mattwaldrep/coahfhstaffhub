import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "./admin.server";
import { fetchCareList, setFieldDatum, pcoPing, invalidateCareListCache, listFieldDefinitions } from "@/server/pco.server";

async function getTier(supabase: any, userId: string): Promise<"elder" | "candidate" | null> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["elder", "elder_candidate"]);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("elder")) return "elder";
  if (roles.includes("elder_candidate")) return "candidate";
  return null;
}

async function assertAccess(supabase: any, userId: string) {
  const tier = await getTier(supabase, userId);
  if (!tier) throw new Error("Forbidden: elder access required");
  return tier;
}

// ---- PCO config ----------------------------------------------------------

export const getPcoConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("elder_pco_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const savePcoConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        list_id: z.string().min(1).max(50),
        assigned_elder_field_id: z.string().min(1).max(50),
        spiritual_health_field_id: z.string().min(1).max(50),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    const { data: existing } = await supabaseAdmin
      .from("elder_pco_config")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const payload = { ...data, updated_by: context.userId, updated_at: new Date().toISOString() };
    if (existing?.id) {
      const { error } = await supabaseAdmin.from("elder_pco_config").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("elder_pco_config").insert(payload);
      if (error) throw new Error(error.message);
    }
    invalidateCareListCache();
    return { ok: true };
  });

export const pingPco = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden");
    return pcoPing();
  });

export const listPcoFieldDefinitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden");
    return listFieldDefinitions();
  });

// ---- Care list -----------------------------------------------------------

export const listCareList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refresh: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: cfg } = await context.supabase
      .from("elder_pco_config")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.list_id || !cfg?.assigned_elder_field_id || !cfg?.spiritual_health_field_id) {
      return { configured: false, people: [], fields: null };
    }
    const people = await fetchCareList({
      list_id: cfg.list_id,
      field_ids: [cfg.assigned_elder_field_id, cfg.spiritual_health_field_id],
      bypass_cache: data.refresh === true,
    });
    return {
      configured: true,
      fields: {
        assigned_elder: cfg.assigned_elder_field_id,
        spiritual_health: cfg.spiritual_health_field_id,
      },
      people,
    };
  });

export const updateSpiritualHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        person_id: z.string().min(1).max(50),
        datum_id: z.string().min(1).max(50).nullable().optional(),
        value: z.string().max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    const { data: cfg } = await context.supabase
      .from("elder_pco_config")
      .select("spiritual_health_field_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cfg?.spiritual_health_field_id) throw new Error("PCO not configured");
    await setFieldDatum({
      person_id: data.person_id,
      field_definition_id: cfg.spiritual_health_field_id,
      datum_id: data.datum_id ?? null,
      value: data.value,
    });
    return { ok: true };
  });

// ---- Notes ---------------------------------------------------------------

export const listPcoNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ pco_person_id: z.string().min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("pco_pastoral_notes")
      .select("*")
      .eq("pco_person_id", data.pco_person_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addPcoNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pco_person_id: z.string().min(1).max(50),
        body: z.string().min(1).max(10000),
        executive_session: z.boolean().optional(),
        meeting_id: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (data.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("pco_pastoral_notes").insert({
      pco_person_id: data.pco_person_id,
      body: data.body,
      executive_session: !!data.executive_session,
      meeting_id: data.meeting_id ?? null,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePcoNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    const { data: row } = await supabaseAdmin
      .from("pco_pastoral_notes")
      .select("executive_session, author_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.executive_session && tier !== "elder") throw new Error("Forbidden");
    const { error } = await supabaseAdmin.from("pco_pastoral_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Touchpoints ---------------------------------------------------------

export const logTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pco_person_id: z.string().min(1).max(50),
        person_name: z.string().max(200).nullable().optional(),
        kind: z.enum(["text", "call", "email", "in_person", "other"]),
        note: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("pco_touchpoints")
      .insert({
        pco_person_id: data.pco_person_id,
        person_name: data.person_name ?? null,
        kind: data.kind,
        note: data.note ?? null,
        user_id: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listTouchpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pco_person_id: z.string().min(1).max(50).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    let q = context.supabase
      .from("pco_touchpoints")
      .select("id, pco_person_id, person_name, user_id, kind, note, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.pco_person_id) q = q.eq("pco_person_id", data.pco_person_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let names: Record<string, string> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      for (const p of (profs ?? []) as any[]) {
        names[p.id] = p.full_name || p.email || "Unknown";
      }
    }
    return (rows ?? []).map((r: any) => ({ ...r, user_name: names[r.user_id] ?? "Unknown" }));
  });

export const deleteTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { error } = await supabaseAdmin
      .from("pco_touchpoints")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- My elder name -------------------------------------------------------

export const getMyElderName = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    return { full_name: (data?.full_name ?? "").trim() || null };
  });


// ---- Archive (unchanged) -------------------------------------------------

export const listArchive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("elder_meeting_archive")
      .select("id, meeting_date, meeting_type, title, attendees, source_url")
      .order("meeting_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getArchiveEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("elder_meeting_archive")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const importArchiveBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entries: z.array(
          z.object({
            meeting_date: z.string(),
            meeting_type: z.string().optional(),
            title: z.string().optional(),
            raw_text: z.string().optional(),
            agenda: z.any().optional(),
            action_items: z.any().optional(),
            attendees: z.any().optional(),
            source_url: z.string().optional(),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await getTier(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    const rows = data.entries.map((e) => ({
      meeting_date: e.meeting_date,
      meeting_type: e.meeting_type ?? "standard",
      title: e.title ?? null,
      raw_text: e.raw_text ?? null,
      source_url: e.source_url ?? null,
      agenda: (e.agenda ?? []) as any,
      action_items: (e.action_items ?? []) as any,
      attendees: (e.attendees ?? []) as any,
      imported_by: context.userId,
    }));
    const { error } = await supabaseAdmin.from("elder_meeting_archive").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
