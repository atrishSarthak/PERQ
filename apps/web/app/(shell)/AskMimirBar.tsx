"use client";

import Image from "next/image";
import { useState } from "react";
import { useMimirChat } from "./mimir/MimirChatContext";

/**
 * Global quick-ask entry point, centered in the top bar. Sending a message
 * here opens the shared MimirChatPanel (right side of the shell) and the
 * conversation continues there — this bar doesn't hold its own reply UI.
 */
export function AskMimirBar() {
  const [input, setInput] = useState("");
  const { send, sending } = useMimirChat();

  async function handleSend() {
    const text = input;
    setInput("");
    await send(text);
  }

  return (
    <div className="flex w-full max-w-md justify-center">
      <div
        className="flex w-full items-center gap-2 rounded-full py-1 pl-1.5 pr-2"
        style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
      >
        <Image
          src="/mimir-avatar.png"
          alt=""
          width={64}
          height={64}
          className="h-7 w-7 shrink-0 rounded-full"
        />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask MIMIR anything…"
          disabled={sending}
          className="min-w-0 flex-1 bg-transparent font-body text-body-sm text-text-primary outline-none placeholder:text-text-secondary"
        />
        <button
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-full px-3 py-1 font-body text-body-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
