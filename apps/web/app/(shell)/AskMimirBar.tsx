"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Global quick-ask entry point, centered in the top bar. Calls the same
 * /api/chat endpoint the results page's full Chat panel uses — chat
 * context is reconstructed fresh from Postgres per request (D2), keyed to
 * the user, not the page, so this works correctly from anywhere in the
 * shell, not just the results page. Answers surface in a small popover
 * under the bar rather than a full message history, which stays on the
 * results page's own Chat component.
 */
export function AskMimirBar() {
  const [input, setInput] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "MIMIR couldn't respond — try again.");
        setReply(null);
        setOpen(true);
        return;
      }

      setReply(data.reply);
      setOpen(true);
      setInput("");
    } catch {
      setError("MIMIR couldn't respond — try again.");
      setReply(null);
      setOpen(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex w-full max-w-md justify-center">
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
              void send();
            }
          }}
          placeholder="Ask MIMIR anything…"
          disabled={sending}
          className="min-w-0 flex-1 bg-transparent font-body text-body-sm text-text-primary outline-none placeholder:text-text-secondary"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="shrink-0 rounded-full px-3 py-1 font-body text-body-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {sending ? "…" : "Send"}
        </button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="MIMIR's answer"
          className="absolute left-1/2 top-full z-10 mt-2 w-full max-w-md -translate-x-1/2 rounded-lg p-4 shadow-lg"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="font-display text-body-sm text-accent">MIMIR</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="font-body text-body-sm text-text-secondary"
            >
              ✕
            </button>
          </div>
          {error ? (
            <p className="font-body text-body-sm text-danger">{error}</p>
          ) : (
            <p className="font-body text-body text-text-primary">{reply}</p>
          )}
        </div>
      )}
    </div>
  );
}
