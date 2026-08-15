"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

// Groups consecutive same-role Messages under a single MIMIR label/avatar
// instead of repeating it per bubble.
export interface BubbleGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  role: "user" | "assistant";
}

export const BubbleGroup = React.forwardRef<HTMLDivElement, BubbleGroupProps>(
  ({ role, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5", role === "user" ? "items-end" : "items-start", className)}
      {...props}
    >
      {role === "assistant" && (
        <div className="flex items-center gap-1.5">
          <Image
            src="/mimir-avatar.png"
            alt=""
            width={40}
            height={40}
            className="h-4 w-4 rounded-full"
          />
          <span className="font-display text-body-sm text-accent">MIMIR</span>
        </div>
      )}
      <div className={cn("flex w-full flex-col gap-1", role === "user" ? "items-end" : "items-start")}>
        {children}
      </div>
    </div>
  )
);
BubbleGroup.displayName = "BubbleGroup";
