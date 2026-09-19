import { BoxGeometry, ConeGeometry, Group, Mesh, MeshStandardMaterial } from "three";
import { HOMESTEAD } from "../core/Homestead";

/** Shared primitive geometry for the initial safe hub; no external asset or asynchronous owner. */
export class HomesteadModels {
    public readonly root = new Group();
    private readonly box = new BoxGeometry(1, 1, 1);
    private readonly roof = new ConeGeometry(1, 1, 4);
    private readonly stone = new MeshStandardMaterial({ color: 0xa5a99a, roughness: .95 });
    private readonly slate = new MeshStandardMaterial({ color: 0x3f6371, roughness: .8 });
    private readonly wood = new MeshStandardMaterial({ color: 0x60432b, roughness: .9 });
    private readonly lamp = new MeshStandardMaterial({ color: 0xffdb86, emissive: 0xffa832, emissiveIntensity: 1.2 });
    constructor() {
        this.root.name = "homestead-buildings";
        for (const building of HOMESTEAD.buildings) {
            const { x, z, width, depth, height } = building;
            const wall = new Mesh(this.box, this.stone); wall.position.set(x, height / 2, z); wall.scale.set(width, height, depth);
            const roof = new Mesh(this.roof, this.slate); roof.position.set(x, height + 1, z); roof.rotation.y = Math.PI / 4;
            roof.scale.set((width + .8) / Math.SQRT2, 2, (depth + .8) / Math.SQRT2);
            const door = new Mesh(this.box, this.wood); door.position.set(x, .95, z + depth / 2 + .04); door.scale.set(1.1, 1.9, .12);
            this.root.add(wall, roof, door);
            for (const side of [-1, 1]) {
                const window = new Mesh(this.box, this.lamp); window.position.set(x + side * width * .31, height * .6, z + depth / 2 + .06);
                window.scale.set(.7, .7, .12); this.root.add(window);
            }
        }
    }
    public dispose(): void { this.box.dispose(); this.roof.dispose(); this.stone.dispose(); this.slate.dispose(); this.wood.dispose(); this.lamp.dispose(); }
}
