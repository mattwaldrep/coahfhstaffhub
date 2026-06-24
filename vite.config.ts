// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const prosemirrorPackages = [
  "prosemirror-changeset",
  "prosemirror-commands",
  "prosemirror-dropcursor",
  "prosemirror-gapcursor",
  "prosemirror-history",
  "prosemirror-inputrules",
  "prosemirror-keymap",
  "prosemirror-model",
  "prosemirror-schema-list",
  "prosemirror-state",
  "prosemirror-tables",
  "prosemirror-transform",
  "prosemirror-view",
];

export default defineConfig({
  vite: {
    resolve: {
      dedupe: prosemirrorPackages,
    },
    ssr: {
      noExternal: ["rrule"],
    },
    optimizeDeps: {
      include: ["rrule", ...prosemirrorPackages],
    },
  },
});
