import { describe, it, expect } from "vitest";
import { clampInt, parseSettings, DEFAULT_SETTINGS } from "@/lib/settings";

describe("settings", () => {
  it("clampInt memakai fallback untuk nilai kosong / bukan angka", () => {
    expect(clampInt(undefined, 14, 1, 90)).toBe(14);
    expect(clampInt("", 14, 1, 90)).toBe(14);
    expect(clampInt("abc", 14, 1, 90)).toBe(14);
  });

  it("clampInt membatasi ke rentang dan membulatkan", () => {
    expect(clampInt("0", 14, 1, 90)).toBe(1);
    expect(clampInt("999", 14, 1, 90)).toBe(90);
    expect(clampInt("7.6", 14, 1, 90)).toBe(8);
  });

  it("parseSettings memakai default saat tabel kosong", () => {
    const s = parseSettings([]);
    expect(s.sabqiWindowDays).toBe(14);
    expect(s.manzilCycleDays).toBe(7);
    expect(s.dailyLoadLimit).toBe(2);
    expect(s.intervalCapDays).toBe(30);
    expect(s.labels).toEqual({ sabaq: "Sabaq", sabqi: "Sabqi", manzil: "Manzil" });
  });

  it("parseSettings menimpa default dengan baris DB", () => {
    const s = parseSettings([
      { key: "sabqi_window_days", value: "21" },
      { key: "manzil_cycle_days", value: "10" },
      { key: "daily_load_limit", value: "4" },
      { key: "interval_cap_days", value: "60" },
      { key: "label_sabaq", value: "Ziyadah" },
    ]);
    expect(s.sabqiWindowDays).toBe(21);
    expect(s.manzilCycleDays).toBe(10);
    expect(s.dailyLoadLimit).toBe(4);
    expect(s.intervalCapDays).toBe(60);
    expect(s.labels.sabaq).toBe("Ziyadah");
    expect(s.labels.sabqi).toBe("Sabqi");
  });

  it("parseSettings mengabaikan nilai di luar rentang dan label kosong", () => {
    const s = parseSettings([
      { key: "sabqi_window_days", value: "9999" },
      { key: "daily_load_limit", value: "0" },
      { key: "label_manzil", value: "   " },
    ]);
    expect(s.sabqiWindowDays).toBe(90);
    expect(s.dailyLoadLimit).toBe(1);
    expect(s.labels.manzil).toBe(DEFAULT_SETTINGS.label_manzil);
  });
});
