import { describe, it, expect } from "vitest";
import { SESSION_TYPES, QUALITY_LEVELS, isSessionType, isQuality, QUALITY_COLORS } from "@/lib/tracker/quality";
import { sessionLogInput, goalInput, restDayInput } from "@/lib/tracker/validation";

describe("tracker/quality", () => {
  it("mendefinisikan tipe & kualitas", () => {
    expect(SESSION_TYPES).toEqual(["sabaq", "sabqi", "manzil"]);
    expect(QUALITY_LEVELS).toContain("mutqin");
  });
  it("validator boolean", () => {
    expect(isSessionType("sabaq")).toBe(true);
    expect(isSessionType("xyz")).toBe(false);
    expect(isQuality("lancar")).toBe(true);
    expect(isQuality("bagus")).toBe(false);
  });
  it("punya warna untuk tiap kualitas", () => {
    for (const q of QUALITY_LEVELS) expect(typeof QUALITY_COLORS[q]).toBe("string");
  });
});

describe("tracker/validation", () => {
  it("menerima log valid tanpa ayat", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 5, type: "sabaq", quality: "lancar" }).success).toBe(true);
  });
  it("menolak pageNumber di luar 1-604", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 605, type: "sabaq", quality: "lancar" }).success).toBe(false);
  });
  it("menolak ayahEnd < ayahStart", () => {
    expect(sessionLogInput.safeParse({ date: "2026-10-10", pageNumber: 5, type: "sabaq", quality: "lancar", ayahStart: 5, ayahEnd: 2 }).success).toBe(false);
  });
  it("goal valid & rest day valid", () => {
    expect(goalInput.safeParse({ type: "khatam", targetPages: 604, startDate: "2026-10-10" }).success).toBe(true);
    expect(restDayInput.safeParse({ date: "2026-10-10" }).success).toBe(true);
  });
});
