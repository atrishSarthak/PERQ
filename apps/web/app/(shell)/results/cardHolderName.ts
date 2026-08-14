// The card visual's "CARD HOLDER" field uses the logged-in user's first
// name. Auth.js session.user.name is only populated for Google OAuth sign-
// ins — email/password registration (apps/web/app/api/register/route.ts)
// never captures a name — so this falls back to the email's local-part,
// which is always present for an authenticated session.
export function firstNameFrom(
  name: string | null | undefined,
  email: string | null | undefined
): string {
  if (name && name.trim()) return name.trim().split(/\s+/)[0] ?? "Card Holder";
  if (email) return email.split("@")[0] ?? "Card Holder";
  return "Card Holder";
}
