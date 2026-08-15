"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Both roles render as boxed bubbles, color-coded by voice: MIMIR's
// replies in accent blue (the "MIMIR-attributed" color used everywhere
// else — the "✦ MIMIR:" label, narration), the user's own messages in
// gold, so the two voices are visually distinct at a glance.
const messageVariants = cva("max-w-[85%] rounded-lg px-3 py-2 font-body text-body text-white", {
  variants: {
    role: {
      user: "self-end",
      assistant: "self-start",
    },
  },
  defaultVariants: { role: "assistant" },
});

// MIMIR's replies are real Markdown (headings, bold, lists — Gemini writes
// them that way on its own) — rendering `content` as plain text left the
// raw `###`/`**`/`*` syntax visible. These overrides keep every element
// legible against the bubble's solid color background (white text
// throughout, tight spacing so it still reads like a chat bubble rather
// than a rendered document).
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-2 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-bold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-1.5 mt-2 font-display text-body-lg font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1.5 mt-2 font-display text-body-lg font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1.5 mt-2 font-body text-body font-bold first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
      {children}
    </a>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code
      className="rounded px-1 py-0.5 font-mono text-body-sm"
      style={{ backgroundColor: "rgba(0,0,0,0.2)" }}
    >
      {children}
    </code>
  ),
};

export interface MessageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role" | "children">,
    VariantProps<typeof messageVariants> {
  content: string;
}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, role, style, content, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(messageVariants({ role }), className)}
      style={{
        backgroundColor: role === "user" ? "var(--gold)" : "var(--accent)",
        ...style,
      }}
      {...props}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
);
Message.displayName = "Message";
