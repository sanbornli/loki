import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CostMeasurementSchema, conservativeCaps } from "./release-evidence.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error(
    "usage: tsx scripts/calculate-cost-caps.ts <measurement.json> <output.json>",
  );
}
const measurement = CostMeasurementSchema.parse(
  JSON.parse(await readFile(resolve(inputPath), "utf8")),
);
const monthlyBudget = Number(process.env.LOKI_MONTHLY_FREE_TIER_BUDGET);
if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) {
  throw new Error("LOKI_MONTHLY_FREE_TIER_BUDGET must be a positive number");
}
const result = conservativeCaps(measurement, {
  monthlyBudget,
  reserveRatio: Number(process.env.LOKI_COST_RESERVE_RATIO ?? 0.5),
  playerHoursPerAccount: Number(
    process.env.LOKI_PLAYER_HOURS_PER_ACCOUNT ?? 10,
  ),
  matchHoursPerAccount: Number(
    process.env.LOKI_MATCH_HOURS_PER_ACCOUNT ?? 2,
  ),
});
await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, {
  flag: "wx",
});
console.log(JSON.stringify(result, null, 2));
