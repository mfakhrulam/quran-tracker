import type { AppSettings } from "@/lib/settings";
import { addDays, daysBetween } from "./date";
import type { Quality, SessionType } from "./quality";

/** Titik acuan tetap untuk rotasi manzil. Tanpa state, aman dihitung ulang kapan pun. */
export const ROTATION_EPOCH = "2024-01-01";

/**
 * Interval berikutnya untuk sebuah halaman.
 *
 * mutqin -> x2, lancar -> +50%, baru/lemah -> 1 hari.
 * Hasil selalu dibatasi `cap` supaya interval tidak tumbuh tanpa batas dan
 * rotasi manzil tetap punya peran.
 */
export function advanceInterval(current: number, quality: Quality, cap: number): number {
  const base = Math.max(1, Math.round(current));
  let next: number;
  switch (quality) {
    case "mutqin":
      next = base * 2;
      break;
    case "lancar":
      next = base + Math.ceil(base / 2);
      break;
    default:
      next = 1;
      break;
  }
  return Math.max(1, Math.min(Math.max(1, cap), next));
}

/** Slot rotasi manzil untuk sebuah tanggal: (tanggal - epoch) mod siklus. */
export function rotationSlot(date: string, cycleDays: number): number {
  const cycle = Math.max(1, Math.round(cycleDays));
  const offset = daysBetween(ROTATION_EPOCH, date);
  return ((offset % cycle) + cycle) % cycle;
}

export interface ScheduleLog {
  id: number;
  date: string;
  pageNumber: number;
  type: SessionType;
  quality: Quality;
}

export interface PageSchedule {
  pageNumber: number;
  status: Quality;
  memorizedAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  nextReviewDate: string;
}

function compareLogs(a: ScheduleLog, b: ScheduleLog): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id - b.id;
}

/**
 * Menurunkan jadwal setiap halaman dari riwayat log.
 *
 * Deterministik: log diurutkan (tanggal, lalu id) dan di-replay dari nol,
 * sehingga hasilnya sama berapa kali pun dipanggil dan tetap konsisten walau
 * log diedit, dihapus, atau di-backdate. Ini alasan jadwal tidak di-increment
 * per kejadian: increment tidak bisa "mundur" saat log dihapus.
 */
export function replayPageSchedule(
  logs: ScheduleLog[],
  cap: number,
): Map<number, PageSchedule> {
  const ordered = [...logs].sort(compareLogs);
  const result = new Map<number, PageSchedule>();

  for (const entry of ordered) {
    const current = result.get(entry.pageNumber);

    if (!current) {
      // Hafalan hanya lahir dari sabaq. Review sebelum sabaq tidak dihitung.
      if (entry.type !== "sabaq") continue;
      result.set(entry.pageNumber, {
        pageNumber: entry.pageNumber,
        status: entry.quality,
        memorizedAt: entry.date,
        lastReviewedAt: entry.date,
        intervalDays: 1,
        nextReviewDate: addDays(entry.date, 1),
      });
      continue;
    }

    const intervalDays = advanceInterval(current.intervalDays, entry.quality, cap);
    result.set(entry.pageNumber, {
      pageNumber: entry.pageNumber,
      status: entry.type === "sabaq" ? entry.quality : current.status,
      memorizedAt: current.memorizedAt,
      lastReviewedAt: entry.date,
      intervalDays,
      nextReviewDate: addDays(entry.date, intervalDays),
    });
  }

  return result;
}

export interface ReviewedToday {
  pageNumber: number;
  quality: Quality;
  type: SessionType;
}

export interface DailyTask {
  pageNumber: number;
  lane: "sabqi" | "manzil";
  status: Quality;
  memorizedAt: string;
  lastReviewedAt: string;
  intervalDays: number;
  nextReviewDate: string;
  overdueDays: number;
}

export interface DailyPlan {
  date: string;
  sabqi: DailyTask[];
  manzil: DailyTask[];
  done: DailyTask[];
  dueSabqi: number;
  dueManzil: number;
  totalDue: number;
  scheduled: number;
  deferred: number;
  manzilTotal: number;
  coverageDays: number;
  capacityWarning: boolean;
  capacityPerDay: number;
  cycleDays: number;
  sabqiWindowDays: number;
  rotationSlot: number;
}

const STATUS_RANK: Record<Quality, number> = { lemah: 0, baru: 1, lancar: 2, mutqin: 3 };

function toTask(schedule: PageSchedule, lane: "sabqi" | "manzil", today: string): DailyTask {
  return {
    ...schedule,
    lane,
    overdueDays: Math.max(0, daysBetween(schedule.nextReviewDate, today)),
  };
}

/**
 * Paling rapuh dulu: interval terkecil, status terlemah, terlambat paling lama,
 * lalu nomor halaman supaya urutan stabil dan mudah diikuti.
 */
function compareTasks(a: DailyTask, b: DailyTask): number {
  if (a.intervalDays !== b.intervalDays) return a.intervalDays - b.intervalDays;
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  if (a.overdueDays !== b.overdueDays) return b.overdueDays - a.overdueDays;
  return a.pageNumber - b.pageNumber;
}

/**
 * Menyusun tugas murajaah hari ini.
 *
 * Dua jalur: sabqi (hafalan lebih muda dari `sabqiWindowDays`, diulang lewat
 * interval) dan manzil (sisanya, dirotasi). Sabqi menang klaim kapasitas karena
 * hafalan baru paling berisiko hilang; manzil mendapat sisa dan sisanya
 * dilaporkan sebagai `deferred`, tidak disembunyikan.
 */
export function buildDailyTasks(input: {
  today: string;
  schedules: PageSchedule[];
  reviewedToday: ReviewedToday[];
  settings: AppSettings;
}): DailyPlan {
  const { today, schedules, reviewedToday, settings } = input;
  const cycle = Math.max(1, settings.manzilCycleDays);
  const limit = Math.max(1, settings.dailyLoadLimit);
  const slot = rotationSlot(today, cycle);

  const reviewedPages = new Set(reviewedToday.map((r) => r.pageNumber));
  const byPage = new Map(schedules.map((s) => [s.pageNumber, s]));

  const sabqiDue: DailyTask[] = [];
  const manzilDue: DailyTask[] = [];
  let manzilTotal = 0;

  for (const schedule of schedules) {
    const isSabqi = daysBetween(schedule.memorizedAt, today) < settings.sabqiWindowDays;
    const dueByInterval = schedule.nextReviewDate <= today;

    if (!isSabqi) {
      manzilTotal += 1;
      if (reviewedPages.has(schedule.pageNumber)) continue;
      const dueByRotation = (schedule.pageNumber - 1) % cycle === slot;
      if (dueByRotation || dueByInterval) manzilDue.push(toTask(schedule, "manzil", today));
      continue;
    }

    if (reviewedPages.has(schedule.pageNumber)) continue;
    if (dueByInterval) sabqiDue.push(toTask(schedule, "sabqi", today));
  }

  sabqiDue.sort(compareTasks);
  manzilDue.sort(compareTasks);

  const sabqi = sabqiDue.slice(0, limit);
  const manzil = manzilDue.slice(0, Math.max(0, limit - sabqi.length));

  const done: DailyTask[] = reviewedToday
    .filter((r) => r.type !== "sabaq")
    .map((r) => {
      const schedule = byPage.get(r.pageNumber);
      if (!schedule) return null;
      const lane: "sabqi" | "manzil" =
        daysBetween(schedule.memorizedAt, today) < settings.sabqiWindowDays ? "sabqi" : "manzil";
      return { ...toTask(schedule, lane, today), status: r.quality };
    })
    .filter((t): t is DailyTask => t !== null)
    .sort((a, b) => a.pageNumber - b.pageNumber);

  const coverageDays = manzilTotal === 0 ? 0 : Math.ceil(manzilTotal / limit);
  const totalDue = sabqiDue.length + manzilDue.length;

  return {
    date: today,
    sabqi,
    manzil,
    done,
    dueSabqi: sabqiDue.length,
    dueManzil: manzilDue.length,
    totalDue,
    scheduled: sabqi.length + manzil.length,
    deferred: totalDue - sabqi.length - manzil.length,
    manzilTotal,
    coverageDays,
    capacityWarning: manzilTotal > 0 && coverageDays > cycle,
    capacityPerDay: limit,
    cycleDays: cycle,
    sabqiWindowDays: settings.sabqiWindowDays,
    rotationSlot: slot,
  };
}
