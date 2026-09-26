import { createRoot } from "react-dom/client";
import { AmbientLight, BoxGeometry, DirectionalLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector2, Vector3, WebGLRenderer } from "three";
import { ActorModels } from "../../src/presentation/ActorModels";
import { AudioControls } from "../../src/presentation/AudioControls";
import { CombatAudio } from "../../src/presentation/CombatAudio";
import { createCombatSound, type SoundKind } from "../../src/presentation/CombatSounds";
import { PlayerFeedback } from "../../src/core/PlayerFeedback";

const audio = new CombatAudio(), root = createRoot(document.getElementById("controls")!);
root.render(<AudioControls audio={audio} />);
const renderer = new WebGLRenderer({ canvas: document.querySelector("canvas")!, antialias: false });
renderer.setSize(256, 256);
const scene = new Scene(), camera = new PerspectiveCamera(40, 1, .1, 20);
camera.position.set(2.5, 1.6, 3); camera.lookAt(0, .7, 0);
scene.add(new AmbientLight(0xffffff, 2));
const light = new DirectionalLight(0xffffff, 3); light.position.set(2, 4, 3); scene.add(light);
// Prime the renderer-owned PBR LUT before measuring actor resources.
const warm = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); scene.add(warm); renderer.render(scene, camera);
scene.remove(warm); warm.geometry.dispose(); warm.material.dispose();
const baseline = { ...renderer.info.memory };
const actors = await ActorModels.load(1, new Vector2(), new AbortController().signal);
scene.add(actors.hero);
const player = { feedback: new PlayerFeedback(), animationTime: 0, entitySlot: 0, x: 0, z: 0, previousX: 0, previousZ: 0,
    heading: 0, healthRatio: 1, invulnerable: false, shieldReady: false, ward: 0, dashing: false, gameOver: false };
const draw = (time: number) => { actors.animateHero(player, time, true, false); renderer.render(scene, camera); };
draw(0); audio.setActive(true); audio.update(player);
const fixture = {
    pose(action: "idle" | "attack" | "death") {
        if (action === "attack") {
            player.feedback.attackTick = 0; player.feedback.attackDuration = .4;
            player.animationTime = .1; draw(100); player.animationTime = .3; draw(300);
        } else if (action === "death") {
            player.gameOver = true; draw(400);
            for (let i = 1; i <= 30; i++) draw(400 + i * 100);
        }
        const mesh = actors.hero.children[0] as Mesh, vertex = new Vector3();
        let maxY = -Infinity, minY = Infinity;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, vertex); maxY = Math.max(maxY, vertex.y); minY = Math.min(minY, vertex.y);
        }
        return { weights: mesh.morphTargetInfluences, frames: mesh.geometry.morphAttributes.position!.length, maxY, minY };
    },
    async samples() {
        const results = [];
        for (const kind of ["attack", "cast", "hurt", "impact", "pickup", "death", "wind"] as SoundKind[]) {
            const context = new OfflineAudioContext(1, 22050, 22050);
            const source = context.createBufferSource(); source.buffer = createCombatSound(context, kind);
            source.connect(context.destination); source.start();
            const rendered = await context.startRendering(), data = rendered.getChannelData(0);
            results.push({ kind, peak: data.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0), finite: data.every(Number.isFinite) });
            source.disconnect();
        }
        return results;
    },
    audioState: () => audio.getSnapshot(),
    async dispose() {
        root.unmount(); actors.dispose(); renderer.renderLists.dispose(); renderer.dispose(); await audio.dispose();
        return { baseline, remaining: { ...renderer.info.memory } };
    }
};
declare global { interface Window { heroFixture: typeof fixture } }
window.heroFixture = fixture;
