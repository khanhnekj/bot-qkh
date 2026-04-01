import { protectionManager } from "../utils/protectionManager.js";
import { nsfwDetector } from "../utils/nsfwDetector.js";
import { mediaHelper } from "../utils/mediaHelper.js";
import { log } from "../logger.js";

export const name = "anti-protection";
export const description = "Hệ thống bảo vệ nhóm: Link, Spam, Photo, Sticker, Tag";

const ZALO_GROUP_LINK_REGEX = /zalo\.me\/g\/[a-zA-Z0-9_\-]+/i;
const STICKER_URL_REGEX = /zfcloud\.zdn\.vn.*StickerBy|sticker.*\.webp/i;

function isSticker(data, content) {
    return mediaHelper.isSticker(data, content);
}

function isPhoto(data, content) {
    return mediaHelper.isPhoto(data, content);
}

// spam: track ALL message types per user
const spamData = new Map();
const kickHistory = [];

// Thresholds
const MSG_LIMIT = 5;
const TIME_LIMIT = 5000;
const MAX_KICKS_PER_MIN = 10;
const NOTIFY_COOLDOWN = 15000;
const lastNotify = new Map();

async function getDisplayName(api, uid) {
    try {
        const info = await api.getUserInfo(uid);
        const u = info?.[uid] || info;
        return u?.displayName || u?.zaloName || uid;
    } catch {
        return uid;
    }
}

async function tryDeleteMessage(ctx) {
    const { api, message, threadId, threadType } = ctx;
    try {
        // Phải dùng deleteMessage (onlyMe = false) để thực hiện Xoá Tin Nhắn Thành Viên (đối với mọi người) bằng tư cách Admin
        await api.deleteMessage(message, false);
    } catch (e) {
        log.error(`[Protection] Lỗi khi xoá tin vi phạm: ${e.message}`);
    }
}

async function handleViolation(ctx, type, count, forceNotify = false) {
    const { api, threadId, threadType, senderId } = ctx;
    const config = protectionManager.CONFIG[type];

    await tryDeleteMessage(ctx);

    const notifyKey = `${type}_${threadId}_${senderId}`;
    const now = Date.now();
    const lastN = lastNotify.get(notifyKey) || 0;
    const isKick = (config && count >= config.kick);

    // Skip notification if cooldown is active, UNLESS it's a kick or forceNotify
    if (!isKick && !forceNotify && (now - lastN < NOTIFY_COOLDOWN)) return;
    lastNotify.set(notifyKey, now);

    const name = await getDisplayName(api, senderId);
    const headers = {
        photo: "📷 ANTI-PHOTO",
        nude: "🛡️ ANTI-NUDE",
        sticker: "🎨 ANTI-STICKER",
        tag: "🏷️ ANTI-TAG",
        link: "🔗 ANTI-LINK",
        spam: "⚡ ANTI-SPAM"
    };

    const header = `➜ [ ${headers[type] || `ANTI-${type.toUpperCase()}`} ]\n`;
    let msg = "";

    if (isKick) {
        try {
            await api.removeUserFromGroup([senderId], threadId);
            msg = `${header}${name}\n➜ 📣 Đã kick ra khỏi nhóm do vi phạm quá nhiều lần (${count}/${config.kick}). 👋`;
            protectionManager.resetViolation(threadId, senderId, type);
        } catch (e1) {
            try {
                await api.blockUsers(threadId, [senderId]);
                msg = `${header}${name}\n➜ 📣 Đã chặn và mời bạn ra do vi phạm liên tục (${count}/${config.kick}). 👋`;
                protectionManager.resetViolation(threadId, senderId, type);
            } catch (e2) {
                msg = `${header}${name}\n➜ ⚠️ Bot không đủ quyền kick/block. Ad xử lý giúp với! 🥺`;
                protectionManager.resetViolation(threadId, senderId, type);
            }
        }
    } else if (config && count >= config.warn) {
        msg = `${header}${name}\n➜ 😡 CẢNH BÁO: Vi phạm ${count} lần. Thêm ${config.kick - count} lần nữa là KICK!`;
    } else {
        const reasons = {
            photo: "không cho gửi ảnh",
            nude: "không cho phép gửi ảnh nhạy cảm (NSFW/NUDE)",
            sticker: "không cho gửi sticker",
            tag: "không được tag @Tất cả",
            link: "không được gửi link nhóm Zalo",
            spam: "không gửi tin nhắn liên tục"
        };
        msg = `${header}${name}\n➜ 🎀 Nhóm mình ${reasons[type] || "đang có bảo vệ"}. Đừng tái phạm nha! ✨`;
    }

    if (msg) {
        await api.sendMessage({
            msg,
            mentions: [{ uid: senderId, pos: header.length, len: name.length }],
            styles: [
                { start: 2, len: (headers[type] || `ANTI-${type.toUpperCase()}`).length + 4, st: "b" },
                { start: 2, len: (headers[type] || `ANTI-${type.toUpperCase()}`).length + 4, st: "c_db342e" }
            ]
        }, threadId, threadType);
    }
}

export async function handle(ctx) {
    const { message, threadId, threadType, senderId, adminIds, isGroup, api, content } = ctx;
    if (message.isSelf) return false;

    const { data } = message;
    const now = Date.now();
    const isOwner = adminIds.includes(String(senderId));

    // Debugging photo detection
    if (isPhoto(data, content)) {
        log.debug(`[Protection] Phát hiện ảnh từ ${senderId} (Admin: ${isOwner}) tại nhóm ${threadId}`);
    }

    if (!isGroup) return false;
    // Bỏ qua các check khác cho Admin, TRỪ lọc NUDE (vẫn xoá tin nhưng ko phạt)
    if (isOwner && !protectionManager.isEnabled(threadId, "nude")) return false;

    // Link check
    if (protectionManager.isEnabled(threadId, "link")) {
        let textToCheck = content || "";
        if (!textToCheck && data?.content) {
            textToCheck = typeof data.content === "string" ? data.content : (data.content.href || data.content.text || "");
        }
        if (textToCheck && ZALO_GROUP_LINK_REGEX.test(textToCheck)) {
            await tryDeleteMessage(ctx);
            const name = await getDisplayName(api, senderId);
            await api.sendMessage({
                msg: `➜ [ 🔗 ANTI-LINK ]\n${name}\n➜ 🚫 Link nhóm Zalo không được phép. Đã gỡ!`,
                mentions: [{ uid: senderId, pos: 19, len: name.length }]
            }, threadId, threadType);
            return true;
        }
    }

    // Spam check
    if (protectionManager.isEnabled(threadId, "spam")) {
        const key = `${threadId}_${senderId}`;
        const timestamps = spamData.get(key) || [];
        const recent = timestamps.filter(t => now - t < TIME_LIMIT);
        recent.push(now);
        spamData.set(key, recent);

        // Auto cleanup old data
        setTimeout(() => {
            const cur = spamData.get(key);
            if (cur && cur.length > 0 && Date.now() - cur[cur.length - 1] > 60000) spamData.delete(key);
        }, 61000);

        if (recent.length >= MSG_LIMIT) {
            spamData.set(key, []); // Reset for next cycle
            
            // Rate-limit kicks to prevent bot being banned for kicking too many at once
            while (kickHistory.length > 0 && kickHistory[0] < now - 60000) kickHistory.shift();

            if (kickHistory.length < MAX_KICKS_PER_MIN) {
                const count = protectionManager.addViolation(threadId, senderId, "spam");
                await handleViolation(ctx, "spam", count);
                kickHistory.push(now);
                return true;
            }
        }
    }

    // Tag check
    if (protectionManager.isEnabled(threadId, "tag")) {
        const mentions = data.mentions || [];
        if (mentions.some(m => m.uid === "-1" || m.uid === -1)) {
            const count = protectionManager.addViolation(threadId, senderId, "tag");
            await handleViolation(ctx, "tag", count);
            return true;
        }
    }

    // Sticker
    if (protectionManager.isEnabled(threadId, "sticker") && isSticker(data, content)) {
        const count = protectionManager.addViolation(threadId, senderId, "sticker");
        await handleViolation(ctx, "sticker", count);
        return true;
    }

    // Anti Nude (NSFW) Check
    const isPhotoTarget = protectionManager.isEnabled(threadId, "nude") && mediaHelper.isPhoto(data, content);
    const isVideoTarget = protectionManager.isEnabled(threadId, "nude") && mediaHelper.isVideo(data, content);

    // [GỠ LỖI BÁO CÁO NHANH]
    if (mediaHelper.isVideo(data, content) || String(data.msgType) === "chat.video" || isVideoTarget) {
        log.info(`[DEBUG VIDEO] type=${data.msgType} | attach=${JSON.stringify(data.attach)} | content=${JSON.stringify(data.content)} | isVideoTarget=${isVideoTarget}`);
    }

    if (isPhotoTarget || isVideoTarget) {
        const attachUrl = isVideoTarget ? mediaHelper.extractVideoUrl(data.attach || data.content) : mediaHelper.extractImageUrl(data.attach || data.content);
        if (attachUrl) {
            log.info(`[Protection] Đang nạp Đạn Quét AI cho Ảnh/Video từ ${senderId}...`);
            try {
                // Đưa cái api và attachUrl, kèm cờ Video cho Máy chủ
                const res = await nsfwDetector.checkUrl(api, attachUrl, isVideoTarget);
                if (res) {
                    log.debug(`[Protection] Zalo AI kết luận: ${res.classification} (Mức Tội Dâm: ${res.confidence}%, Tỷ Lệ Vi Phạm: ${res.isNSFW})`);
                    if (res.isNSFW) {
                        // Admin vi phạm thì xoá cái Một, châm chước không đếm số lần nổ Kick
                        if (isOwner) {
                            await tryDeleteMessage(ctx);
                            await api.sendMessage({ msg: "🛡️ [ ANTI-NUDE ]\nPhát hiện 1 tệp Nhạy Cảm (18+) từ Quản trị viên! Đã gỡ bỏ để làm sạch môi trường nhóm!" }, threadId, threadType);
                            return true;
                        }
                        const count = protectionManager.addViolation(threadId, senderId, "nude");
                        await handleViolation(ctx, "nude", count, true);
                        return true;
                    }
                } else {
                    log.warn(`[Protection] Trí tuệ Zalo chối từ phán xét file này.`);
                }
            } catch (e) {
                log.error(`[Protection] Lỗi Tương tác với Máy Phân Tích Zalo: ${e.message}`);
            }
        } else {
            log.info(`[Protection-Debug] Không lấy được URL! attachUrl = null. Dữ liệu là: ${JSON.stringify(data)}`);
        }
    }

    // Nếu là Admin, dừng các check bảo vệ khác tại đây (link, spam, tag, sticker, photo bình thường)
    if (isOwner) return false;

    // Photo
    if (protectionManager.isEnabled(threadId, "photo") && isPhoto(data, content)) {
        const count = protectionManager.addViolation(threadId, senderId, "photo");
        await handleViolation(ctx, "photo", count);
        return true;
    }

    return false;
}
