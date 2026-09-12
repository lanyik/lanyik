const PATHS = {
    rift: "m12 2 8 10-8 10-8-10Zm0 5-4 5 4 5 4-5Z",
    character: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
    inventory: "M5 8h14l2 13H3ZM8 8V6a4 4 0 0 1 8 0v2M8 13h8M10 13v3h4v-3",
    map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16",
    skills: "m13 2-8 12h6l-1 8 9-13h-7Z",
    craft: "m4 4 5 1 3 4-4 4-4-3Zm6 7 10 10M15 3l6 6-4 4-6-6ZM3 21l7-7",
    spirit: "M12 2c7 7 8 10 5 15-2 4-8 4-10 0C4 12 5 9 12 2Zm0 7c-5 6-3 10 0 11 3-1 5-5 0-11Z",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8Z",
    shield: "m12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5Zm-4 9 3 3 5-6",
    crossbow: "m5 19 14-14M4 9c6-6 11-4 15 1M4 9l6 11M19 10 8 4M3 17l4 4M16 3h5v5",
    coins: "M18 7c0 3-14 3-14 0s14-3 14 0ZM4 7v5c0 3 14 3 14 0V7M4 12v5c0 3 14 3 14 0v-5",
    sort: "M7 3v18m-4-4 4 4 4-4M14 5h7m-7 6h5m-5 6h3",
    close: "m6 6 12 12M6 18 18 6",
    lock: "M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4m-4 5v2",
} as const;

export function UiIcon({ name, className = "" }: { readonly name: keyof typeof PATHS; readonly className?: string }) {
    return <svg className={`ui-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[name]} /></svg>;
}
