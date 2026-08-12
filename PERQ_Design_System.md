# PERQ — Design System & Brand Tokens

*Foundational doc. Every feature's UI (Feature 1 web onboarding, Feature 2 extension, Feature 3 goal advisor) should be built from these tokens and conventions — a Claude Code session should never invent a new color, font, or spacing value outside this system.*

---

## 1. The Brand Tension

MIMIR is named for a Norse figure consulted for wisdom — that gives the *product* mythological gravitas. The *voice* stays unmistakably Gen Z: bold, direct, a little playful, never sounding like a bank. This isn't a conflict to resolve — it's the point. MIMIR is the wise one, but it talks like it actually knows your life (concert tickets, BNPL traps, group plans), not like a financial institution.

Practically, this tension is carried by **typography and copy**, not by softening the color system — the palette stays clean and high-contrast (see below); the "wisdom" comes through in the display type and how MIMIR's narration is written.

---

## 2. Color Tokens

### Primitives (locked)

| Token | Hex | Role |
|---|---|---|
| `--color-white` | `#FFFFFF` | Primary |
| `--color-black` | `#000000` | Secondary |
| `--color-accent` | `#00A1FF` | Accent — MIMIR's signature color; used for interactive elements, active states, and anything "MIMIR is doing this right now" |

### Semantic tokens (proposed — needed for a working UI, not yet explicitly specified by you; flag if you want different values)

| Token | Light mode | Dark mode | Use |
|---|---|---|---|
| `--bg-base` | `#FFFFFF` | `#000000` | Page background |
| `--bg-surface` | `#F7F7F8` | `#0D0D0F` | Cards, panels |
| `--text-primary` | `#000000` | `#FFFFFF` | Body/heading text |
| `--text-secondary` | `#5C5C63` | `#A6A6AD` | Muted/supporting text |
| `--accent` | `#00A1FF` | `#00A1FF` | Interactive, links, MIMIR-narration highlights |
| `--success` | `#16A34A` | `#22C55E` | Positive recommendation signal (e.g. "this saves you money") |
| `--warning` | `#D97706` | `#F59E0B` | Caution (e.g. "you already have 2 EMIs running") |
| `--danger` | `#DC2626` | `#EF4444` | Errors only, not used for advisory content (MIMIR should never look alarmist about a card) |
| `--border` | `#E5E5E8` | `#232326` | Dividers, card outlines |

Built as CSS variables from day 1 (per your "both from day 1" decision), toggled via a `data-theme` attribute or `prefers-color-scheme`, consumed identically by `packages/ui`.

**Accessibility check:** `#00A1FF` on `#FFFFFF` background is borderline for small text (contrast ratio ~2.7:1) — fine for large text, icons, and UI chrome, but body text should stay `--text-primary`/`--text-secondary`, never accent-colored, to stay WCAG-compliant. Same caution applies to `#00A1FF` on `#000000` (better, ~4.6:1, but still reserve it for UI elements over long-form reading text).

---

## 3. Typography

**Direction locked:** bold Gen-Z display sans for headlines/emphasis moments + a neutral sans for UI/body.

**Proposed pairing** (both free, both work well in Next.js via `next/font`):

| Role | Font | Why |
|---|---|---|
| Display (headlines, MIMIR's key recommendation moments, e.g. "Use your Axis card") | **Cabinet Grotesk** (Fontshare, free) | Bold, geometric, confident without being loud — reads as a considered statement, not a shout |
| Body / UI (quiz questions, form labels, explanatory text, navigation) | **Inter** or **Geist** | Neutral, highly legible at small sizes, the safe workhorse for dense UI text |

If you'd rather pick different specific faces, swap them here — the *system* (one bold display font for MIMIR's moments, one neutral workhorse for everything else) is the locked decision; the specific names are a preference call.

**Scale (proposed, 4/8pt-ish rhythm):**

| Token | Size | Use |
|---|---|---|
| `text-display` | 40–56px, display font | MIMIR's headline recommendation |
| `text-h1` | 32px, display font | Page/section titles |
| `text-h2` | 24px, display font | Card/subsection titles |
| `text-body-lg` | 18px, body font | Key explanatory text |
| `text-body` | 16px, body font | Default UI text |
| `text-body-sm` | 14px, body font | Secondary/meta text |
| `text-caption` | 12px, body font | Timestamps, fine print |

---

## 4. Spacing, Radius, Elevation

| Token | Value |
|---|---|
| Spacing scale | 4px base unit: 4/8/12/16/24/32/48/64 |
| Radius | `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 20px` — rounded but not pill-shaped by default; keeps the "considered advisor" feel rather than a bubbly social-app feel |
| Elevation | Prefer 1px `--border` + subtle background shift (`--bg-surface`) over heavy drop shadows — flatter, more editorial, less "app store card game" |

---

## 5. Component Conventions

- Base primitives from **shadcn/ui**, themed with the tokens above — don't hand-roll basic components (buttons, inputs, dialogs) that shadcn already provides well.
- One PERQ-specific component every feature will need: a **"MIMIR is working" narration component** — a structured, visible step-list (not a spinner) that shows what MIMIR is currently doing ("Reading your quiz," "Scoring 118 cards," "Writing your recommendation"). Build this once in `packages/ui` in Feature 1; Feature 2 and 3 reuse it for their own multi-step agentic actions ("MIMIR is checking 4 sites for you").
- Recommendation results should always be presented as: **the card/answer, a confidence-free plain-language "why" attributed to MIMIR, and the underlying factor it traces to** (e.g. "because your food delivery spend is ₹4,200/month") — never a bare score or a vague "recommended for you."

---

## 6. Voice & Tone

- Always attribute to **MIMIR by name** — "MIMIR recommends the Axis Airtel card," never "PERQ recommends" or a generic "Recommended for you." This is non-negotiable across all three features per the handbook.
- Direct, plain-language, a little playful — write like you're texting a smart friend who happens to know finance, not like a bank's terms page.
- Never hedge with disclaimers that undercut confidence ("this might possibly help you save some money") — MIMIR has done the work (see §5's narration component), so it can state its reasoning plainly.
- Never use urgency/scarcity language ("Only 2 spots left," "Act now!") — that's the "social media gimmick" the handbook explicitly wants PERQ to avoid. Urgency in this product should only ever reflect something real (e.g. an actual ticket-sale countdown from Feature 3's context), never manufactured.
- Compliance language ("self-reported data," "advisory only") should read as a *feature*, stated plainly and confidently, not a buried legal footnote.

---

## 7. What's Explicitly Not Decided Yet

- Illustration/iconography style (not needed until Feature 1's UI is actually being built — can be decided in the PRD or during build).
- Motion/animation conventions (defer to Feature 1 PRD).
- Logo/wordmark treatment (defer — not a blocker for Feature 1's functional build).
