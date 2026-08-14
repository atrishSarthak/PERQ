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
    // /home is the app shell's landing page (sidebar + feature icons) —
    // navigating into Card Recommender from there is the user's choice,
    // not an automatic redirect.
    window.location.href = "/home";
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
      <div className="flex w-full max-w-sm items-center gap-3 text-text-secondary">
        <div className="h-px flex-1 bg-border" />
        <span className="text-body-sm">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/home" })}
        className="flex w-full max-w-sm items-center justify-center gap-2 rounded-md border border-border bg-bg-surface px-3 py-2 font-body text-text-primary"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
          />
          <path
            fill="#FBBC05"
            d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
          />
        </svg>
        Continue with Google
      </button>
      <a href="/register" className="font-body text-body-sm text-accent">
        New here? Create an account
      </a>
    </main>
  );
}
