import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { metricsClient } from "./client";

export function useMetricsSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    metricsClient.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = metricsClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}
