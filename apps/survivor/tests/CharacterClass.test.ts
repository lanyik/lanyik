import { afterEach, expect, test } from "vitest";
import { CharacterState } from "../src/core/CharacterState";
import { type CharacterClassId } from "../src/core/CharacterClass";
import { CombatSimulation } from "../src/core/CombatSimulation";
import { validateCharacterCheckpoint } from "../src/core/CharacterCheckpoint";
import { compareEquipment } from "../src/core/EquipmentEvaluation";
import { canEquipEquipment, createStarterEquipment, equipmentAccessLabel, EQUIPMENT_SLOTS, generateEquipment,
    hasValidEquipmentAccess, REGULAR_DROP_SLOTS, withEquipmentAffixes, type Equipment } from "../src/core/Equipment";
import { DeterministicRandom } from "../src/core/DeterministicRandom";
import { BASE_LOOT_PROFILE } from "../src/core/Loot";
import { NO_PASSIVE_EFFECTS } from "../src/core/PassiveSkills";
import { EMPTY_SPIRIT_REALM } from "../src/core/SpiritRealm";

const simulations: CombatSimulation[] = [];
afterEach(() => { for (const simulation of simulations.splice(0)) simulation.dispose(); });
function simulation() {
    const sim = new CombatSimulation("class-foundation", { x: 0, z: 0 }, EMPTY_SPIRIT_REALM, undefined, "homestead");
    simulations.push(sim); return sim;
}
function equipment(value: Equipment["value"], requiredClass: Equipment["requiredClass"], id = 2): Equipment {
    return { ...createStarterEquipment("ranger"), value, requiredClass, id, locked: false };
}

test("the existing ranger identity and bound starter weapon survive save and travel", () => {
    const sim = simulation(), before = sim.checkpoint();
    expect(sim.getSnapshot().player).toMatchObject({ classId: "ranger", equipment: { weapon: { requiredClass: "ranger", name: "守夜短弩" } } });
    const restored = simulation(); restored.restore(structuredClone(before));
    expect(restored.checkpoint()).toEqual(before);
    const travel = sim.checkpoint("wilds");
    expect(travel.player.classId).toBe("ranger");
    expect(travel.player.equipment.weapon).toEqual(before.player.equipment.weapon);
});

test("weapon ownership, optional class armor and universal accessories are separate rules", () => {
    expect(hasValidEquipmentAccess(equipment("weapon", null))).toBe(false);
    expect(canEquipEquipment(equipment("weapon", "ranger"), "ranger")).toBe(true);
    expect(canEquipEquipment(equipment("weapon", "ranger"), "unregistered" as CharacterClassId)).toBe(false);
    for (const slot of ["head", "chest", "legs", "boots", "arms", "hands"] as const) {
        for (const requiredClass of [null, "ranger"] as const) expect(canEquipEquipment(equipment(slot, requiredClass), "ranger")).toBe(true);
    }
    for (const slot of ["ring", "necklace", "bracelet", "charm"] as const) {
        expect(canEquipEquipment(equipment(slot, null), "ranger")).toBe(true);
        expect(hasValidEquipmentAccess(equipment(slot, "ranger"))).toBe(false);
    }
    expect(equipmentAccessLabel(equipment("weapon", "ranger"))).toBe("游侠专属");
    expect(equipmentAccessLabel(equipment("chest", null))).toBe("通用装备");
    expect(equipmentAccessLabel(equipment("necklace", null))).toBe("通用饰品");
});

test("generation binds class weapons, keeps other equipment universal and requires an explicit valid pool", () => {
    const random = new DeterministicRandom("class-generation");
    expect(REGULAR_DROP_SLOTS).toEqual(["weapon", "head", "chest", "legs", "boots", "arms", "hands"]);
    for (const slot of EQUIPMENT_SLOTS) {
        const item = generateEquipment(random, 2, 1, BASE_LOOT_PROFILE, { classId: "ranger", slots: [slot] });
        expect(item.requiredClass).toBe(slot === "weapon" ? "ranger" : null);
        if (slot === "weapon") expect(item.name).toMatch(/弓|弩/);
    }
    const before = random.state;
    for (const options of [{ classId: "ranger", slots: [] }, { classId: "unknown", slots: ["weapon"] }, { classId: "ranger", slots: ["unknown"] }]) {
        expect(() => generateEquipment(random, 2, 1, BASE_LOOT_PROFILE, options as never)).toThrow();
        expect(random.state).toBe(before);
    }
});

test("manual and automatic equipment operations preserve ineligible gear without suggesting or recycling it", () => {
    const host = { tick: 0, automatic: false, passiveEffects: NO_PASSIVE_EFFECTS,
        statsChanged() {}, addSkillPoints() {}, notify() {}, changed() {} };
    const character = new CharacterState(EMPTY_SPIRIT_REALM, host);
    const unusable = withEquipmentAffixes(equipment("weapon", "unregistered" as CharacterClassId), [{ stat: "damage", value: 1000, rarity: "common" }]);
    expect(character.receiveItems([unusable])).toBe(true);
    const before = character.snapshot();
    expect(character.equip(unusable.id)).toEqual({ ok: false, message: "职业不符，无法装备" });
    expect(character.snapshot()).toEqual(before);
    expect(compareEquipment(unusable, before)).toMatchObject({ canEquip: false, delta: 0, canClear: false });
    character.setAutoRecycle("equipment", "rainbow");
    host.automatic = true; character.updateAutomaticLoadout();
    expect(character.snapshot().inventory).toEqual([unusable]);
    expect(character.snapshot().equipment).toEqual(before.equipment);
    expect(character.snapshot().recycled.equipment).toBe(0);
    const shared = equipment("chest", null, 3), dedicated = equipment("head", "ranger", 4);
    expect(character.receiveItems([shared, dedicated])).toBe(true);
    expect(character.snapshot().equipment.chest?.id).toBe(3);
    expect(character.snapshot().equipment.head?.id).toBe(4);
});

test("unsupported saves and invalid restrictions are rejected before changing the active character", () => {
    const sim = simulation(), before = sim.checkpoint();
    const malformed = [
        { ...before, version: 10 },
        ...[undefined, "unregistered", "toString"].map(classId => ({ ...before, player: { ...before.player, classId } })),
        ...[equipment("weapon", null), equipment("head", "unregistered" as CharacterClassId),
            equipment("head", undefined as never), equipment("necklace", "ranger")]
            .map(item => ({ ...before, nextItemId: 3, player: { ...before.player, inventory: [item] } })),
        { ...before, player: { ...before.player, equipment: { weapon: { ...before.player.equipment.weapon!, requiredClass: null } } } }
    ];
    for (const saved of malformed) {
        expect(() => sim.restore(saved as never)).toThrow();
        expect(sim.checkpoint()).toEqual(before);
    }
    const inventory = [equipment("head", "ranger", 2), equipment("chest", null, 3), equipment("necklace", null, 4)];
    const valid = { ...before, nextItemId: 5, player: { ...before.player, inventory } };
    expect(() => validateCharacterCheckpoint(valid)).not.toThrow();
    sim.restore(valid);
    for (const item of inventory) expect(sim.equip(item.id).ok).toBe(true);
    const saved = sim.checkpoint(); sim.restore(saved);
    expect(sim.checkpoint()).toEqual(saved);
});
