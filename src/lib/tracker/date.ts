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
