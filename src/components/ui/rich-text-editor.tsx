import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  Bold, Italic, Strikethrough, List, ListOrdered, Quote, Link as LinkIcon, Undo, Redo, Heading2,
} from "lucide-react";

type Props = {
  value: string;
  onChange?: (html: string) => void;
  onBlur?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
};

export function RichTextEditor({ value, onChange, onBlur, placeholder, className, minHeight = 96 }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "underline text-[oklch(0.55_0.15_280)]" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Write…" }),
    ],
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

  // Keep editor content in sync when external value changes (e.g. realtime update)
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Render rich text HTML safely-ish (TipTap output is sanitized HTML). */
export function RichTextView({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={`prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_a]:text-[oklch(0.55_0.15_280)] [&_a]:underline ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
