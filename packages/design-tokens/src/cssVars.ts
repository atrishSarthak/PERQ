import { fontFamilies, fontSizes, radii, spacing, themes, type ThemeColors } from "./tokens";

// Maps each semantic role to the CSS custom property apps/web reads.
const CSS_VAR_NAMES: Record<keyof ThemeColors, string> = {
  bg: "--bg-base",
  surface: "--bg-surface",
  surface2: "--bg-surface-2",
  surfaceDeep: "--bg-surface-deep",
  border: "--border",
  text: "--text-primary",
  textMuted: "--text-secondary",
  primary: "--primary",
  primaryPressed: "--primary-pressed",
  onPrimary: "--on-primary",
  link: "--link",
  ember: "--ember",
  emberPressed: "--ember-pressed",
  emberText: "--ember-text",
  onEmber: "--on-ember",
  success: "--success",
  warning: "--warning",
  danger: "--danger",
};

function themeBlock(colors: ThemeColors): string {
  return (Object.keys(CSS_VAR_NAMES) as (keyof ThemeColors)[])
    .map((k) => `  ${CSS_VAR_NAMES[k]}: ${colors[k]};`)
    .join("\n");
}

/** The full contents of tokens.css, derived from tokens.ts. */
export function buildTokensCss(): string {
  const scale = [
    `  --font-display: "${fontFamilies.display}", "${fontFamilies.body}", sans-serif;`,
    `  --font-body: "${fontFamilies.body}", sans-serif;`,
    `  --text-display-size: ${fontSizes.display}px;`,
    `  --text-h1-size: ${fontSizes.h1}px;`,
    `  --text-h2-size: ${fontSizes.h2}px;`,
    `  --text-body-lg-size: ${fontSizes.bodyLg}px;`,
    `  --text-body-size: ${fontSizes.body}px;`,
    `  --text-body-sm-size: ${fontSizes.bodySm}px;`,
    `  --text-caption-size: ${fontSizes.caption}px;`,
    ...Object.entries(spacing).map(([k, v]) => `  --space-${k}: ${v}px;`),
    `  --radius-sm: ${radii.sm}px;`,
    `  --radius-md: ${radii.md}px;`,
    `  --radius-lg: ${radii.lg}px;`,
  ].join("\n");

  return `/*
 * GENERATED from packages/design-tokens/src/tokens.ts by
 * \`pnpm --filter @perq/design-tokens build:css\`. Do not edit by hand.
 *
 * Dark is the default theme (handoff §3); light applies only when the user
 * picks it (data-theme="light" on <html>).
 */

:root {
${themeBlock(themes.dark)}
${scale}
  color-scheme: dark;
}

:root[data-theme="light"] {
${themeBlock(themes.light)}
  color-scheme: light;
}
`;
}
