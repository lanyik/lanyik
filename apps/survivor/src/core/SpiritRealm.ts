import { ATTRIBUTE_IDS, type Attributes } from "./Equipment";

export interface SpiritRealm {
    readonly souls: number;
    readonly attributes: Attributes;
    readonly revision: number;
}
export const EMPTY_SPIRIT_REALM: SpiritRealm = Object.freeze({ souls: 0, revision: 0,
    attributes: Object.freeze({ might: 0, vitality: 0, agility: 0, spirit: 0 }) });
export function spiritLevel(realm: SpiritRealm): number { return ATTRIBUTE_IDS.reduce((total, id) => total + realm.attributes[id], 0); }
export function validateSpiritRealm(value: SpiritRealm): SpiritRealm {
    if (!value || !Number.isSafeInteger(value.souls) || value.souls < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0
        || !value.attributes || ATTRIBUTE_IDS.some(id => !Number.isSafeInteger(value.attributes[id]) || value.attributes[id] < 0)
        || !Number.isSafeInteger(spiritLevel(value))) throw new Error("灵境存档数据无效");
    return Object.freeze({ souls: value.souls, revision: value.revision, attributes: Object.freeze({ ...value.attributes }) });
}
