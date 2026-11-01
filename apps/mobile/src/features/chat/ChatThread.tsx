import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EmberEvent, NudgeChip, PartialPlanInput, PlanInput } from "@perq/shared";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { api, streamEmber } from "@/lib/api";
import { formatInr } from "@perq/finance-engine";
import { useTheme } from "@/theme/ThemeProvider";
import { PlanConfirmCard, PlanResultCard } from "@/features/planner/ChatCards";
import { splitPlanMarker } from "@/features/planner/chatMessage";
import { plannerApi } from "@/lib/plannerApi";

// One Ember conversation (handoff §7.4, §8): the main thread, or a
// `nudge:<id>` / `card:<id>` thread. Chips with an `action` are app buttons
// the parent handles; plain chips are sent as messages. A level-3 proposal
// from Ember shows a Confirm card; nothing is saved until the user taps it.

type Proposal = Extract<EmberEvent, { type: "proposal" }>["proposal"];

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  proposal?: Proposal;
  /** Details Ember read from a purchase question, for the user to confirm (Step 3 §6.4). */
  planConfirm?: { draft: PartialPlanInput; missing: ("price" | "item")[] };
  /** A finished plan shown as a result card. */
  planId?: string | null;
}

const fromHistory = (m: Msg): Msg => {
  const { text, planId } = splitPlanMarker(m.content);
  return { ...m, content: text, planId };
};

export function ChatThread({
  threadRef,
  header,
  footer,
  emptyText,
  chips: fixedChips,
  onAction,
  onConfirmProposal,
  overTabBar = false,
}: {
  threadRef?: string;
  header?: ReactNode;
  footer?: ReactNode;
  emptyText?: string;
  /** Used when the thread itself has no chips (the main thread). */
  chips?: NudgeChip[];
  onAction?: (action: NonNullable<NudgeChip["action"]>) => void;
  onConfirmProposal?: (p: Proposal) => Promise<void>;
  /** On a tab: messages scroll behind the glass tab bar and the message box floats above it.
   * Needs a SafeAreaProvider inside the tab, so the bottom inset includes the bar. */
  overTabBar?: boolean;
}) {
  const t = useTheme();
  const qc = useQueryClient();
  const key = ["chat", threadRef ?? "main"];
  const history = useQuery({ queryKey: key, queryFn: () => api.chatHistory(threadRef) });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const listRef = useRef<FlatList<Msg>>(null);
  const scrollToEnd = useCallback(() => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50), []);
  // Over a tab bar: the box sits on the bar (the bottom inset) until the keyboard
  // covers the bar, then on the keyboard. The list is padded by the box's height.
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  useEffect(() => {
    if (!overTabBar) return;
    const show = Keyboard.addListener("keyboardWillShow", () => setKeyboardUp(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [overTabBar]);
  const composerBottom = overTabBar && !keyboardUp ? insets.bottom : 0;

  useEffect(() => {
    if (history.data && messages.length === 0) setMessages(history.data.messages.map(fromHistory));
  }, [history.data, messages.length]);

  const chips = history.data?.chips ?? fixedChips ?? [];

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, { id: replyId, role: "assistant", content: "", pending: true }]);
    const update = (fn: (x: Msg) => Msg) => setMessages((m) => m.map((x) => (x.id === replyId ? fn(x) : x)));
    try {
      await streamEmber("/api/ember/chat", { message, ...(threadRef ? { threadRef } : {}) }, (e) => {
        if (e.type === "step") setStep(e.label);
        if (e.type === "proposal") update((x) => ({ ...x, proposal: e.proposal }));
        if (e.type === "planConfirm") update((x) => ({ ...x, planConfirm: { draft: e.draft, missing: e.missing } }));
        if (e.type === "chunk") {
          setStep(null);
          update((x) => ({ ...x, content: x.content + e.text }));
        }
        if (e.type === "error") update((x) => ({ ...x, content: e.message }));
      });
    } catch (err) {
      update((x) => ({ ...x, content: (err as Error).message }));
    } finally {
      update((x) => ({ ...x, pending: false }));
      setStep(null);
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["nudges"] });
    }
  }

  // "Plan it" on a confirmation card: the user's tap is the confirmation; the plan
  // runs with narration in the thread, and the answer is saved to the thread too.
  async function planIt(cardId: string, input: PlanInput) {
    if (busy) return;
    setBusy(true);
    setConfirmed((s) => new Set(s).add(cardId));
    const replyId = `p-${Date.now()}`;
    setMessages((m) => [...m, { id: replyId, role: "assistant", content: "", pending: true }]);
    const update = (fn: (x: Msg) => Msg) => setMessages((m) => m.map((x) => (x.id === replyId ? fn(x) : x)));
    try {
      await plannerApi.run(
        input,
        "chat",
        (e) => {
          if (e.type === "step") setStep(e.label);
          if (e.type === "plan") update((x) => ({ ...x, content: e.explanation, planId: e.planId }));
          if (e.type === "error") update((x) => ({ ...x, content: e.message }));
        },
        undefined,
        { postToChat: !threadRef }
      );
    } catch (err) {
      update((x) => ({ ...x, content: (err as Error).message }));
    } finally {
      update((x) => ({ ...x, pending: false }));
      setStep(null);
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["plans"] });
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" && !overTabBar ? 80 : 0}>
      {header}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3], paddingBottom: overTabBar ? composerHeight + composerBottom + t.spacing[3] : t.spacing[5] }}
          ListEmptyComponent={emptyText ? <Text tone="muted">{emptyText}</Text> : undefined}
          ListFooterComponent={footer ? <View style={{ marginTop: t.spacing[2] }}>{footer}</View> : undefined}
          renderItem={({ item }) => (
            <View style={{ gap: t.spacing[2], alignSelf: item.role === "user" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
              <View
                style={{
                  padding: t.spacing[3],
                  borderRadius: t.radii.md,
                  backgroundColor: item.role === "user" ? t.colors.primary : t.colors.surface,
                  borderWidth: item.role === "user" ? 0 : 1,
                  borderColor: t.colors.border,
                }}
              >
                <Text tone={item.role === "user" ? "onPrimary" : "default"}>
                  {item.content || (item.pending ? (step ?? "Thinking…") : "")}
                </Text>
              </View>
              {item.planConfirm ? (
                <PlanConfirmCard draft={item.planConfirm.draft} missing={item.planConfirm.missing} used={confirmed.has(item.id)} onPlan={(input) => planIt(item.id, input)} />
              ) : null}
              {item.planId ? <PlanResultCard planId={item.planId} onReady={item.id === messages.at(-1)?.id ? scrollToEnd : undefined} /> : null}
              {item.proposal && onConfirmProposal ? (
                <View style={{ padding: t.spacing[3], borderRadius: t.radii.md, borderWidth: 1, borderColor: t.colors.ember, gap: t.spacing[2] }}>
                  <Text variant="bodyStrong">{item.proposal.kind === "budget" ? "Proposed budget" : "Proposed goal"}</Text>
                  {item.proposal.kind === "budget" ? (
                    <>
                      {item.proposal.total ? <Text variant="small">Total: {formatInr(item.proposal.total)} a month</Text> : null}
                      {Object.entries(item.proposal.categories).map(([c, v]) => (
                        <Text key={c} variant="small" tone="muted">
                          {c.replace(/_/g, " ")}: {formatInr(v)}
                        </Text>
                      ))}
                    </>
                  ) : (
                    <Text variant="small">
                      {item.proposal.name}: {formatInr(item.proposal.target)}
                      {item.proposal.date ? ` by ${item.proposal.date}` : ""}
                    </Text>
                  )}
                  <Button
                    label={confirmed.has(item.id) ? "Saved" : "Confirm"}
                    disabled={confirmed.has(item.id)}
                    onPress={async () => {
                      await onConfirmProposal(item.proposal!);
                      setConfirmed((s) => new Set(s).add(item.id));
                    }}
                  />
                </View>
              ) : null}
            </View>
          )}
        />
        <View
          onLayout={overTabBar ? (e) => setComposerHeight(e.nativeEvent.layout.height) : undefined}
          style={[
            { paddingHorizontal: t.spacing[5], paddingBottom: t.spacing[3], gap: t.spacing[2] },
            overTabBar && { position: "absolute", left: 0, right: 0, bottom: composerBottom, paddingTop: t.spacing[2], backgroundColor: `${t.colors.bg}E6` },
          ]}
        >
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
            {chips.map((c) => (
              <Pressable
                key={c.label}
                disabled={busy}
                accessibilityRole="button"
                onPress={() => (c.action ? onAction?.(c.action) : send(c.label))}
                style={{
                  paddingHorizontal: t.spacing[3],
                  paddingVertical: t.spacing[2],
                  borderRadius: t.radii.pill,
                  borderWidth: 1,
                  borderColor: t.colors.ember,
                  backgroundColor: c.action ? t.colors.surface : undefined,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text variant="small">{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", gap: t.spacing[2], alignItems: "center" }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Ask Ember…"
              placeholderTextColor={t.colors.textMuted}
              onSubmitEditing={() => send(draft)}
              returnKeyType="send"
              editable={!busy}
              accessibilityLabel="Message Ember"
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: t.radii.md,
                borderWidth: 1,
                borderColor: t.colors.border,
                backgroundColor: t.colors.surface,
                color: t.colors.text,
                paddingHorizontal: t.spacing[4],
                fontFamily: t.fonts.body,
                fontSize: t.fontSizes.body,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={busy || !draft.trim()}
              onPress={() => send(draft)}
              style={{ minHeight: 48, minWidth: 64, borderRadius: t.radii.md, backgroundColor: t.colors.primary, alignItems: "center", justifyContent: "center", opacity: busy || !draft.trim() ? 0.5 : 1 }}
            >
              <Text variant="bodyStrong" tone="onPrimary">
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
