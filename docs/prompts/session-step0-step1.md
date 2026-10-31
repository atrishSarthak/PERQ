Read docs/PERQ_Handoff_Step0_Step1.md in full before doing anything. It is the
spec for this session: Step 0 (monorepo foundation, MIMIR → Ember rename, new
brand colours, Ember agent core, finance engine, mobile auth, Expo app shell)
and Step 1 (Card Recommender v2 on mobile and web).

Work through the checkpoints in Section 11 in order, starting with the audit in
Section 4. Commit after each checkpoint. Use plan mode for checkpoint 2 (the
monorepo restructure) and show me the plan before moving files.

Rules that matter most:
- Upgrade the existing Feature 1 code; don't rebuild it.
- Every rupee figure comes from packages/finance-engine, never from Gemini.
- Everything must run in Expo Go on my iPhone, so no custom native modules.
- Card terms must come from the bank's own pages, with source links; mark
  anything you can't verify and exclude it from ranking.

Stop and ask me only for things you can't decide yourself (API keys, database
URL, Vercel access). Log every other judgement call in docs/DECISIONS.md and
keep going. When you finish, walk me through docs/RUNNING.md so I can scan the
QR code and test the full flow on my phone.