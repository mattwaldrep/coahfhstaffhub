import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { assertCore, supabaseAdmin } from "@/server/users.server";

const ROLES = ["core", "meeting", "extended", "elder", "elder_candidate"] as const;
type Role = (typeof ROLES)[number];


export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCore(context.supabase, context.userId);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, avatar_url, created_at"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const rolesByUser = new Map<string, Role[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });
    // Fetch last_sign_in_at from auth.users (paginate)
    const lastSignInByUser = new Map<string, string | null>();
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;
      data.users.forEach((u: any) => lastSignInByUser.set(u.id, u.last_sign_in_at ?? null));
      if (!data.users.length || data.users.length < 1000) break;
      page += 1;
    }
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
      last_sign_in_at: lastSignInByUser.get(p.id) ?? null,
    }));
  });

const STAFF_ROLES = ["core", "meeting", "extended"] as const;
const DEACON_ROLES = ["deacon", "chair_of_deacons"] as const;

export const setUserDeaconTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["none", "deacon", "chair_of_deacons"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .in("role", [...DEACON_ROLES]);
    if (data.tier !== "none") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.tier });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const ELDER_ROLES = ["elder", "elder_candidate"] as const;

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), role: z.enum(STAFF_ROLES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    if (data.userId === context.userId) {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "core");
      if ((count ?? 0) <= 1 && data.role !== "core") {
        throw new Error("Cannot remove the last core admin");
      }
    }
    // Remove only staff roles, preserve elder roles
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .in("role", [...STAFF_ROLES]);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserElderTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        tier: z.enum(["none", "elder", "elder_candidate"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .in("role", [...ELDER_ROLES]);
    if (data.tier !== "none") {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.tier });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const setUserCgCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("role", "cg_coach");
    if (data.enabled) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "cg_coach" });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(ROLES),
        fullName: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    // Check if a user with this email already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();

    if (existingProfile?.id) {
      // Already a user — just (re)assign the role
      await supabaseAdmin.from("user_roles").delete().eq("user_id", existingProfile.id);
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: existingProfile.id, role: data.role });
      if (roleErr) throw new Error(roleErr.message);
      return { ok: true, alreadyExisted: true };
    }

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { full_name: data.fullName ?? data.email } },
    );
    if (error) {
      // Friendlier error if the user already exists in auth but not in profiles
      if (/already.*registered|already.*exists/i.test(error.message)) {
        throw new Error("A user with that email already exists. Adjust their role from the list instead.");
      }
      throw new Error(error.message);
    }
    const newId = invited.user?.id;
    if (newId) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
      await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role });
    }
    return { ok: true };
  });

export const bulkInviteUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        invites: z
          .array(
            z.object({
              email: z.string().email(),
              role: z.enum(ROLES),
              fullName: z.string().optional(),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    const results: { email: string; status: "invited" | "updated" | "error"; message?: string }[] = [];

    for (const inv of data.invites) {
      try {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .ilike("email", inv.email)
          .maybeSingle();

        if (existingProfile?.id) {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", existingProfile.id);
          const { error: roleErr } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: existingProfile.id, role: inv.role });
          if (roleErr) throw new Error(roleErr.message);
          results.push({ email: inv.email, status: "updated" });
          continue;
        }

        const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
          inv.email,
          { data: { full_name: inv.fullName ?? inv.email } },
        );
        if (error) throw new Error(error.message);
        const newId = invited.user?.id;
        if (newId) {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
          await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: inv.role });
        }
        results.push({ email: inv.email, status: "invited" });
      } catch (e: any) {
        results.push({ email: inv.email, status: "error", message: e?.message ?? "Failed" });
      }
    }

    return { results };
  });

export const removeUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("You cannot remove yourself");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

