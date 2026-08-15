"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Both roles now render as boxed bubbles, color-coded by voice: MIMIR's
// replies in accent blue (the "MIMIR-attributed" color used everywhere
// else — the "✦ MIMIR:" label, narration), the user's own messages in
// gold, so the two voices are visually distinct at a glance.
const messageVariants = cva(
  "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 font-body text-body text-white",
  {
    variants: {
      role: {
        user: "self-end",
        assistant: "self-start",
      },
    },
    defaultVariants: { role: "assistant" },
  }
);

export interface MessageProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "role">,
    VariantProps<typeof messageVariants> {}

export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ className, role, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(messageVariants({ role }), className)}
      style={{
        backgroundColor: role === "user" ? "var(--gold)" : "var(--accent)",
        ...style,
      }}
      {...props}
    />
  )
);
Message.displayName = "Message";
