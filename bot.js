import { readFileSync } from "node:fs";
import { Zalo } from "zca-js";
import sizeOf from "image-size";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { loadModules } from "./src/modules/index.js";
import { loadEvents } from "./src/events/index.js";
import { log } from "./src/logger.js";
import { rentalManager } from "./src/utils/rentalManager.js";
import { statsManager } from "./src/utils/statsManager.js";
import { threadSettingsManager } from "./src/utils/threadSettingsManager.js";
import { autoReactManager } from "./src/utils/autoReactManager.js";
import { protectionManager } from "./src/utils/protectionManager.js";
import { cleanTempFiles, cleanupOldFiles } from "./src/utils/io-json.js";
import { handleListen } from "./src/utils/listen.js";
import { registerCustomApi } from "./src/utils/customApi.js";
import { startAutosendTicker } from "./src/modules/autosend.js";
import { startXSMBTracker } from "./src/modules/xsmb.js";
import { loadConfig, readRawConfig, writeRawConfig } from "./src/utils/config.js";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

const isValidCookies = (creds) => {
    const c = creds?.cookies;
    if (!c) return false;
    if (typeof c === "string") return c.length > 50;
    return (Array.isArray(c.cookies) && c.cookies.length > 0) || (Array.isArray(c) && c.length > 0) || Object.keys(c).length > 0;
};

const normalizeCookieInput = (rawCookies) => {
    if (!rawCookies) return null;
    if (Array.isArray(rawCookies)) return rawCookies;
    if (Array.isArray(rawCookies.cookies)) return rawCookies.cookies;
    if (typeof rawCookies === "string") {
        return rawCookies.split(";").map(c => {
            const [key, ...val] = c.trim().split("=");
            if (!key) return null;
            return { key, value: val.join("="), domain: "chat.zalo.me" };
        }).filter(Boolean);
    }
    return null;
};

async function main() {
    const config = loadConfig();
    const { bot: { prefix = "!", selfListen = false } = {}, admin: { ids: adminIds = [] } = {}, credentials: creds = {} } = config;

    log.info("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
    log.info("┃   ✦  ZALO BOT (zca-js)    ┃");
    log.info("┃   ✦  CREATE BY DGK         ┃");
    log.info("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛");

    rentalManager.load();
    statsManager.load();
    threadSettingsManager.load();
    autoReactManager.load();
    protectionManager.load();

    const { allCommands, moduleInfo, extraHandlers } = await loadModules();
    const { handlers: baseEventHandlers, eventCommands } = await loadEvents();
    const eventHandlers = [...baseEventHandlers, ...extraHandlers];
    Object.assign(allCommands, eventCommands);

    log.info(`✦ ${moduleInfo.length} modules | ${Object.keys(allCommands).length} commands | ${eventHandlers.length} events`);

    const fixedUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    const fixedImei = creds.imei || "a3a30244-5f0a-45d1-9ce9-07a1bcd0f9ae-33d0f257a817d1ca4c4381b87f8ad83f";

    const zalo = new Zalo({
        apiType: 30,
        apiVersion: 680,
        selfListen,
        imageMetadataGetter: async (p) => {
            try {
                const b = readFileSync(p);
                const d = sizeOf(b);
                return { width: d.width, height: d.height, size: b.length };
            } catch (e) { return { width: 100, height: 100, size: 0 }; }
        }
    });

    let api;
    if (isValidCookies(creds)) {
        try {
            log.info("🔑 Đăng nhập bằng cookies...");
            const cookieParam = normalizeCookieInput(creds.cookies);
            if (!cookieParam || cookieParam.length === 0) {
                throw new Error("Cookie format không hợp lệ.");
            }
            api = await zalo.login({ cookie: cookieParam, imei: fixedImei, userAgent: fixedUA });
            log.success("Đăng nhập thành công!");
        } catch (e) {
            log.error("Cookie login failed:", e.message);
            api = null;
        }
    }

    if (!api) {
        try {
            log.info("📱 Quét QR code...");
            api = await zalo.loginQR({ userAgent: fixedUA });
            log.success("Đăng nhập QR thành công!");
        } catch (e) { log.error("Thất bại:", e.message); process.exit(1); }
    }

    const appCtx = api.ctx || (typeof api.getContext === "function" ? api.getContext() : (api.context || {}));
    const cfg = readRawConfig();
    
    // Lưu lại cookie kiểu string (lấy từ tough-cookie)
    let finalCookies = normalizeCookieInput(creds.cookies) || creds.cookies;
    if (appCtx.cookie?.toJSON) {
        finalCookies = appCtx.cookie.toJSON().cookies;
    } else if (appCtx.cookie && appCtx.cookie.getCookieStringSync) {
        finalCookies = normalizeCookieInput(appCtx.cookie.getCookieStringSync("https://chat.zalo.me"));
    }

    cfg.credentials = {
        cookies: finalCookies,
        imei: appCtx.imei || fixedImei,
        userAgent: appCtx.userAgent || fixedUA
    };
    writeRawConfig(cfg);

    registerCustomApi(api, log);

    cleanTempFiles(); cleanupOldFiles();
    setInterval(() => { cleanTempFiles(); cleanupOldFiles(); }, 3600000);

    startAutosendTicker(api);
    startXSMBTracker(api);

    await handleListen(api, { prefix, selfListen, adminIds, allCommands, moduleInfo, eventHandlers, log });

    const stop = () => { log.info("\n✦ Tắt bot..."); api.listener.stop(); process.exit(0); };
    process.on("SIGINT", stop); process.on("SIGTERM", stop);
}

main();
