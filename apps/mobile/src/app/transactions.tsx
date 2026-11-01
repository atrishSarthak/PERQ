import { Stack, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { categoryLabel } from "@/features/money/components";
import { TransactionList } from "@/features/money/TransactionList";

// All transactions, optionally pre-filtered (where Home's category bars lead).
export default function TransactionsScreen() {
  const { category, cardAccountId } = useLocalSearchParams<{ category?: string; cardAccountId?: string }>();
  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: category ? categoryLabel(category) : "Transactions" }} />
      <TransactionList initialCategory={category} cardAccountId={cardAccountId} limit={200} />
    </Screen>
  );
}
