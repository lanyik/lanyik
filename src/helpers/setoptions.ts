export function setOptions(obj: object, options: unknown): Record<string, unknown> {
    const holder = obj as { options?: Record<string, unknown> };
    const target = holder.options ?? {};
    holder.options = target;
    if (!options || typeof options !== "object") return target;

    // Only existing option keys are configurable. Object.keys ignores inherited
    // properties, and the explicit guard also prevents __proto__/constructor
    // assignments from changing the defaults object's prototype.
    for (const key of Object.keys(options)) {
        if (!Object.prototype.hasOwnProperty.call(target, key)) continue;
        target[key] = (options as Record<string, unknown>)[key];
    }
    return target;
}
