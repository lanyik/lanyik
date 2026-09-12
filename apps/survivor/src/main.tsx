import { bootstrap, type SurvivorOptions } from "./app/bootstrap";

const application = bootstrap(window.survivorOptions);

declare global {
    interface Window {
        survivorOptions?: SurvivorOptions;
        survivorApplication?: typeof application;
    }
}

window.survivorApplication = application;
