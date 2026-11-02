import { useState, type ReactNode } from "react";
import { Alert, FlatList, Platform, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { router } from "expo-router";
import { formatInr } from "@perq/finance-engine";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { CARD_PALETTES, cardInk, CreditCardFace, type CardPalette } from "@/components/CreditCardFace";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { useDeleteCardAccount, useMoneyState } from "@/lib/moneyQueries";
import { useCatalogue } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";
import type { CardStateView, CardSummary } from "@perq/shared";
import { dueLine, shortDate, UtilisationBar } from "./components";

/** My cards (handoff §10.3): each card account drawn as a card; tap it for due, utilisation, points and Remove. */
export function MyCards({ header }: { header?: ReactNode }) {
  const t = useTheme();
  const state = useMoneyState();
  const catalogue = useCatalogue();
  const [open, setOpen] = useState<string | null>(null);
  const networksById = new Map((catalogue.data?.cards ?? []).map((c) => [c.id, c.networks]));
  if (state.isLoading) return <Loading />;
  if (state.error) return <ErrorState message={state.error.message} onRetry={() => state.refetch()} />;
  const s = state.data!;

  return (
    <FlatList
      data={s.cards}
      keyExtractor={(c) => c.cardAccountId}
      onRefresh={() => state.refetch()}
      refreshing={state.isRefetching}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[12] }}
      ListHeaderComponent={
        <View style={{ gap: t.spacing[4] }}>
          {header}
          {s.dataThrough ? (
            <Text variant="small" tone="muted">
              From statements up to {shortDate(s.dataThrough)} · {formatInr(s.totals.totalDueAll)} due across cards
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Card>
          <Text variant="heading">No cards yet</Text>
          <Text tone="muted">Upload a statement and your card shows up here with its due date, utilisation and points.</Text>
          <Button label="Upload a statement" onPress={() => router.push("/upload")} />
        </Card>
      }
      ListFooterComponent={s.cards.length ? <Button label="Upload a statement" kind="secondary" onPress={() => router.push("/upload")} /> : undefined}
      renderItem={({ item: c, index }) => (
        // A different colour for each card, starting after the pearl Ember's pick uses.
        <CardRow c={c} palette={CARD_PALETTES[(index + 1) % CARD_PALETTES.length]!} networks={networksById.get(c.catalogueCardId ?? "") ?? []} open={open === c.cardAccountId} onToggle={() => setOpen(open === c.cardAccountId ? null : c.cardAccountId)} />
      )}
    />
  );
}

function confirmRemove(label: string, onYes: () => void) {
  const title = `Remove ${label}?`;
  const body = "Its statements and transactions are deleted from PERQ too. This can't be undone.";
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${body}`)) onYes();
    return;
  }
  Alert.alert(title, body, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: onYes },
  ]);
}

function CardRow({ c, networks, palette, open, onToggle }: { c: CardStateView; networks: CardSummary["networks"]; palette: CardPalette; open: boolean; onToggle: () => void }) {
  const t = useTheme();
  const { ink, muted } = cardInk(palette);
  const remove = useDeleteCardAccount();
  const due = c.latestStatement?.totalDue;
  // Added with "I have this card": no statement yet, and a placeholder last4 (#<card id>).
  const manual = c.last4.startsWith("#");
  const dueSoon = c.daysToDue !== null && c.daysToDue >= 0 && c.daysToDue <= 3 && !c.isPaidMarked;
  return (
    <View style={{ gap: t.spacing[2] }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={c.last4.startsWith("#") ? c.label : `${c.label} ending ${c.last4}`} accessibilityHint={open ? "Hides card details" : "Shows due, utilisation and Remove"}>
        <CreditCardFace
          issuer={c.issuer}
          name={c.label}
          networks={networks}
          palette={palette}
          label={dueSoon ? (c.daysToDue === 0 ? "DUE TODAY" : `DUE IN ${c.daysToDue}D`) : undefined}
          footer={
            <View>
              <Text variant="bodyStrong" style={{ color: ink, letterSpacing: manual ? 0 : 2 }}>
                {manual ? "Added by you" : `•••• ${c.last4}`}
              </Text>
              {due !== null && due !== undefined ? (
                <Text variant="caption" style={{ color: muted }}>
                  {formatInr(due)} due
                </Text>
              ) : null}
            </View>
          }
        />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          <Card style={{ borderRadius: 22, gap: t.spacing[3] }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted" style={{ letterSpacing: 0.8 }}>
                  TOTAL DUE
                </Text>
                <Text variant="heading">{due !== null && due !== undefined ? formatInr(due) : "—"}</Text>
              </View>
              <Text variant="small" tone={dueSoon ? "danger" : "muted"} style={{ flexShrink: 1, textAlign: "right" }}>
                {manual ? "Upload a statement to track dues" : dueLine(c)}
              </Text>
            </View>
            <UtilisationBar pct={c.utilisationPct} />
            {c.points ? (
              <Text variant="small" tone="muted">
                {c.points.closing.toLocaleString("en-IN")} points{c.points.valueRupees !== null ? ` · about ${formatInr(c.points.valueRupees)}` : ""}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", gap: t.spacing[2] }}>
              {manual ? (
                <Button label="Upload statement" kind="secondary" style={{ flex: 1 }} onPress={() => router.push("/upload")} />
              ) : (
                <Button label="Card details" kind="secondary" style={{ flex: 1 }} onPress={() => router.push(`/account/${c.cardAccountId}`)} />
              )}
              <Button label="Remove" kind="ghost" style={{ flex: 1 }} loading={remove.isPending} onPress={() => confirmRemove(c.label, () => remove.mutate(c.cardAccountId))} accessibilityHint="Deletes this card and its statements from PERQ" />
            </View>
            {remove.error ? (
              <Text variant="small" tone="danger">
                {remove.error.message}
              </Text>
            ) : null}
          </Card>
        </Animated.View>
      ) : null}
    </View>
  );
}
