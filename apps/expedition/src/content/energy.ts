export interface PowerDefinition {
    readonly node?: { readonly coverage: number; readonly linkRange: number };
    readonly generation?: { readonly kind: "constant" | "solar"; readonly kw: number };
    readonly storage?: { readonly capacityJ: number; readonly chargeKW: number; readonly dischargeKW: number };
    readonly demandKW?: number;
}

// One game day is four minutes: three minutes of daylight, one minute of night.
export const DAYLIGHT_TICKS = 1800;
export const DAY_CYCLE_TICKS = 2400;
export const POWER_PRIORITIES = [0, 1, 2] as const;
export type PowerPriority = typeof POWER_PRIORITIES[number];
export const PRIORITY_NAMES = ["高", "普通", "低"] as const;
