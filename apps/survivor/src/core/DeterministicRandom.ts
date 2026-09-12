/** Small serializable PRNG used only by authoritative gameplay. */
export class DeterministicRandom {
    private value: number;

    constructor(seed: string | number) {
        const text = String(seed);
        let hash = 0x811c9dc5;
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193);
        }
        this.value = hash >>> 0 || 0x9e3779b9;
    }

    public clone(): DeterministicRandom {
        const copy = new DeterministicRandom(0);
        copy.value = this.value;
        return copy;
    }
    public get state(): number { return this.value; }
    public restore(state: number): void {
        if (!Number.isSafeInteger(state) || state <= 0 || state > 0xffffffff) throw new RangeError("Invalid random state");
        this.value = state;
    }

    public nextUint32(): number {
        let value = this.value;
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        this.value = value >>> 0;
        return this.value;
    }

    public next(): number { return this.nextUint32() / 0x1_0000_0000; }

    public integer(maximumExclusive: number): number {
        if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive <= 0) {
            throw new RangeError("Random integer bound must be a positive safe integer");
        }
        return Math.floor(this.next() * maximumExclusive);
    }

    public chance(probability: number): boolean {
        if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
            throw new RangeError("Probability must be finite and between zero and one");
        }
        return this.next() < probability;
    }

    public pick<T>(values: readonly T[]): T {
        if (values.length === 0) throw new RangeError("Cannot choose from an empty collection");
        return values[this.integer(values.length)];
    }
}
