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
2. **Home** shows ₹21,920 left to spend in November (the demo budget is ₹28,000), **Ember noticed** ("Axis ACE bill due Tuesday", ₹22,120),
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
7. Back in Diagnostics: **Reset demo** clears everything, including the demo's purchase plans.

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

## Purchase Planner (Step 3)

**Demo on the iPhone (about 4 minutes).** Load demo data as above. It now has three cards (Axis ACE, SimplyCLICK
and an HDFC **Regalia Gold**) and three ready plans. Open them from **Home → Your plans** (or Profile → Your plans).
1. **Pixel 10 phone, ₹59,900, with a ₹1,500 HDFC offer, needed by 5 Dec → "Go ahead, on 26 Nov".**
   The Regalia Gold statement closes on 25 Nov, so buying on the 26th gives 49 interest-free days instead of 22.
   Open **Timing** for the calendar strip. Net cost is ₹58,108 (price − offer − rewards), ₹1,792 less than UPI.
   Ember also says it's ₹36,480 more than what's left this month: the need-by date skips the wait, but the
   overshoot is still stated. A reminder is already set for 26 Nov.
2. **Lenovo laptop, ₹24,999 on "no-cost" EMI (6 months, ₹199 fee) → "Pay a different way: Axis ACE".**
   The EMI costs ₹799 more than paying in full (GST on the interest, the fee with GST, and lost rewards). Open
   **EMI** for the line-by-line true cost, and **Best way to pay** for all 8 options.
3. **Manali trip package, ₹38,000 → "Better to wait"**, because it's more than December's ₹28,000. Tap
   **Add this goal** on the savings-goal card ("₹38,000 by 22 Dec") and it appears under Budgets and goals.
4. On any plan, try **What if…** (Pay by UPI, Use my SimplyCLICK, a different price). Nothing is saved until you
   tap **Keep this version**. **Ask Ember about this** opens a chat about that plan.
5. **Time travel** in Diagnostics: tap **+1 day** four times, to 26 Nov. The days run as in Step 2, then on 26 Nov
   the inbox (bell) has **"Your Pixel 10 phone plan: Today works… use your Regalia Gold"**. Ember re-ran the plan
   with that day's numbers before sending it. In Expo Go the reminder is also scheduled as a local notification
   (9 am on the day) when the app opens; tapping it opens the plan.

**Making your own plan.** Tap **Should I buy this?** on Home. Then either type the item and price, tap **Add
screenshot** (a product page; it's read in memory and not stored), or **Paste link**. The server never fetches
the page: the link gives only the shop and maybe the item name. Every source goes through a confirmation form
before anything is planned. In the **Ember** tab, ask "Should I buy a ₹45,000 phone?". Ember shows the same
confirmation as a card, and the plan runs when you tap **Plan it**.

**Statement matching.** When a later statement holds a purchase that looks like an open plan (same shop, price
within 5%, within 30 days after the plan was made), the inbox asks "Did you buy the …?". **Yes** marks the plan bought and
shows how it went against the plan. The API round trip test does exactly this: `pnpm --filter @perq/web test:db`.

## Useful commands
- `pnpm test`: all unit tests. `pnpm eval`: live Ember eval (uses Gemini quota).
- `pnpm eval:money`: live nudge-copy + money chat eval (10 fixtures). `pnpm eval:plans`: live planner eval
  (10 fixtures: explanations, a missing price in chat, 5 screenshots).
- `pnpm test:db`: the planner API round trip on a throwaway user in the real database (needs `.env`). `pnpm eval:statements`: statement extraction
  accuracy, heuristic and Gemini, on the synthetic fixtures. Results in `docs/EVALS.md`.
- `pnpm statements:fake`: regenerate the synthetic statement PDFs and expected JSON.
- `GEMINI_DISABLED=1 pnpm dev:web`: run with Gemini off to see the template fallback.
- Gemini free tier on this key: ~20 requests/day on `gemini-3.5-flash`; Flash-Lite leads the chain (DECISIONS.md #48).

## Deployed backend (not done yet)
Deploy `apps/web` to Vercel (root directory `apps/web`), set `DATABASE_URL`, `AUTH_SECRET`, `MOBILE_JWT_SECRET`, `GEMINI_API_KEY`,
`PARSE_TOKEN_SECRET`, `CRON_SECRET` (and `DEMO_ENABLED=false` for anything real), then set
`EXPO_PUBLIC_API_URL=https://<project>.vercel.app`. The cron in `apps/web/vercel.json` runs once deployed.
Before any real user's statement: move the Gemini key to the paid tier (DECISIONS.md #88).
