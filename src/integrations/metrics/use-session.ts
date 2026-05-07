// Metrics is now backed by a server-side export endpoint, so there is no
// per-user session anymore. This hook returns a stable truthy sentinel for
// backwards compatibility with existing components that gated on a session.
export function useMetricsSession() {
  return { user: { email: "metrics-export" } } as const;
}
