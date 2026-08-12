"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Couldn't create your account — try again.");
        return;
      }

      // Registration doesn't establish a session on its own — sign in
      // immediately with the same credentials so the user lands straight
      // in the app shell instead of hitting a second manual step.
      const signInResult = await signIn("credentials", { email, password, redirect: false });
      if (signInResult?.error) {
        setError("Account created — sign in on the next screen.");
        window.location.href = "/login";
        return;
      }
      window.location.href = "/home";
    } catch {
      setError("Couldn't create your account — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-display text-h1 text-text-primary">Create your account</h1>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="rounded-md border border-border bg-bg-surface px-3 py-2 text-text-primary"
        />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          className="rounded-md border border-border bg-bg-surface px-3 py-2 text-text-primary"
        />
        {error && <p className="text-body-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-accent px-3 py-2 font-body text-body text-white disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
      <a href="/login" className="font-body text-body-sm text-accent">
        Already have an account? Sign in
      </a>
    </main>
  );
}
