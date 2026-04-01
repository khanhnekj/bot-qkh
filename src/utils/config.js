import fs from "node:fs";
import path from "node:path";

export const CONFIG_PATH = path.resolve(process.cwd(), "config.json");

function parseEnvFile(content) {
    const out = {};
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        out[key] = value;
    }
    return out;
}

function loadDotEnv() {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    try {
        const parsed = parseEnvFile(fs.readFileSync(envPath, "utf-8"));
        for (const [key, value] of Object.entries(parsed)) {
            if (process.env[key] === undefined) process.env[key] = value;
        }
    } catch {}
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function applyEnvOverrides(config) {
    const next = clone(config);
    next.bot ??= {};
    next.credentials ??= {};
    next.admin ??= {};
    next.zalopay ??= {};
    next.kaia ??= {};
    next.pixverse ??= {};
    next.removebg ??= {};

    if (process.env.BOT_PREFIX) next.bot.prefix = process.env.BOT_PREFIX;
    if (process.env.BOT_SELF_LISTEN) next.bot.selfListen = /^(1|true|yes|on)$/i.test(process.env.BOT_SELF_LISTEN);
    if (process.env.BOT_AUTO_ACCEPT_INVITES) next.bot.autoAcceptInvites = /^(1|true|yes|on)$/i.test(process.env.BOT_AUTO_ACCEPT_INVITES);
    if (process.env.BOT_ADMIN_ONLY) next.bot.adminOnly = /^(1|true|yes|on)$/i.test(process.env.BOT_ADMIN_ONLY);
    if (process.env.BOT_DELETE_REACTIONS) {
        next.bot.deleteReactions = process.env.BOT_DELETE_REACTIONS.split(",").map(v => v.trim()).filter(Boolean);
    }

    if (process.env.ADMIN_IDS) {
        next.admin.ids = process.env.ADMIN_IDS.split(",").map(v => v.trim()).filter(Boolean);
    }

    if (process.env.ZALO_COOKIES) next.credentials.cookies = process.env.ZALO_COOKIES;
    if (process.env.ZALO_IMEI) next.credentials.imei = process.env.ZALO_IMEI;
    if (process.env.ZALO_USER_AGENT) next.credentials.userAgent = process.env.ZALO_USER_AGENT;

    if (process.env.ZALOPAY_APPID) next.zalopay.appid = process.env.ZALOPAY_APPID;
    if (process.env.ZALOPAY_KEY1) next.zalopay.key1 = process.env.ZALOPAY_KEY1;
    if (process.env.ZALOPAY_KEY2) next.zalopay.key2 = process.env.ZALOPAY_KEY2;
    if (process.env.ZALOPAY_CREATE_URL) next.zalopay.create_url = process.env.ZALOPAY_CREATE_URL;
    if (process.env.ZALOPAY_QUERY_URL) next.zalopay.query_url = process.env.ZALOPAY_QUERY_URL;

    if (process.env.KAIA_TOKEN) next.kaia.token = process.env.KAIA_TOKEN;
    if (process.env.KAIA_CHANNEL_ID) next.kaia.channelId = process.env.KAIA_CHANNEL_ID;
    if (process.env.PIXVERSE_TOKEN) next.pixverse.token = process.env.PIXVERSE_TOKEN;
    if (process.env.REMOVEBG_KEYS) {
        next.removebg.keys = process.env.REMOVEBG_KEYS.split(",").map(v => v.trim()).filter(Boolean);
    }

    return next;
}

export function readRawConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
        return {};
    }
}

export function loadConfig() {
    loadDotEnv();
    return applyEnvOverrides(readRawConfig());
}

export function writeRawConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
