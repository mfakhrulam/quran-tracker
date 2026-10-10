import { writeFileSync, mkdirSync } from "node:fs";
import { parseTanzilMetadata, parseTanzilSurahs } from "../src/lib/mushaf/parse-tanzil";

const SOURCE_URL = "https://tanzil.net/res/text/metadata/quran-data.js";

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Gagal fetch: HTTP ${res.status}`);
  const source = await res.text();
  const rows = parseTanzilMetadata(source);
  const surahs = parseTanzilSurahs(source);

  if (rows.length !== 604) throw new Error(`Harus 604 halaman, dapat ${rows.length}`);
  if (surahs.length !== 114) throw new Error(`Harus 114 surah, dapat ${surahs.length}`);
  if (rows[0].surahStart !== 1 || rows[0].ayahStart !== 1) throw new Error("Halaman 1 tidak valid");
  const last = rows[603];
  if (last.surahEnd !== 114 || last.ayahEnd !== 6) throw new Error("Halaman 604 tidak valid");

  mkdirSync("src/data", { recursive: true });
  writeFileSync("src/data/pages.json", JSON.stringify(rows, null, 2) + "\n");
  writeFileSync("src/data/surahs.json", JSON.stringify(surahs, null, 2) + "\n");
  console.log(`Menulis 604 halaman + 114 surah ke src/data/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
