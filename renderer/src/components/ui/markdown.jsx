import React from "react";

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

export function MarkdownText({ text, className }) {
  if (!text) return null;
  const parts = [];
  let lastIndex = 0;
  let match;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    const [full, label, url] = match;
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <a
        key={`${label}-${match.index}`}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-amber hover:text-amber/80 underline underline-offset-2"
      >
        {label || url}
      </a>
    );
    lastIndex = match.index + full.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <span className={className}>{parts}</span>;
}
