// Sembel Sky Courier — entry program (Node 22, standard library only).
//
// What it does: takes the playable game in game/ and the screenshots in
// screenshots/ from beside this file, copies both into the output directory
// the grader reads, and writes dossier.json there — the summary the judge
// reads — using the vendored make.fun dossier library.
//
// Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader MAKEFUN_OUTPUT_DIR is unset and /output is used.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-game.ts";

const repoRoot = fileURLToPath(new URL(".", import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const gameSource = join(repoRoot, "game");
const shotsSource = join(repoRoot, "screenshots");

if (!existsSync(join(gameSource, "index.html"))) {
  throw new Error(`game/index.html is missing under ${gameSource} — nothing to hand in`);
}

mkdirSync(outputDir, { recursive: true });
cpSync(gameSource, join(outputDir, "game"), { recursive: true });
mkdirSync(join(outputDir, "screenshots"), { recursive: true });
if (existsSync(shotsSource)) {
  cpSync(shotsSource, join(outputDir, "screenshots"), { recursive: true });
}

// The scorer's own caps: only text_max_bytes shapes the dossier bytes; the
// rest refuse an entry the scorer would refuse anyway (more than 4 shots or
// one over 256 KiB; more than 993 files or 48 MiB under game/; a game path
// over 1000 bytes).
const dossierText = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, "dossier.json"), dossierText);
console.log(`Sembel Sky Courier handed in: ${outputDir} (${dossierText.length} byte dossier)`);
