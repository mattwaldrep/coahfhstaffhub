import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { useEffect } from "react";
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, List, ListOrdered, Quote,
  Link as LinkIcon, Undo, Redo, Heading2, Heading3, Code, Minus,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Highlighter, Palette, Eraser,
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
  doc.querySelectorAll("p, li, blockquote, h2, h3").forEach((block) => {
    const mentions = block.querySelectorAll<HTMLElement>("[data-mention-id]");
    mentions.forEach((m) => {
      const id = m.getAttribute("data-mention-id");
      if (!id) return;
      let task = "";
      let node: Node | null = m.nextSibling;
      while (node) {
        if (node instanceof HTMLElement && node.hasAttribute("data-mention-id")) break;
        task += node.textContent ?? "";
        node = node.nextSibling;
      }
      task = task.replace(/\s+/g, " ").trim();
      task = task.replace(/^[:\-–—,;.\s]+/, "").trim();
      if (task) out.push({ assignee_id: id, title: task.slice(0, 500) });
    });
  });
  return out;
}

const PRESET_COLORS = [
  "#0f172a", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];
const PRESET_HIGHLIGHTS = [
  "#fef08a", "#fed7aa", "#fecaca", "#bbf7d0", "#bae6fd", "#ddd6fe", "#fbcfe8",
];

const EDITOR_CONTENT_CLASS =
  "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-sm " +
  "[&_p]:my-1 " +
  "[&_ul]:my-1 [&_ul]:pl-6 [&_ul]:list-disc " +
  "[&_ol]:my-1 [&_ol]:pl-6 [&_ol]:list-decimal " +
  "[&_li]:my-0.5 [&_li>p]:my-0 " +
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 " +
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground " +
  "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs " +
  "[&_hr]:my-3 [&_hr]:border-border " +
  "[&_u]:underline";

export function RichTextEditor({
  value, onChange, onBlur, placeholder, className, minHeight = 96, mentionUsers,
}: Props) {
  const extensions: any[] = [
    StarterKit.configure({ heading: { levels: [2, 3] } }),
    Underline,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
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
        class: EDITOR_CONTENT_CLASS,
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

  const Btn = ({ active, onClick, title, children, disabled }: any) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`p-1 rounded hover:bg-background disabled:opacity-40 disabled:hover:bg-transparent ${active ? "bg-background text-foreground" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );

  const Sep = () => <span className="w-px h-4 bg-border mx-1" />;

  return (
    <div className={`border border-border rounded-md bg-background ${className ?? ""}`}>
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border flex-wrap">
        <Btn title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-3.5 h-3.5" /></Btn>
        <Btn title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-3.5 h-3.5" /></Btn>
        <Btn title="Underline (Ctrl+U)" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon className="w-3.5 h-3.5" /></Btn>
        <Btn title="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="w-3.5 h-3.5" /></Btn>
        <Btn title="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}><Code className="w-3.5 h-3.5" /></Btn>
        <Sep />
        <Btn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-3.5 h-3.5" /></Btn>
        <Btn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-3.5 h-3.5" /></Btn>
        <Btn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-3.5 h-3.5" /></Btn>
        <Btn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-3.5 h-3.5" /></Btn>
        <Btn title="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-3.5 h-3.5" /></Btn>
        <Btn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-3.5 h-3.5" /></Btn>
        <Sep />
        <Btn title="Align left" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft className="w-3.5 h-3.5" /></Btn>
        <Btn title="Align center" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter className="w-3.5 h-3.5" /></Btn>
        <Btn title="Align right" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight className="w-3.5 h-3.5" /></Btn>
        <Btn title="Justify" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify className="w-3.5 h-3.5" /></Btn>
        <Sep />
        <div className="relative group">
          <Btn title="Text color"><Palette className="w-3.5 h-3.5" /></Btn>
          <div className="absolute z-50 hidden group-hover:flex hover:flex top-full left-0 mt-0.5 p-1.5 bg-background border border-border rounded shadow-lg gap-1 flex-wrap w-[140px]">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().setColor(c).run()}
                className="w-5 h-5 rounded border border-border"
                style={{ background: c }}
                title={c}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetColor().run()}
              className="text-[10px] px-1 py-0.5 rounded hover:bg-muted w-full text-left text-muted-foreground"
            >
              Clear color
            </button>
          </div>
        </div>
        <div className="relative group">
          <Btn title="Highlight" active={editor.isActive("highlight")}><Highlighter className="w-3.5 h-3.5" /></Btn>
          <div className="absolute z-50 hidden group-hover:flex hover:flex top-full left-0 mt-0.5 p-1.5 bg-background border border-border rounded shadow-lg gap-1 flex-wrap w-[140px]">
            {PRESET_HIGHLIGHTS.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                className="w-5 h-5 rounded border border-border"
                style={{ background: c }}
                title={c}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().unsetHighlight().run()}
              className="text-[10px] px-1 py-0.5 rounded hover:bg-muted w-full text-left text-muted-foreground"
            >
              Clear highlight
            </button>
          </div>
        </div>
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
        <Btn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser className="w-3.5 h-3.5" /></Btn>
        <Sep />
        <Btn title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo className="w-3.5 h-3.5" /></Btn>
        <Btn title="Redo (Ctrl+Shift+Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo className="w-3.5 h-3.5" /></Btn>
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
      className={
        "prose prose-sm max-w-none " +
        "[&_p]:my-1 " +
        "[&_ul]:my-1 [&_ul]:pl-6 [&_ul]:list-disc " +
        "[&_ol]:my-1 [&_ol]:pl-6 [&_ol]:list-decimal " +
        "[&_li]:my-0.5 [&_li>p]:my-0 " +
        "[&_h2]:text-base [&_h2]:font-semibold " +
        "[&_h3]:text-sm [&_h3]:font-semibold " +
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic " +
        "[&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs " +
        "[&_u]:underline " +
        "[&_a]:text-[oklch(0.55_0.15_280)] [&_a]:underline " +
        "[&_[data-mention-id]]:text-[oklch(0.55_0.15_280)] [&_[data-mention-id]]:font-medium " +
        (className ?? "")
      }
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
