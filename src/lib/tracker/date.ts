const MS_PER_DAY = 86_400_000;

const JAKARTA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function parseISO(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUTC(ms: number): string {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export function todayISO(now: Date = new Date()): string {
  return JAKARTA_DATE.format(now);
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, n: number): string {
  return formatUTC(parseISO(iso) + n * MS_PER_DAY);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b) - parseISO(a)) / MS_PER_DAY);
}

export function countRestDaysInRange(restDays: string[], startISO: string, endISO: string): number {
  const start = parseISO(startISO);
  const end = parseISO(endISO);
  let count = 0;
  for (const r of new Set(restDays)) {
    const t = parseISO(r);
    if (t >= start && t <= end) count += 1;
  }
  return count;
}

export function effectiveDaysElapsed(startISO: string, todayISOStr: string, restDays: string[]): number {
  const total = daysBetween(startISO, todayISOStr) + 1;
  const rest = countRestDaysInRange(restDays, startISO, todayISOStr);
  return Math.max(1, total - rest);
}

const ID_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

const ID_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "2026-10-20" -> "Selasa, 20 Oktober 2026" */
export function formatDateID(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const weekday = ID_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d} ${ID_MONTHS[m - 1]} ${y}`;
}

/** "2026-10-20" -> "20 Okt 2026" */
export function formatDateShortID(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${ID_MONTHS[m - 1].slice(0, 3)} ${y}`;
}

/** Number of consecutive days (ending today or yesterday) that have a session. */
export function computeStreak(dates: string[], today: string, restDays: string[] = []): number {
  const unique = new Set(dates);
  if (unique.size === 0) return 0;

  let streak = 0;
  let cursor = today;

  // Allow the streak to still count when today has not been logged yet.
  if (!unique.has(cursor)) {
    cursor = addDays(cursor, -1);
    if (!unique.has(cursor)) return 0;
  }

  while (unique.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
    // Skip rest days without breaking the streak.
    let guard = 0;
    while (restDays.includes(cursor) && guard < 400) {
      cursor = addDays(cursor, -1);
      guard += 1;
    }
  }
  return streak;
}
