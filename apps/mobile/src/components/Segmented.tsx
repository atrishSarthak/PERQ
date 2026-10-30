import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: "row", backgroundColor: t.colors.surface2, borderRadius: t.radii.md, padding: 4 }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: t.radii.sm,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? t.colors.primary : "transparent",
            }}
          >
            <Text variant="small" tone={selected ? "onPrimary" : "muted"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
