import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/elder/motions")({
  component: () => <Outlet />,
});
