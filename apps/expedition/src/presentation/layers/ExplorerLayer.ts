import { BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry } from "three";
import { collectObject3DResourceAllocations, type ResourceBudgetAccount, type WorldRenderLayer, type WorldRenderLayerHost } from "three-hex-map";
import type { ExplorerSnapshot, GroundPoint } from "../../core/exploration/Explorer";

/** One persistent astronaut. World ownership controls attachment; locomotion owns all gameplay state. */
export class ExplorerLayer implements WorldRenderLayer {
    public readonly id = "expedition-explorer";
    private readonly root = new Group();
    private readonly body = new Group();
    private readonly limbs: Group[] = [];
    private readonly box = new BoxGeometry(1, 1, 1);
    private readonly helmet = new SphereGeometry(0.2, 12, 8);
    private readonly ring = new RingGeometry(0.31, 0.36, 32).rotateX(-Math.PI / 2);
    private readonly arrow = new ConeGeometry(0.07, 0.13, 4);
    private readonly suit = new MeshStandardMaterial({ color: 0xeff4e9, roughness: 0.72 });
    private readonly dark = new MeshStandardMaterial({ color: 0x163842, roughness: 0.35, metalness: 0.3 });
    private readonly orange = new MeshStandardMaterial({ color: 0xeea550, roughness: 0.7 });
    private readonly beacon = new MeshBasicMaterial({ color: 0x89f5df, depthTest: false, depthWrite: false });
    private host: WorldRenderLayerHost | undefined;
    private state: ExplorerSnapshot | undefined;
    private point: GroundPoint | undefined;

    constructor(private readonly resources: ResourceBudgetAccount) {
        this.root.name = "expedition-explorer";
        const box = (parent: Group, material: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number) => {
            const mesh = new Mesh(this.box, material); mesh.scale.set(w, h, d); mesh.position.set(x, y, z); parent.add(mesh);
        };
        box(this.body, this.suit, 0.38, 0.38, 0.25, 0, 0.63, 0);
        box(this.body, this.orange, 0.3, 0.31, 0.14, 0, 0.65, -0.19);
        box(this.body, this.dark, 0.23, 0.15, 0.03, 0, 0.64, 0.14);
        const head = new Mesh(this.helmet, this.suit); head.position.y = 0.96; this.body.add(head);
        box(this.body, this.dark, 0.29, 0.16, 0.07, 0, 0.97, 0.16);
        for (const [x, y, leg] of [[-0.11, 0.46, 1], [0.11, 0.46, 1], [-0.26, 0.77, 0], [0.26, 0.77, 0]]) {
            const limb = new Group(); limb.position.set(x, y, 0); this.body.add(limb); this.limbs.push(limb);
            box(limb, this.suit, leg ? 0.14 : 0.11, leg ? 0.35 : 0.29, 0.15, 0, leg ? -0.18 : -0.13, 0);
            box(limb, leg ? this.dark : this.orange, leg ? 0.16 : 0.12, 0.09, leg ? 0.24 : 0.15, 0, leg ? -0.39 : -0.3, leg ? 0.035 : 0);
        }
        const halo = new Mesh(this.ring, this.beacon); halo.position.y = 0.02; halo.renderOrder = 100;
        const marker = new Mesh(this.arrow, this.beacon); marker.rotation.z = Math.PI; marker.position.y = 1.4; marker.renderOrder = 100;
        this.root.add(this.body, halo, marker);
        this.root.visible = false;
        resources.acquireRequired("explorer-model", {}, true, collectObject3DResourceAllocations([this.root]));
    }
    public initialize(host: WorldRenderLayerHost): void {
        if (!host.surface) throw new Error("Explorer rendering requires the world surface");
        this.host = host; this.root.scale.setScalar(host.tileSize); host.addObject(this.root);
        this.update(this.state, this.point);
    }
    public update(state: ExplorerSnapshot | undefined, point: GroundPoint | undefined): void {
        this.state = state; this.point = point;
        if (!this.host) return;
        const visible = !!state && !!point;
        if (this.root.visible !== visible) { this.root.visible = visible; this.host.invalidateVisibility(); }
        if (!state || !point) return;
        const size = this.host.tileSize;
        const x = point.x * size, z = point.z * size;
        if (this.root.position.x !== x || this.root.position.z !== z || this.root.position.y === 0) {
            this.root.position.set(x, this.host.surface!.getWorldHeight(x, z) + size * 0.04, z);
            this.host.invalidateVisibility();
        }
        this.body.rotation.y = state.heading;
        const swing = state.status === "walking" || state.status === "navigating" ? Math.sin(state.distance * 7) * 0.55 : 0;
        this.limbs.forEach((limb, index) => { limb.rotation.x = swing * (index === 0 || index === 3 ? 1 : -1); });
    }
    public mountChunk(): void {}
    public unmountChunk(): void {}
    public surfaceChanged(): void { this.root.position.y = 0; this.update(this.state, this.point); }
    public unloadWorld(host: WorldRenderLayerHost): void { host.removeObject(this.root); this.host = undefined; }
    public dispose(): void {
        this.host?.removeObject(this.root); this.host = undefined;
        for (const geometry of [this.box, this.helmet, this.ring, this.arrow]) geometry.dispose();
        for (const material of [this.suit, this.dark, this.orange, this.beacon]) material.dispose();
        this.resources.dispose();
    }
}
