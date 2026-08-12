"use client";

import { useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * PRD §9.4 follow-up chat, embedded on the results page. DR7's visual
 * identity: user messages get a simple --bg-surface bubble (standard
 * convention, right-aligned); MIMIR's responses are unboxed text with a
 * small "MIMIR" label in the display font, --accent used sparingly on the
 * label only — reads as advice spoken directly, not a boxed chatbot
 * reply, per the brand tension (wisdom + Gen-Z voice, never a bank,
 * never generic bubble-chat).
 */
export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Post-outside-voice decision: explicit error, the failed turn is
        // not added to the visible history — the user's question stays in
        // the input box (restored below) so they can just retry.
        setError(data.error ?? "MIMIR couldn't respond — try again.");
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setError("MIMIR couldn't respond — try again.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <h2 className="font-display text-h2 text-text-primary">Ask MIMIR</h2>

      <div className="space-y-3">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p
                className="max-w-sm rounded-md px-3 py-2 font-body text-body text-text-primary"
                style={{ backgroundColor: "var(--bg-surface)" }}
              >
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i}>
              <p className="font-display text-body-sm text-accent">MIMIR</p>
              <p className="font-body text-body text-text-primary">{m.content}</p>
            </div>
          )
        )}
      </div>

      {error && <p className="font-body text-body-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Why not the travel card?"
          disabled={sending}
          className="flex-1 rounded-md border px-3 py-2 font-body text-body text-text-primary"
          style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-base)" }}
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="rounded-md bg-accent px-3 py-2 font-body text-body-sm text-white disabled:opacity-40"
        >
          {sending ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
