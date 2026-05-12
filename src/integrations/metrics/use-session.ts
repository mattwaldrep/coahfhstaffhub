// Metrics is now backed by a server-side export endpoint, so there is no
// per-user session anymore. This hook returns a stable truthy sentinel for
// backwards compatibility with existing components that gated on a session.
//
// IMPORTANT: must return the SAME reference on every call. Returning a fresh
// object literal causes any useEffect that depends on the session to re-run
// every render, producing an infinite fetch/setState loop that freezes the page.
const SESSION = { user: { email: "metrics-export" } } as const;

export function useMetricsSession() {
  return SESSION;
}
