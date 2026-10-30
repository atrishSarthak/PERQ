import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { EmberAvatar } from "@/components/EmberAvatar";
import { Text } from "@/components/Text";
import { api, streamEmber } from "@/lib/api";
import { useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export default function EmberTab() {
  const t = useTheme();
  const results = useResults();
  const history = useQuery({ queryKey: ["chat"], queryFn: api.chatHistory });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    if (history.data && messages.length === 0) setMessages(history.data.messages);
  }, [history.data, messages.length]);

  const ranked = results.data?.result.ranked ?? [];
  const chips = [
    ranked[1] ? `Why not ${ranked[1].name}?` : null,
    "What if I travel more?",
    ranked[0] && !ranked[0].flags.lifetimeFree ? "Is the fee worth it?" : "What if I spent ₹5,000 on dining?",
  ].filter(Boolean) as string[];

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setDraft("");
    setBusy(true);
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [...m, { id: `u-${Date.now()}`, role: "user", content: message }, { id: replyId, role: "assistant", content: "", pending: true }]);
    try {
      await streamEmber("/api/ember/chat", { message }, (e) => {
        if (e.type === "step") setStep(e.label);
        if (e.type === "chunk") {
          setStep(null);
          setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: x.content + e.text } : x)));
        }
        if (e.type === "error") setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: e.message } : x)));
      });
    } catch (err) {
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: (err as Error).message } : x)));
    } finally {
      setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, pending: false } : x)));
      setStep(null);
      setBusy(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: t.spacing[3], paddingHorizontal: t.spacing[5], paddingVertical: t.spacing[3] }}>
          <EmberAvatar size={36} />
          <View>
            <Text variant="heading">Ember</Text>
            <Text variant="caption" tone="muted">
              Answers from your answers and verified card terms
            </Text>
          </View>
        </View>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[3] }}
          ListEmptyComponent={
            <Text tone="muted">
              Ask me why a card ranked where it did, or try a what-if. I only use the numbers PERQ computed for you.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={{
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
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
          )}
        />
        <View style={{ paddingHorizontal: t.spacing[5], paddingBottom: t.spacing[3], gap: t.spacing[2] }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
            {chips.map((c) => (
              <Pressable
                key={c}
                disabled={busy}
                onPress={() => send(c)}
                style={{ paddingHorizontal: t.spacing[3], paddingVertical: t.spacing[2], borderRadius: t.radii.pill, borderWidth: 1, borderColor: t.colors.ember, opacity: busy ? 0.5 : 1 }}
              >
                <Text variant="small">{c}</Text>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
