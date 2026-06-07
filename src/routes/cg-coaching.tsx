import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/cg-coaching")({
  component: () => <Outlet />,
});
