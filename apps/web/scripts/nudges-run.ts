// pnpm nudges:run --user <id> [--now 2026-11-14] [--upcoming]
// Runs the nudge engine for one user with an optional fake date (09:00 IST that day).
import { runNudgeEngine, upcomingNudges } from "@/lib/money/nudgeEngine";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const user = arg("user");
if (!user) {
  console.error("usage: pnpm nudges:run --user <id> [--now YYYY-MM-DD] [--upcoming]");
  process.exit(1);
}
const nowArg = arg("now");
const now = nowArg ? new Date(nowArg.length === 10 ? `${nowArg}T09:00:00+05:30` : nowArg) : new Date();

async function main() {
  const result = process.argv.includes("--upcoming") ? await upcomingNudges(user!, now) : await runNudgeEngine(user!, now);
  console.log(JSON.stringify({ now: now.toISOString(), result }, null, 2));
}
main().then(() => process.exit(0), (err) => {
  console.error(err);
  process.exit(1);
});
