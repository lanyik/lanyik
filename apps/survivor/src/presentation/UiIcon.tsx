const PATHS = {
    rift: "m12 2 8 10-8 10-8-10Zm0 5-4 5 4 5 4-5Z",
    character: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
    inventory: "M5 8h14l2 13H3ZM8 8V6a4 4 0 0 1 8 0v2M8 13h8M10 13v3h4v-3",
    map: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16",
    skills: "m13 2-8 12h6l-1 8 9-13h-7Z",
    pause: "M8 5v14M16 5v14",
    play: "m8 4 12 8-12 8Z",
    shield: "m12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5Zm-4 9 3 3 5-6",
    pulse: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM3 3l2 2m14 14 2 2M3 21l2-2M19 5l2-2",
    frost: "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1",
    chain: "m13 2-5 9h5l-2 11 8-13h-6ZM3 5l2 2m14 11 2 2M2 14h3m14-9 2-2",
    dash: "M2 8h9M2 12h6M2 16h9m2-12 9 8-9 8 3-8Z",
    ward: "m12 2 8 3v6c0 5-4 8-8 11-4-3-8-6-8-11V5ZM12 7v10m-4-5h8",
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
