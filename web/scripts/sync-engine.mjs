/**
 * sync-engine.mjs: vendors the gtm-xray engine (../src/gtm/*.ts) into
 * web/lib/engine/ so the Next.js app is self-contained under web/
 * (Vercel deploys web/ as the project root, so ../src is not available).
 * Relative "./x.js" specifiers are rewritten to "./x" for webpack.
 * Runs automatically via the `prebuild` npm script.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "src", "gtm");
const destDir = join(here, "..", "lib", "engine");

mkdirSync(destDir, { recursive: true });

const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
for (const f of files) {
  const content = readFileSync(join(srcDir, f), "utf8");
  const rewritten = content.replace(/from\s+["']\.\/([^"']+)\.js["']/g, 'from "./$1"');
  writeFileSync(join(destDir, f), rewritten);
}
console.log(`synced ${files.length} engine files to lib/engine/`);
