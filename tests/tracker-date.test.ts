import { describe, it, expect } from "vitest";
import { todayISO, isValidISODate, addDays, daysBetween, countRestDaysInRange, effectiveDaysElapsed } from "@/lib/tracker/date";

describe("tracker/date", () => {
  it("todayISO memformat lokal sebagai YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 9, 10))).toBe("2026-10-10");
  });
  it("isValidISODate menolak format salah", () => {
    expect(isValidISODate("2026-10-10")).toBe(true);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("10/10/2026")).toBe(false);
  });
  it("addDays melewati batas bulan", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("daysBetween mengembalikan selisih hari", () => {
    expect(daysBetween("2026-10-01", "2026-10-10")).toBe(9);
  });
  it("countRestDaysInRange menghitung hari libur dalam rentang inklusif", () => {
    expect(countRestDaysInRange(["2026-10-03", "2026-10-05", "2026-11-01"], "2026-10-01", "2026-10-10")).toBe(2);
  });
  it("effectiveDaysElapsed mengurangi hari libur, minimal 1", () => {
    expect(effectiveDaysElapsed("2026-10-01", "2026-10-10", [])).toBe(10);
    expect(effectiveDaysElapsed("2026-10-01", "2026-10-10", ["2026-10-03", "2026-10-04"])).toBe(8);
    expect(effectiveDaysElapsed("2026-10-10", "2026-10-10", ["2026-10-10"])).toBe(1);
  });
});
