"use client";

import Image from "next/image";
import { useState } from "react";
import { MessageScroller } from "@/components/ui/message-scroller";
import { BubbleGroup } from "@/components/ui/bubble-group";
import { Message } from "@/components/ui/message";
import { useMimirChat, type MimirChatMessage } from "./MimirChatContext";

/**
 * Right-side chat panel, opened by MimirChatContext on the first message
 * sent from the top bar. Has its own input for continued back-and-forth —
 * the top bar's AskMimirBar is just the entry point, not the only way to
 * send a message once the conversation is going.
 */
export function MimirChatPanel() {
  const { open, setOpen, messages, sending, send } = useMimirChat();
  const [input, setInput] = useState("");

  async function handleSend() {
    const text = input;
    setInput("");
    await send(text);
  }

  if (!open) return null;

  const groups = groupMessages(messages);

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "rgba(0,0,0,0.3)" }}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-label="Chat with MIMIR"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col shadow-xl"
        style={{ backgroundColor: "var(--bg-surface)", borderLeft: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Image
              src="/mimir-avatar.png"
              alt=""
              width={64}
              height={64}
              className="h-7 w-7 rounded-full"
            />
            <p className="font-display text-h2 text-text-primary">MIMIR</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            className="font-body text-body-sm text-text-secondary"
          >
            ✕
          </button>
        </div>

        <MessageScroller className="flex-1" autoScrollOn={messages.length}>
          {groups.length === 0 ? (
            <p className="font-body text-body-sm text-text-secondary">
              Ask MIMIR anything about your results.
            </p>
          ) : (
            groups.map((group, i) => {
              if (group.role === "error") {
                return (
                  <p key={i} className="font-body text-body-sm text-danger">
                    {group.messages[0]!.content}
                  </p>
                );
              }
              const role = group.role;
              return (
                <BubbleGroup key={i} role={role}>
                  {group.messages.map((m, j) => (
                    <Message key={j} role={role}>
                      {m.content}
                    </Message>
                  ))}
                </BubbleGroup>
              );
            })
          )}
          {sending && (
            <p className="font-body text-body-sm text-text-secondary">MIMIR is thinking…</p>
          )}
        </MessageScroller>

        <div className="flex gap-2 border-t border-border p-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Why not the travel card?"
            disabled={sending}
            className="flex-1 rounded-md border px-3 py-2 font-body text-body text-text-primary"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-base)" }}
          />
          <button
            onClick={() => void handleSend()}
            disabled={sending || !input.trim()}
            className="rounded-md bg-accent px-3 py-2 font-body text-body-sm text-white disabled:opacity-40"
          >
            {sending ? "…" : "Send"}
          </button>
        </div>
      </aside>
    </>
  );
}

function groupMessages(messages: MimirChatMessage[]) {
  const groups: { role: MimirChatMessage["role"]; messages: MimirChatMessage[] }[] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.role === m.role && m.role !== "error") {
      last.messages.push(m);
    } else {
      groups.push({ role: m.role, messages: [m] });
    }
  }
  return groups;
}
