import { Text as RNText, type TextProps, type TextStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";

type Variant = "display" | "title" | "heading" | "body" | "bodyStrong" | "small" | "caption";
type Tone = "default" | "muted" | "ember" | "link" | "success" | "danger" | "onPrimary" | "onEmber";

export function Text({
  variant = "body",
  tone = "default",
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const t = useTheme();
  const color = {
    default: t.colors.text,
    muted: t.colors.textMuted,
    ember: t.colors.ember,
    link: t.colors.link,
    success: t.colors.success,
    danger: t.colors.danger,
    onPrimary: t.colors.onPrimary,
    onEmber: t.colors.onEmber,
  }[tone];

  const variants: Record<Variant, TextStyle> = {
    display: { fontFamily: t.fonts.displayExtra, fontSize: 40, lineHeight: 44, letterSpacing: -0.5 },
    title: { fontFamily: t.fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.3 },
    heading: { fontFamily: t.fonts.display, fontSize: 20, lineHeight: 26 },
    body: { fontFamily: t.fonts.body, fontSize: t.fontSizes.body, lineHeight: 23 },
    bodyStrong: { fontFamily: t.fonts.bodySemi, fontSize: t.fontSizes.body, lineHeight: 23 },
    small: { fontFamily: t.fonts.body, fontSize: t.fontSizes.bodySm, lineHeight: 20 },
    caption: { fontFamily: t.fonts.bodyMedium, fontSize: t.fontSizes.caption, lineHeight: 16 },
  };

  return <RNText style={[variants[variant], { color }, style]} {...rest} />;
}
