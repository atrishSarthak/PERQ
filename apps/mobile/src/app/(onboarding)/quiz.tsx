import { useReducer } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { QUIZ_QUESTIONS } from "@perq/shared";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { QuestionBody } from "@/features/quiz/QuestionBody";
import {
  canContinue,
  currentStep,
  draftFromAnswers,
  initialQuizState,
  isLastStep,
  quizReducer,
  quizSteps,
  toAnswers,
} from "@/features/quiz/reducer";
import { useResults, useSaveAnswers } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

export default function Quiz() {
  const t = useTheme();
  const { retake } = useLocalSearchParams<{ retake?: string }>();
  const results = useResults();
  const prefill = retake && results.data ? draftFromAnswers(results.data.answers) : undefined;
  const [state, dispatch] = useReducer(quizReducer, prefill, initialQuizState);
  const save = useSaveAnswers();

  const steps = quizSteps(state.draft);
  const step = currentStep(state);
  const question = QUIZ_QUESTIONS.find((q) => q.key === step)!;
  const last = isLastStep(state);

  async function onContinue() {
    if (!last) return dispatch({ type: "next" });
    const answers = toAnswers(state.draft);
    if (!answers) return;
    await save.mutateAsync(answers);
    router.replace("/working");
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }} edges={["top", "bottom"]}>
      <View style={{ paddingHorizontal: t.spacing[5], paddingTop: t.spacing[2], gap: t.spacing[3] }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
          {state.index > 0 ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => dispatch({ type: "back" })} hitSlop={12}>
              <Text variant="bodyStrong" tone="link">
                ‹ Back
              </Text>
            </Pressable>
          ) : retake ? (
            <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
              <Text variant="bodyStrong" tone="link">
                Cancel
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Text variant="small" tone="muted" accessibilityLiveRegion="polite">
            {state.index + 1} of {steps.length}
          </Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.colors.surface2 }}>
          <View style={{ height: 4, borderRadius: 2, width: `${((state.index + 1) / steps.length) * 100}%`, backgroundColor: t.colors.link }} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[12] }} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">
          {question.title}
        </Text>
        {question.hint ? <Text tone="muted">{question.hint}</Text> : null}
        <QuestionBody question={step} draft={state.draft} dispatch={dispatch} />
      </ScrollView>

      <View style={{ padding: t.spacing[5], paddingTop: t.spacing[3], borderTopWidth: 1, borderTopColor: t.colors.border, gap: t.spacing[2] }}>
        {save.error ? (
          <Text tone="danger" variant="small">
            {save.error.message}
          </Text>
        ) : null}
        <Button
          label={last ? "See my cards" : step === "cardsHeld" && state.draft.cardsHeld.length === 0 ? "I don't have one yet" : "Continue"}
          disabled={!canContinue(state)}
          loading={save.isPending}
          onPress={onContinue}
        />
      </View>
    </SafeAreaView>
  );
}
