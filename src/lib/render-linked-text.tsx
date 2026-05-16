import React from "react";

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;

function isSafeUrl(url: string) {
  return /^(https?:\/\/|mailto:)/i.test(url);
}

/** Renders plain text, converting [label](url) markdown links into <a> elements. */
export function LinkedText({ value, className }: { value: string; className?: string }) {
  if (!value) return null;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  let key = 0;
  while ((match = LINK_RE.exec(value)) !== null) {
    const [full, label, url] = match;
    if (match.index > lastIndex) {
      nodes.push(value.slice(lastIndex, match.index));
    }
    if (isSafeUrl(url)) {
      nodes.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="underline text-primary hover:opacity-80"
        >
          {label}
        </a>,
      );
    } else {
      nodes.push(full);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return <span className={className}>{nodes}</span>;
}
