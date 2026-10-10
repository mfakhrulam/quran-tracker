import surahsData from "@/data/surahs.json";

export interface SurahInfo {
  number: number;
  arabic: string;
  latin: string;
  ayahCount: number;
}

export const SURAHS = surahsData as SurahInfo[];
