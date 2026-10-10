import surahsData from "@/data/surahs.json";

export interface SurahInfo {
  number: number;
  arabic: string;
  latin: string;
  ayahCount: number;
}

export const SURAHS = surahsData as SurahInfo[];

export function surahName(number: number): string {
  return SURAHS.find((s) => s.number === number)?.latin ?? `Surah ${number}`;
}
