// Pure money math for PERQ (handoff §0.5). No I/O, no Node or Next APIs —
// consumed by the web API and by the Expo app alike. All money is integer
// rupees, rounded once at the end of a calculation, never mid-way.
export const FINANCE_ENGINE_VERSION = 1;
