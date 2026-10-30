import type { ComponentRef, Ref } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

export type TextInputRef = ComponentRef<typeof TextInput>;

export function TextField({
  label,
  error,
  style,
  ref,
  ...rest
}: TextInputProps & { label: string; error?: string | null; ref?: Ref<TextInputRef> }) {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing[2] }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textMuted}
        style={[
          {
            minHeight: 52,
            borderRadius: t.radii.md,
            borderWidth: 1,
            borderColor: error ? t.colors.danger : t.colors.border,
            backgroundColor: t.colors.surface,
            color: t.colors.text,
            paddingHorizontal: t.spacing[4],
            fontFamily: t.fonts.body,
            fontSize: t.fontSizes.body,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="small" tone="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
