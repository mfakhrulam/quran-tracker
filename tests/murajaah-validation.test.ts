import { describe, it, expect } from "vitest";
import { murajaahCompleteInput, settingsPatchInput } from "@/lib/tracker/validation";

describe("murajaahCompleteInput", () => {
  it("menerima payload minimal", () => {
    const parsed = murajaahCompleteInput.safeParse({
      date: "2026-10-21",
      items: [{ pageNumber: 3, quality: "lancar" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("menolak items kosong", () => {
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items: [] }).success).toBe(false);
  });

  it("menolak lebih dari 50 item", () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ pageNumber: i + 1, quality: "lancar" }));
    expect(murajaahCompleteInput.safeParse({ date: "2026-10-21", items }).success).toBe(false);
  });

  it("menolak halaman di luar 1-604 dan kualitas tak dikenal", () => {
    expect(
      murajaahCompleteInput.safeParse({
        date: "2026-10-21",
        items: [{ pageNumber: 605, quality: "lancar" }],
      }).success,
    ).toBe(false);
    expect(
      murajaahCompleteInput.safeParse({
        date: "2026-10-21",
        items: [{ pageNumber: 1, quality: "sempurna" }],
      }).success,
    ).toBe(false);
  });

  it("menolak tanggal kalender tidak valid", () => {
    expect(
      murajaahCompleteInput.safeParse({
        date: "2026-02-30",
        items: [{ pageNumber: 1, quality: "lancar" }],
      }).success,
    ).toBe(false);
  });
});

describe("settingsPatchInput", () => {
  it("menerima subset field", () => {
    expect(settingsPatchInput.safeParse({ dailyLoadLimit: 3 }).success).toBe(true);
    expect(
      settingsPatchInput.safeParse({
        labels: { sabaq: "Ziyadah", sabqi: "Sabqi", manzil: "Manzil" },
      }).success,
    ).toBe(true);
  });

  it("menolak nilai di luar rentang", () => {
    expect(settingsPatchInput.safeParse({ dailyLoadLimit: 0 }).success).toBe(false);
    expect(settingsPatchInput.safeParse({ intervalCapDays: 1 }).success).toBe(false);
    expect(settingsPatchInput.safeParse({ manzilCycleDays: 999 }).success).toBe(false);
  });

  it("menolak key tak dikenal", () => {
    expect(settingsPatchInput.safeParse({ unknownKey: 1 }).success).toBe(false);
  });

  it("menolak label kosong", () => {
    expect(
      settingsPatchInput.safeParse({
        labels: { sabaq: "  ", sabqi: "Sabqi", manzil: "Manzil" },
      }).success,
    ).toBe(false);
  });
});
