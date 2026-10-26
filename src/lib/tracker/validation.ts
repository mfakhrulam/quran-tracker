import { z } from "zod";
import { SETTINGS_LIMITS } from "@/lib/settings";
import { isValidISODate } from "./date";
import { SESSION_TYPES, QUALITY_LEVELS } from "./quality";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus YYYY-MM-DD")
  .refine(isValidISODate, { message: "Tanggal tidak valid" });

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

export const goalInput = z
  .object({
    type: z.enum(["khatam", "harian"]),
    targetPages: z.number().int().min(1).max(604),
    startDate: isoDate,
    deadline: isoDate.nullable().optional(),
  })
  .refine((d) => !d.deadline || d.deadline >= d.startDate, {
    message: "Tenggat harus >= tanggal mulai",
    path: ["deadline"],
  });

export const restDayInput = z.object({
  date: isoDate,
  reason: z.string().max(500).optional(),
});

export const murajaahItemInput = z.object({
  pageNumber: z.number().int().min(1).max(604),
  quality: z.enum(QUALITY_LEVELS),
});

export const murajaahCompleteInput = z.object({
  date: isoDate,
  items: z.array(murajaahItemInput).min(1).max(50),
});

export const settingsPatchInput = z
  .object({
    sabqiWindowDays: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.sabqiWindowDays.min)
      .max(SETTINGS_LIMITS.sabqiWindowDays.max)
      .optional(),
    manzilCycleDays: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.manzilCycleDays.min)
      .max(SETTINGS_LIMITS.manzilCycleDays.max)
      .optional(),
    dailyLoadLimit: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.dailyLoadLimit.min)
      .max(SETTINGS_LIMITS.dailyLoadLimit.max)
      .optional(),
    intervalCapDays: z
      .number()
      .int()
      .min(SETTINGS_LIMITS.intervalCapDays.min)
      .max(SETTINGS_LIMITS.intervalCapDays.max)
      .optional(),
    labels: z
      .object({
        sabaq: z.string().trim().min(1).max(24),
        sabqi: z.string().trim().min(1).max(24),
        manzil: z.string().trim().min(1).max(24),
      })
      .optional(),
  })
  .strict();
