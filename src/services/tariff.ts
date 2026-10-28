export interface TariffInput {
  origin: string;
  destination: string;
  product: string;
  hsCode?: string;
  dutyPct: number;
  baseCost: number;
  freight: number;
  insurance: number;
  currentDutyPct?: number;
}

export interface TariffResult {
  currentLandedCost: number;
  scenarioLandedCost: number;
  delta: number;
  deltaPct: number;
  breakdown: { baseCost: number; duty: number; freight: number; insurance: number };
  /** Landed cost at each duty point from 0..maxDuty, for the line chart. */
  curve: { dutyPct: number; landedCost: number }[];
  maxDutyPct: number;
  disclaimer: string;
}

export function calculateTariff(input: TariffInput, maxDutyPct = 30): TariffResult {
  const currentDuty = input.currentDutyPct ?? 0;
  const landed = (duty: number) =>
    Math.round(input.baseCost * (1 + duty / 100) + input.freight + input.insurance);

  const current = landed(currentDuty);
  const scenario = landed(input.dutyPct);
  const delta = scenario - current;

  const curve = Array.from({ length: maxDutyPct + 1 }, (_, d) => ({ dutyPct: d, landedCost: landed(d) }));

  return {
    currentLandedCost: current,
    scenarioLandedCost: scenario,
    delta,
    deltaPct: current ? Math.round((delta / current) * 1000) / 10 : 0,
    breakdown: {
      baseCost: input.baseCost,
      duty: Math.round(input.baseCost * (input.dutyPct / 100)),
      freight: input.freight,
      insurance: input.insurance,
    },
    curve,
    maxDutyPct,
    disclaimer:
      "Analytical aid only. Confirm classification and duty with a customs professional.",
  };
}
