import { useMemo, useState, type ReactNode } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Segmented } from "@/components/Segmented";
import { ErrorState, Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { CardRow, FiltersSheet, LeakageBanner, TopPickCard } from "./components";
import {
  activeFilterCount,
  applyFiltersAndSort,
  EMPTY_FILTERS,
  issuersOf,
  SORT_LABELS,
  type SortMode,
} from "./filterSort";
import { useResults, useSetHeld } from "@/lib/queries";
import { useExplanation } from "./useExplanation";
import { useTheme } from "@/theme/ThemeProvider";

/** Explore: the Step 1 recommender list (Cards tab → Explore). */
export function ExploreList({ header }: { header?: ReactNode }) {
  const t = useTheme();
  const results = useResults();
  const setHeld = useSetHeld();
  const [sort, setSort] = useState<SortMode>("best");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const data = results.data;
  const emberStep = useExplanation(data);
  const list = useMemo(() => (data ? applyFiltersAndSort(data.result.ranked, filters, sort) : []), [data, filters, sort]);

  if (results.isLoading) return <Loading label="Ranking your cards…" />;
  if (results.error) return <ErrorState message={results.error.message} onRetry={() => results.refetch()} />;
  if (!data) {
    return (
      <View style={{ padding: t.spacing[5], gap: t.spacing[4] }}>
        {header}
        <Text tone="muted">Answer a few questions and Ember will rank every verified card by what it's worth to you.</Text>
        <Button label="Find my best card" onPress={() => router.push("/quiz")} />
      </View>
    );
  }

  const top = data.result.ranked[0];
  const explanation = top && data.explanation?.topCardId === top.cardId ? data.explanation.text : null;
  const nFilters = activeFilterCount(filters);
  // The Top Pick card shows only in the default, unfiltered view, so the
  // list below it never repeats it.
  const showTop = !!top && sort === "best" && nFilters === 0;
  const rows = showTop ? list.filter((c) => c.cardId !== top!.cardId) : list;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(c) => c.cardId}
        contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[12] }}
        onRefresh={() => results.refetch()}
        refreshing={results.isRefetching}
        ListHeaderComponent={
          <View style={{ gap: t.spacing[4] }}>
            {header}
            <LeakageBanner leakage={data.result.leakage} />
            {showTop ? <TopPickCard card={top!} explanation={explanation} working={emberStep} /> : null}
            <Segmented<SortMode>
              value={sort}
              onChange={setSort}
              options={(Object.keys(SORT_LABELS) as SortMode[]).map((v) => ({ value: v, label: SORT_LABELS[v] }))}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text variant="small" tone="muted">
                {list.length} of {data.result.ranked.length} cards you can get · terms checked {data.result.catalogue.checkedOn}
              </Text>
              <Pressable onPress={() => setShowFilters(true)} hitSlop={10} accessibilityRole="button">
                <Text tone="link" variant="bodyStrong">
                  Filters{nFilters ? ` (${nFilters})` : ""}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <CardRow card={item} onToggleHeld={(held) => setHeld.mutate({ cardId: item.cardId, held })} />}
        ListEmptyComponent={
          <Text tone="muted">
            {nFilters ? "No cards match these filters." : "None of the verified cards fit your answers. Try a higher fee limit in Profile."}
          </Text>
        }
        ListFooterComponent={
          data.result.ineligible.length ? (
            <Text variant="small" tone="muted">
              {data.result.ineligible.length} more cards don't fit your answers. Ask Ember "why not …?" about any of them.
            </Text>
          ) : undefined
        }
      />
      <FiltersSheet visible={showFilters} filters={filters} issuers={issuersOf(data.result.ranked)} onChange={setFilters} onClose={() => setShowFilters(false)} />
    </>
  );
}
