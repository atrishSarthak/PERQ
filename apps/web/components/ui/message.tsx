"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// DR7's visual identity, ported from the old Chat.tsx: user messages get a
// simple --bg-surface bubble (right-aligned); MIMIR's responses are
// unboxed text — reads as advice spoken directly, not a boxed chatbot
// reply.
const messageVariants = cva("max-w-[85%] whitespace-pre-wrap font-body text-body text-text-primary", {
  variants: {
    role: {
      user: "self-end rounded-lg px-3 py-2",
      assistant: "self-start",
    },
  },
  defaultVariants: { role: "assistant" },
});

export interface MessageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role">,
    VariantProps<typeof messageVariants> {}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, role, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(messageVariants({ role }), className)}
      style={role === "user" ? { backgroundColor: "var(--bg-surface-2)", ...style } : style}
      {...props}
    />
  )
);
Message.displayName = "Message";
