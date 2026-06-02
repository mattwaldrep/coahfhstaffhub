export { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getElderTier(
  supabase: any,
  userId: string
): Promise<"elder" | "candidate" | null> {
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

export async function assertElderAccess(supabase: any, userId: string) {
  const tier = await getElderTier(supabase, userId);
  if (!tier) throw new Error("Forbidden: elder access required");
  return tier;
}

export async function assertFullElder(supabase: any, userId: string) {
  const tier = await getElderTier(supabase, userId);
  if (tier !== "elder") throw new Error("Forbidden: full elder access required");
}
