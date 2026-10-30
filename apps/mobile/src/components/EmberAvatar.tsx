import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

// Ember's mark: a chartreuse flame on navy (handoff §3: chartreuse is
// Ember's accent). Drawn with plain Views so no SVG module is needed.
export function EmberAvatar({ size = 40 }: { size?: number }) {
  const t = useTheme();
  const flame = size * 0.42;
  return (
    <View
      accessibilityLabel="Ember"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "#1B1C45",
        borderWidth: 1.5,
        borderColor: t.colors.ember,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: flame,
          height: flame,
          backgroundColor: "#E0D847",
          borderTopLeftRadius: flame,
          borderBottomLeftRadius: flame,
          borderBottomRightRadius: flame,
          transform: [{ rotate: "-45deg" }],
          marginTop: size * 0.08,
        }}
      />
    </View>
  );
}
