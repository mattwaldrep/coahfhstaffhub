import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "core" | "meeting" | "extended" | "elder" | "elder_candidate" | "cg_coach" | "deacon" | "chair_of_deacons";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  hasStaffAccess: boolean;
  hasElderAccess: boolean;
  isFullElder: boolean;
  isCgCoach: boolean;
  hasDeaconAccess: boolean;
  isChairOfDeacons: boolean;
  isDeaconOnly: boolean;
  hasElderHubAccess: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STAFF_ROLES: AppRole[] = ["core", "meeting", "extended"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadRoles(data.session.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadRoles(userId: string) {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  }

  const hasStaffAccess = roles.some((r) => STAFF_ROLES.includes(r));
  const hasElderAccess = roles.includes("elder") || roles.includes("elder_candidate");
  const isFullElder = roles.includes("elder");
  const isCgCoach = roles.includes("cg_coach");

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    roles,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    hasRole: (r) => roles.includes(r),
    hasAnyRole: (rs) => rs.some((r) => roles.includes(r)),
    hasStaffAccess,
    hasElderAccess,
    isFullElder,
    isCgCoach,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
