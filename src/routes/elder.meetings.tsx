import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/elder/meetings")({
  component: () => <Outlet />,
});
