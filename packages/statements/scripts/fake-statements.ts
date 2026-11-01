import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSyntheticStatement, renderSyntheticPdf } from "../src/synthetic";
import { FIXTURE_SPECS } from "../src/fixtures";

// pnpm statements:fake: writes the synthetic, password-protected fixture
// PDFs and their expected JSON. Synthetic only; never put real statements
// here (real ones go in fixtures/private/, which is gitignored).
const out = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures/synthetic");
mkdirSync(out, { recursive: true });
for (const spec of FIXTURE_SPECS) {
  const s = buildSyntheticStatement(spec);
  const pdf = await renderSyntheticPdf(s);
  const name = `${spec.layout}-${spec.issuer.split(" ")[0]!.toLowerCase()}-${spec.statementDate}`;
  writeFileSync(`${out}/${name}.pdf`, pdf);
  writeFileSync(`${out}/${name}.json`, JSON.stringify({ password: spec.password, layout: spec.layout, expected: s.expected }, null, 2) + "\n");
  console.log(`${name}.pdf  ${s.expected.transactions.length} transactions  total due Rs. ${s.expected.totalDue}`);
}
