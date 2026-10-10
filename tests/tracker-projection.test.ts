import { describe, it, expect } from "vitest";
import { computeProjection } from "@/lib/tracker/projection";

describe("computeProjection", () => {
  it("tanpa tenggat: status tanpa-tenggat, onTrack null", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: [], today: "2026-10-10" });
    expect(p.status).toBe("tanpa-tenggat");
    expect(p.onTrack).toBeNull();
    expect(p.remainingPages).toBe(544);
    expect(p.pace).toBeCloseTo(6);
  });

  it("rest days menaikkan pace (hari efektif lebih sedikit)", () => {
    const noRest = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: [], today: "2026-10-10" });
    const withRest = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: null, memorizedPages: 60, restDays: ["2026-10-03", "2026-10-04"], today: "2026-10-10" });
    expect(withRest.effectiveDaysElapsed).toBe(8);
    expect(withRest.pace).toBeGreaterThan(noRest.pace);
  });

  it("on-track bila pace >= requiredPace", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-09-01", deadline: "2026-12-31", memorizedPages: 300, restDays: [], today: "2026-10-10" });
    expect(p.pace).toBeCloseTo(7.5);
    expect(p.onTrack).toBe(true);
    expect(p.status).toBe("on-track");
    expect(p.requiredPace).not.toBeNull();
  });

  it("terlambat bila pace < requiredPace", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-01", deadline: "2026-10-20", memorizedPages: 5, restDays: [], today: "2026-10-10" });
    expect(p.onTrack).toBe(false);
    expect(p.status).toBe("terlambat");
  });

  it("belum-mulai bila belum ada hafalan", () => {
    const p = computeProjection({ targetPages: 604, startDate: "2026-10-10", deadline: "2026-12-31", memorizedPages: 0, restDays: [], today: "2026-10-10" });
    expect(p.status).toBe("belum-mulai");
    expect(p.pace).toBe(0);
    expect(p.projectedFinishDate).toBeNull();
  });
});
