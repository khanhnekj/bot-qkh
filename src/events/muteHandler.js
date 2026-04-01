import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { log } from "../logger.js";

export const name = "muteHandler";
export const description = "Thu hồi tin nhắn người bị mute theo từng box";

const MUTE_FILE = path.join(process.cwd(), "src", "modules", "cache", "mutes.json");

let muteCache = null;
let lastLoad = 0;

function loadMutes() {
    try {
        const now = Date.now();
        if (muteCache && now - lastLoad < 5000) return muteCache;

        if (!existsSync(MUTE_FILE)) {
            muteCache = {};
            return muteCache;
        }

        const content = readFileSync(MUTE_FILE, "utf-8");
        if (!content.trim()) {
            muteCache = {};
            return muteCache;
        }

        const raw = JSON.parse(content);
        muteCache = Array.isArray(raw) ? {} : raw;
        lastLoad = now;
        return muteCache;

    } catch (e) {
        log.error("[Mute] Lỗi đọc file:", e.message);
        return {};
    }
}

function isUserMuted(threadId, uid) {
    const mutes = loadMutes();
    const list = mutes[String(threadId)] || [];
    return list.includes(String(uid));
}

export async function handle(ctx) {
    const { api, message, senderId, threadId, threadType } = ctx;

    if (!isUserMuted(threadId, senderId)) return false;

    const d = message?.data || {};
    const msgId    = d.msgId    || message?.msgId    || null;
    const cliMsgId = d.cliMsgId || message?.cliMsgId || "";

    if (!msgId) return false;

    try {
        await api.deleteMessage(
            {
                data: {
                    msgId:    String(msgId),
                    cliMsgId: String(cliMsgId),
                    uidFrom:  String(senderId),
                },
                threadId: String(threadId),
                type: threadType,
            },
            false
        );

        log.info(`✦ [Mute] Đã xóa tin của ${senderId} trong box ${threadId}`);
        return true;

    } catch (err) {
        log.error(`✖ [Mute] Lỗi (${err.code}): ${err.message}`);
        return false;
    }
}
