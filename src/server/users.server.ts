import { supabaseAdmin } from "@/integrations/supabase/client.server";

export { supabaseAdmin };

export async function assertCore(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "core")
    .maybeSingle();
  if (error || !data) throw new Error("Forbidden: core role required");
}
