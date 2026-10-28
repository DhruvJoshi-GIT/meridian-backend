/*
  Exporter-side tariff simulator and the Tariff Absorber.

  Simulator (per unit, per shipment of `volume` units):
    landed            = FOB + freight + duty * FOB
    extra duty        = (newDuty - oldDuty) * FOB
    buyer's increase  = (1 - absorption) * extra duty
    price change %    = buyer's increase / old landed
    volume change %   = elasticity * price change %
    FOB received      = FOB - absorption * extra duty
    profit            = new volume * (FOB received - unit cost)
    break-even duty   = (rival landed - FOB - freight) / FOB

  Absorber: runs each mitigation through the same simulator and compares profit with doing nothing.
*/

export interface ExporterInput {
  fob: number;            // price per unit at origin, USD
  freight: number;        // per unit
  unitCost: number;       // exporter's cost per unit
  volume: number;         // units per period at the old duty
  oldDutyPct: number;
  newDutyPct: number;
  elasticity: number;     // price elasticity of demand (negative)
  absorption: number;     // 0..1 share of the duty increase the exporter absorbs
  rivalLanded?: number;   // a competitor's landed price, for break-even
  extraCostPerUnit?: number; // added cost per unit (used by the origin-requalification action)
}

export interface ExporterResult {
  input: ExporterInput;
  oldLanded: number; newLanded: number;
  extraDutyPerUnit: number; buyerIncrease: number;
  priceChangePct: number; volumeChangePct: number;
  oldVolume: number; newVolume: number; lostUnits: number;
  fobReceived: number; marginPerUnitOld: number; marginPerUnitNew: number;
  oldProfit: number; newProfit: number; profitDelta: number; profitDeltaPct: number;
  breakEvenDutyPct: number | null; pastBreakEven: boolean | null;
  steps: { label: string; formula: string; value: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const usd2 = (n: number) => `$${r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function simulateExporter(input: ExporterInput): ExporterResult {
  const { fob, freight, unitCost, volume, elasticity } = input;
  const absorption = Math.min(1, Math.max(0, input.absorption));
  const oldDuty = input.oldDutyPct / 100, newDuty = input.newDutyPct / 100;
  const extraCost = input.extraCostPerUnit ?? 0;

  const oldLanded = fob + freight + oldDuty * fob;
  const newLanded = fob + freight + newDuty * fob;
  const extraDutyPerUnit = (newDuty - oldDuty) * fob;
  const buyerIncrease = (1 - absorption) * extraDutyPerUnit;
  const priceChange = oldLanded ? buyerIncrease / oldLanded : 0;
  const volumeChange = elasticity * priceChange;
  const newVolume = Math.max(0, volume * (1 + volumeChange));
  const fobReceived = fob - absorption * extraDutyPerUnit;
  const marginOld = fob - unitCost;
  const marginNew = fobReceived - unitCost - extraCost;
  const oldProfit = volume * marginOld;
  const newProfit = newVolume * marginNew;
  const breakEven = input.rivalLanded != null && fob ? (input.rivalLanded - fob - freight) / fob : null;

  return {
    input: { ...input, absorption },
    oldLanded: r2(oldLanded), newLanded: r2(newLanded),
    extraDutyPerUnit: r2(extraDutyPerUnit), buyerIncrease: r2(buyerIncrease),
    priceChangePct: r1(priceChange * 100), volumeChangePct: r1(volumeChange * 100),
    oldVolume: volume, newVolume: Math.round(newVolume), lostUnits: Math.round(volume - newVolume),
    fobReceived: r2(fobReceived), marginPerUnitOld: r2(marginOld), marginPerUnitNew: r2(marginNew),
    oldProfit: Math.round(oldProfit), newProfit: Math.round(newProfit), profitDelta: Math.round(newProfit - oldProfit),
    profitDeltaPct: oldProfit ? r1(((newProfit - oldProfit) / oldProfit) * 100) : 0,
    breakEvenDutyPct: breakEven == null ? null : r1(breakEven * 100), pastBreakEven: breakEven == null ? null : newDuty > breakEven,
    steps: [
      { label: "Landed cost (old)", formula: "FOB + freight + old duty × FOB", value: `${usd2(fob)} + ${usd2(freight)} + ${input.oldDutyPct}% × ${usd2(fob)} = ${usd2(oldLanded)}` },
      { label: "Landed cost (new)", formula: "FOB + freight + new duty × FOB", value: `${usd2(fob)} + ${usd2(freight)} + ${input.newDutyPct}% × ${usd2(fob)} = ${usd2(newLanded)}` },
      { label: "Extra duty per unit", formula: "(new duty − old duty) × FOB", value: `(${input.newDutyPct}% − ${input.oldDutyPct}%) × ${usd2(fob)} = ${usd2(extraDutyPerUnit)}` },
      { label: "Buyer's price increase", formula: "(1 − absorption) × extra duty", value: `(1 − ${r2(absorption)}) × ${usd2(extraDutyPerUnit)} = ${usd2(buyerIncrease)}` },
      { label: "Price change", formula: "buyer's increase ÷ old landed cost", value: `${usd2(buyerIncrease)} ÷ ${usd2(oldLanded)} = ${r1(priceChange * 100)}%` },
      { label: "Volume change", formula: "elasticity × price change", value: `${elasticity} × ${r1(priceChange * 100)}% = ${r1(volumeChange * 100)}%  →  ${Math.round(newVolume).toLocaleString()} units` },
      { label: "Exporter's FOB received", formula: "FOB − absorption × extra duty", value: `${usd2(fob)} − ${r2(absorption)} × ${usd2(extraDutyPerUnit)} = ${usd2(fobReceived)}` },
      { label: "Profit", formula: "new volume × (FOB received − unit cost" + (extraCost ? " − extra cost" : "") + ")", value: `${Math.round(newVolume).toLocaleString()} × (${usd2(fobReceived)} − ${usd2(unitCost)}${extraCost ? ` − ${usd2(extraCost)}` : ""}) = ${usd(newProfit)}  (was ${usd(oldProfit)})` },
      ...(breakEven != null ? [{ label: "Break-even duty", formula: "(rival landed − own FOB − freight) ÷ own FOB", value: `(${usd2(input.rivalLanded!)} − ${usd2(fob)} − ${usd2(freight)}) ÷ ${usd2(fob)} = ${r1(breakEven * 100)}%  →  ${input.newDutyPct}% is ${newDuty > breakEven ? "past" : "below"} break-even` }] : []),
    ],
  };
}

/** Profit across a range of new duties (for the chart), and across absorption 0..100 %. */
export function exporterCurves(input: ExporterInput, maxDutyPct = 60) {
  const byDuty = Array.from({ length: maxDutyPct + 1 }, (_, d) => ({ dutyPct: d, profit: simulateExporter({ ...input, newDutyPct: d }).newProfit }));
  const byAbsorption = Array.from({ length: 11 }, (_, i) => ({ absorptionPct: i * 10, profit: simulateExporter({ ...input, absorption: i / 10 }).newProfit }));
  return { byDuty, byAbsorption };
}

/* ---------------- Absorber ---------------- */

export interface AbsorberInput extends ExporterInput {
  absorbShare: number;              // action 1: absorb this share of the duty increase (0..1)
  origin: { dutyPct: number; extraCostPerUnit: number };   // action 2: requalified origin / relief scheme
  shift: { units: number; marginPerUnit: number };          // action 3: move lost units to another market
}

export interface AbsorberAction {
  key: "nothing" | "absorb" | "origin" | "shift" | "combo";
  label: string; models: string;
  profit: number; recovered: number; recoveredPct: number;
  volumeSold: number; lostUnits: number; shiftedUnits: number; marginPerUnit: number;
  detail: string;
}

export function runAbsorber(input: AbsorberInput) {
  const base = { ...input, absorption: 0, extraCostPerUnit: 0 };
  const nothing = simulateExporter(base);
  const absorb = simulateExporter({ ...base, absorption: input.absorbShare });
  const origin = simulateExporter({ ...base, newDutyPct: input.origin.dutyPct, extraCostPerUnit: input.origin.extraCostPerUnit });

  const shiftFrom = (sim: ExporterResult) => {
    const units = Math.max(0, Math.min(input.shift.units, sim.lostUnits));
    return { units, extra: units * input.shift.marginPerUnit };
  };
  const shiftN = shiftFrom(nothing);
  const shiftO = shiftFrom(origin);

  const mk = (key: AbsorberAction["key"], label: string, models: string, sim: ExporterResult, shifted: { units: number; extra: number } | null, detail: string): AbsorberAction => {
    const profit = sim.newProfit + (shifted?.extra ?? 0);
    return {
      key, label, models, profit, recovered: profit - nothing.newProfit, recoveredPct: nothing.newProfit ? r1(((profit - nothing.newProfit) / Math.abs(nothing.newProfit)) * 100) : 0,
      volumeSold: sim.newVolume + (shifted?.units ?? 0), lostUnits: sim.lostUnits - (shifted?.units ?? 0), shiftedUnits: shifted?.units ?? 0, marginPerUnit: sim.marginPerUnitNew, detail,
    };
  };

  const actions: AbsorberAction[] = [
    mk("nothing", "Do nothing", "Pass the whole duty increase to buyers", nothing, null, `Buyers pay ${usd2(nothing.buyerIncrease)} more per unit; volume falls ${Math.abs(nothing.volumeChangePct)}% to ${nothing.newVolume.toLocaleString()} units at a ${usd2(nothing.marginPerUnitNew)} margin.`),
    mk("absorb", `Absorb ${Math.round(input.absorbShare * 100)}% of the increase`, "Exporter cuts price to keep buyers", absorb, null, `Margin drops to ${usd2(absorb.marginPerUnitNew)} per unit on every unit sold; volume only falls ${Math.abs(absorb.volumeChangePct)}% (saves ${(absorb.newVolume - nothing.newVolume).toLocaleString()} units).`),
    mk("origin", "Requalify origin / relief scheme", `Lowers the duty rate to ${input.origin.dutyPct}% at ${usd2(input.origin.extraCostPerUnit)} per unit`, origin, null, `Buyers see ${usd2(origin.buyerIncrease)} instead of ${usd2(nothing.buyerIncrease)}; lost volume shrinks to ${origin.lostUnits.toLocaleString()} units; margin ${usd2(origin.marginPerUnitNew)} after the compliance cost.`),
    mk("shift", `Shift ${input.shift.units.toLocaleString()} units to a lower-tariff market`, `Moves lost units to an FTA market at ${usd2(input.shift.marginPerUnit)} switching margin`, nothing, shiftN, `${shiftN.units.toLocaleString()} of the ${nothing.lostUnits.toLocaleString()} lost units find a new market (capped at what was actually lost) at ${usd2(input.shift.marginPerUnit)} each = ${usd(shiftN.extra)}.`),
    mk("combo", "Combination: origin + shift", "Stacks both actions", origin, shiftO, `Origin fix leaves only ${origin.lostUnits.toLocaleString()} lost units, so only ${shiftO.units.toLocaleString()} can be shifted (${usd(shiftO.extra)}) on top of ${usd(origin.newProfit)}.`),
  ].sort((a, b) => b.profit - a.profit);

  const byKey = Object.fromEntries(actions.map((a) => [a.key, a])) as Record<AbsorberAction["key"], AbsorberAction>;
  const insights: string[] = [];
  const best = actions[0];
  insights.push(`Best option: ${best.label} at ${usd(best.profit)}, recovering ${usd(best.recovered)} versus doing nothing.`);
  if (byKey.absorb.profit < byKey.nothing.profit) {
    insights.push(`Absorbing the duty is ${actions[actions.length - 1].key === "absorb" ? "the worst option" : "worse than doing nothing"}: it cuts the margin on every unit (to ${usd2(absorb.marginPerUnitNew)} from ${usd2(nothing.marginPerUnitNew)}), so the profit given up outweighs the ${(absorb.newVolume - nothing.newVolume).toLocaleString()} units it saves.`);
  } else {
    insights.push(`Absorbing the duty pays here because demand is elastic enough (${input.elasticity}) that the volume saved is worth more than the margin given up.`);
  }
  const rescued = nothing.lostUnits - origin.lostUnits;
  const netPerRescued = rescued > 0 ? byKey.origin.recovered / rescued : 0;
  if (byKey.combo.profit < byKey.shift.profit && byKey.combo.profit > byKey.origin.profit) {
    insights.push(`The combination beats requalifying origin alone but not market shifting alone: fixing origin reduces the lost volume available to shift (${nothing.lostUnits.toLocaleString()} → ${origin.lostUnits.toLocaleString()} units). After paying ${usd2(input.origin.extraCostPerUnit)} on every unit, the origin fix nets only ${usd2(netPerRescued)} per rescued unit, while a shifted unit earns ${usd2(input.shift.marginPerUnit)}.`);
  } else if (byKey.combo.profit >= byKey.shift.profit) {
    insights.push(`The combination is the strongest play: the origin fix protects ${usd2(origin.marginPerUnitNew)} per unit on retained volume and the remaining lost units are still shifted.`);
  }
  if (nothing.breakEvenDutyPct != null) insights.push(`Against a rival landed at ${usd2(input.rivalLanded!)}, break-even duty is ${nothing.breakEvenDutyPct}%, so ${input.newDutyPct}% is ${nothing.pastBreakEven ? "far past it: buyers can switch supplier, which is why volume defence matters more than margin." : "still below it."}`);

  return { input, baseline: nothing, actions, insights, disclaimer: "Illustrative model. Elasticity, switching margins and compliance costs are assumptions, not observed data." };
}
