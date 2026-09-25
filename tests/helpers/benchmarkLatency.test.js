import { expect, test } from "vitest";
import { BenchmarkProbe, latencyOverruns, summarizeLatencies, summarizeLatencyRounds } from "../../scripts/lib/benchmark-latency.mjs";

test("nearest-rank tails retain an early spike and do not sort the caller's samples", () => {
    const samples = Float64Array.from([100, ...Array(99).fill(1)]);
    const summary = summarizeLatencies(samples, 3);
    expect(summary).toMatchObject({ count: 100, meanMs: 1.99, firstMs: 100, p50Ms: 1, p95Ms: 1, p99Ms: 1, maxMs: 100 });
    expect(summary.worst[0]).toEqual({ sample: 1, ms: 100 });
    expect(summary.overBudget).toEqual({ thresholdMs: 3, count: 1, fraction: .01, maxConsecutive: 1, excessMs: 97 });
    expect(samples[0]).toBe(100);
    expect(summarizeLatencies([7], 3).p99Ms).toBe(7);
});

test("overruns distinguish equality, consecutive runs and cumulative excess", () => {
    expect(latencyOverruns([3, 5, 4, 1, 8], 3)).toEqual({ thresholdMs: 3, count: 3, fraction: .6, maxConsecutive: 2, excessMs: 8 });
    expect(summarizeLatencies([2, 2, 1], 3).worst.map(s => s.sample)).toEqual([1, 2, 3]);
    for (const values of [[], [NaN], [Infinity], [-1]]) expect(() => summarizeLatencies(values, 3)).toThrow();
    for (const budget of [0, -1, NaN, Infinity]) expect(() => summarizeLatencies([1], budget)).toThrow();
});

test("pooled tails retain earlier rounds, use operation weights and stop consecutive runs at round boundaries", () => {
    const summary = summarizeLatencyRounds([[1, 100], [10, 10, 1, 1]], 3);
    expect(summary).toMatchObject({ count: 6, meanMs: 20.5, p50Ms: 1, p95Ms: 100, p99Ms: 100, maxMs: 100 });
    expect(summary.overBudget).toMatchObject({ count: 3, maxConsecutive: 2 });
    expect(summary.worst.slice(0, 3)).toEqual([{ round: 1, sample: 2, ms: 100 }, { round: 2, sample: 1, ms: 10 }, { round: 2, sample: 2, ms: 10 }]);
    expect(() => summarizeLatencyRounds([], 3)).toThrow();
    expect(() => summarizeLatencyRounds([[1], []], 3)).toThrow();
});

test("nested probes preserve receivers/results, subtract child time and restore inherited methods", async () => {
    let time = 0;
    const parent = { child() { time += 3; return this.value; } };
    const target = Object.assign(Object.create(parent), { value: 42, outer() { time += 2; const result = this.child(); time += 1; return result; } });
    const original = target.outer, probe = new BenchmarkProbe(1, () => time);
    try {
        probe.attach(target, "outer", "outer"); probe.attach(target, "child", "child");
        probe.begin(0, 0); expect(target.outer()).toBe(42); probe.end(time);
        const result = await probe.report([6], 3);
        expect(result.stages.outer).toMatchObject({ inclusiveMs: 6, selfMs: 3, calls: 1 });
        expect(result.stages.child).toMatchObject({ inclusiveMs: 3, selfMs: 3, calls: 1 });
        expect(result.worst[0].stages.outer.selfMs).toBe(3);
        expect(target.outer).toBe(original); expect(Object.hasOwn(target, "child")).toBe(false);
    } finally { probe.dispose(); }
});

test("probe exceptions preserve failure and cannot strand wrappers or accept partial samples", async () => {
    let time = 0;
    const failure = new Error("expected failure"), target = { run() { time += 2; throw failure; } }, original = target.run;
    const probe = new BenchmarkProbe(2, () => time);
    try {
        probe.attach(target, "run", "run");
        expect(() => probe.begin(1, 0)).toThrow();
        probe.begin(0, 0); expect(() => target.run()).toThrow(failure); probe.end(time);
        await expect(probe.report([2], 3)).rejects.toThrow("Incomplete");
        expect(target.run).toBe(original);
    } finally { probe.dispose(); }
});
