import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "./admin.server";
import { fetchCareList, pcoPing } from "@/server/pco.server";
import { listLeaderGroupsForPerson } from "@/server/pco-groups.server";

// Hard-coded to the owner of this hub. Serve Team Leaders Hub is scoped
// to a single staff account.
const OWNER_USER_ID = "3a7c1973-5fc6-4f2f-a129-31713fd24587"; // Matt Waldrep
const SERVE_LEADERS_LIST_ID = "4135471";

function assertOwner(userId: string) {
  if (userId !== OWNER_USER_ID) {
    throw new Error("Forbidden");
  }
}

export const listServeLeaders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refresh: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    assertOwner(context.userId);
    const people = await fetchCareList({
      list_id: SERVE_LEADERS_LIST_ID,
      field_ids: [],
      bypass_cache: data.refresh === true,
    });
    // Enrich each person with the groups they lead in PCO Groups.
    // Runs in parallel; failures for individual people don't block the list.
    const enriched = await Promise.all(
      people.map(async (p) => {
        const leader_groups = await listLeaderGroupsForPerson(p.id, {
          bypass_cache: data.refresh === true,
        }).catch(() => [] as string[]);
        return { ...p, leader_groups };
      }),
    );
    return { people: enriched };
  });


export const pingServeLeadersPco = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    assertOwner(context.userId);
    return pcoPing();
  });

export const logServeLeaderTouchpoint = createServerFn({ method: "POST" })
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
    assertOwner(context.userId);
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
      .from("serve_leader_touchpoints")
      .insert(insert)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listServeLeaderTouchpoints = createServerFn({ method: "POST" })
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
    assertOwner(context.userId);
    let q = context.supabase
      .from("serve_leader_touchpoints")
      .select("id, pco_person_id, person_name, user_id, kind, note, direction, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.pco_person_id) q = q.eq("pco_person_id", data.pco_person_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const userName = prof?.full_name || prof?.email || "You";
    return (rows ?? []).map((r: any) => ({ ...r, user_name: userName }));
  });

export const deleteServeLeaderTouchpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    assertOwner(context.userId);
    const { error } = await supabaseAdmin
      .from("serve_leader_touchpoints")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
