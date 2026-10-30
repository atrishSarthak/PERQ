import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";

export function Screen({
  children,
  scroll = true,
  edges = ["top"],
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
}) {
  const t = useTheme();
  const padding: ViewStyle = { paddingHorizontal: t.spacing[5], paddingVertical: t.spacing[4], gap: t.spacing[4] };
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[padding, { paddingBottom: t.spacing[12] }, contentStyle]}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
