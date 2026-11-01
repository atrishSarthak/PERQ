import { Image, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

const EMBER = require("../../assets/images/ember-avatar.png");

// Ember's mark: the coral flame on charcoal. The artwork has its own dark disc
// with a small margin, so it's drawn 10% larger and clipped to a circle.
export function EmberAvatar({ size = 40 }: { size?: number }) {
  const t = useTheme();
  const inner = size * 1.1;
  return (
    <View
      accessibilityLabel="Ember"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        backgroundColor: t.colors.surface,
        borderWidth: 1,
        borderColor: t.colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image source={EMBER} style={{ width: inner, height: inner }} resizeMode="cover" />
    </View>
  );
}
