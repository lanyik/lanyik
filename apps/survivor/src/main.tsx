import { bootstrap } from "./app/bootstrap";

const application = bootstrap();

declare global {
    interface Window {
        survivorApplication?: typeof application;
    }
}

window.survivorApplication = application;
