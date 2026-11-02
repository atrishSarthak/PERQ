import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/**
 * A short status note ("The totals add up ✓"): a tint of its colour with a
 * matching border and coloured text. Deliberately smaller than a Card so it
 * reads as a note, not a section.
 */
export function Notice({
  tone,
  title,
  children,
  onPress,
  accessibilityHint,
}: {
  tone: "success" | "danger";
  title: string;
  children?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const color = tone === "success" ? t.colors.success : t.colors.danger;
  const body = (
    <View
      style={{
        borderRadius: 16,
        paddingVertical: t.spacing[3],
        paddingHorizontal: t.spacing[4],
        gap: t.spacing[1],
        // Hex alpha: ~12% fill, ~35% border.
        backgroundColor: `${color}1F`,
        borderWidth: 1,
        borderColor: `${color}59`,
      }}
    >
      <Text variant="small" tone={tone} style={{ fontFamily: t.fonts.bodySemi }}>
        {title}
      </Text>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint={accessibilityHint}>
      {body}
    </Pressable>
  );
}
