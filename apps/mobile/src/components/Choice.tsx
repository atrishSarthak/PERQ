import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { Text } from "./Text";

/** A large, full-width answer option (single or multi select). */
export function ChoiceRow({
  label,
  selected,
  onPress,
  detail,
  leading,
  multi = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  detail?: string;
  leading?: React.ReactNode;
  multi?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={multi ? { checked: selected } : { selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: t.spacing[3],
        paddingHorizontal: t.spacing[4],
        paddingVertical: t.spacing[3],
        borderRadius: t.radii.md,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? t.colors.link : t.colors.border,
        backgroundColor: pressed ? t.colors.surface2 : t.colors.surface,
      })}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="small" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: multi ? 6 : 11,
          borderWidth: 2,
          borderColor: selected ? t.colors.link : t.colors.textMuted,
          backgroundColor: selected ? t.colors.link : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <Text style={{ color: t.colors.bg, fontSize: 13, lineHeight: 15 }}>✓</Text> : null}
      </View>
    </Pressable>
  );
}

/** A compact pill used for spend buckets and filters. */
export function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      hitSlop={4}
      style={{
        minHeight: 40,
        minWidth: 52,
        paddingHorizontal: t.spacing[3],
        borderRadius: t.radii.pill,
        borderWidth: 1,
        borderColor: selected ? t.colors.primary : t.colors.border,
        backgroundColor: selected ? t.colors.primary : t.colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="small" tone={selected ? "onPrimary" : "default"}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Issuer initials in a navy tile (no logo licensing needed). */
export function IssuerBadge({ issuer, size = 36 }: { issuer: string; size?: number }) {
  const t = useTheme();
  const initials = issuer
    .replace(/Bank|Card|Ltd\.?|Limited|Small Finance/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: t.radii.sm,
        backgroundColor: t.colors.surface2,
        borderWidth: 1,
        borderColor: t.colors.border,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="caption">{initials}</Text>
    </View>
  );
}
