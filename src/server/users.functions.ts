import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/require-auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ROLES = ["core", "meeting", "extended"] as const;
type Role = (typeof ROLES)[number];

async function assertCore(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: core role required");
}

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
    return (profiles ?? []).map((p: any) => ({
      ...p,
      roles: rolesByUser.get(p.id) ?? [],
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ userId: z.string().uuid(), role: z.enum(ROLES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertCore(context.supabase, context.userId);
    // Prevent removing the last core
    if (data.userId === context.userId) {
      // Allow user to change others; if changing self away from core, ensure another core exists
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "core");
      if ((count ?? 0) <= 1 && data.role !== "core") {
        throw new Error("Cannot remove the last core admin");
      }
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
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
