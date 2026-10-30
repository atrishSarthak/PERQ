// The one place Ember's Gemini model is pinned (handoff §0.4).
//
// Checked against the live API on 2026-10-31: `gemini-flash-latest` now
// resolves to gemini-3.8-flash, which took 40–134 s for a one-word reply on
// this key, far too slow for live narration. `gemini-3.5-flash` answered in
// ~2 s. Flash-Lite is the second hop when the first model's free-tier quota
// is exhausted (429): each model has its own quota bucket.
// Free-tier RPM/RPD limits change often; check them in Google AI Studio
// (Settings → Rate limits) rather than trusting a number in code.
// GEMINI_MODEL in the environment overrides the whole chain with one model.
export const EMBER_MODEL = "gemini-3.5-flash";
export const EMBER_FALLBACK_MODEL = "gemini-3.5-flash-lite";
export const EMBER_MODEL_CHAIN = [EMBER_MODEL, EMBER_FALLBACK_MODEL];
