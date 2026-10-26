import { describe, it, expect } from "vitest";
import {
  advanceInterval,
  rotationSlot,
  replayPageSchedule,
  ROTATION_EPOCH,
  type ScheduleLog,
} from "@/lib/tracker/schedule";

describe("advanceInterval", () => {
  it("mutqin menggandakan interval", () => {
    expect(advanceInterval(1, "mutqin", 30)).toBe(2);
    expect(advanceInterval(4, "mutqin", 30)).toBe(8);
    expect(advanceInterval(10, "mutqin", 30)).toBe(20);
  });

  it("lancar menambah setengah (dibulatkan ke atas)", () => {
    expect(advanceInterval(1, "lancar", 30)).toBe(2);
    expect(advanceInterval(4, "lancar", 30)).toBe(6);
    expect(advanceInterval(5, "lancar", 30)).toBe(8);
  });

  it("lemah dan baru mereset ke 1", () => {
    expect(advanceInterval(16, "lemah", 30)).toBe(1);
    expect(advanceInterval(16, "baru", 30)).toBe(1);
  });

  it("menghormati batas atas interval", () => {
    expect(advanceInterval(20, "mutqin", 30)).toBe(30);
    expect(advanceInterval(30, "mutqin", 30)).toBe(30);
  });

  it("tidak pernah menghasilkan 0 walau input aneh", () => {
    expect(advanceInterval(0, "lancar", 30)).toBe(2);
    expect(advanceInterval(-5, "mutqin", 30)).toBe(2);
  });
});

describe("rotationSlot", () => {
  it("selalu di dalam rentang siklus", () => {
    for (let i = 0; i < 30; i += 1) {
      const slot = rotationSlot("2026-10-21", 7);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(7);
    }
  });

  it("bertambah satu setiap hari lalu berputar", () => {
    const a = rotationSlot("2026-10-21", 7);
    const b = rotationSlot("2026-10-22", 7);
    expect(b).toBe((a + 1) % 7);
  });

  it("epoch sendiri berada di slot 0", () => {
    expect(rotationSlot(ROTATION_EPOCH, 7)).toBe(0);
  });

  it("tanggal sebelum epoch tetap menghasilkan slot valid", () => {
    const slot = rotationSlot("2023-12-31", 7);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(7);
  });
});

function log(
  id: number,
  date: string,
  pageNumber: number,
  type: ScheduleLog["type"],
  quality: ScheduleLog["quality"],
): ScheduleLog {
  return { id, date, pageNumber, type, quality };
}

describe("replayPageSchedule", () => {
  it("sabaq pertama memulai interval 1 dan jatuh tempo besok", () => {
    const map = replayPageSchedule([log(1, "2026-10-01", 5, "sabaq", "lancar")], 30);
    const s = map.get(5)!;
    expect(s.memorizedAt).toBe("2026-10-01");
    expect(s.lastReviewedAt).toBe("2026-10-01");
    expect(s.status).toBe("lancar");
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewDate).toBe("2026-10-02");
  });

  it("review berikutnya memajukan interval sesuai kualitas", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 5, "sabaq", "lancar"),
        log(2, "2026-10-02", 5, "sabqi", "mutqin"),
        log(3, "2026-10-04", 5, "sabqi", "lancar"),
      ],
      30,
    );
    const s = map.get(5)!;
    expect(s.intervalDays).toBe(3); // 1 -> 2 (mutqin) -> 3 (lancar: 2 + 1)
    expect(s.lastReviewedAt).toBe("2026-10-04");
    expect(s.nextReviewDate).toBe("2026-10-07");
  });

  it("status mengikuti kualitas sabaq terakhir, bukan review", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 5, "sabaq", "mutqin"),
        log(2, "2026-10-05", 5, "manzil", "lemah"),
      ],
      30,
    );
    const s = map.get(5)!;
    expect(s.status).toBe("mutqin");
    expect(s.intervalDays).toBe(1);
    expect(s.nextReviewDate).toBe("2026-10-06");
  });

  it("urutan log diacak tetap menghasilkan jadwal sama", () => {
    const logs = [
      log(1, "2026-10-01", 5, "sabaq", "lancar"),
      log(2, "2026-10-02", 5, "sabqi", "mutqin"),
      log(3, "2026-10-04", 5, "sabqi", "lancar"),
    ];
    const a = replayPageSchedule(logs, 30).get(5)!;
    const b = replayPageSchedule([logs[2], logs[0], logs[1]], 30).get(5)!;
    expect(b).toEqual(a);
  });

  it("log sabqi/manzil sebelum sabaq diabaikan", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 7, "manzil", "lancar"),
        log(2, "2026-10-03", 7, "sabaq", "baru"),
      ],
      30,
    );
    const s = map.get(7)!;
    expect(s.memorizedAt).toBe("2026-10-03");
    expect(s.intervalDays).toBe(1);
  });

  it("sabaq ulang pada halaman yang sama juga memajukan interval", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 9, "sabaq", "lancar"),
        log(2, "2026-10-03", 9, "sabaq", "mutqin"),
      ],
      30,
    );
    const s = map.get(9)!;
    expect(s.status).toBe("mutqin");
    expect(s.intervalDays).toBe(2);
    expect(s.nextReviewDate).toBe("2026-10-05");
  });

  it("menghormati batas interval", () => {
    const map = replayPageSchedule(
      [
        log(1, "2026-10-01", 11, "sabaq", "lancar"),
        log(2, "2026-10-02", 11, "sabqi", "mutqin"),
        log(3, "2026-10-04", 11, "sabqi", "mutqin"),
        log(4, "2026-10-08", 11, "sabqi", "mutqin"),
      ],
      3,
    );
    expect(map.get(11)!.intervalDays).toBe(3);
  });

  it("halaman tanpa sabaq tidak masuk hasil", () => {
    const map = replayPageSchedule([log(1, "2026-10-01", 12, "sabqi", "lancar")], 30);
    expect(map.size).toBe(0);
  });
});
