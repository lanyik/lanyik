import { materials, type ItemAmounts } from "./items";

export interface RecipeDefinition {
    readonly name: string;
    readonly inputs: ItemAmounts;
    readonly outputs: ItemAmounts;
    readonly ticks: number;
}
export const RECIPES = Object.freeze({
    "iron-plate": Object.freeze({ name: "铁板冶炼", inputs: materials({ iron: 2 }), outputs: materials({ "iron-plate": 1 }), ticks: 30 }),
    "copper-plate": Object.freeze({ name: "铜板冶炼", inputs: materials({ copper: 2 }), outputs: materials({ "copper-plate": 1 }), ticks: 30 }),
    "stone-brick": Object.freeze({ name: "建材烧制", inputs: materials({ stone: 3 }), outputs: materials({ "stone-brick": 1 }), ticks: 20 })
}) satisfies Readonly<Record<string, RecipeDefinition>>;
export type RecipeId = keyof typeof RECIPES;
export const RECIPE_IDS = Object.freeze(Object.keys(RECIPES) as RecipeId[]);
