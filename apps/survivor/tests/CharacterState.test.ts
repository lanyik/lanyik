import { expect, test, vi } from "vitest";
import { CharacterState } from "../src/core/CharacterState";
import { GAME_CONFIG } from "../src/core/GameConfig";
import { createConsumable } from "../src/core/InventoryItem";
import { createOrb } from "../src/core/Orbs";
import { NO_PASSIVE_EFFECTS } from "../src/core/PassiveSkills";
import { EMPTY_SPIRIT_REALM } from "../src/core/SpiritRealm";

function fixture() {
    const host = { tick: 0, automatic: false, passiveEffects: NO_PASSIVE_EFFECTS,
        statsChanged: vi.fn(), addSkillPoints: vi.fn(), notify: vi.fn(), changed: vi.fn() };
    return { character: new CharacterState(EMPTY_SPIRIT_REALM, host), host };
}

test("a mixed receipt commits inventory, recycling income, chest gold and IDs together after capacity succeeds", () => {
    const { character } = fixture(), count = GAME_CONFIG.inventory.orb.capacity;
    const inventory = Array.from({ length: count }, (_, i) => createOrb(i + 2, "common", "fortune"));
    expect(character.receiveGenerated(inventory, count + 2, 100, 0, {})).toBe(true);
    character.setAutoRecycle("consumable", "common");
    const nextId = character.nextItemId, before = character.snapshot();
    const incoming = [createConsumable(nextId, "common", "health", 2), createOrb(nextId + 1, "rare", "bounty")];
    expect(character.receiveGenerated(incoming, nextId + 2, 250, 0, {})).toBe(false);
    expect(character.snapshot()).toEqual(before);
    expect(character.nextItemId).toBe(nextId);
    expect(character.equipOrb(2, 0).ok).toBe(true);
    expect(character.receiveGenerated(incoming, nextId + 2, 250, 0, {})).toBe(true);
    const after = character.snapshot();
    expect(after.gold).toBe(356); // 100 held + 250 chest + two common potions at 3 each.
    expect(after.orbDust).toBe(0); expect(after.recycled.consumable).toBe(2);
    expect(after.inventory).toHaveLength(count);
    expect(after.inventory.at(-1)?.id).toBe(nextId + 1);
    expect(after.orbs[0]?.id).toBe(2);
    expect(character.allocateItemId()).toBe(nextId + 2);
});

test("multiple earned levels update the character before one growth callback and credit the separate skill ledger", () => {
    const { character, host } = fixture(), previous = character.stats;
    character.gainExperience(99); // 39 for level 1 and 60 for level 2.
    expect(character.snapshot()).toMatchObject({ level: 3, experience: 0, unspentAttributePoints: 4 });
    expect(host.addSkillPoints.mock.calls).toEqual([[1], [1]]);
    expect(host.statsChanged).toHaveBeenCalledExactlyOnceWith(previous, character.stats, true);
    expect(host.changed).toHaveBeenCalledTimes(1);
    const points = host.addSkillPoints.mock.calls.length;
    character.grantDefeat(17);
    expect(character.snapshot()).toMatchObject({ gold: 17, spiritRealm: { souls: 1, revision: 1 } });
    expect(host.addSkillPoints).toHaveBeenCalledTimes(points);
});
