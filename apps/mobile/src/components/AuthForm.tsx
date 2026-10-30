import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { loginRequestSchema, signupRequestSchema } from "@perq/shared";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/theme/ThemeProvider";
import { Button } from "./Button";
import { Screen } from "./Screen";
import { Text } from "./Text";
import { TextField, type TextInputRef } from "./TextField";

export function AuthForm({ mode }: { mode: "signIn" | "signUp" }) {
  const t = useTheme();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputRef>(null);
  const isSignUp = mode === "signUp";

  async function submit() {
    setError(null);
    const schema = isSignUp ? signupRequestSchema : loginRequestSchema;
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your details");
    setBusy(true);
    try {
      await (isSignUp ? signUp(parsed.data) : signIn(parsed.data));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["top", "bottom"]} contentStyle={{ paddingTop: t.spacing[16] }}>
      <Text variant="title">{isSignUp ? "Create your account" : "Welcome back"}</Text>
      <View style={{ gap: t.spacing[4] }}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={isSignUp ? "new-password" : "current-password"}
          textContentType={isSignUp ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {isSignUp ? (
          <Text variant="small" tone="muted">
            At least 8 characters.
          </Text>
        ) : null}
        {error ? (
          <Text variant="small" tone="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
      <Button label={isSignUp ? "Sign up" : "Sign in"} loading={busy} onPress={submit} />
      <Button
        kind="ghost"
        label={isSignUp ? "I already have an account" : "New here? Create an account"}
        onPress={() => router.replace(isSignUp ? "/sign-in" : "/sign-up")}
      />
      {/* TODO(handoff §0.6): Google sign-in needs native config beyond Expo Go. */}
    </Screen>
  );
}
