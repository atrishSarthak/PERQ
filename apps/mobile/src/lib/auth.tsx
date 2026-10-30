import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginRequest, PublicUser, SignupRequest } from "@perq/shared";
import { api, ApiError, onUnauthorized } from "./api";
import { clearToken, getToken, setToken } from "./session";
import { queryClient } from "./queryClient";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user: PublicUser | null;
  signIn: (body: LoginRequest) => Promise<void>;
  signUp: (body: SignupRequest) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<PublicUser | null>(null);

  const signOut = useCallback(async () => {
    await clearToken();
    queryClient.clear();
    setUser(null);
    setStatus("signedOut");
  }, []);

  useEffect(() => {
    onUnauthorized(() => void signOut());
    (async () => {
      if (!(await getToken())) return setStatus("signedOut");
      try {
        const { user } = await api.me();
        setUser(user);
        setStatus("signedIn");
      } catch (err) {
        // Offline at launch: keep the token, but show sign-in only if the
        // server actually rejected it.
        if (err instanceof ApiError && err.status === 401) return signOut();
        setStatus("signedOut");
      }
    })();
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      signOut,
      signIn: async (body) => {
        const res = await api.login(body);
        await setToken(res.token);
        setUser(res.user);
        setStatus("signedIn");
      },
      signUp: async (body) => {
        const res = await api.signup(body);
        await setToken(res.token);
        setUser(res.user);
        setStatus("signedIn");
      },
    }),
    [status, user, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
