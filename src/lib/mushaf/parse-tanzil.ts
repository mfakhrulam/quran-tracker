export interface SurahRow {
  number: number;
  arabic: string;
  latin: string;
  ayahCount: number;
}

export interface PageRow {
  pageNumber: number;
  juz: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
}

function extractPairs(source: string, name: string, minParts = 2): number[][] {
  const re = new RegExp(`QuranData\\.${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
  const m = source.match(re);
  if (!m) throw new Error(`QuranData.${name} tidak ditemukan`);
  const entries = m[1].match(/\[[^\]]*\]/g) ?? [];
  return entries
    .map((e) => e.slice(1, -1).split(",").map((t) => t.trim()))
    .filter((parts) => parts.length >= minParts && parts[0] !== "")
    .map((parts) => [Number(parts[0]), Number(parts[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export function parseTanzilMetadata(source: string): PageRow[] {
  const sura = extractPairs(source, "Sura", 8);
  const juz = extractPairs(source, "Juz");
  const page = extractPairs(source, "Page");

  if (sura.length === 0) throw new Error("Data surah kosong");
  if (page.length < 2) throw new Error("Data halaman kosong");

  const surahCount = sura.length;
  const surahOffset: number[] = [0];
  for (let s = 1; s <= surahCount; s++) {
    surahOffset[s] = surahOffset[s - 1] + sura[s - 1][1];
  }
  const globalOf = (s: number, a: number) => surahOffset[s - 1] + a;
  const verseOf = (g: number): [number, number] => {
    for (let s = 1; s <= surahCount; s++) {
      if (g > surahOffset[s - 1] && g <= surahOffset[s]) return [s, g - surahOffset[s - 1]];
    }
    throw new Error(`Indeks ayat global di luar jangkauan: ${g}`);
  };
  const juzStartGlobal = juz.map(([s, a]) => globalOf(s, a));

  const pageStarts = page.map(([s, a]) => globalOf(s, a));
  const rows: PageRow[] = [];
  for (let i = 0; i < pageStarts.length - 1; i++) {
    const startGlobal = pageStarts[i];
    const endGlobal = pageStarts[i + 1] - 1;
    const [surahStart, ayahStart] = verseOf(startGlobal);
    const [surahEnd, ayahEnd] = verseOf(endGlobal);
    let juzNumber = 1;
    for (let j = 0; j < juzStartGlobal.length; j++) {
      if (juzStartGlobal[j] <= startGlobal) juzNumber = j + 1;
    }
    rows.push({ pageNumber: i + 1, juz: juzNumber, surahStart, ayahStart, surahEnd, ayahEnd });
  }
  return rows;
}

function stripQuotes(value: string): string {
  const t = value.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

export function parseTanzilSurahs(source: string): SurahRow[] {
  const re = /QuranData\.Sura\s*=\s*\[([\s\S]*?)\];/;
  const m = source.match(re);
  if (!m) throw new Error("QuranData.Sura tidak ditemukan");
  const entries = m[1].match(/\[[^\]]*\]/g) ?? [];
  const rows: SurahRow[] = [];
  let number = 0;
  for (const entry of entries) {
    const parts = entry.slice(1, -1).split(",").map((t) => t.trim());
    if (parts.length < 8) continue;
    if (!Number.isFinite(Number(parts[0])) || !Number.isFinite(Number(parts[1]))) continue;
    number += 1;
    rows.push({
      number,
      arabic: stripQuotes(parts[4]),
      latin: stripQuotes(parts[5]),
      ayahCount: Number(parts[1]),
    });
  }
  if (rows.length === 0) throw new Error("Data surah kosong");
  return rows;
}
