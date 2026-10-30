import { useReducer } from "react";
import { ScrollView, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { QUIZ_QUESTIONS, type QuizKey } from "@perq/shared";
import { Button } from "@/components/Button";
import { Loading } from "@/components/StateViews";
import { Text } from "@/components/Text";
import { QuestionBody } from "@/features/quiz/QuestionBody";
import { draftFromAnswers, initialQuizState, quizReducer } from "@/features/quiz/reducer";
import { useEditAnswer, useResults } from "@/lib/queries";
import { useTheme } from "@/theme/ThemeProvider";

// Edit one answer from Profile (handoff §1.6 screen 7): PATCH just that key;
// the server re-ranks and the results cache updates in place.
export default function EditAnswer() {
  const { key } = useLocalSearchParams<{ key: QuizKey }>();
  const results = useResults();
  if (!results.data) return <Loading />;
  return <Editor questionKey={key} initial={draftFromAnswers(results.data.answers)} />;
}

function Editor({ questionKey, initial }: { questionKey: QuizKey; initial: ReturnType<typeof draftFromAnswers> }) {
  const t = useTheme();
  const [state, dispatch] = useReducer(quizReducer, initial, initialQuizState);
  const edit = useEditAnswer();
  const question = QUIZ_QUESTIONS.find((q) => q.key === questionKey)!;
  const value = state.draft[questionKey as keyof typeof state.draft];

  async function save() {
    await edit.mutateAsync({ key: questionKey, value: questionKey === "openToSecured" ? (value ?? null) : value });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <Stack.Screen options={{ title: "Edit answer" }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing[5], gap: t.spacing[4], paddingBottom: t.spacing[12] }} keyboardShouldPersistTaps="handled">
        <Text variant="heading">{question.title}</Text>
        {question.hint ? <Text tone="muted">{question.hint}</Text> : null}
        <QuestionBody question={questionKey} draft={state.draft} dispatch={dispatch} />
      </ScrollView>
      <View style={{ padding: t.spacing[5], borderTopWidth: 1, borderTopColor: t.colors.border, gap: t.spacing[2] }}>
        {edit.error ? (
          <Text tone="danger" variant="small">
            {edit.error.message}
          </Text>
        ) : null}
        <Button label="Save and re-rank" loading={edit.isPending} onPress={save} disabled={value === undefined} />
      </View>
    </View>
  );
}
