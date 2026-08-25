import { BufferAttribute, BufferGeometry, InstancedBufferGeometry, InterleavedBufferAttribute } from "three";

// Instanced chunks own their per-instance attributes but reuse one immutable
// vertex/index template per LOD. Three's default dispose handler deletes every
// attached WebGL buffer; temporarily detaching shared attributes ensures an
// evicted chunk releases only its own buffers and cannot invalidate siblings.
export class SharedBaseInstancedBufferGeometry extends InstancedBufferGeometry {
    private readonly sharedAttributes = new Map<string, BufferAttribute | InterleavedBufferAttribute>();
    private readonly sharedIndex: BufferAttribute | null;

    constructor(base: BufferGeometry, attributeNames: readonly string[]) {
        super();
        for (const name of attributeNames) {
            const attribute = base.getAttribute(name);
            if (!attribute) continue;
            this.sharedAttributes.set(name, attribute);
            this.setAttribute(name, attribute);
        }
        this.sharedIndex = base.getIndex();
        this.setIndex(this.sharedIndex);
    }

    public override dispose(): void {
        for (const [name, attribute] of this.sharedAttributes) {
            if (this.getAttribute(name) === attribute) this.deleteAttribute(name);
        }
        const usesSharedIndex = this.getIndex() === this.sharedIndex;
        if (usesSharedIndex) this.setIndex(null);
        super.dispose();
        // A cached LOD geometry remains a valid CPU object after GPU eviction;
        // restore its shared template so a later activation can re-upload it.
        for (const [name, attribute] of this.sharedAttributes) this.setAttribute(name, attribute);
        if (usesSharedIndex) this.setIndex(this.sharedIndex);
    }
}
