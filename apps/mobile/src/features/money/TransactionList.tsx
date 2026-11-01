import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { formatInr } from "@perq/finance-engine";
import { TXN_CATEGORIES, type TransactionItem, type TxnCategory } from "@perq/shared";
import { Pill } from "@/components/Choice";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { moneyApi } from "@/lib/moneyApi";
import { useInvalidateMoney, useTransactions } from "@/lib/moneyQueries";
import { useTheme } from "@/theme/ThemeProvider";
import { categoryLabel, shortDate } from "./components";

/** Transactions with search, a category filter and tap-to-recategorise (§10.4). */
export function TransactionList({ cardAccountId, initialCategory, limit = 100 }: { cardAccountId?: string; initialCategory?: string; limit?: number }) {
  const t = useTheme();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | undefined>(initialCategory);
  const [editing, setEditing] = useState<TransactionItem | null>(null);
  const list = useTransactions({ cardAccountId, category, q: q.trim() || undefined, limit });
  const invalidate = useInvalidateMoney();
  const rows = list.data?.transactions ?? [];

  return (
    <View style={{ gap: t.spacing[3] }}>
      <TextField label="Search" value={q} onChangeText={setQ} placeholder="Merchant" autoCapitalize="none" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: t.spacing[2] }}>
        <Pill label="All" selected={!category} onPress={() => setCategory(undefined)} />
        {TXN_CATEGORIES.filter((c) => c !== "transfers").map((c) => (
          <Pill key={c} label={categoryLabel(c)} selected={category === c} onPress={() => setCategory(category === c ? undefined : c)} />
        ))}
      </ScrollView>
      {list.isLoading ? <Text tone="muted">Loading…</Text> : null}
      {!list.isLoading && !rows.length ? <Text tone="muted">No transactions match.</Text> : null}
      {rows.map((x) => (
        <Pressable
          key={x.id}
          onPress={() => setEditing(x)}
          accessibilityRole="button"
          accessibilityHint="Change this transaction's category"
          style={{ flexDirection: "row", gap: t.spacing[3], paddingVertical: t.spacing[2], borderBottomWidth: 1, borderBottomColor: t.colors.border }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="small">{x.merchant || x.description}</Text>
            <Text variant="caption" tone="muted">
              {shortDate(x.date)} · {categoryLabel(x.category)}
              {x.categorySource === "user" ? " (you)" : ""}
              {x.isInternational ? " · international" : ""}
            </Text>
          </View>
          <Text variant="small" tone={x.direction === "credit" ? "success" : "default"}>
            {x.direction === "credit" ? "+" : ""}
            {formatInr(x.amount)}
          </Text>
        </Pressable>
      ))}
      {list.data && list.data.total > rows.length ? (
        <Text variant="caption" tone="muted">
          Showing {rows.length} of {list.data.total}. Search or filter to narrow it down.
        </Text>
      ) : null}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setEditing(null)} />
        <View style={{ backgroundColor: t.colors.surface, padding: t.spacing[5], gap: t.spacing[3], borderTopLeftRadius: t.radii.lg, borderTopRightRadius: t.radii.lg }}>
          <Text variant="heading">Category for {editing?.merchant || "this transaction"}</Text>
          <Text variant="small" tone="muted">
            Ember will use this for {editing?.merchant || "this merchant"} from now on. Only for you.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
            {TXN_CATEGORIES.map((c) => (
              <Pill
                key={c}
                label={categoryLabel(c)}
                selected={editing?.category === c}
                onPress={async () => {
                  const txn = editing!;
                  setEditing(null);
                  await moneyApi.recategorise(txn.id, c as TxnCategory).catch(() => {});
                  await invalidate();
                }}
              />
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}
