"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (result?.error) {
      setError("Couldn't sign you in — check your email and password.");
      return;
    }
    // /quiz itself redirects to /results if a profile already exists
    // (§11) — so this one target correctly routes both new and
    // returning users without this page needing to know which.
    window.location.href = "/quiz";
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="font-display text-h1 text-text-primary">Sign in</h1>
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="rounded-md border border-border bg-bg-surface px-3 py-2 text-text-primary"
        />
        {error && <p className="text-body-sm text-danger">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-2 font-body text-white"
        >
          Sign in
        </button>
      </form>
      <a href="/register" className="font-body text-body-sm text-accent">
        New here? Create an account
      </a>
    </main>
  );
}
