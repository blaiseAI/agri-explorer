import { z } from "zod";

// No database needed - all data is served from static JSON datasets
// These types define the shape of our agricultural data

export const countrySchema = z.object({
  name: z.string(),
  code: z.string(),
  region: z.string(),
});

export const cropDataPointSchema = z.object({
  year: z.string(),
  production: z.number(),  // thousands of tonnes
  yield: z.number(),       // hg/ha (hectograms per hectare)
  area: z.number(),        // thousands of hectares
});

export const tradeDataPointSchema = z.object({
  year: z.string(),
  exportValue: z.number(), // millions USD
});

export const worldBankDataPointSchema = z.object({
  year: z.string(),
  value: z.number().nullable(),
});

export const insightSchema = z.object({
  id: z.string(),
  type: z.enum(["opportunity", "growth", "yield_gap", "trade", "warning"]),
  title: z.string(),
  description: z.string(),
  country: z.string(),
  crop: z.string().optional(),
  score: z.number(), // 0-100 opportunity score
  metrics: z.record(z.string(), z.any()).optional(),
});

export type Country = z.infer<typeof countrySchema>;
export type CropDataPoint = z.infer<typeof cropDataPointSchema>;
export type TradeDataPoint = z.infer<typeof tradeDataPointSchema>;
export type WorldBankDataPoint = z.infer<typeof worldBankDataPointSchema>;
export type Insight = z.infer<typeof insightSchema>;
