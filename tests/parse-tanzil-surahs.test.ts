import { describe, it, expect } from "vitest";
import { parseTanzilSurahs } from "@/lib/mushaf/parse-tanzil";

const FIXTURE = `
QuranData.Sura = [
	// [start, ayas, order, rukus, name, tname, ename, type]
	[],
	[0, 7, 5, 1, 'الفاتحة', "Al-Faatiha", 'The Opening', 'Meccan'],
	[7, 286, 87, 40, 'البقرة', "Al-Baqara", 'The Cow', 'Medinan'],
	[293, 200, 89, 20, 'آل عمران', "Aal-i-Imraan", 'Family', 'Medinan'],
	[6236, 1]
];
`;

describe("parseTanzilSurahs", () => {
  const rows = parseTanzilSurahs(FIXTURE);
  it("menghasilkan 114 baris pada data asli; fixture menghasilkan 3", () => {
    expect(rows).toHaveLength(3);
  });
  it("nomor surah berurutan dari 1 dan melewati entri kosong/total", () => {
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3]);
  });
  it("mengambil nama arab, latin, dan jumlah ayat", () => {
    expect(rows[0]).toMatchObject({ number: 1, arabic: "الفاتحة", latin: "Al-Faatiha", ayahCount: 7 });
    expect(rows[1]).toMatchObject({ number: 2, arabic: "البقرة", latin: "Al-Baqara", ayahCount: 286 });
  });
});
