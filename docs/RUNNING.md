# Running PERQ on your iPhone

1. Install **Expo Go** from the App Store. Open it once and check it supports **SDK 58** (the app is on Expo SDK 58).
2. Put the laptop and iPhone on the same Wi-Fi (your laptop currently uses the iPhone's Personal Hotspot at `172.20.10.4`, which also works).
3. From the repo root: `pnpm install`, then `pnpm db:migrate && pnpm db:seed-cards`.
   (Root `.env` already has `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `MOBILE_JWT_SECRET`, and for Step 2
   `PARSE_TOKEN_SECRET`, `CRON_SECRET`, `DEMO_ENABLED=true`. See `.env.example`.)
4. Terminal 1: `pnpm dev:web` (serves on `0.0.0.0:3000`). Check `http://<LAN-IP>:3000/api/health` from the phone's Safari.
5. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000` (find it with `ipconfig getifaddr en0`). Restart Expo after changing it.
6. Terminal 2: `pnpm dev:mobile`. A QR code appears.
7. Open the iPhone **Camera**, point it at the QR, tap the banner. PERQ opens in Expo Go.
8. If the QR won't connect (college Wi-Fi often blocks it): `pnpm --filter @perq/mobile start:tunnel`.
9. If the app opens but can't load data: long-press the **Profile** title (or the PERQ wordmark on Welcome) for **Diagnostics**. It shows the API URL and a live `/api/health` check. Use the Vercel URL if the local one is unreachable.

## Flow to test
Sign up → 7-question quiz (8 for students / income under ₹25k) → "Ember is on it" narration → Cards tab (leakage, Ember's pick, sort, filters, "I have this card") → tap any ₹ for **See the math** → Ember tab (try the chips) → Profile: tap an answer, change it, see the ranking update → Home.

## Money Manager (Step 2)

**Demo on the iPhone (about 3 minutes).** It uses synthetic data only and replaces this account's money data.
1. Sign in, then long-press the **Profile** title to open **Diagnostics** → **Demo mode** → **Load demo data**.
   The account's clock jumps to **Sun 22 Nov 2026, 9:00 am IST**.
2. **Home** shows ₹33,920 left to spend in November, **Ember noticed** ("Axis ACE bill due Tuesday", ₹22,120),
   upcoming dues with *Mark as paid*, and spending bars (food delivery ₹4,100 of ₹5,000). The bell shows 2 nudges.
3. Tap **Ember noticed**. A chat opens about that nudge, with chips. Try "How much should I pay to get under 30%?"
   on the utilisation nudge, then **Why am I seeing this?**
4. **Cards → My cards → SimplyCLICK**: 74% utilisation, 4,200 points ≈ ₹1,050, fee waiver progress, ₹590 fees,
   best card in hindsight (₹340 on the AIRTEL bill), transactions (tap one to recategorise), statements.
5. **Time travel** in Diagnostics: **+1 day** three times. Each day the engine sends at most 2 nudges.
   22 Nov: due soon + 74% utilisation. 23 Nov: ₹590 fees + points. 24 Nov: due today + fee waiver.
   25 Nov: ₹340 missed rewards + goal. In Expo Go these show up in the **inbox** (bell). See "Notifications" below.
6. **Profile → Budgets & goals**, **What Ember did**, and **Privacy & data** (consents, delete all, delete account).
   Ask Ember "Suggest a budget for me" and tap **Confirm** on the proposal.
7. Back in Diagnostics: **Reset demo** clears everything.

**Uploading a statement.** Home → *Upload a statement*. In dev builds the upload screen also has three **sample
statement** buttons (synthetic HDFC / SBI / Axis PDFs, passwords filled in) so you don't need a file on the phone.
To test a real PDF, put it in the iPhone's Files app and pick it. The PDF and password are read once in memory.
Real statements you test with go in `fixtures/private/` (gitignored). Never commit them.

**Notifications in Expo Go.** iOS remote push needs an EAS projectId, which this app doesn't have yet. So in
Expo Go the app schedules **local notifications** for the next 7 days (the same plan the daily job will follow,
at 9 am IST, max 2/day) each time it opens, and the inbox always works. Allow notifications on the explainer
screen shown on first Home visit. With `eas init` and a projectId in `app.json`, real push turns on automatically
(DECISIONS.md #83).

**Nudges from the command line.**
- `pnpm nudges:run --user <userId> --now 2026-11-14`: run the engine as of 9 am IST that day.
- `pnpm nudges:run --user <userId> --upcoming`: what the next 7 days would send.
- Daily job: `GET /api/cron/nudges` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron `30 3 * * *`,
  `apps/web/vercel.json`).

## Useful commands
- `pnpm test`: all unit tests. `pnpm eval`: live Ember eval (uses Gemini quota).
- `pnpm eval:money`: live nudge-copy + money chat eval (10 fixtures). `pnpm eval:statements`: statement extraction
  accuracy, heuristic and Gemini, on the synthetic fixtures. Results in `docs/EVALS.md`.
- `pnpm statements:fake`: regenerate the synthetic statement PDFs and expected JSON.
- `GEMINI_DISABLED=1 pnpm dev:web`: run with Gemini off to see the template fallback.
- Gemini free tier on this key: ~20 requests/day on `gemini-3.5-flash`; Flash-Lite leads the chain (DECISIONS.md #48).

## Deployed backend (not done yet)
Deploy `apps/web` to Vercel (root directory `apps/web`), set `DATABASE_URL`, `AUTH_SECRET`, `MOBILE_JWT_SECRET`, `GEMINI_API_KEY`,
`PARSE_TOKEN_SECRET`, `CRON_SECRET` (and `DEMO_ENABLED=false` for anything real), then set
`EXPO_PUBLIC_API_URL=https://<project>.vercel.app`. The cron in `apps/web/vercel.json` runs once deployed.
Before any real user's statement: move the Gemini key to the paid tier (DECISIONS.md #88).
