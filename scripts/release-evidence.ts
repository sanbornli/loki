import { z } from "zod";

export const CostMeasurementSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  currency: z.string().length(3),
  windowHours: z.number().positive(),
  activePlayerHours: z.number().positive(),
  activeMatchHours: z.number().positive(),
  costs: z.object({
    compute: z.number().nonnegative(),
    database: z.number().nonnegative(),
    objectStorage: z.number().nonnegative(),
    bandwidth: z.number().nonnegative(),
    monitoring: z.number().nonnegative(),
    other: z.number().nonnegative(),
  }),
  sourceReferences: z.array(z.string().min(1)).min(1),
});

export const pilotCategories = [
  "browser",
  "swift",
  "android",
  "unity-native",
  "unity-webgl",
  "turn-based",
  "casual-realtime",
  "team",
] as const;

export const PilotMatrixSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime({ offset: true }),
  release: z.string().min(1),
  environment: z.string().min(1),
  pilots: z.array(
    z.object({
      category: z.enum(pilotCategories),
      game: z.string().min(1),
      platform: z.string().min(1),
      startedAt: z.string().datetime({ offset: true }),
      completedAt: z.string().datetime({ offset: true }),
      players: z.number().int().positive(),
      rooms: z.number().int().positive(),
      result: z.enum(["pass", "fail"]),
      tester: z.string().min(1),
      evidenceReferences: z.array(z.string().min(1)).min(1),
      observations: z.string().min(1),
    }),
  ),
});

export function conservativeCaps(
  measurement: z.infer<typeof CostMeasurementSchema>,
  input: {
    monthlyBudget: number;
    reserveRatio?: number;
    playerHoursPerAccount?: number;
    matchHoursPerAccount?: number;
  },
) {
  const total = Object.values(measurement.costs).reduce(
    (sum, cost) => sum + cost,
    0,
  );
  const costPerPlayerHour = total / measurement.activePlayerHours;
  const costPerMatchHour = total / measurement.activeMatchHours;
  const reserveRatio = input.reserveRatio ?? 0.5;
  if (!(input.monthlyBudget > 0) || reserveRatio < 0 || reserveRatio >= 1) {
    throw new Error("monthlyBudget must be positive and reserveRatio must be in [0, 1)");
  }
  const usableBudget = input.monthlyBudget * (1 - reserveRatio);
  const playerHoursPerAccount = input.playerHoursPerAccount ?? 10;
  const matchHoursPerAccount = input.matchHoursPerAccount ?? 2;
  const projectedCostPerAccount =
    costPerPlayerHour * playerHoursPerAccount +
    costPerMatchHour * matchHoursPerAccount;
  return {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    currency: measurement.currency,
    assumptions: {
      monthlyBudget: input.monthlyBudget,
      reserveRatio,
      usableBudget,
      playerHoursPerAccount,
      matchHoursPerAccount,
    },
    measured: { total, costPerPlayerHour, costPerMatchHour },
    recommendedPublicFreeAccounts:
      projectedCostPerAccount === 0
        ? 0
        : Math.floor(usableBudget / projectedCostPerAccount),
    projectedCostPerAccount,
    policy: "Zero is returned for unpriced usage; do not infer unlimited capacity.",
  };
}
