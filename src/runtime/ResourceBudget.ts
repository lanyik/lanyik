import { BufferAttribute, BufferGeometry, InterleavedBufferAttribute, Material, Object3D, Texture } from "three";

export interface ResourceCost {
    cpuBytes: number;
    gpuBytes: number;
    geometryBytes: number;
    textureBytes: number;
    modelBytes: number;
}

export interface ResourceBudgetLimits {
    cpuBytes: number;
    gpuBytes: number;
}

/** One immutable backing allocation or upload, shared by object identity. */
export interface ResourceAllocation {
    readonly identity: object;
    readonly cost: Partial<ResourceCost>;
}

export interface ResourceReservation extends ResourceCost {
    readonly key: string;
    readonly pinned: boolean;
}

export interface ResourceBudgetStats extends ResourceCost {
    readonly disposed: boolean;
    readonly cpuLimitBytes: number;
    readonly gpuLimitBytes: number;
    readonly accounts: number;
    readonly reservations: number;
    readonly pinnedReservations: number;
    readonly cpuExceededBytes: number;
    readonly gpuExceededBytes: number;
    readonly rejectedReservations: number;
    readonly peakCpuBytes: number;
    readonly peakGpuBytes: number;
}

export interface ResourceBudgetView {
    readonly stats: Readonly<ResourceBudgetStats>;
}

export interface ResourceBudgetAccountStats extends ResourceCost {
    readonly label: string;
    readonly disposed: boolean;
    readonly reservations: number;
    readonly pinnedReservations: number;
}

export interface ResourceReservationHandle {
    readonly key: string;
    readonly released: boolean;
    readonly reservation: Readonly<ResourceReservation> | undefined;
    update(cost: Partial<ResourceCost>, pinned?: boolean, allocations?: readonly ResourceAllocation[]): boolean;
    setPinned(pinned: boolean): boolean;
    release(): boolean;
}

export interface ResourceBudgetAccount {
    readonly label: string;
    readonly disposed: boolean;
    readonly stats: Readonly<ResourceBudgetAccountStats>;
    acquire(
        key: string,
        cost: Partial<ResourceCost>,
        pinned?: boolean,
        allocations?: readonly ResourceAllocation[]
    ): ResourceReservationHandle | undefined;
    acquireRequired(
        key: string,
        cost: Partial<ResourceCost>,
        pinned: true,
        allocations?: readonly ResourceAllocation[]
    ): ResourceReservationHandle;
    release(key: string): boolean;
    clear(): void;
    dispose(): void;
}

export interface BufferGeometryResourceBytes {
    /** Unique backing-store bytes retained on the CPU. */
    readonly cpuBytes: number;
    /** Attribute/index upload bytes retained by Three.js/WebGL. */
    readonly gpuBytes: number;
}

const ZERO_COST: ResourceCost = {
    cpuBytes: 0,
    gpuBytes: 0,
    geometryBytes: 0,
    textureBytes: 0,
    modelBytes: 0
};

export function normalizeResourceCost(cost: Partial<ResourceCost> = {}): ResourceCost {
    const normalized = { ...ZERO_COST, ...cost };
    for (const [name, value] of Object.entries(normalized)) {
        if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
            throw new RangeError(`${name} must be a non-negative safe integer byte count`);
        }
    }
    return normalized;
}

function addCost(first: ResourceCost, second: ResourceCost): ResourceCost {
    return {
        cpuBytes: first.cpuBytes + second.cpuBytes,
        gpuBytes: first.gpuBytes + second.gpuBytes,
        geometryBytes: first.geometryBytes + second.geometryBytes,
        textureBytes: first.textureBytes + second.textureBytes,
        modelBytes: first.modelBytes + second.modelBytes
    };
}

function subtractCost(first: ResourceCost, second: ResourceCost): ResourceCost {
    return {
        cpuBytes: Math.max(0, first.cpuBytes - second.cpuBytes),
        gpuBytes: Math.max(0, first.gpuBytes - second.gpuBytes),
        geometryBytes: Math.max(0, first.geometryBytes - second.geometryBytes),
        textureBytes: Math.max(0, first.textureBytes - second.textureBytes),
        modelBytes: Math.max(0, first.modelBytes - second.modelBytes)
    };
}

// Shared byte ledger for render, simulation and streaming owners. A caller can
// probe an admission with reserve(); pinned working-set entries may explicitly
// use forceReserve(), which keeps the overage visible in stats for degradation.
export class ResourceBudgetLedger {
    private readonly entries = new Map<string, ResourceReservation>();
    private readonly allocations = new Map<string, readonly ResourceAllocation[]>();
    private readonly shared = new Map<object, { cost: ResourceCost; references: number }>();
    private readonly accounts = new Set<LedgerResourceBudgetAccount>();
    private totals: ResourceCost = { ...ZERO_COST };
    private limits: ResourceBudgetLimits;
    private rejectedReservations = 0;
    private peakCpuBytes = 0;
    private peakGpuBytes = 0;
    private nextAccountId = 1;
    private disposed = false;

    constructor(limits: ResourceBudgetLimits) {
        this.limits = this.validateLimits(limits);
    }

    public configure(limits: Partial<ResourceBudgetLimits>): void {
        this.assertActive();
        this.limits = this.validateLimits({ ...this.limits, ...limits });
    }

    public reserve(
        key: string, cost: Partial<ResourceCost>, pinned = false,
        allocations = this.allocations.get(key) ?? []
    ): boolean {
        this.assertActive();
        this.assertKey(key);
        const normalized = normalizeResourceCost(cost);
        const prepared = this.prepareAllocations(allocations);
        const prospective = this.prospectiveCost(key, normalized, prepared);
        if (prospective.cpuBytes > this.limits.cpuBytes || prospective.gpuBytes > this.limits.gpuBytes) {
            this.rejectedReservations += 1;
            return false;
        }
        this.store(key, normalized, pinned, prepared);
        return true;
    }

    public forceReserve(
        key: string, cost: Partial<ResourceCost>, pinned = false,
        allocations = this.allocations.get(key) ?? []
    ): void {
        this.assertActive();
        this.assertKey(key);
        const normalized = normalizeResourceCost(cost);
        this.store(key, normalized, pinned, this.prepareAllocations(allocations));
    }

    public release(key: string): boolean {
        const existing = this.entries.get(key);
        if (!existing) return false;
        this.entries.delete(key);
        this.totals = subtractCost(this.totals, existing);
        for (const allocation of this.allocations.get(key) ?? []) {
            const shared = this.shared.get(allocation.identity)!;
            shared.references -= 1;
            if (shared.references === 0) {
                this.shared.delete(allocation.identity);
                this.totals = subtractCost(this.totals, shared.cost);
            }
        }
        this.allocations.delete(key);
        return true;
    }

    public clear(): void {
        if (this.disposed) return;
        for (const account of this.accounts) account.invalidateReservations();
        this.entries.clear();
        this.allocations.clear();
        this.shared.clear();
        this.totals = { ...ZERO_COST };
    }

    public dispose(): void {
        if (this.disposed) return;
        for (const account of [...this.accounts]) account.detachFromLedger();
        this.accounts.clear();
        this.entries.clear();
        this.allocations.clear();
        this.shared.clear();
        this.totals = { ...ZERO_COST };
        this.disposed = true;
    }

    public createAccount(label: string): ResourceBudgetAccount {
        this.assertActive();
        if (typeof label !== "string" || label.trim().length === 0) {
            throw new TypeError("resource account label is required");
        }
        const account = new LedgerResourceBudgetAccount(
            this,
            label,
            `@account:${this.nextAccountId++}:`,
            value => { this.accounts.delete(value); }
        );
        this.accounts.add(account);
        return account;
    }

    public setPinned(key: string, pinned: boolean): boolean {
        const existing = this.entries.get(key);
        if (!existing || existing.pinned === pinned) return Boolean(existing);
        this.entries.set(key, { ...existing, pinned });
        return true;
    }

    public get(key: string): Readonly<ResourceReservation> | undefined {
        const entry = this.entries.get(key);
        return entry ? { ...entry, ...this.costForKeys([key]) } : undefined;
    }

    public costForKeys(keys: Iterable<string>): ResourceCost {
        let total = { ...ZERO_COST };
        const seen = new Set<object>();
        for (const key of keys) {
            const entry = this.entries.get(key);
            if (!entry) continue;
            total = addCost(total, entry);
            for (const allocation of this.allocations.get(key) ?? []) {
                if (seen.has(allocation.identity)) continue;
                seen.add(allocation.identity);
                total = addCost(total, this.shared.get(allocation.identity)!.cost);
            }
        }
        return total;
    }

    public get stats(): Readonly<ResourceBudgetStats> {
        let pinnedReservations = 0;
        for (const entry of this.entries.values()) if (entry.pinned) pinnedReservations += 1;
        return {
            ...this.totals,
            disposed: this.disposed,
            cpuLimitBytes: this.limits.cpuBytes,
            gpuLimitBytes: this.limits.gpuBytes,
            accounts: this.accounts.size,
            reservations: this.entries.size,
            pinnedReservations,
            cpuExceededBytes: Math.max(0, this.totals.cpuBytes - this.limits.cpuBytes),
            gpuExceededBytes: Math.max(0, this.totals.gpuBytes - this.limits.gpuBytes),
            rejectedReservations: this.rejectedReservations,
            peakCpuBytes: this.peakCpuBytes,
            peakGpuBytes: this.peakGpuBytes
        };
    }

    private store(
        key: string,
        cost: ResourceCost,
        pinned: boolean,
        allocations: readonly ResourceAllocation[]
    ): void {
        this.release(key);
        this.totals = addCost(this.totals, cost);
        for (const allocation of allocations) {
            const shared = this.shared.get(allocation.identity);
            if (shared) shared.references += 1;
            else {
                const normalized = normalizeResourceCost(allocation.cost);
                this.shared.set(allocation.identity, { cost: normalized, references: 1 });
                this.totals = addCost(this.totals, normalized);
            }
        }
        this.allocations.set(key, allocations);
        this.entries.set(key, { key, pinned, ...cost });
        this.peakCpuBytes = Math.max(this.peakCpuBytes, this.totals.cpuBytes);
        this.peakGpuBytes = Math.max(this.peakGpuBytes, this.totals.gpuBytes);
    }

    private prepareAllocations(allocations: readonly ResourceAllocation[]): ResourceAllocation[] {
        const unique = new Map<object, ResourceCost>();
        for (const allocation of allocations) {
            if (!allocation.identity || typeof allocation.identity !== "object") {
                throw new TypeError("resource allocation identity must be an object");
            }
            const cost = normalizeResourceCost(allocation.cost);
            const previous = unique.get(allocation.identity) ?? this.shared.get(allocation.identity)?.cost;
            if (previous && Object.keys(ZERO_COST).some(key => previous[key as keyof ResourceCost] !== cost[key as keyof ResourceCost])) {
                throw new Error("shared resource allocation cost changed; replace its identity when reallocating");
            }
            unique.set(allocation.identity, cost);
        }
        return [...unique].map(([identity, cost]) => ({ identity, cost }));
    }

    private prospectiveCost(key: string, cost: ResourceCost, allocations: readonly ResourceAllocation[]): ResourceCost {
        let total = addCost(subtractCost(this.totals, this.entries.get(key) ?? ZERO_COST), cost);
        const released = new Set<object>();
        for (const allocation of this.allocations.get(key) ?? []) {
            const shared = this.shared.get(allocation.identity)!;
            if (shared.references !== 1) continue;
            released.add(allocation.identity);
            total = subtractCost(total, shared.cost);
        }
        for (const allocation of allocations) {
            if (!this.shared.has(allocation.identity) || released.has(allocation.identity)) {
                total = addCost(total, normalizeResourceCost(allocation.cost));
            }
        }
        return total;
    }

    private validateLimits(limits: ResourceBudgetLimits): ResourceBudgetLimits {
        for (const [name, value] of Object.entries(limits)) {
            if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(value)) {
                throw new RangeError(`${name} budget must be a non-negative safe integer`);
            }
        }
        return { ...limits };
    }

    private assertKey(key: string): void {
        if (typeof key !== "string" || key.trim().length === 0) {
            throw new TypeError("resource key is required");
        }
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("ResourceBudgetLedger has been disposed");
    }
}

class LedgerResourceReservationHandle implements ResourceReservationHandle {
    private releasedValue = false;

    constructor(
        private readonly account: LedgerResourceBudgetAccount,
        public readonly key: string,
        public readonly ledgerKey: string
    ) {}

    public get released(): boolean { return this.releasedValue; }

    public get reservation(): Readonly<ResourceReservation> | undefined {
        return this.releasedValue ? undefined : this.account.lookup(this.ledgerKey);
    }

    public update(cost: Partial<ResourceCost>, pinned = this.reservation?.pinned ?? false, allocations?: readonly ResourceAllocation[]): boolean {
        if (this.releasedValue) throw new Error(`resource reservation "${this.key}" has been released`);
        return this.account.update(this, cost, pinned, allocations);
    }

    public setPinned(pinned: boolean): boolean {
        if (this.releasedValue) return false;
        return this.account.setPinned(this, pinned);
    }

    public release(): boolean {
        if (this.releasedValue) return false;
        this.releasedValue = true;
        return this.account.releaseHandle(this);
    }

    public invalidate(): void { this.releasedValue = true; }
}

class LedgerResourceBudgetAccount implements ResourceBudgetAccount {
    private readonly handles = new Map<string, LedgerResourceReservationHandle>();
    private disposedValue = false;

    constructor(
        private readonly ledger: ResourceBudgetLedger,
        public readonly label: string,
        private readonly prefix: string,
        private readonly detached: (account: LedgerResourceBudgetAccount) => void
    ) {}

    public get disposed(): boolean { return this.disposedValue; }

    public acquire(
        key: string,
        cost: Partial<ResourceCost>,
        pinned = false,
        allocations?: readonly ResourceAllocation[]
    ): ResourceReservationHandle | undefined {
        this.assertActive();
        this.assertLocalKey(key);
        if (this.handles.has(key)) {
            throw new Error(`resource account "${this.label}" already owns reservation "${key}"`);
        }
        const ledgerKey = `${this.prefix}${key}`;
        if (!this.ledger.reserve(ledgerKey, cost, pinned, allocations)) return undefined;
        const handle = new LedgerResourceReservationHandle(this, key, ledgerKey);
        this.handles.set(key, handle);
        return handle;
    }

    public acquireRequired(
        key: string,
        cost: Partial<ResourceCost>,
        pinned: true,
        allocations?: readonly ResourceAllocation[]
    ): ResourceReservationHandle {
        this.assertActive();
        this.assertLocalKey(key);
        if (this.handles.has(key)) {
            throw new Error(`resource account "${this.label}" already owns reservation "${key}"`);
        }
        const ledgerKey = `${this.prefix}${key}`;
        this.ledger.forceReserve(ledgerKey, cost, pinned, allocations);
        const handle = new LedgerResourceReservationHandle(this, key, ledgerKey);
        this.handles.set(key, handle);
        return handle;
    }

    public release(key: string): boolean {
        return this.handles.get(key)?.release() ?? false;
    }

    public clear(): void {
        if (this.disposedValue) return;
        for (const handle of [...this.handles.values()]) handle.release();
    }

    public dispose(): void {
        if (this.disposedValue) return;
        this.clear();
        this.disposedValue = true;
        this.detached(this);
    }

    public get stats(): Readonly<ResourceBudgetAccountStats> {
        const totals = this.ledger.costForKeys([...this.handles.values()].map(handle => handle.ledgerKey));
        let reservations = 0;
        let pinnedReservations = 0;
        for (const handle of this.handles.values()) {
            const reservation = handle.reservation;
            if (!reservation) continue;
            reservations += 1;
            if (reservation.pinned) pinnedReservations += 1;
        }
        return {
            ...totals,
            label: this.label,
            disposed: this.disposedValue,
            reservations,
            pinnedReservations
        };
    }

    public lookup(ledgerKey: string): Readonly<ResourceReservation> | undefined {
        return this.ledger.get(ledgerKey);
    }

    public update(
        handle: LedgerResourceReservationHandle,
        cost: Partial<ResourceCost>,
        pinned: boolean,
        allocations?: readonly ResourceAllocation[]
    ): boolean {
        this.assertOwned(handle);
        return this.ledger.reserve(handle.ledgerKey, cost, pinned, allocations);
    }

    public setPinned(handle: LedgerResourceReservationHandle, pinned: boolean): boolean {
        this.assertOwned(handle);
        return this.ledger.setPinned(handle.ledgerKey, pinned);
    }

    public releaseHandle(handle: LedgerResourceReservationHandle): boolean {
        if (this.handles.get(handle.key) !== handle) return false;
        this.handles.delete(handle.key);
        return this.ledger.release(handle.ledgerKey);
    }

    public invalidateReservations(): void {
        for (const handle of this.handles.values()) handle.invalidate();
        this.handles.clear();
    }

    public detachFromLedger(): void {
        this.invalidateReservations();
        this.disposedValue = true;
    }

    private assertOwned(handle: LedgerResourceReservationHandle): void {
        this.assertActive();
        if (this.handles.get(handle.key) !== handle) {
            throw new Error(`resource reservation "${handle.key}" is not owned by account "${this.label}"`);
        }
    }

    private assertActive(): void {
        if (this.disposedValue) throw new Error(`resource account "${this.label}" has been disposed`);
    }

    private assertLocalKey(key: string): void {
        if (typeof key !== "string" || key.trim().length === 0) {
            throw new TypeError("resource reservation key is required");
        }
    }
}

function attributeArray(attribute: BufferAttribute | InterleavedBufferAttribute): ArrayBufferView {
    return attribute instanceof InterleavedBufferAttribute ? attribute.data.array : attribute.array;
}

export function collectCpuBufferAllocations(arrays: readonly ArrayBufferView[]): ResourceAllocation[] {
    return [...new Set(arrays.map(array => array.buffer))]
        .filter(buffer => buffer.byteLength > 0)
        .map(buffer => ({ identity: buffer, cost: { cpuBytes: buffer.byteLength, modelBytes: buffer.byteLength } }));
}

export function collectGeometryAllocations(
    geometries: readonly BufferGeometry[],
    instanceAttributes: readonly BufferAttribute[] = []
): ResourceAllocation[] {
    const arrays = new Set<ArrayBufferLike>();
    const uploads = new Set<object>();
    const allocations: ResourceAllocation[] = [];
    const account = (attribute: BufferAttribute | InterleavedBufferAttribute | null | undefined): void => {
        if (!attribute) return;
        const array = attributeArray(attribute);
        const buffer = array.buffer;
        if (!arrays.has(buffer)) {
            arrays.add(buffer);
            // A view keeps its complete backing allocation alive even when it
            // exposes only a slice of that allocation.
            allocations.push({ identity: buffer, cost: { cpuBytes: buffer.byteLength, modelBytes: buffer.byteLength } });
        }
        // Three.js caches WebGL buffers by BufferAttribute, or by the shared
        // InterleavedBuffer for interleaved attributes—not by ArrayBuffer.
        const uploadOwner = attribute instanceof InterleavedBufferAttribute
            ? attribute.data
            : attribute;
        if (!uploads.has(uploadOwner)) {
            uploads.add(uploadOwner);
            allocations.push({ identity: uploadOwner, cost: { gpuBytes: array.byteLength, geometryBytes: array.byteLength } });
        }
    };
    for (const geometry of new Set(geometries)) {
        account(geometry.index);
        for (const attribute of Object.values(geometry.attributes)) account(attribute);
        for (const attributes of Object.values(geometry.morphAttributes)) {
            for (const attribute of attributes) account(attribute);
        }
    }
    for (const attribute of instanceAttributes) account(attribute);
    return allocations;
}

export function estimateBufferGeometriesResourceBytes(
    geometries: readonly BufferGeometry[],
    instanceAttributes: readonly BufferAttribute[] = []
): BufferGeometryResourceBytes {
    const cost = sumResourceAllocations(collectGeometryAllocations(geometries, instanceAttributes));
    return { cpuBytes: cost.cpuBytes, gpuBytes: cost.gpuBytes };
}

// CPU backing-store estimate. GPU admission uses the separate upload estimate.
export function estimateBufferGeometriesBytes(geometries: readonly BufferGeometry[]): number {
    return estimateBufferGeometriesResourceBytes(geometries).cpuBytes;
}

interface TextureImageLike {
    width?: number;
    height?: number;
    depth?: number;
    data?: ArrayBufferView;
}

function textureImageBytes(image: unknown): number {
    if (Array.isArray(image)) return image.reduce((bytes, face) => bytes + textureImageBytes(face), 0);
    if (!image || typeof image !== "object") return 0;
    const value = image as TextureImageLike;
    if (value.data) return value.data.byteLength;
    if (!Number.isFinite(value.width) || !Number.isFinite(value.height)) return 0;
    return Math.max(0, Math.round(
        (value.width as number) * (value.height as number) * (value.depth ?? 1) * 4
    ));
}

function textureResourceBytes(texture: Texture): BufferGeometryResourceBytes {
    const baseBytes = textureImageBytes(texture.image);
    const mipmapBytes = (texture.mipmaps as unknown[])
        .reduce<number>((bytes, mipmap) => bytes + textureImageBytes(mipmap), 0);
    // When Three/WebGL generates mipmaps instead of receiving explicit levels,
    // the complete chain costs approximately another third of the base level.
    const generatedMipBytes = texture.generateMipmaps && mipmapBytes === 0
        ? Math.ceil(baseBytes / 3)
        : 0;
    return {
        cpuBytes: baseBytes + mipmapBytes,
        gpuBytes: baseBytes + mipmapBytes + generatedMipBytes
    };
}

function collectTextureValue(value: unknown, textures: Set<Texture>): void {
    if (value instanceof Texture) {
        textures.add(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const entry of value) collectTextureValue(entry, textures);
    }
}

interface Object3DResourceSets {
    readonly geometries: Set<BufferGeometry>;
    readonly instanceAttributes: Set<BufferAttribute>;
    readonly materials: Set<Material>;
    readonly textures: Set<Texture>;
}

function collectObject3DResources(objects: readonly Object3D[]): Object3DResourceSets {
    const geometries = new Set<BufferGeometry>();
    const instanceAttributes = new Set<BufferAttribute>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const root of new Set(objects)) root.traverse(object => {
        const renderable = object as Object3D & {
            geometry?: BufferGeometry;
            material?: Material | Material[];
            skeleton?: { boneTexture?: Texture | null };
            instanceMatrix?: BufferAttribute;
            instanceColor?: BufferAttribute | null;
            morphTexture?: Texture | null;
        };
        if (renderable.geometry) geometries.add(renderable.geometry);
        if (renderable.instanceMatrix) instanceAttributes.add(renderable.instanceMatrix);
        if (renderable.instanceColor) instanceAttributes.add(renderable.instanceColor);
        if (renderable.morphTexture) textures.add(renderable.morphTexture);
        if (renderable.skeleton?.boneTexture) textures.add(renderable.skeleton.boneTexture);
        const objectMaterials = renderable.material
            ? Array.isArray(renderable.material) ? renderable.material : [renderable.material]
            : [];
        for (const material of objectMaterials) materials.add(material);
    });
    for (const material of materials) {
        for (const value of Object.values(material)) collectTextureValue(value, textures);
        const uniforms = (material as Material & {
            uniforms?: Record<string, { value?: unknown }>;
        }).uniforms;
        for (const uniform of Object.values(uniforms ?? {})) {
            collectTextureValue(uniform?.value, textures);
        }
    }
    return { geometries, instanceAttributes, materials, textures };
}

export function collectObject3DResourceAllocations(
    objects: readonly Object3D[], extraGeometries: readonly BufferGeometry[] = []
): ResourceAllocation[] {
    const { geometries, instanceAttributes, textures } = collectObject3DResources(objects);
    const allocations = collectGeometryAllocations([...geometries, ...extraGeometries], [...instanceAttributes]);
    const textureSources = new Set<object>();
    for (const texture of textures) {
        const cost = textureResourceBytes(texture);
        if (cost.cpuBytes > 0 && !textureSources.has(texture.source)) {
            textureSources.add(texture.source);
            allocations.push({ identity: texture.source, cost: { cpuBytes: cost.cpuBytes, modelBytes: cost.cpuBytes } });
        }
        if (cost.gpuBytes > 0) allocations.push({ identity: texture, cost: { gpuBytes: cost.gpuBytes, textureBytes: cost.gpuBytes } });
    }
    return allocations;
}

export function sumResourceAllocations(allocations: readonly ResourceAllocation[]): ResourceCost {
    let cost = { ...ZERO_COST };
    const seen = new Set<object>();
    for (const allocation of allocations) {
        if (seen.has(allocation.identity)) continue;
        seen.add(allocation.identity);
        cost = addCost(cost, normalizeResourceCost(allocation.cost));
    }
    return cost;
}

export function estimateObject3DResourceCost(objects: readonly Object3D[]): ResourceCost {
    return sumResourceAllocations(collectObject3DResourceAllocations(objects));
}

// Dispose one immutable asset graph after its final borrower releases it. The
// sets prevent shared glTF resources from being disposed more than once.
export function disposeObject3DResources(objects: readonly Object3D[]): void {
    const { geometries, materials, textures } = collectObject3DResources(objects);
    const images = new Set<object>();
    const closeImage = (image: unknown): void => {
        if (Array.isArray(image)) {
            for (const entry of image) closeImage(entry);
            return;
        }
        if (!image || typeof image !== "object" || images.has(image)) return;
        images.add(image);
        const close = (image as { close?: () => void }).close;
        if (typeof close === "function") close.call(image);
    };
    for (const texture of textures) {
        closeImage(texture.image);
        for (const mipmap of texture.mipmaps as unknown[]) closeImage(mipmap);
        texture.dispose();
    }
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
}
