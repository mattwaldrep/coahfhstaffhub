import { createFileRoute, redirect } from "@tanstack/react-router";

// The Planning Center calendar beta is now the main calendar at /calendar.
// Keep this route as a redirect so existing bookmarks keep working.
export const Route = createFileRoute("/calendar_/pco")({
  beforeLoad: ({ search }) => {
    const s = search as Record<string, unknown>;
    throw redirect({
      to: "/calendar",
      search: {
        instance: typeof s.instance === "string" ? s.instance : undefined,
        month: typeof s.month === "string" ? s.month : undefined,
      },
      replace: true,
    });
  },
  component: () => null,
});
