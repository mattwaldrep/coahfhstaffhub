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

export async function isChairOfDeacons(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "chair_of_deacons")
    .maybeSingle();
  return !!data;
}

export async function hasDeaconAccess(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["deacon", "chair_of_deacons"]);
  return (data ?? []).length > 0;
}

export type ElderHubAccess = {
  tier: "elder" | "candidate" | null;
  deacon: boolean;
  chair: boolean;
  /** True when the user is a deacon (or chair) with no elder access at all. */
  deaconOnly: boolean;
};

export async function assertElderHubAccess(supabase: any, userId: string): Promise<ElderHubAccess> {
  const tier = await getElderTier(supabase, userId);
  if (tier) return { tier, deacon: false, chair: false, deaconOnly: false };
  const deacon = await hasDeaconAccess(supabase, userId);
  if (!deacon) throw new Error("Forbidden: elder hub access required");
  const chair = await isChairOfDeacons(supabase, userId);
  return { tier: null, deacon: true, chair, deaconOnly: true };
}

export async function assertJointEditAccess(supabase: any, userId: string) {
  const tier = await getElderTier(supabase, userId);
  if (tier === "elder") return "elder" as const;
  if (await isChairOfDeacons(supabase, userId)) return "chair" as const;
  throw new Error("Forbidden: full elder or chair of deacons required");
}
