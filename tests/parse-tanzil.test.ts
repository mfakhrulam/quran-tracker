import { describe, it, expect } from "vitest";
import { parseTanzilMetadata } from "@/lib/mushaf/parse-tanzil";

const FIXTURE = `
QuranData.Sura = [
	// [start, ayas, order, rukus, name, tname, ename, type]
	[],
	[0, 7, 5, 1, 'X', "Al-Faatiha", 'The Opening', 'Meccan'],
	[7, 5, 87, 40, 'X', "Al-Baqara", 'The Cow', 'Medinan'],
	[293, 5, 89, 20, 'X', "Aal-i-Imraan", 'Family', 'Medinan']
];
QuranData.Juz = [
	// [sura, aya]
	[],
	[1, 1], 	[2, 3]
];
QuranData.Page = [
	// [sura, aya]
	[],
	[1, 1], 	[1, 6], 	[2, 1], 	[2, 5], 	[3, 1]
];
`;

describe("parseTanzilMetadata", () => {
  const rows = parseTanzilMetadata(FIXTURE);
  it("menghasilkan satu baris per halaman (n-1 batas)", () => {
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.pageNumber)).toEqual([1, 2, 3, 4]);
  });
  it("halaman 1 mulai Al-Fatihah 1 dan berakhir sebelum batas berikut", () => {
    expect(rows[0]).toMatchObject({ pageNumber: 1, surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 5 });
  });
  it("halaman pada batas surah berakhir di ayat terakhir surah lama", () => {
    expect(rows[1]).toMatchObject({ pageNumber: 2, surahStart: 1, ayahStart: 6, surahEnd: 1, ayahEnd: 7 });
    expect(rows[2]).toMatchObject({ pageNumber: 3, surahStart: 2, ayahStart: 1 });
  });
  it("halaman terakhir berakhir di ayat terakhir mushaf", () => {
    expect(rows[3]).toMatchObject({ pageNumber: 4, surahEnd: 2, ayahEnd: 5 });
  });
  it("juz dihitung dari ayat pertama halaman", () => {
    expect(rows[0].juz).toBe(1);
    expect(rows[3].juz).toBe(2);
  });
});
