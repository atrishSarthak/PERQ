import { useMemo, useState, type Dispatch } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  FEE_OPTIONS,
  INCOME_OPTIONS,
  OCCUPATION_OPTIONS,
  PRIORITY_OPTIONS,
  SPEND_CATEGORY_QUESTIONS,
  SPEND_OPTIONS,
  TRAVEL_OPTIONS,
  type QuizKey,
} from "@perq/shared";
import { ChoiceRow, IssuerBadge, Pill } from "@/components/Choice";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { useCatalogue } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";
import type { Draft, QuizAction } from "./reducer";

/** The answer controls for one quiz question (used by the quiz and Profile edits). */
export function QuestionBody({
  question,
  draft,
  dispatch,
}: {
  question: QuizKey;
  draft: Draft;
  dispatch: Dispatch<QuizAction>;
}) {
  const t = useTheme();
  const gap = { gap: t.spacing[3] };

  switch (question) {
    case "cardsHeld":
      return <CardPicker selected={draft.cardsHeld} onToggle={(cardId) => dispatch({ type: "toggleCard", cardId })} />;
    case "occupation":
      return (
        <View style={gap}>
          {OCCUPATION_OPTIONS.map((o) => (
            <ChoiceRow key={o.value} label={o.label} selected={draft.occupation === o.value} onPress={() => dispatch({ type: "set", key: "occupation", value: o.value })} />
          ))}
        </View>
      );
    case "monthlyIncome":
      return (
        <View style={gap}>
          {INCOME_OPTIONS.map((o) => (
            <ChoiceRow key={o.value} label={o.label} selected={draft.monthlyIncome === o.value} onPress={() => dispatch({ type: "set", key: "monthlyIncome", value: o.value })} />
          ))}
        </View>
      );
    case "monthlySpend":
      return (
        <View style={{ gap: t.spacing[5] }}>
          {SPEND_CATEGORY_QUESTIONS.map((q) => (
            <View key={q.key} style={{ gap: t.spacing[2] }} accessibilityRole="radiogroup" accessibilityLabel={q.label}>
              <Text variant="bodyStrong">{q.label}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[2] }}>
                {SPEND_OPTIONS.map((o) => (
                  <Pill
                    key={o.value}
                    label={o.label}
                    selected={draft.monthlySpend[q.key] === o.value}
                    onPress={() => dispatch({ type: "setSpend", category: q.key, value: o.value })}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    case "travelPerYear":
      return (
        <View style={gap}>
          {TRAVEL_OPTIONS.map((o) => (
            <ChoiceRow key={o.value} label={o.label} selected={draft.travelPerYear === o.value} onPress={() => dispatch({ type: "set", key: "travelPerYear", value: o.value })} />
          ))}
        </View>
      );
    case "feeTolerance":
      return (
        <View style={gap}>
          {FEE_OPTIONS.map((o) => (
            <ChoiceRow key={o.value} label={o.label} selected={draft.feeTolerance === o.value} onPress={() => dispatch({ type: "set", key: "feeTolerance", value: o.value })} />
          ))}
        </View>
      );
    case "priorities":
      return (
        <View style={gap}>
          {PRIORITY_OPTIONS.map((o) => (
            <ChoiceRow key={o.value} multi label={o.label} selected={draft.priorities.includes(o.value)} onPress={() => dispatch({ type: "togglePriority", value: o.value })} />
          ))}
          <ChoiceRow multi label="No preference" selected={draft.priorities.length === 0} onPress={() => dispatch({ type: "togglePriority", value: "none" })} />
        </View>
      );
    case "openToSecured":
      return (
        <View style={gap}>
          <ChoiceRow label="Yes" detail="Show me FD-backed cards too" selected={draft.openToSecured === true} onPress={() => dispatch({ type: "set", key: "openToSecured", value: true })} />
          <ChoiceRow label="No" selected={draft.openToSecured === false} onPress={() => dispatch({ type: "set", key: "openToSecured", value: false })} />
        </View>
      );
  }
}

function CardPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const t = useTheme();
  const catalogue = useCatalogue();
  const [query, setQuery] = useState("");
  const cards = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = catalogue.data?.cards ?? [];
    const filtered = q ? list.filter((c) => `${c.name} ${c.issuer}`.toLowerCase().includes(q)) : list;
    // Selected cards first so they're easy to undo.
    return [...filtered].sort((a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)));
  }, [catalogue.data, query, selected]);

  return (
    <View style={{ gap: t.spacing[3] }}>
      <TextField label="Search cards" placeholder="e.g. Millennia, SBI, Amazon" value={query} onChangeText={setQuery} autoCorrect={false} clearButtonMode="while-editing" />
      <Text variant="small" tone="muted">
        {selected.length === 0 ? "None selected: that's fine if you don't have one yet." : `${selected.length} selected`}
      </Text>
      {catalogue.isLoading ? <ActivityIndicator color={t.colors.link} /> : null}
      {catalogue.error ? (
        <Text tone="danger" variant="small">
          Couldn't load cards. Check your connection, or continue without picking.
        </Text>
      ) : null}
      {cards.slice(0, query ? 40 : 12).map((c) => (
        <ChoiceRow
          key={c.id}
          multi
          label={c.name}
          detail={c.issuer}
          selected={selected.includes(c.id)}
          onPress={() => onToggle(c.id)}
          leading={<IssuerBadge issuer={c.issuer} />}
        />
      ))}
      {!query && cards.length > 12 ? (
        <Text variant="small" tone="muted">
          Search to see all {cards.length} cards.
        </Text>
      ) : null}
    </View>
  );
}
