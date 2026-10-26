import { describe, it, expect } from "vitest";
import { buildDailyTasks, rotationSlot, type PageSchedule } from "@/lib/tracker/schedule";
import { parseSettings, type AppSettings } from "@/lib/settings";

const TODAY = "2026-10-21";

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...parseSettings([]), ...overrides };
}

function page(
  pageNumber: number,
  memorizedAt: string,
  intervalDays: number,
  nextReviewDate: string,
  status: PageSchedule["status"] = "lancar",
): PageSchedule {
  return { pageNumber, status, memorizedAt, lastReviewedAt: memorizedAt, intervalDays, nextReviewDate };
}

describe("buildDailyTasks", () => {
  it("memisahkan sabqi (baru) dan manzil (lama) berdasarkan umur hafalan", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    // Pilih halaman yang slot rotasinya BUKAN hari ini, supaya test tidak bergantung tanggal.
    const offSlot = [2, 3, 4, 5, 6, 7, 8].find((p) => (p - 1) % 7 !== slot) ?? 8;

    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(1, "2026-10-18", 1, "2026-10-19"), // 3 hari -> sabqi, jatuh tempo
        page(offSlot, "2026-08-01", 30, "2026-12-31"), // lama, belum slotnya, belum jatuh tempo
      ],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([1]);
    expect(plan.manzil).toHaveLength(0);
    expect(plan.manzilTotal).toBe(1);
  });

  it("halaman manzil yang slot rotasinya hari ini masuk tugas", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    const duePage = slot + 1;
    const otherPage = ((slot + 1) % 7) + 1;
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(duePage, "2026-01-01", 30, "2026-12-31"),
        page(otherPage, "2026-01-01", 30, "2026-12-31"),
      ],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([duePage]);
  });

  it("manzil dengan interval jatuh tempo tetap muncul walau bukan slotnya", () => {
    const s = settings({ manzilCycleDays: 7 });
    const slot = rotationSlot(TODAY, 7);
    const offSlot = ((slot + 3) % 7) + 1;
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(offSlot, "2026-01-01", 1, "2026-10-20")],
      reviewedToday: [],
      settings: s,
    });
    expect(plan.manzil.map((t) => t.pageNumber)).toEqual([offSlot]);
  });

  it("sabqi menang kapasitas, manzil mendapat sisa, sisanya dilaporkan deferred", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(1, "2026-10-20", 1, "2026-10-21"),
        page(2, "2026-10-20", 1, "2026-10-21"),
        page(3, "2026-10-20", 1, "2026-10-21"),
        page(4, "2026-01-01", 1, "2026-10-01"),
        page(5, "2026-01-01", 1, "2026-10-01"),
      ],
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 2 }),
    });
    expect(plan.sabqi).toHaveLength(2);
    expect(plan.manzil).toHaveLength(0);
    expect(plan.dueSabqi).toBe(3);
    expect(plan.dueManzil).toBe(2);
    expect(plan.totalDue).toBe(5);
    expect(plan.scheduled).toBe(2);
    expect(plan.deferred).toBe(3);
  });

  it("halaman yang sudah diulang hari ini tidak muncul lagi, tetapi masuk daftar selesai", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-20", 1, "2026-10-21"), page(2, "2026-10-20", 1, "2026-10-21")],
      reviewedToday: [{ pageNumber: 1, quality: "mutqin", type: "sabqi" }],
      settings: settings(),
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([2]);
    expect(plan.done).toHaveLength(1);
    expect(plan.done[0]).toMatchObject({ pageNumber: 1, status: "mutqin", lane: "sabqi" });
  });

  it("sabaq hari ini tidak dihitung sebagai murajaah selesai", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-21", 1, "2026-10-22")],
      reviewedToday: [{ pageNumber: 1, quality: "lancar", type: "sabaq" }],
      settings: settings(),
    });
    expect(plan.done).toHaveLength(0);
    expect(plan.sabqi).toHaveLength(0);
  });

  it("prioritas: interval terkecil dulu, lalu status paling lemah, lalu terlambat, lalu nomor halaman", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [
        page(10, "2026-10-19", 8, "2026-10-21", "mutqin"),
        page(11, "2026-10-19", 1, "2026-10-21", "lancar"),
        page(12, "2026-10-19", 1, "2026-10-21", "lemah"),
        page(13, "2026-10-19", 1, "2026-10-15", "lancar"),
        page(14, "2026-10-19", 1, "2026-10-18", "lemah"),
      ],
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 20 }),
    });
    expect(plan.sabqi.map((t) => t.pageNumber)).toEqual([14, 12, 13, 11, 10]);
  });

  it("menghitung cakupan siklus dan memberi peringatan bila kapasitas tidak cukup", () => {
    const many = Array.from({ length: 16 }, (_, i) => page(i + 1, "2026-01-01", 30, "2026-12-31"));
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: many,
      reviewedToday: [],
      settings: settings({ dailyLoadLimit: 2, manzilCycleDays: 7 }),
    });
    expect(plan.manzilTotal).toBe(16);
    expect(plan.coverageDays).toBe(8);
    expect(plan.capacityWarning).toBe(true);
  });

  it("tanpa halaman manzil, tidak ada peringatan kapasitas", () => {
    const plan = buildDailyTasks({
      today: TODAY,
      schedules: [page(1, "2026-10-20", 1, "2026-10-21")],
      reviewedToday: [],
      settings: settings(),
    });
    expect(plan.manzilTotal).toBe(0);
    expect(plan.coverageDays).toBe(0);
    expect(plan.capacityWarning).toBe(false);
  });
});
