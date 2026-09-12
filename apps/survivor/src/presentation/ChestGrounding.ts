import { Matrix4, Quaternion, Vector3, type BufferGeometry } from "three";
import { MAX_COMBAT_CHUNKS } from "../core/RegionalWorld";

const UP = new Vector3(0, 1, 0);

/** Rigid placement over the whole base, cached until the underlying surface changes. */
export class ChestGrounding {
    private readonly samples: Vector3[] = [];
    private readonly entries = new Map<string, Matrix4>();
    private readonly normal = new Vector3();
    private readonly rotation = new Quaternion();
    private readonly point = new Vector3();
    private readonly varianceX: number;
    private readonly varianceZ: number;

    constructor(geometry: BufferGeometry, private readonly height: (x: number, z: number) => number) {
        geometry.computeBoundingBox();
        const { min, max } = geometry.boundingBox!;
        let varianceX = 0, varianceZ = 0;
        for (let row = 0; row <= 4; row++) for (let column = 0; column <= 4; column++) {
            const x = min.x + (max.x - min.x) * column / 4, z = min.z + (max.z - min.z) * row / 4;
            this.samples.push(new Vector3(x, min.y, z));
            varianceX += x * x; varianceZ += z * z;
        }
        this.varianceX = varianceX; this.varianceZ = varianceZ;
    }

    /** Source models are centered in XZ and grounded at Y=0 during asset preparation. */
    public at(x: number, z: number): Matrix4 {
        const key = `${x},${z}`, cached = this.entries.get(key);
        if (cached) return cached;
        let slopeX = 0, slopeZ = 0;
        const centerHeight = this.height(x, z);
        for (const sample of this.samples) {
            const h = this.height(x + sample.x, z + sample.z) - centerHeight;
            slopeX += sample.x * h; slopeZ += sample.z * h;
        }
        this.normal.set(-slopeX / this.varianceX, 1, -slopeZ / this.varianceZ).normalize();
        this.rotation.setFromUnitVectors(UP, this.normal);
        // Rotation changes the footprint. Resample it before raising the rigid base to contact.
        let y = -Infinity;
        for (const sample of this.samples) {
            this.point.copy(sample).applyQuaternion(this.rotation);
            y = Math.max(y, this.height(x + this.point.x, z + this.point.z) - this.point.y);
        }
        const matrix = new Matrix4().makeRotationFromQuaternion(this.rotation).setPosition(x, y, z);
        if (this.entries.size >= MAX_COMBAT_CHUNKS) this.entries.delete(this.entries.keys().next().value!);
        this.entries.set(key, matrix);
        return matrix;
    }

    public clear(): void { this.entries.clear(); }
}
