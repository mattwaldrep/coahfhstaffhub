import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "./admin.server";
import { fetchCareList, setFieldDatum, deleteFieldDatum, pcoPing, invalidateCareListCache, listFieldDefinitions, listFieldOptions, createPersonNote } from "@/server/pco.server";

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
        elevated_care_field_id: z.string().max(50).nullable().optional(),
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
    const payload: any = {
      list_id: data.list_id,
      assigned_elder_field_id: data.assigned_elder_field_id,
      spiritual_health_field_id: data.spiritual_health_field_id,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.elevated_care_field_id !== undefined) {
      payload.elevated_care_field_id = data.elevated_care_field_id || null;
    }
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
    // Elevated-care checkbox field: the trigger for the Escalated care section.
    // If no field has been picked yet, try to auto-detect a checkbox field on
    // the same tab named like "elevated care needed" and remember it.
    let elevatedFieldId: string | null = (cfg as any).elevated_care_field_id ?? null;
    if (!elevatedFieldId) {
      try {
        const defs = await listFieldDefinitions();
        const match = defs.find(
          (f) => /(escalated|elevated)\s*care/i.test(f.name) && (f.data_type ?? "").toLowerCase().includes("check"),
        );
        if (match) {
          elevatedFieldId = match.id;
          await supabaseAdmin.from("elder_pco_config").update({ elevated_care_field_id: elevatedFieldId }).eq("id", (cfg as any).id);
        }
      } catch {
        // best effort — fall back to crisis-tag behavior below
      }
    }
    const field_ids: string[] = [cfg.assigned_elder_field_id, cfg.spiritual_health_field_id];
    if (elevatedFieldId) field_ids.push(elevatedFieldId);
    const people = await fetchCareList({
      list_id: cfg.list_id,
      field_ids,
      bypass_cache: data.refresh === true,
    });
    let health_options: string[] = [];
    let options_ok = false;
    try {
      health_options = await listFieldOptions(cfg.spiritual_health_field_id);
      options_ok = true;
    } catch {
      health_options = [];
    }
    // Planning Center is the source of truth: drop any stored value whose tag
    // no longer exists in PCO so retired tags disappear from the app.
    const cleaned = options_ok && health_options.length > 0
      ? people.map((p) => {
          const cur = p.fields[cfg.spiritual_health_field_id!];
          if (!cur?.value || health_options.includes(cur.value)) return p;
          return {
            ...p,
            fields: { ...p.fields, [cfg.spiritual_health_field_id!]: { ...cur, value: null } },
          };
        })
      : people;
    return {
      configured: true,
      fields: {
        assigned_elder: cfg.assigned_elder_field_id,
        spiritual_health: cfg.spiritual_health_field_id,
        elevated_care: elevatedFieldId,
      },
      health_options,
      people: cleaned,
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

    // Push to PCO under "Shepherding Notes" category (elder-only in PCO).
    // Best-effort: if PCO push fails, we still record locally and surface a warning.
    let pcoWarning: string | null = null;
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", context.userId)
        .maybeSingle();
      const author = (prof?.full_name || prof?.email || "Staff Hub user").trim();
      const stamp = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
      const prefix = `[Staff Hub — ${author} • ${stamp}${data.executive_session ? " • Executive session" : ""}]`;
      const result = await createPersonNote({
        person_id: data.pco_person_id,
        body: `${prefix}\n\n${data.body}`,
        category_name: "Shepherding Notes",
      });
      if (!result.ok) pcoWarning = result.error ?? "Failed to write PCO note";
    } catch (e: any) {
      pcoWarning = e?.message ?? "Failed to write PCO note";
    }

    const { error } = await supabaseAdmin.from("pco_pastoral_notes").insert({
      pco_person_id: data.pco_person_id,
      body: data.body,
      executive_session: !!data.executive_session,
      meeting_id: data.meeting_id ?? null,
      author_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true, pco_warning: pcoWarning };
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
        direction: z.enum(["outbound", "inbound"]).nullable().optional(),
        created_at: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.supabase, context.userId);
    const insert: any = {
      pco_person_id: data.pco_person_id,
      person_name: data.person_name ?? null,
      kind: data.kind,
      note: data.note ?? null,
      user_id: context.userId,
    };
    if (data.direction) insert.direction = data.direction;
    if (data.created_at) insert.created_at = data.created_at;
    const { data: row, error } = await supabaseAdmin
      .from("pco_touchpoints")
      .insert(insert)
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

// ---- Secondary elder assignments -----------------------------------------

export const listSecondaryElders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccess(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("pco_care_assignments")
      .select("pco_person_id, secondary_elder");
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    for (const r of data ?? []) {
      if ((r as any).secondary_elder) map[(r as any).pco_person_id] = (r as any).secondary_elder;
    }
    return map;
  });

export const setSecondaryElder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      pco_person_id: z.string().min(1).max(50),
      secondary_elder: z.string().max(200).nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    if (!data.secondary_elder) {
      const { error } = await supabaseAdmin
        .from("pco_care_assignments")
        .delete()
        .eq("pco_person_id", data.pco_person_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("pco_care_assignments")
      .upsert({
        pco_person_id: data.pco_person_id,
        secondary_elder: data.secondary_elder,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEscalatedCare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      person_id: z.string().min(1).max(50),
      datum_id: z.string().min(1).max(50).nullable().optional(),
      checked: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const tier = await assertAccess(context.supabase, context.userId);
    if (tier !== "elder") throw new Error("Forbidden: full elder required");
    const { data: cfg } = await context.supabase
      .from("elder_pco_config")
      .select("elevated_care_field_id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fieldId = (cfg as any)?.elevated_care_field_id as string | null;
    if (!fieldId) throw new Error("Escalated care field not configured");
    if (data.checked) {
      const opts = await listFieldOptions(fieldId);
      const value = opts[0] ?? "true";
      await setFieldDatum({ person_id: data.person_id, field_definition_id: fieldId, datum_id: data.datum_id ?? null, value });
    } else if (data.datum_id) {
      await deleteFieldDatum(data.datum_id);
    }
    return { ok: true };
  });
