import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Switch, View } from "react-native";
import { router, Stack } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useQueryClient } from "@tanstack/react-query";
import { formatInr } from "@perq/finance-engine";
import { TXN_CATEGORY_LABELS, type StatementDraft } from "@perq/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ChoiceRow } from "@/components/Choice";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Notice } from "@/components/Notice";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { moneyApi } from "@/lib/moneyApi";
import { API_URL } from "@/lib/config";
import { getRememberedPassword, listRemembered, rememberPassword, type RememberedPassword } from "@/lib/statementPasswords";
import { useTheme } from "@/theme/ThemeProvider";

// Statement upload (handoff §10.2): consent (first time) → pick PDF →
// password → Ember narration → review → confirm. The PDF is read into memory
// as base64, the picker's temporary copy is deleted straight away, and the
// password is only kept if the user asks (Keychain, this phone only).

const SHOW_SAMPLES = __DEV__ || process.env.EXPO_PUBLIC_DEMO === "true";
const SAMPLE_LABELS = { A: "HDFC", B: "SBI", C: "Axis" } as const;
const SAMPLE_PASSWORDS = { A: "ARJU1503", B: "PRIY2208", C: "ROHA0510" } as const;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

type Phase = "loading" | "consent" | "pick" | "password" | "working" | "review" | "saved";
const MAX_BYTES = 3 * 1024 * 1024;

export default function Upload() {
  const t = useTheme();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("loading");
  const [fileName, setFileName] = useState<string | null>(null);
  const pdfRef = useRef<string | null>(null); // base64, memory only
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [remembered, setRemembered] = useState<RememberedPassword[]>([]);
  const [steps, setSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<StatementDraft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    moneyApi
      .consents()
      .then((c) => setPhase(c.current.statements ? "pick" : "consent"))
      .catch(() => setPhase("consent"));
    listRemembered().then(setRemembered);
    return () => {
      pdfRef.current = null;
    };
  }, []);

  async function pick() {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > MAX_BYTES) return setError("That file is over 3 MB. Statements are usually much smaller.");
    try {
      if (Platform.OS === "web") {
        // Web preview: the picker hands back a data: URI (no file on disk).
        pdfRef.current = asset.uri.slice(asset.uri.indexOf(",") + 1);
      } else {
        const file = new File(asset.uri);
        try {
          pdfRef.current = await file.base64();
        } finally {
          try {
            file.delete(); // don't leave the statement in the app's cache
          } catch {}
        }
      }
    } catch {
      return setError("Couldn't open that file. Try picking it again.");
    }
    setFileName(asset.name);
    setPhase("password");
  }

  // Dev/demo only: fetch a SYNTHETIC statement from the server so the flow
  // can be tried without saving a file to the phone first.
  async function useSample(layout: "A" | "B" | "C") {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/demo/fixtures?layout=${layout}`);
      if (!res.ok) throw new Error("Sample statements are only available in demo mode.");
      pdfRef.current = toBase64(new Uint8Array(await res.arrayBuffer()));
      setFileName(`Sample statement ${layout} (synthetic) · password ${SAMPLE_PASSWORDS[layout]}`);
      setPhase("password");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function read(pw: string) {
    if (!pdfRef.current) return setPhase("pick");
    setSteps([]);
    setError(null);
    setPhase("working");
    try {
      await moneyApi.parseStatement(pdfRef.current, pw || undefined, (e) => {
        if (e.type === "step") setSteps((s) => [...s, e.label]);
        if (e.type === "draft") {
          setDraft(e.draft);
          setPhase("review");
        }
        if (e.type === "error") {
          setError(e.message);
          setPhase(e.code === "bad_password" || e.code === "password_required" ? "password" : "pick");
        }
      });
    } catch (err) {
      setError((err as Error).message);
      setPhase("pick");
    }
  }

  async function confirm(edits: Record<string, unknown>) {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await moneyApi.confirmStatement({ parseToken: draft.parseToken, edits });
      if (remember && password && draft.summary.last4) {
        await rememberPassword(
          { id: `${draft.summary.issuer ?? "card"}-${draft.summary.last4}`, label: `${draft.match.catalogueCardName ?? draft.summary.cardName ?? draft.summary.issuer} ·${draft.summary.last4}` },
          password
        );
      }
      pdfRef.current = null;
      setPassword("");
      await qc.invalidateQueries();
      setPhase("saved");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.colors.bg }} contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[16] }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Upload a statement" }} />
      {error ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      {phase === "loading" ? <Text tone="muted">One moment…</Text> : null}

      {phase === "consent" ? (
        <ConsentStep
          onAgree={async () => {
            setBusy(true);
            await moneyApi.giveConsent("statements", true).catch(() => {});
            setBusy(false);
            setPhase("pick");
          }}
          busy={busy}
        />
      ) : null}

      {phase === "pick" ? (
        <View style={{ gap: t.spacing[4] }}>
          <Text variant="title">Pick your statement</Text>
          <Text tone="muted">The PDF your bank emails you each month. Ember reads it once; the file isn't kept anywhere.</Text>
          <Button label="Choose PDF from Files" onPress={pick} />
          {SHOW_SAMPLES ? (
            <View style={{ gap: t.spacing[2] }}>
              <Text variant="small" tone="muted">
                Demo: try a synthetic statement
              </Text>
              <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
                {(["A", "B", "C"] as const).map((l) => (
                  <Button key={l} kind="secondary" style={{ flex: 1 }} label={SAMPLE_LABELS[l]} onPress={() => useSample(l)} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {phase === "password" ? (
        <View style={{ gap: t.spacing[4] }}>
          <Text variant="title">Statement password</Text>
          <Text tone="muted">{fileName}</Text>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            autoCapitalize="characters"
            autoCorrect={false}
            textContentType="password"
            onSubmitEditing={() => read(password)}
          />
          <Pressable onPress={() => setShowPw((v) => !v)} accessibilityRole="button">
            <Text tone="link" variant="small">
              {showPw ? "Hide password" : "Show password"}
            </Text>
          </Pressable>
          <Text variant="small" tone="muted">
            Many banks use the first 4 letters of your name plus your birth date and month (DDMM); some use your card's last digits. Check your statement email for the exact format.
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ flex: 1 }}>Remember on this phone</Text>
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: t.colors.primary, false: t.colors.surface2 }} />
          </View>
          {remembered.length ? (
            <View style={{ gap: t.spacing[2] }}>
              <Text variant="small" tone="muted">
                Use a remembered password
              </Text>
              {remembered.map((r) => (
                <Button
                  key={r.id}
                  kind="secondary"
                  label={r.label}
                  onPress={async () => {
                    const pw = (await getRememberedPassword(r.id)) ?? "";
                    setPassword(pw);
                    read(pw);
                  }}
                />
              ))}
            </View>
          ) : null}
          <Button label="Read statement" onPress={() => read(password)} />
        </View>
      ) : null}

      {phase === "working" ? (
        <View style={{ gap: t.spacing[5], paddingTop: t.spacing[8] }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3] }}>
            <EmberAvatar size={44} />
            <Text variant="title">
              <Text variant="title" tone="ember">
                Ember
              </Text>{" "}
              is reading it
            </Text>
          </View>
          <View style={{ gap: t.spacing[3] }} accessibilityLiveRegion="polite">
            {steps.map((s, i) => (
              <View key={`${i}-${s}`} style={{ flexDirection: "row", gap: t.spacing[3], alignItems: "center" }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.colors.ember, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: t.colors.onEmber, fontSize: 13, lineHeight: 15 }}>✓</Text>
                </View>
                <Text tone={i === steps.length - 1 ? "default" : "muted"}>{s}</Text>
              </View>
            ))}
            {!steps.length ? <Text tone="muted">Opening the file…</Text> : null}
          </View>
        </View>
      ) : null}

      {phase === "review" && draft ? <Review draft={draft} busy={busy} onConfirm={confirm} /> : null}

      {phase === "saved" ? (
        <View style={{ gap: t.spacing[4], paddingTop: t.spacing[8] }}>
          <Text variant="title">Saved</Text>
          <Text tone="muted">Your numbers are updated. Ember will tell you if anything needs attention.</Text>
          <Button label="Back to Home" onPress={() => router.back()} />
          <Button kind="ghost" label="Upload another" onPress={() => setPhase("pick")} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function ConsentStep({ onAgree, busy }: { onAgree: () => void; busy: boolean }) {
  const t = useTheme();
  const items = [
    ["What Ember reads", "Your statement's summary (dues, limits, points) and each transaction line."],
    ["What PERQ keeps", "Those figures and lines, so it can track dues and spending. Card numbers are cut to the last 4 digits."],
    ["What PERQ never keeps", "The PDF file and its password. Both are used once, in memory, then dropped."],
    ["Who else sees it", "If the layout is unusual, the statement text goes to Google's Gemini to read it. Unknown shop names (not amounts) may also be sent to sort them."],
    ["Deleting it", "Delete any statement, or all your money data, from Profile → Privacy & data. It's immediate."],
  ];
  return (
    <View style={{ gap: t.spacing[4] }}>
      <Text variant="title">Before Ember reads a statement</Text>
      {items.map(([h, b]) => (
        <Card key={h}>
          <Text variant="bodyStrong">{h}</Text>
          <Text tone="muted">{b}</Text>
        </Card>
      ))}
      <Button label="I agree, continue" loading={busy} onPress={onAgree} />
      <Button kind="ghost" label="Not now" onPress={() => router.back()} />
    </View>
  );
}

function Review({ draft, busy, onConfirm }: { draft: StatementDraft; busy: boolean; onConfirm: (edits: Record<string, unknown>) => void }) {
  const t = useTheme();
  const s = draft.summary;
  const [cardId, setCardId] = useState<string | null | undefined>(draft.match.catalogueCardId ?? undefined);
  const [statementDate, setStatementDate] = useState(s.statementDate ?? "");
  const [dueDate, setDueDate] = useState(s.dueDate ?? "");
  const [totalDue, setTotalDue] = useState(s.totalDue?.toString() ?? "");
  const [minimumDue, setMinimumDue] = useState(s.minimumDue?.toString() ?? "");
  const r = draft.reconcile;
  const spend = draft.transactions.filter((x) => x.kind === "purchase").length;
  const cats = Object.entries(
    draft.transactions.filter((x) => x.kind === "purchase").reduce<Record<string, number>>((m, x) => ((m[x.category] = (m[x.category] ?? 0) + x.amount), m), {})
  ).sort((a, b) => b[1] - a[1]);

  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^\d.]/g, "")));
  const edits = {
    ...(cardId !== draft.match.catalogueCardId ? { catalogueCardId: cardId ?? null } : {}),
    ...(statementDate !== s.statementDate ? { statementDate } : {}),
    ...(dueDate !== (s.dueDate ?? "") ? { dueDate } : {}),
    ...(num(totalDue) !== s.totalDue ? { totalDue: num(totalDue) } : {}),
    ...(num(minimumDue) !== s.minimumDue ? { minimumDue: num(minimumDue) } : {}),
  };

  return (
    <View style={{ gap: t.spacing[4] }}>
      <Text variant="title">Check before saving</Text>
      <Notice tone={r.reconciled ? "success" : "danger"} title={r.reconciled ? "The totals add up ✓" : "The totals don't add up"}>
        {r.reconciled ? (
          <Text variant="small" tone="muted">
            Previous balance, payments, purchases, fees and charges match the total due, and the {draft.transactions.length} lines match the summary.
          </Text>
        ) : (
          <>
            {r.issues.map((i) => (
              <Text key={i} variant="small" tone="danger">
                {i}
              </Text>
            ))}
            <Text variant="small" tone="muted">
              Correct the figures below from your statement. If they still don't add up it's saved as unchecked, and Ember won't use its rupee amounts for alerts.
            </Text>
          </>
        )}
      </Notice>

      <Card>
        <Text variant="heading">Card</Text>
        <Text tone="muted">
          {s.issuer} · {s.cardName} ·{s.last4}
        </Text>
        {draft.match.candidates.slice(0, 4).map((c) => (
          <ChoiceRow key={c.id} label={c.name} detail={c.issuer} selected={cardId === c.id} onPress={() => setCardId(c.id)} />
        ))}
        <ChoiceRow label="My card isn't listed" selected={cardId === null} onPress={() => setCardId(null)} />
      </Card>

      <Card>
        <Text variant="heading">Statement</Text>
        <TextField label="Statement date (YYYY-MM-DD)" value={statementDate} onChangeText={setStatementDate} autoCapitalize="none" />
        <TextField label="Due date (YYYY-MM-DD)" value={dueDate} onChangeText={setDueDate} autoCapitalize="none" />
        <TextField label="Total due (₹)" value={totalDue} onChangeText={setTotalDue} keyboardType="decimal-pad" error={!r.summaryOk ? "Check this against your statement" : null} />
        <TextField label="Minimum due (₹)" value={minimumDue} onChangeText={setMinimumDue} keyboardType="decimal-pad" />
        <Text variant="small" tone="muted">
          {draft.transactions.length} lines · {spend} purchases
        </Text>
      </Card>

      {cats.length ? (
        <Card>
          <Text variant="heading">Where it went</Text>
          {cats.slice(0, 6).map(([c, amt]) => (
            <View key={c} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text>{TXN_CATEGORY_LABELS[c as keyof typeof TXN_CATEGORY_LABELS] ?? c}</Text>
              <Text variant="bodyStrong">{formatInr(amt)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Button label="Save statement" loading={busy} onPress={() => onConfirm(edits)} disabled={cardId === undefined && !draft.match.catalogueCardId} />
      {cardId === undefined && !draft.match.catalogueCardId ? (
        <Text variant="small" tone="muted">
          Pick the card above (or "My card isn't listed") to save.
        </Text>
      ) : null}
    </View>
  );
}
