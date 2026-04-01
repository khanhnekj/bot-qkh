import { threadSettingsManager } from "../utils/threadSettingsManager.js";
import { log } from "../logger.js";
import fs from "node:fs";
import path from "node:path";

const jsonCacheDir = path.join(process.cwd(), "src", "modules", "cache");
const pendingTagSetup = new Map();
const pendingDelete = new Map();

export const name = "shortcut";
export const description = "Phản hồi tự động Tag (Chọn Video Gái/Anime)";

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const commands = {
    shortcut: async (ctx) => {
        const { args, threadId, senderId, adminIds, reply, message, api } = ctx;
        const sub = args[0]?.toLowerCase();

        if (!sub || sub === "help") {
            const msg = `[ 📕 HƯỚNG DẪN SHORTCUT ]\n` +
                `──────────────────\n` +
                `◈ !shortcut tag [Nội dung]: Thiết lập phản hồi khi bị Tag.\n` +
                `◈ !shortcut list: Xem danh sách và XOÁ phím tắt.\n` +
                `◈ !shortcut tag off: Tắt phản hồi Tag của bản thân.\n` +
                `──────────────────\n` +
                `💡 Mẹo: {name} để tag người gọi bạn, {groupName} để hiện tên nhóm.\n` +
                `🎬 Sau khi set, Bot sẽ cho chọn kèm Video Gái hoặc Anime!`;
            return reply(msg);
        }

        if (sub === "list") {
            const allSettings = threadSettingsManager.getAll(threadId);
            const tagReplies = allSettings.filter(s => {
                if (!s.key.startsWith("tag_reply_")) return false;
                let val = s.value;
                try { val = JSON.parse(s.value); } catch { }
                return val !== null && val !== "null";
            });
            if (tagReplies.length === 0) return reply("⚠️ Không có phím tắt Tag nào.");
            let msg = `[ 📋 DANH SÁCH ]\n`;
            const listForDelete = [];
            for (let i = 0; i < tagReplies.length; i++) {
                const uid = tagReplies[i].key.replace("tag_reply_", "");
                let content = "";
                try { content = JSON.parse(tagReplies[i].value); } catch { content = tagReplies[i].value; }
                msg += `${i + 1}. ID: ${uid} ➜ ${content}\n`;
                listForDelete.push({ index: i + 1, uid });
            }
            const sent = await reply(msg + `\n💡 Reply số để xoá.`);
            if (sent && sent.message) pendingDelete.set(`${threadId}_${senderId}`, { 
                list: listForDelete, 
                msgId: sent.message.msgId, 
                cliMsgId: sent.message.cliMsgId,
                time: Date.now() 
            });
            return;
        }

        if (sub === "tag") {
            let targetId = senderId;
            let content = args.slice(1).join(" ");
            const isOwner = adminIds.includes(String(senderId));
            if (message.data?.mentions?.length > 0) {
                targetId = message.data.mentions[0].uid;
                content = args.slice(2).join(" ");
            } else if (message.data?.quote) {
                targetId = message.data.quote.uidFrom || message.data.quote.ownerId;
                content = args.slice(1).join(" ");
            }
            targetId = String(targetId);
            if (targetId !== senderId && !isOwner) return reply("⚠️ Chỉ Admin Bot!");
            if (content.toLowerCase() === "off") {
                threadSettingsManager.set(threadId, `tag_reply_${targetId}`, null);
                threadSettingsManager.set(threadId, `tag_mode_${targetId}`, null);
                return reply(`✅ Đã xóa phím tắt cho ID: ${targetId}`);
            }
            if (!content) return reply("◈ Dùng: !shortcut tag [nội dung]");
            threadSettingsManager.set(threadId, `tag_reply_${targetId}`, content);
            const msg = `[ ⚙️ THIẾT LẬP ]\n✅ Đã lưu nội dung!\n🎬 Chọn video đính kèm:\n1. Gái Xinh\n2. Anime\n0. Chỉ Text\n💡 Gõ 1, 2 hoặc 0`;
            const sent = await reply(msg);
            if (sent && sent.message) pendingTagSetup.set(`${threadId}_${senderId}`, { 
                targetId, 
                msgId: sent.message.msgId, 
                cliMsgId: sent.message.cliMsgId,
                time: Date.now() 
            });
            return;
        }
    }
};

export async function handle(ctx) {
    const { content, threadId, api, threadType, isGroup, senderId, senderName, groupName, message } = ctx;
    if (!isGroup || message.isSelf) return false;

    const sessionKey = `${threadId}_${senderId}`;

    if (pendingDelete.has(sessionKey)) {
        const session = pendingDelete.get(sessionKey);
        const quote = message.data?.quote;
        const quoteId = String(quote?.msgId || quote?.globalMsgId || quote?.cliMsgId || "");
        const sessionMsgId = String(session.msgId);
        const sessionCliId = String(session.cliMsgId);

        if (quoteId === sessionMsgId || quoteId === sessionCliId) {
            const choice = parseInt(content);
            const target = session.list.find(item => item.index === choice);
            if (target) {
                pendingDelete.delete(sessionKey);
                threadSettingsManager.set(threadId, `tag_reply_${target.uid}`, null);
                threadSettingsManager.set(threadId, `tag_mode_${target.uid}`, null);
                api.sendMessage({ msg: `✅ Đã xóa ID phím tắt: ${target.uid}` }, threadId, threadType);
                return true;
            }
        }
    }

    if (pendingTagSetup.has(sessionKey)) {
        const session = pendingTagSetup.get(sessionKey);
        const quote = message.data?.quote;
        const quoteId = String(quote?.msgId || quote?.globalMsgId || quote?.cliMsgId || "");
        const sessionMsgId = String(session.msgId);
        const sessionCliId = String(session.cliMsgId);

        if (quoteId === sessionMsgId || quoteId === sessionCliId) {
            let mode = "normal";
            if (content === "1") mode = "vdgai";
            else if (content === "2") mode = "vdanime";
            else if (content === "0") mode = "normal";
            else return false;
            pendingTagSetup.delete(sessionKey);
            threadSettingsManager.set(threadId, `tag_mode_${session.targetId}`, mode);
            api.sendMessage({ msg: `✅ Đã chọn chế độ: ${mode}` }, threadId, threadType);
            return true;
        }
    }

    const mentionsInMsg = message.data?.mentions || [];
    if (mentionsInMsg.length > 0) {
        const uniqueUids = [...new Set(mentionsInMsg.map(m => String(m.uid)))];
        for (const uid of uniqueUids) {
            if (uid === senderId) continue;
            const replyMsg = threadSettingsManager.get(threadId, `tag_reply_${uid}`, "");
            const mode = threadSettingsManager.get(threadId, `tag_mode_${uid}`, "normal");
            
            if (replyMsg || mode !== "normal") {
                // TAG NGƯỜI GỌI (Người gửi tin nhắn hiện tại)
                const tagTagger = `@${senderName}`;
                
                // Thay thế các biến
                let finalMsg = replyMsg ? replyMsg.replace(/{name}/g, tagTagger) : tagTagger;
                if (!replyMsg) finalMsg = tagTagger;
                finalMsg = finalMsg.replace(/{groupName}/g, groupName || "Nhóm");

                const mentionArr = [];
                const regexMe = new RegExp(escapeRegExp(tagTagger), 'g');
                let m;
                while ((m = regexMe.exec(finalMsg)) !== null) {
                    mentionArr.push({ uid: String(senderId), pos: m.index, len: tagTagger.length });
                }

                if (mode === "vdgai" || mode === "vdanime") {
                    const cacheFile = path.join(jsonCacheDir, `${mode}.json`);
                    if (fs.existsSync(cacheFile)) {
                        try {
                            const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
                            const randomLink = data[Math.floor(Math.random() * data.length)];
                            if (randomLink) {
                                // Gửi video kèm caption có Tag người gọi
                                await api.sendVideoEnhanced({
                                    videoUrl: randomLink,
                                    thumbnailUrl: "https://drive.google.com/uc?id=1pCQPRic8xPxbgUaPSIczb94S4RDdWDHK&export=download",
                                    msg: finalMsg, threadId, threadType,
                                    mentions: mentionArr,
                                    duration: 15000, width: 720, height: 1280, fileSize: 10 * 1024 * 1024,
                                });
                                return true;
                            }
                        } catch (e) { log.error("Shortcut Video Error:", e.message); }
                    }
                }

                if (finalMsg) {
                    await api.sendMessage({ msg: finalMsg, quote: message.data, mentions: mentionArr }, threadId, threadType);
                    return true;
                }
            }
        }
    }
    return false;
}
