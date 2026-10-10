import { z } from "zod";
import { SESSION_TYPES, QUALITY_LEVELS } from "./quality";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD");

export const sessionLogInput = z
  .object({
    date: isoDate,
    pageNumber: z.number().int().min(1).max(604),
    type: z.enum(SESSION_TYPES),
    quality: z.enum(QUALITY_LEVELS),
    ayahStart: z.number().int().min(1).optional(),
    ayahEnd: z.number().int().min(1).optional(),
    mistakesNote: z.string().max(2000).optional(),
    durationMin: z.number().int().min(0).optional(),
  })
  .refine((d) => d.ayahStart === undefined || d.ayahEnd === undefined || d.ayahEnd >= d.ayahStart, {
    message: "ayahEnd harus >= ayahStart",
    path: ["ayahEnd"],
  });

export const goalInput = z.object({
  type: z.enum(["khatam", "harian"]),
  targetPages: z.number().int().min(1).max(604),
  startDate: isoDate,
  deadline: isoDate.nullable().optional(),
});

export const restDayInput = z.object({
  date: isoDate,
  reason: z.string().max(500).optional(),
});

export const idParam = z.coerce.number().int().positive();
