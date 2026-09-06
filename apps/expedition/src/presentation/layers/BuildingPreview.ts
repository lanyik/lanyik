import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import { getHexCenter, type WorldRenderLayerHost } from "three-hex-map";
import type { Placement } from "../../core/construction/Industry";
import { moduleFor, type BuildingModule } from "./buildingModels";

export class BuildingPreview {
    public readonly root = new Group();
    private readonly ghostMaterial = new MeshStandardMaterial({ color: "#8ceac3", transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.7 });
    private readonly rimMaterial = new MeshBasicMaterial({ color: "#8ceac3", depthWrite: false });
    private readonly slots: { ghost: Mesh; rim: Mesh<BufferGeometry, MeshBasicMaterial> }[];
    constructor(private readonly models: ReadonlyMap<BuildingModule, BufferGeometry>) {
        this.root.name = "building-preview";
        this.root.visible = false;
        this.slots = Array.from({ length: 4 }, () => {
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6 * 8 * 6 * 3), 3));
            const rim = new Mesh(geometry, this.rimMaterial);
            rim.renderOrder = 2;
            const ghost = new Mesh(models.get("command-core")!, this.ghostMaterial);
            this.root.add(rim, ghost);
            return { ghost, rim };
        });
    }
    public get geometries(): readonly BufferGeometry[] { return this.slots.map(slot => slot.rim.geometry); }
    public show(placement: Placement | undefined, host: WorldRenderLayerHost | undefined): void {
        this.root.visible = !!placement && !!host;
        if (!placement || !host) return;
        const surface = host.surface!;
        const size = host.tileSize;
        this.ghostMaterial.color.set(placement.valid ? "#8ceac3" : "#ef7f68");
        this.rimMaterial.color.copy(this.ghostMaterial.color);
        this.slots.forEach(({ ghost, rim }, index) => {
            const cell = placement.cells[index];
            ghost.visible = rim.visible = !!cell;
            if (!cell) return;
            const center = getHexCenter(cell.x, cell.y, size);
            ghost.geometry = this.models.get(moduleFor(placement.kind, index))!;
            ghost.position.set(center.x, surface.getTileCenterHeight(cell.x, cell.y) + size * 0.04, center.y);
            ghost.scale.setScalar(size);
            ghost.rotation.y = -placement.rotation * Math.PI / 3;
            rim.position.set(center.x, 0, center.y);
            const attribute = rim.geometry.getAttribute("position");
            let cursor = 0;
            for (let edge = 0; edge < 6; edge += 1) for (let step = 0; step < 8; step += 1) {
                const points = [[step / 8, 0.93], [step / 8, 1], [(step + 1) / 8, 0.93], [(step + 1) / 8, 1]]
                    .map(([t, radius]) => {
                        const a = edge * Math.PI / 3;
                        const b = (edge + 1) * Math.PI / 3;
                        const x = (Math.cos(a) * (1 - t) + Math.cos(b) * t) * size * radius;
                        const z = (Math.sin(a) * (1 - t) + Math.sin(b) * t) * size * radius;
                        return [x, surface.getWorldHeight(center.x + x, center.y + z) + size * 0.045, z];
                    });
                for (const point of [0, 2, 1, 1, 2, 3]) attribute.setXYZ(cursor++, ...points[point] as [number, number, number]);
            }
            attribute.needsUpdate = true;
            rim.geometry.computeBoundingSphere();
        });
        host.invalidateVisibility();
    }
    public dispose(): void {
        for (const geometry of this.geometries) geometry.dispose();
        this.ghostMaterial.dispose();
        this.rimMaterial.dispose();
        this.root.clear();
    }
}
