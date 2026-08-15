"use client";

import { createContext, useCallback, useContext, useState } from "react";

export interface MimirChatMessage {
  role: "user" | "assistant" | "error";
  content: string;
}

interface MimirChatContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: MimirChatMessage[];
  sending: boolean;
  send: (text: string) => Promise<void>;
}

const MimirChatContext = createContext<MimirChatContextValue | null>(null);

/**
 * Shell-wide MIMIR chat state, shared by the top bar's quick-ask input and
 * the right side panel that opens on first send — one conversation, two
 * entry points. Calls the same /api/chat endpoint the old per-page Chat
 * component used; server-side context is reconstructed fresh per request
 * (D2), so this works the same from any page under the shell.
 */
export function MimirChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MimirChatMessage[]>([]);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setOpen(true);
      setSending(true);
      setMessages((prev) => [...prev, { role: "user", content: trimmed }]);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            { role: "error", content: data.error ?? "MIMIR couldn't respond — try again." },
          ]);
          return;
        }

        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "error", content: "MIMIR couldn't respond — try again." },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  return (
    <MimirChatContext.Provider value={{ open, setOpen, messages, sending, send }}>
      {children}
    </MimirChatContext.Provider>
  );
}

export function useMimirChat() {
  const ctx = useContext(MimirChatContext);
  if (!ctx) throw new Error("useMimirChat must be used within a MimirChatProvider");
  return ctx;
}
