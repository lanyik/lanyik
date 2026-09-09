/** One shared application budget for terrain, authority and numerical query workers. */
export function workerBudget(hardwareConcurrency: number): { terrain: number; queries: number } {
    if (!Number.isInteger(hardwareConcurrency) || hardwareConcurrency < 1) throw new Error("Invalid hardware concurrency");
    return { terrain: hardwareConcurrency >= 6 ? 2 : 1, queries: hardwareConcurrency >= 8 ? 2 : 0 };
}
