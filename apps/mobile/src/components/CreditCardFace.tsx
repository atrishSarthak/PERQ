import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SymbolView } from "expo-symbols";
import { Text } from "./Text";

// A card drawn as a physical card: pearl iridescent face, EMV chip,
// contactless mark and the network wordmark. Soft colour blobs under a native
// blur give the mesh-gradient look without an image. The face is always light,
// and its text uses the palette's own ink rather than theme tokens.
const INK = "#141416";
const INK_MUTED = "#4A4A52";

/** A card's colours: three base stops, seven blobs under the blur, and light or dark ink. */
export interface CardPalette {
  base: [string, string, string];
  blobs: [string, string, string, string, string, string, string];
  dark?: boolean;
}

export const CARD_PALETTES: CardPalette[] = [
  // Pearl (the default, Ember's pick).
  { base: ["#F1F2F4", "#E9EBF1", "#F4EEE8"], blobs: ["#FFD98A", "#FF5A2E", "#E8221F", "#141A3A", "#3A2E7A", "#B9A8F0", "#9FD3F2"] },
  // Deep ocean.
  { base: ["#0B1B33", "#0F2A4A", "#0A1424"], blobs: ["#1E6BFF", "#00C2D1", "#3A5BFF", "#0A0F2A", "#6A4CFF", "#2AE3C4", "#1B3F8F"], dark: true },
  // Rose gold.
  { base: ["#FBEFEA", "#F6E2DC", "#FFF5EE"], blobs: ["#F7B79B", "#E8738A", "#C9A06A", "#7A3B4F", "#F2C6D0", "#FFD9B8", "#E9A6A0"] },
  // Emerald.
  { base: ["#06231C", "#0B3A2E", "#041A14"], blobs: ["#10B981", "#0F766E", "#A3E635", "#022C22", "#34D399", "#065F46", "#5EEAD4"], dark: true },
  // Lavender.
  { base: ["#F1EEFB", "#E8E3FA", "#F7F4FF"], blobs: ["#B9A8F0", "#7C6CF0", "#F0A8D8", "#3A2E7A", "#A8D8F0", "#E0D4FF", "#C4B5FD"] },
  // Ember night.
  { base: ["#1A0A0A", "#2A0E0E", "#120606"], blobs: ["#971211", "#E8221F", "#FF7A3D", "#2B0B0B", "#5A0B0A", "#FFB36B", "#7A1A12"], dark: true },
];

/** Text colours for a palette, for footers drawn on the card. */
export const cardInk = (p: CardPalette = CARD_PALETTES[0]!) => (p.dark ? { ink: "#F5F5F7", muted: "#C2C2CA" } : { ink: INK, muted: INK_MUTED });

type Network = "Visa" | "Mastercard" | "RuPay" | "Amex";

function Blob({ color, size, top, left, opacity = 1 }: { color: string; size: number; top: string; left: string; opacity?: number }) {
  return (
    <View
      style={{
        position: "absolute",
        top: top as ViewStyle["top"],
        left: left as ViewStyle["left"],
        width: `${size}%`,
        aspectRatio: 1,
        borderRadius: 999,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

function Chip() {
  return (
    <LinearGradient colors={["#E9D18A", "#C9A24A", "#E6C878"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 44, height: 34, borderRadius: 7, overflow: "hidden", borderWidth: 0.5, borderColor: "#A9862F" }}>
      {/* The contact pads: a centre plate and the lines between pads. */}
      <View style={{ position: "absolute", left: 15, top: 9, width: 14, height: 16, borderRadius: 3, borderWidth: 1, borderColor: "#A9862F" }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 11, height: 1, backgroundColor: "#A9862F" }} />
      <View style={{ position: "absolute", left: 0, right: 0, top: 22, height: 1, backgroundColor: "#A9862F" }} />
      <View style={{ position: "absolute", top: 0, bottom: 0, left: 22, width: 1, backgroundColor: "#A9862F" }} />
    </LinearGradient>
  );
}

function NetworkMark({ network, dark }: { network: Network | undefined; dark?: boolean }) {
  const ink = dark ? "#F5F5F7" : INK;
  if (network === "Mastercard") {
    return (
      <View accessibilityLabel="Mastercard" style={{ flexDirection: "row" }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#EB001B" }} />
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "#F79E1B", marginLeft: -12, opacity: 0.9 }} />
      </View>
    );
  }
  const label = network === "Amex" ? "AMEX" : network === "RuPay" ? "RuPay" : network === "Visa" ? "VISA" : null;
  if (!label) return null;
  return (
    <Text style={{ color: network === "Visa" && !dark ? "#1A1F71" : ink, fontSize: 24, lineHeight: 28, fontStyle: "italic", fontWeight: "900", letterSpacing: network === "Visa" ? 1 : 0 }}>{label}</Text>
  );
}

export function CreditCardFace({
  issuer,
  name,
  networks,
  label,
  footer,
  palette = CARD_PALETTES[0]!,
}: {
  issuer: string;
  name: string;
  networks: Network[];
  label?: string;
  footer?: ReactNode;
  palette?: CardPalette;
}) {
  const { ink, muted } = cardInk(palette);
  const b = palette.blobs;
  return (
    <View
      style={{
        width: "100%",
        aspectRatio: 1.586, // ISO/IEC 7810 ID-1, a real card's proportions
        borderRadius: 18,
        overflow: "hidden",
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: "rgba(255,255,255,0.35)",
      }}
    >
      <LinearGradient colors={palette.base} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Blob color={b[0]} size={55} top="-28%" left="22%" opacity={0.9} />
      <Blob color={b[1]} size={44} top="18%" left="46%" />
      <Blob color={b[2]} size={30} top="46%" left="40%" />
      <Blob color={b[3]} size={36} top="-2%" left="66%" />
      <Blob color={b[4]} size={26} top="30%" left="78%" opacity={0.9} />
      <Blob color={b[5]} size={50} top="58%" left="68%" />
      <Blob color={b[6]} size={45} top="66%" left="2%" opacity={0.7} />
      <BlurView intensity={45} tint={palette.dark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
      {/* Sheen across the top-left, like light on a laminated card. */}
      <LinearGradient colors={[palette.dark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.6)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.7 }} style={StyleSheet.absoluteFill} />

      <View style={{ flex: 1, padding: 20, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <View style={{ gap: 10 }}>
            <Text variant="caption" style={{ color: muted, letterSpacing: 1.2 }}>
              {issuer.toUpperCase()}
            </Text>
            <Chip />
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            {label ? (
              <View style={{ backgroundColor: "rgba(20,20,22,0.85)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text variant="caption" style={{ color: "#FFFFFF", letterSpacing: 0.8 }}>
                  {label}
                </Text>
              </View>
            ) : null}
            <SymbolView name="wave.3.right" tintColor={ink} size={22} />
          </View>
        </View>
        <Text variant="heading" numberOfLines={2} style={{ color: ink, letterSpacing: 0.2 }}>
          {name}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>{footer}</View>
          <NetworkMark network={networks[0]} dark={palette.dark} />
        </View>
      </View>
    </View>
  );
}

export const CARD_INK_MUTED = INK_MUTED;
