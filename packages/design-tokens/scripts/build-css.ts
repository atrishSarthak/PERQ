import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokensCss } from "../src/cssVars";

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(resolve(__dirname, "../src/tokens.css"), buildTokensCss());
console.log("Wrote src/tokens.css");
