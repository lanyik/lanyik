import { bootstrap } from "./app/bootstrap";
import "./presentation/app.css";

try {
    const application = bootstrap();
    import.meta.hot?.dispose(() => {
        void application.dispose().catch(error => console.error("Expedition shutdown failed", error));
    });
} catch (reason) {
    const element = document.getElementById("expedition-ui");
    if (element) {
        element.classList.add("startup-failed");
        element.textContent = `启动失败：${reason instanceof Error ? reason.message : String(reason)}`;
    }
    console.error(reason);
}
