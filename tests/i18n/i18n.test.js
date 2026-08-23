import { describe, expect, test, vi } from "vitest";
import {
    createI18n,
    DEFAULT_MESSAGES,
    resolveLocale,
    SUPPORTED_LOCALES
} from "../../public/i18n.js";

describe("i18n", () => {
    test("resolves Chinese variants and falls back to English", () => {
        expect(resolveLocale("zh-CN")).toBe("zh-CN");
        expect(resolveLocale("zh-Hans-CN")).toBe("zh-CN");
        expect(resolveLocale("en-US")).toBe("en");
        expect(resolveLocale("fr-FR")).toBe("en");
        expect(SUPPORTED_LOCALES).toEqual(["en", "zh-CN"]);
    });

    test("translates and interpolates status messages", () => {
        const i18n = createI18n({ locale: "zh-CN" });
        expect(i18n.t("status.generated")).toBe("世界已生成");
        expect(i18n.t("status.worldDetail", { width: 42, height: 32, seed: "atlas" }))
            .toBe("42 × 32 · 四向循环 · 种子 atlas");
        expect(i18n.t("performance.title")).toBe("性能监控");
        expect(i18n.t("performance.drawCalls")).toBe("绘制调用");
    });

    test("keeps English and Chinese catalogs in sync", () => {
        expect(Object.keys(DEFAULT_MESSAGES["zh-CN"]).sort())
            .toEqual(Object.keys(DEFAULT_MESSAGES.en).sort());
    });

    test("uses English fallback when a key is missing from the active locale", () => {
        const i18n = createI18n({
            locale: "zh-CN",
            messages: {
                en: { greeting: "Hello" },
                "zh-CN": {}
            }
        });
        expect(i18n.t("greeting")).toBe("Hello");
        expect(i18n.t("missing.key")).toBe("missing.key");
    });

    test("notifies subscribers only when the resolved locale changes", () => {
        const i18n = createI18n({ locale: "en" });
        const listener = vi.fn();
        const unsubscribe = i18n.subscribe(listener);

        i18n.setLocale("en-US");
        i18n.setLocale("zh-TW");
        i18n.setLocale("zh-CN");
        unsubscribe();
        i18n.setLocale("en");

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener).toHaveBeenCalledWith("zh-CN");
    });
});
