import { performance, PerformanceObserver } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";

function validate(values, budgetMs) {
    if (!values.length || !Number.isFinite(budgetMs) || budgetMs <= 0) throw new RangeError("Latency samples and a positive budget are required");
    for (const value of values) if (!Number.isFinite(value) || value < 0) throw new RangeError("Latency samples must be finite and non-negative");
}

/** Strictly greater than the threshold; a sample exactly on budget is not an overrun. */
export function latencyOverruns(values, budgetMs) {
    validate(values, budgetMs);
    let count = 0, consecutive = 0, maxConsecutive = 0, excessMs = 0;
    for (const value of values) {
        if (value > budgetMs) {
            count++; consecutive++; excessMs += value - budgetMs;
            maxConsecutive = Math.max(maxConsecutive, consecutive);
        } else consecutive = 0;
    }
    return { thresholdMs: budgetMs, count, fraction: count / values.length, maxConsecutive, excessMs };
}

/** Nearest-rank percentiles. Sort a copy so original sample ordinals remain meaningful. */
export function summarizeLatencies(values, budgetMs) {
    validate(values, budgetMs);
    const sorted = Float64Array.from(values).sort();
    const percentile = p => sorted[Math.ceil(sorted.length * p) - 1];
    return {
        count: values.length, meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
        firstMs: values[0], p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), maxMs: sorted.at(-1),
        overBudget: latencyOverruns(values, budgetMs),
        worst: Array.from(values, (ms, index) => ({ sample: index + 1, ms }))
            .sort((a, b) => b.ms - a.ms || a.sample - b.sample).slice(0, 8)
    };
}

export function summarizeLatencyRounds(rounds, budgetMs) {
    if (!rounds.length || rounds.some(values => !values.length)) throw new RangeError("Non-empty latency rounds are required");
    const pooled = new Float64Array(rounds.reduce((sum, values) => sum + values.length, 0));
    let offset = 0;
    for (const values of rounds) { pooled.set(values, offset); offset += values.length; }
    const summary = summarizeLatencies(pooled, budgetMs);
    summary.overBudget.maxConsecutive = Math.max(...rounds.map(values => latencyOverruns(values, budgetMs).maxConsecutive));
    summary.worst = summary.worst.map(entry => {
        let sample = entry.sample, round = 0;
        while (sample > rounds[round].length) sample -= rounds[round++].length;
        return { round: round + 1, sample, ms: entry.ms };
    });
    return summary;
}

/** Benchmark-only probes: no production hooks or per-entity histories. Nested time is inclusive/self, never summed twice. */
export class BenchmarkProbe {
    constructor(capacity, clock = performance.now.bind(performance)) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("Invalid probe capacity");
        this.capacity = capacity; this.clock = clock;
        this.starts = new Float64Array(capacity); this.ends = new Float64Array(capacity);
        this.stages = new Map(); this.restores = [];
        this.children = new Float64Array(32); this.depth = 0; this.index = -1; this.completed = 0;
        this.gc = []; this.droppedGcEntries = 0;
        this.observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
                if (this.gc.length < 1024) this.gc.push({ startMs: entry.startTime, durationMs: entry.duration, kind: entry.detail.kind });
                else this.droppedGcEntries++;
            }
        });
        this.observer.observe({ entryTypes: ["gc"] });
    }

    begin(index, started) {
        if (this.index !== -1 || index !== this.completed || index >= this.capacity || !Number.isFinite(started)) throw new Error("Invalid probe sample order");
        this.index = index; this.starts[index] = started;
    }

    end(ended) {
        if (this.index < 0 || this.depth !== 0 || !Number.isFinite(ended) || ended < this.starts[this.index]) throw new Error("Invalid probe sample completion");
        this.ends[this.index] = ended; this.index = -1; this.completed++;
    }

    attach(target, key, label) {
        if (typeof target[key] !== "function" || this.stages.has(label)) throw new Error(`Invalid benchmark probe: ${label}`);
        const descriptor = Object.getOwnPropertyDescriptor(target, key), original = target[key], probe = this;
        const stage = { inclusive: new Float64Array(this.capacity), self: new Float64Array(this.capacity), calls: new Uint32Array(this.capacity) };
        this.stages.set(label, stage);
        target[key] = function (...args) {
            if (probe.index < 0) return Reflect.apply(original, this, args);
            if (probe.depth === probe.children.length) throw new Error("Benchmark probe nesting exceeded");
            const index = probe.index, depth = probe.depth++, started = probe.clock();
            probe.children[depth] = 0;
            try { return Reflect.apply(original, this, args); }
            finally {
                const elapsed = probe.clock() - started;
                probe.depth--;
                if (depth) probe.children[depth - 1] += elapsed;
                stage.inclusive[index] += elapsed; stage.self[index] += elapsed - probe.children[depth]; stage.calls[index]++;
            }
        };
        this.restores.push(() => {
            if (descriptor) Object.defineProperty(target, key, descriptor);
            else delete target[key];
        });
    }

    async report(timings, budgetMs) {
        try {
            if (this.completed !== this.capacity || timings.length !== this.capacity) throw new Error("Incomplete benchmark profile");
            // perf_hooks delivers GC entries asynchronously after the synchronous workload returns.
            await setImmediate(); await setImmediate();
            const gc = this.gc.filter(entry => this.starts.some((start, i) => start < entry.startMs + entry.durationMs && this.ends[i] > entry.startMs));
            const stagesAt = index => Object.fromEntries([...this.stages].map(([label, s]) => [label,
                { inclusiveMs: s.inclusive[index], selfMs: s.self[index], calls: s.calls[index] }]));
            return {
                timing: "Instrumented synchronous calls; self excludes nested probed calls. Probe overhead remains; GC overlap is correlation, not attribution.",
                stages: Object.fromEntries([...this.stages].map(([label, s]) => [label, {
                    inclusiveMs: s.inclusive.reduce((a, b) => a + b, 0), selfMs: s.self.reduce((a, b) => a + b, 0),
                    calls: s.calls.reduce((a, b) => a + b, 0), maxInclusiveMsPerSample: s.inclusive.reduce((a, b) => Math.max(a, b), 0)
                }])),
                gc, droppedGcEntries: this.droppedGcEntries,
                worst: summarizeLatencies(timings, budgetMs).worst.map(sample => {
                    const index = sample.sample - 1, start = this.starts[index], end = this.ends[index];
                    return { ...sample, startMs: start, stages: stagesAt(index),
                        gcOverlapMs: gc.reduce((sum, entry) => sum + Math.max(0, Math.min(end, entry.startMs + entry.durationMs) - Math.max(start, entry.startMs)), 0) };
                })
            };
        } finally { this.dispose(); }
    }

    dispose() {
        this.observer.disconnect();
        for (const restore of this.restores.splice(0).reverse()) restore();
    }
}
