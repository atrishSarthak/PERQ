# Running PERQ on your iPhone

1. Install **Expo Go** from the App Store. Open it once and check it supports **SDK 58** (the app is on Expo SDK 58).
2. Put the laptop and iPhone on the same Wi-Fi (your laptop currently uses the iPhone's Personal Hotspot at `172.20.10.4`, which also works).
3. From the repo root: `pnpm install`, then `pnpm db:migrate && pnpm db:seed-cards`.
   (Root `.env` already has `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`, `MOBILE_JWT_SECRET`.)
4. Terminal 1: `pnpm dev:web` (serves on `0.0.0.0:3000`). Check `http://<LAN-IP>:3000/api/health` from the phone's Safari.
5. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:3000` (find it with `ipconfig getifaddr en0`). Restart Expo after changing it.
6. Terminal 2: `pnpm dev:mobile`. A QR code appears.
7. Open the iPhone **Camera**, point it at the QR, tap the banner. PERQ opens in Expo Go.
8. If the QR won't connect (college Wi-Fi often blocks it): `pnpm --filter @perq/mobile start:tunnel`.
9. If the app opens but can't load data: long-press the **Profile** title (or the PERQ wordmark on Welcome) for **Diagnostics**. It shows the API URL and a live `/api/health` check. Use the Vercel URL if the local one is unreachable.

## Flow to test
Sign up → 7-question quiz (8 for students / income under ₹25k) → "Ember is on it" narration → Cards tab (leakage, Ember's pick, sort, filters, "I have this card") → tap any ₹ for **See the math** → Ember tab (try the chips) → Profile: tap an answer, change it, see the ranking update → Home.

## Useful commands
- `pnpm test`: all unit tests. `pnpm eval`: live Ember eval (uses Gemini quota).
- `GEMINI_DISABLED=1 pnpm dev:web`: run with Gemini off to see the template fallback.
- Gemini free tier on this key: ~20 requests/day on `gemini-3.5-flash`; Flash-Lite leads the chain (DECISIONS.md #48).

## Deployed backend (not done yet)
Deploy `apps/web` to Vercel (root directory `apps/web`), set `DATABASE_URL`, `AUTH_SECRET`, `MOBILE_JWT_SECRET`, `GEMINI_API_KEY`, then set `EXPO_PUBLIC_API_URL=https://<project>.vercel.app`.
