import type { ReactNode } from "react";
import { StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/theme/ThemeProvider";

// Cards are charcoal at the top, fading darker toward the black page
// (DECISIONS #173). Top-left to bottom so the light catches one corner.
const START = { x: 0.2, y: 0 };
const END = { x: 0.5, y: 1 };

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle | ViewStyle[] }) {
  const t = useTheme();
  return (
    <LinearGradient
      colors={[t.colors.surface, t.colors.surfaceDeep]}
      start={START}
      end={END}
      style={[
        {
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
    </LinearGradient>
  );
}

/** The card gradient as a background layer, for a container that isn't a Card (give it overflow: "hidden"). */
export function SurfaceFill() {
  const t = useTheme();
  return <LinearGradient pointerEvents="none" colors={[t.colors.surface, t.colors.surfaceDeep]} start={START} end={END} style={StyleSheet.absoluteFill} />;
}
