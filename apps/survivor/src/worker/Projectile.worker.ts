import { ProjectileBatch, resolveProjectileRange } from "../core/ProjectileBatch";
import type { QueryRequest, QueryResponse } from "./CombatProtocol";

self.onmessage = (event: MessageEvent<{ port: MessagePort }>) => {
    const port = event.data.port;
    port.onmessage = (message: MessageEvent<QueryRequest>) => {
        const { id, buffer, begin, end } = message.data;
        try {
            resolveProjectileRange(new ProjectileBatch(buffer), begin, end);
            const response: QueryResponse = { id, buffer }; port.postMessage(response, [buffer]);
        } catch (reason) {
            const response: QueryResponse = { id, error: reason instanceof Error ? reason.message : String(reason) };
            port.postMessage(response);
        }
    };
};
