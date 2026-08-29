export class CoordinatePairMap<T> {
    private readonly columns = new Map<number, Map<number, T>>();
    private entryCount = 0;

    public get size(): number {
        return this.entryCount;
    }

    public get(x: number, y: number): T | undefined {
        return this.columns.get(x)?.get(y);
    }

    public has(x: number, y: number): boolean {
        return this.columns.get(x)?.has(y) ?? false;
    }

    public set(x: number, y: number, value: T): this {
        let column = this.columns.get(x);
        if (!column) {
            column = new Map<number, T>();
            this.columns.set(x, column);
        }
        if (!column.has(y)) this.entryCount += 1;
        column.set(y, value);
        return this;
    }

    public delete(x: number, y: number): boolean {
        const column = this.columns.get(x);
        if (!column || !column.delete(y)) return false;
        this.entryCount -= 1;
        if (column.size === 0) this.columns.delete(x);
        return true;
    }

    public clear(): void {
        this.columns.clear();
        this.entryCount = 0;
    }

    public *values(): IterableIterator<T> {
        for (const column of this.columns.values()) yield* column.values();
    }

    public *entries(): IterableIterator<readonly [x: number, y: number, value: T]> {
        for (const [x, column] of this.columns) {
            for (const [y, value] of column) yield [x, y, value] as const;
        }
    }
}

