"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { parseSSEStream } from "../quiz/parseSSEStream";

export interface MimirChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

interface MimirChatContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: MimirChatMessage[];
  sending: boolean;
  // True only for the gap between sending and the first chunk (or error)
  // arriving — MimirChatPanel shows "MIMIR is thinking…" for this window,
  // then switches to the growing reply bubble once streaming actually
  // starts. Distinct from `sending`, which stays true for the whole
  // request (guards against a second send while one is in flight).
  awaitingReply: boolean;
  send: (text: string) => Promise<void>;
}

const MimirChatContext = createContext<MimirChatContextValue | null>(null);

/**
 * Shell-wide MIMIR chat state, shared by the top bar's quick-ask input and
 * the right side panel that opens on first send — one conversation, two
 * entry points. Calls the same /api/chat endpoint the old per-page Chat
 * component used; server-side context is reconstructed fresh per request
 * (D2), so this works the same from any page under the shell.
 *
 * /api/chat streams its reply via SSE (same `data: {...}\n\n` framing as
 * the quiz-submit route, reusing its parser) so the reply appears
 * word-by-word rather than all at once — the server already has the full
 * Gemini response before it starts emitting (Gemini's own tool-calling
 * loop isn't itself streamed, see the route's comment), but the client
 * experience reads the same as a live-streaming reply.
 */
export function MimirChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MimirChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [awaitingReply, setAwaitingReply] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setOpen(true);
      setSending(true);
      setAwaitingReply(true);
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setMessages((prev) => [
            ...prev,
            { role: "error", content: data.error ?? "MIMIR couldn't respond — try again." },
          ]);
          return;
        }

        let replyStarted = false;
        for await (const event of parseSSEStream(res.body)) {
          const e = event as { type: string; text?: string; message?: string };
          if (e.type === "chunk" && e.text) {
            if (!replyStarted) {
              replyStarted = true;
              setAwaitingReply(false);
              setMessages((prev) => [...prev, { role: "assistant", content: e.text! }]);
            } else {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1]!;
                next[next.length - 1] = { ...last, content: last.content + e.text };
                return next;
              });
            }
          } else if (e.type === "error") {
            setMessages((prev) => [
              ...prev,
              { role: "error", content: e.message ?? "MIMIR couldn't respond — try again." },
            ]);
          }
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "error", content: "MIMIR couldn't respond — try again." },
        ]);
      } finally {
        setSending(false);
        setAwaitingReply(false);
      }
    },
    [sending]
  );

  return (
    <MimirChatContext.Provider value={{ open, setOpen, messages, sending, awaitingReply, send }}>
      {children}
    </MimirChatContext.Provider>
  );
}

export function useMimirChat() {
  const ctx = useContext(MimirChatContext);
  if (!ctx) throw new Error("useMimirChat must be used within a MimirChatProvider");
  return ctx;
}
