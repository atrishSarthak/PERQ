import { ActivityIndicator, Pressable, type PressableProps, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

type Kind = "primary" | "secondary" | "ghost";

export function Button({
  label,
  kind = "primary",
  loading = false,
  disabled,
  style,
  onPress,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  label: string;
  kind?: Kind;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={(e) => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        {
          minHeight: 52,
          borderRadius: t.radii.md,
          paddingHorizontal: t.spacing[5],
          alignItems: "center",
          justifyContent: "center",
          opacity: isDisabled ? 0.5 : 1,
        },
        kind === "primary" && { backgroundColor: pressed ? t.colors.primaryPressed : t.colors.primary },
        kind === "secondary" && {
          borderWidth: 1,
          borderColor: t.colors.border,
          backgroundColor: pressed ? t.colors.surface2 : t.colors.surface,
        },
        kind === "ghost" && { backgroundColor: pressed ? t.colors.surface2 : "transparent" },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={kind === "primary" ? t.colors.onPrimary : t.colors.text} />
      ) : (
        <Text variant="bodyStrong" tone={kind === "primary" ? "onPrimary" : kind === "ghost" ? "link" : "default"}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
