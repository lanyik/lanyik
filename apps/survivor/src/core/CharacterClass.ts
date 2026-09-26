/** Character identity and its weapon family. Combat/skill specializations are added with their gameplay. */
export const CHARACTER_CLASSES = Object.freeze({
    ranger: Object.freeze({
        name: "游侠",
        weaponName: "弓弩",
        starterWeapon: "守夜短弩",
        weapons: Object.freeze(["猎手短弩", "符文长弓", "巡林战弩", "守望猎弓"])
    })
});
export type CharacterClassId = keyof typeof CHARACTER_CLASSES;
export const INITIAL_CHARACTER_CLASS: CharacterClassId = "ranger";
export function isCharacterClassId(value: unknown): value is CharacterClassId {
    return typeof value === "string" && Object.hasOwn(CHARACTER_CLASSES, value);
}
