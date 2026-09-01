//----------------------------------------------------------------------------------
//Minimal multi-listener event emitter used across the library's public API
//(HexMap, Unit, ...). Unlike the old ad-hoc `Callback[key] = fn` dictionaries,
//`on()` here appends a listener instead of overwriting the previous one.
//----------------------------------------------------------------------------------
export type Listener<T = unknown> = (payload: T) => void;
type EventKey<Events> = Extract<keyof Events, string>;
type EmitArguments<Payload> = undefined extends Payload
    ? [payload?: Payload]
    : [payload: Payload];

export class EventEmitter<Events extends object = Record<string, unknown>> {
    private listeners = new Map<string, Listener<unknown>[]>();

    public on<Event extends EventKey<Events>>(event: Event, listener: Listener<Events[Event]>): this {
        const listeners = this.listeners.get(event) ?? [];
        listeners.push(listener as unknown as Listener<unknown>);
        this.listeners.set(event, listeners);
        return this;
    }

    public off<Event extends EventKey<Events>>(event: Event, listener?: Listener<Events[Event]>): this {
        const listeners = this.listeners.get(event);
        if (!listeners) return this;
        if (!listener) {
            this.listeners.delete(event);
            return this;
        }
        const erased = listener as unknown as Listener<unknown>;
        const remaining = listeners.filter(candidate => candidate !== erased);
        if (remaining.length === 0) this.listeners.delete(event);
        else this.listeners.set(event, remaining);
        return this;
    }

    public emit<Event extends EventKey<Events>>(
        event: Event,
        ...[payload]: EmitArguments<Events[Event]>
    ): void {
        const list = this.listeners.get(event);
        if (!list || list.length === 0) {
            if (event === "error") throw unhandledEventError(payload);
            return;
        }
        // copy in case a listener unsubscribes itself/others during emit
        for (const listener of list.slice()) {
            listener(payload);
        }
    }

    public listenerCount<Event extends EventKey<Events>>(event: Event): number {
        return this.listeners.get(event)?.length ?? 0;
    }

    public removeAllListeners(event?: EventKey<Events>): this {
        if (event === undefined) this.listeners.clear();
        else this.listeners.delete(event);
        return this;
    }
}

function unhandledEventError(payload: unknown): Error {
    if (payload instanceof Error) return payload;
    return new Error(payload === undefined
        ? 'Unhandled "error" event'
        : `Unhandled "error" event: ${String(payload)}`);
}
