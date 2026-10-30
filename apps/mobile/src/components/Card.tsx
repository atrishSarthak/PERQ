import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.colors.surface,
          borderColor: t.colors.border,
          borderWidth: 1,
          borderRadius: t.radii.lg,
          padding: t.spacing[5],
          gap: t.spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
