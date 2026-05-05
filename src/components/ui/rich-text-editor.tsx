import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { useEffect } from "react";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote, Link as LinkIcon, Undo, Redo, Heading2,
} from "lucide-react";
import { MentionList, type MentionUser } from "./mention-list";

type Props = {
  value: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  /** When provided, enables @-mention with this user list. */
  mentionUsers?: MentionUser[];
};

/** Pull all mention assignments out of an HTML string produced by this editor. */
export function extractMentions(html: string): { assignee_id: string; title: string }[] {
  if (!html || !html.includes("data-mention-id")) return [];
  if (typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out: { assignee_id: string; title: string }[] = [];
  // Walk through text nodes & mention spans in order, grouping by paragraph/list-item
  doc.querySelectorAll("p, li, blockquote, h2, h3").forEach((block) => {
    const mentions = block.querySelectorAll<HTMLElement>("[data-mention-id]");
    mentions.forEach((m) => {
      const id = m.getAttribute("data-mention-id");
      if (!id) return;
      // Capture text after the mention until next mention or end of block
      let task = "";
      let node: Node | null = m.nextSibling;
      while (node) {
        if (node instanceof HTMLElement && node.hasAttribute("data-mention-id")) break;
        task += node.textContent ?? "";
        node = node.nextSibling;
      }
      task = task.replace(/\s+/g, " ").trim();
      // Strip leading punctuation
      task = task.replace(/^[:\-–—,;.\s]+/, "").trim();
      if (task) out.push({ assignee_id: id, title: task.slice(0, 500) });
    });
  });
  return out;
}

export function RichTextEditor({
  value, onChange, onBlur, placeholder, className, minHeight = 96, mentionUsers,
}: Props) {
  const extensions: any[] = [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "underline text-[oklch(0.55_0.15_280)]" } }),
    Placeholder.configure({ placeholder: placeholder ?? "Write…" }),
  ];

  if (mentionUsers) {
    extensions.push(
      Mention.configure({
        HTMLAttributes: {
          class:
            "inline-block px-1 rounded bg-[oklch(0.55_0.15_280)]/15 text-[oklch(0.55_0.15_280)] font-medium",
        },
        renderHTML({ options, node }) {
          return [
            "span",
            {
              ...options.HTMLAttributes,
              "data-mention-id": node.attrs.id,
              "data-mention-label": node.attrs.label ?? node.attrs.id,
            },
            `@${node.attrs.label ?? node.attrs.id}`,
          ];
        },
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase();
            return mentionUsers
              .filter((u) => u.name.toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q))
              .slice(0, 8);
          },
          render: () => {
            let component: ReactRenderer | null = null;
            let popup: TippyInstance[] = [];
            return {
              onStart: (props: any) => {
                component = new ReactRenderer(MentionList, { props, editor: props.editor });
                if (!props.clientRect) return;
                popup = tippy("body", {
                  getReferenceClientRect: props.clientRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: "manual",
                  placement: "bottom-start",
                });
              },
              onUpdate: (props: any) => {
                component?.updateProps(props);
                if (!props.clientRect) return;
                popup[0]?.setProps({ getReferenceClientRect: props.clientRect });
              },
              onKeyDown: (props: any) => {
                if (props.event.key === "Escape") {
                  popup[0]?.hide();
                  return true;
                }
                return (component?.ref as any)?.onKeyDown?.(props) ?? false;
              },
              onExit: () => {
                popup[0]?.destroy();
                component?.destroy();
              },
            };
          },
        },
      }),
    );
  }

  const editor = useEditor({
    extensions,
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold",
        style: `min-height:${minHeight}px`,
      },
    },
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    onBlur: ({ editor }) => onBlur?.(editor.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && !editor.isFocused) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  const Btn = ({ active, onClick, title, children }: any) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-1 rounded hover:bg-background ${active ? "bg-background text-foreground" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );

  return (
    <div className={`border border-border rounded-md bg-background ${className ?? ""}`}>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border flex-wrap">
        <Btn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></Btn>
        <Btn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></Btn>
        <span className="w-px h-4 bg-border mx-1" />
        <Btn title="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-3.5 h-3.5" /></Btn>
        <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></Btn>
        <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></Btn>
        <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></Btn>
        <Btn
          title="Link"
          active={editor.isActive("link")}
          onClick={() => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt("URL", prev ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </Btn>
        <span className="w-px h-4 bg-border mx-1" />
        <Btn title="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo className="w-3.5 h-3.5" /></Btn>
        <Btn title="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo className="w-3.5 h-3.5" /></Btn>
        {mentionUsers && (
          <span className="text-[10px] text-muted-foreground ml-2">Type @ to assign a task</span>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Render rich text HTML safely-ish (TipTap output is sanitized HTML). */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_a]:text-[oklch(0.55_0.15_280)] [&_a]:underline [&_[data-mention-id]]:text-[oklch(0.55_0.15_280)] [&_[data-mention-id]]:font-medium ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
