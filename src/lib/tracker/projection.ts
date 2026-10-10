import { addDays, daysBetween, countRestDaysInRange, effectiveDaysElapsed } from "./date";

export interface ProjectionInput {
  targetPages: number;
  startDate: string;
  deadline: string | null;
  memorizedPages: number;
  restDays: string[];
  today: string;
}

export type ProjectionStatus = "belum-mulai" | "on-track" | "terlambat" | "tanpa-tenggat";

export interface Projection {
  remainingPages: number;
  effectiveDaysElapsed: number;
  pace: number;
  projectedFinishDate: string | null;
  daysRemainingToDeadline: number | null;
  requiredPace: number | null;
  onTrack: boolean | null;
  status: ProjectionStatus;
}

export function computeProjection(input: ProjectionInput): Projection {
  const { targetPages, startDate, deadline, memorizedPages, restDays, today } = input;
  const remainingPages = Math.max(targetPages - memorizedPages, 0);
  const elapsed = effectiveDaysElapsed(startDate, today, restDays);
  const pace = elapsed > 0 ? memorizedPages / elapsed : 0;

  let projectedFinishDate: string | null = null;
  if (remainingPages === 0) {
    projectedFinishDate = today;
  } else if (pace > 0) {
    projectedFinishDate = addDays(today, Math.ceil(remainingPages / pace));
  }

  let daysRemainingToDeadline: number | null = null;
  let requiredPace: number | null = null;
  let onTrack: boolean | null = null;
  let status: ProjectionStatus = "tanpa-tenggat";

  if (deadline) {
    const daysLeft = daysBetween(today, deadline) + 1 - countRestDaysInRange(restDays, today, deadline);
    daysRemainingToDeadline = daysLeft;
    if (remainingPages === 0) {
      requiredPace = 0;
      onTrack = true;
    } else if (daysLeft <= 0) {
      requiredPace = null;
      onTrack = false;
    } else {
      requiredPace = remainingPages / daysLeft;
      onTrack = pace >= requiredPace;
    }
    status = onTrack ? "on-track" : "terlambat";
  }

  if (memorizedPages === 0) {
    status = deadline ? "belum-mulai" : "tanpa-tenggat";
  }

  return {
    remainingPages,
    effectiveDaysElapsed: elapsed,
    pace,
    projectedFinishDate,
    daysRemainingToDeadline,
    requiredPace,
    onTrack,
    status,
  };
}
