"use client";

import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils";

export interface MessageScrollerProps
  extends React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> {
  // Change this value (e.g. messages.length) to trigger an auto-scroll to
  // the bottom, mirroring a chat transcript's usual behavior on new turns.
  autoScrollOn?: unknown;
}

export const MessageScroller = React.forwardRef<HTMLDivElement, MessageScrollerProps>(
  ({ className, children, autoScrollOn, ...props }, ref) => {
    const viewportRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      viewport.scrollTop = viewport.scrollHeight;
    }, [autoScrollOn]);

    return (
      <ScrollAreaPrimitive.Root
        ref={ref}
        className={cn("relative overflow-hidden", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport ref={viewportRef} className="h-full w-full">
          <div className="flex flex-col gap-4 p-4">{children}</div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.Scrollbar
          orientation="vertical"
          className="flex w-2 touch-none select-none p-0.5"
        >
          <ScrollAreaPrimitive.Thumb
            className="relative flex-1 rounded-full"
            style={{ backgroundColor: "var(--border)" }}
          />
        </ScrollAreaPrimitive.Scrollbar>
      </ScrollAreaPrimitive.Root>
    );
  }
);
MessageScroller.displayName = "MessageScroller";
