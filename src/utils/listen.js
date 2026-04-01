import { ThreadType } from "zca-js";

// MessageType không có trong zca-js npm, định nghĩa local (giá trị giống hệt)
const MessageType = { DirectMessage: 0, GroupMessage: 1 };
import { statsManager } from "./statsManager.js";
import { rentalManager } from "./rentalManager.js";
import { prefixManager } from "./prefixManager.js";
import { messageCache } from "./messageCache.js";
import { cooldownManager } from "./cooldownManager.js";
import { groupAdminManager } from "./groupAdminManager.js";
import { threadSettingsManager } from "./threadSettingsManager.js";
import { loadConfig } from "./config.js";
import { createWaitReaction, wrapApiWithWaitReaction } from "./waitReaction.js";

function levenshteinDistance(s1, s2) {
    const m = s1.length, n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

function extractHistoryMessages(history) {
    if (Array.isArray(history)) return history;
    if (!history || typeof history !== "object") return [];

    const candidates = [
        history.messages,
        history.msgs,
        history.items,
        history.data,
        history.list,
        history.chatHistory,
        history.messageList
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
    }

    return [];
}

export async function handleListen(api, ctx_base) {
    const { prefix, selfListen, adminIds, allCommands, eventHandlers, log } = ctx_base;
    
    const getConfig = () => loadConfig();

    const boxNameCache = new Map();
    const ownId = api.getOwnId();

    const fetchBoxName = async (threadId) => {
        if (boxNameCache.has(threadId)) return boxNameCache.get(threadId);
        try {
            const groupRes = await api.getGroupInfo(threadId).catch(() => null);
            const info = groupRes?.[threadId] || groupRes?.gridInfoMap?.[threadId] || groupRes;
            const bName = info?.gName || info?.gname || info?.name || info?.title || "Nhóm";
            if (boxNameCache.size > 100) boxNameCache.delete(boxNameCache.keys().next().value);
            boxNameCache.set(threadId, bName);
            return bName;
        } catch { return "Nhóm"; }
    };

    const listener = api.listener;

    listener.on("message", async (message) => {
        let ctx = null; // Khởi tạo để dễ dàng gán null sau này
        try {
            const liveConfig = getConfig();
            const liveAdminIds = liveConfig.admin?.ids || adminIds || [];
            const liveSelfListen = liveConfig.bot?.selfListen ?? selfListen;
            const globalPrefix = (liveConfig.bot?.prefix || prefix || "!").trim();
            const globalAdminOnly = liveConfig.bot?.adminOnly ?? false;

            let { data, type, threadId, isSelf } = message;
            if (isSelf && !liveSelfListen) return;

            const senderId = String(message.senderId || data.uidFrom || data.uid || "");
            const senderName = data.dName ?? senderId;
            const waitReaction = createWaitReaction(api, message, threadId, type);
            const scopedApi = wrapApiWithWaitReaction(api, waitReaction);

            // --- CACHE TIN NHẮN (TIẾT KIỆM RAM) ---
            const cacheData = {
                content: typeof data.content === "string" ? data.content
                    : (data.content?.text || data.content?.desc || data.content?.title || data.content?.href || null),
                senderName, senderId, threadId, type,
                msgId: data.msgId, cliMsgId: data.cliMsgId, globalMsgId: data.globalMsgId,
                data: data // Giữ object gốc cho các handler (Anti-Undo) cần đọc type, attach
            };
            if (data.msgId)       messageCache.set(data.msgId,       cacheData);
            if (data.cliMsgId)    messageCache.set(data.cliMsgId,    cacheData);
            if (data.globalMsgId) messageCache.set(data.globalMsgId, cacheData);

            let content = null;
            if (typeof data.content === "string") {
                content = data.content.trim();
            } else if (typeof data.content === "object" && data.content !== null) {
                content = data.content.text || data.content.desc || data.content.title || data.content.href || null;
            }
            if (content?.includes("threads")) log.debug(`[AUTODOWN DEBUG] Thread: ${threadId} | Content: ${content}`);

            const isGroup = type === ThreadType.Group;
            const currentPrefix = (prefixManager.getPrefix(threadId) || globalPrefix).trim();
            const groupName = isGroup ? await fetchBoxName(threadId) : null;

            // ─── MUTE HANDLER: chạy trước mọi check rental/admin ───
            // Phải chặn tin nhắn người bị mute dù group chưa thuê
            {
                const muteCtx = { api, message, senderId, threadId, threadType: type, isSelf, content, isGroup, adminIds: liveAdminIds, log };
                const muteEvt = eventHandlers.find(e => e.name === "muteHandler");
                if (muteEvt?.handle) {
                    try {
                        const blocked = await muteEvt.handle(muteCtx);
                        if (blocked) return;
                    } catch (e) { log.error("[muteHandler early]:", e.message); }
                }
            }
            // ────────────────────────────────────────────────────────

            const isOwner = liveAdminIds.includes(String(senderId));
            const isRented = rentalManager.isRented(threadId);
            if (content?.includes("threads")) log.debug(`[RENTAL DEBUG] Thread: ${threadId} | isRented: ${isRented}`);

            // Log chat cho mọi trường hợp để dễ debug
            log.chat(isGroup ? "GROUP" : "PRIVATE", senderName, threadId, content, groupName, data, senderId);

            // --- HỆ THỐNG ADMIN ONLY (PER-THREAD) & ROLE CHECK ---
            if (isGroup) {
                if (!isOwner) {
                    if (!isRented) {
                        return; // Nhóm chưa thuê = block không xử lý lệnh/event
                    }

                    const groupAdmins = await groupAdminManager.fetchGroupAdmins(api, threadId);
                    const isBoxAdmin = groupAdmins.includes(String(senderId));
                    const isAdminOnly = threadSettingsManager.get(threadId, "adminOnly", globalAdminOnly);

                    if (isAdminOnly && !isBoxAdmin) {
                        if (content?.startsWith(currentPrefix)) {
                            const tagName = `@${senderName}`;
                            const msg = `🔒 [ ADMIN ONLY ] 🔒\n───────────────────\nChào ${tagName}, hiện tại nhóm đang ở chế độ riêng tư.\n⚠️ Chỉ Quản trị viên mới được phép sử dụng Bot lúc này.`;
                            
                            const pos = msg.indexOf(tagName);
                            const mentions = [{ uid: String(senderId), pos: pos, len: tagName.length }];
                            
                            await scopedApi.sendMessage({ 
                                msg, 
                                mentions, 
                                quote: data,
                                styles: [
                                    { start: 2, len: 14, st: "b", type: "b" },
                                    { start: 2, len: 14, st: "c_db342e", type: "c_db342e" }
                                ]
                            }, threadId, type).catch(() => {});
                        }
                        return;
                    }
                }
            }
            
            ctx = {
                ...ctx_base,
                api: scopedApi,
                rawApi: api,
                message,
                content,
                isGroup,
                threadId,
                threadType: type,
                senderId,
                senderName,
                isSelf,
                groupName,
                isOwner,
                adminIds: [...liveAdminIds],
                prefix: currentPrefix,
                waitReaction,
                startWaitReaction: () => waitReaction.start(),
                stopWaitReaction: (finalReaction) => waitReaction.stop(finalReaction)
            };
            
            // --- THỐNG KÊ TƯƠNG TÁC (CHỈ BOX ĐÃ THUÊ HOẶC ADMIN) ---
            if (isGroup && (isRented || isOwner)) {
                statsManager.addMessage(threadId, senderId, senderName, null, data.msgId);
            }
            
            // --- HÀM REPLY SIÊU CẤP ---
            ctx.reply = async (msgObj, targetUids = [], opts = {}) => {
                let text = typeof msgObj === "string" ? msgObj : (msgObj.msg || "");
                const attachments = msgObj.attachments || [];
                const hidden = opts.hidden ?? msgObj.hidden ?? false;
                const quote = message.data?.quote || message.data?.content?.quote || message.data;
                if (targetUids.length === 0) {
                    const qId = String(quote?.uidFrom || quote?.ownerId || "");
                    if (qId) targetUids = [qId];
                }
                let mentions = [];
                if (hidden) {
                    // Tag ẩn: mention với len=0 — ping nhưng không hiện @tên
                    targetUids.forEach(uid => mentions.push({ uid: String(uid), pos: text.length, len: 0 }));
                } else {
                    let count = 0;
                    while (text.includes("@tag") && count < targetUids.length) {
                        const tagName = " @Thành viên ";
                        const pos = text.indexOf("@tag");
                        text = text.replace("@tag", tagName);
                        mentions.push({ uid: String(targetUids[count]), pos: pos + 1, len: tagName.trim().length });
                        count++;
                    }
                }
                return scopedApi.sendMessage({ msg: text, attachments, quote: message.data, mentions }, threadId, type).catch(e => log.error("Reply Error:", e.message));
            };

            // --- XỬ LÝ MENTION Ở ĐẦU (REPLY) ---
            let processedContent = content || "";
            if (data.mentions?.length > 0) {
                const sortedMentions = [...data.mentions].sort((a, b) => a.pos - b.pos);
                let lastTagEnd = 0;
                for (const m of sortedMentions) {
                    if (processedContent.slice(lastTagEnd, m.pos).trim() === "") {
                        lastTagEnd = m.pos + m.len;
                    } else break;
                }
                processedContent = processedContent.slice(lastTagEnd).trim();
            }

            // --- XỬ LÝ EVENT HANDLERS ---
            let handledByEvent = false;
            for (const evt of eventHandlers) {
                try {
                    if (typeof evt.handle === "function") {
                        if (await evt.handle({ ...ctx, content: processedContent })) { handledByEvent = true; break; }
                    }
                } catch (e) { log.error(`Lỗi event [${evt.name}]:`, e.message); }
            }
            if (handledByEvent) return;

            // --- XỬ LÝ LỆNH (COMMAND) ---
            let isCommand = false, cmdStr = "";
            let sanitized = processedContent.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
            if (currentPrefix && sanitized.startsWith(currentPrefix)) {
                isCommand = true;
                cmdStr = sanitized.slice(currentPrefix.length).trim();
            }

            if (isCommand) {
                if (!cmdStr) {
                    try {
                        return scopedApi.sendMessage({ msg: `🔍 Hãy nhập lệnh sau dấu "${currentPrefix}" nhé! (Ví dụ: ${currentPrefix}menu)` }, threadId, type);
                    } catch (err) {
                        log.error(`[SEND_MESSAGE CRASH] ${err.stack || err.message}`);
                        return;
                    }
                }
                let parts = cmdStr.split(/\s+/);
                let cName = parts[0].toLowerCase();
                const args = parts.slice(1);
                const handler = allCommands[cName];

                log.chat(isGroup ? "GROUP" : "PRIVATE", senderName, threadId, `⚡ [COMMAND] ${cName.toUpperCase()}`, groupName);

                if (handler) {
                    // --- KIỂM TRA COOLDOWN (TRỪ ADMIN) ---
                    if (!isOwner) {
                        const timeLeft = cooldownManager.getRemainingCooldown(senderId, cName, 5);
                        if (timeLeft) {
                            return scopedApi.sendMessage({ msg: `⚠️ Bạn đang trong thời gian chờ! Vui lòng đợi ${timeLeft}s nữa để tiếp tục dùng lệnh !${cName}.` }, threadId, type);
                        }
                        cooldownManager.setCooldown(senderId, cName, 5);
                    }

                    try {
                        ctx.startWaitReaction();
                        api.sendTypingEvent(threadId, type).catch(() => {});
                        await handler({ ...ctx, args });
                    } catch (e) {
                        log.error(`Lỗi command !${cName}:`, e.message);
                        await scopedApi.sendMessage({ msg: `⚠️ Lỗi: ${e.message}` }, threadId, type).catch(() => {});
                    } finally {
                        ctx.stopWaitReaction();
                    }
                } else {
                    // --- GỢI Ý LỆNH KHI SAI (TYPO) ---
                    const availableCommands = Object.keys(allCommands);
                    let closest = null;
                    let bestDistance = 4;

                    for (const cmd of availableCommands) {
                        const distance = levenshteinDistance(cName, cmd);
                        if (distance < bestDistance) {
                            bestDistance = distance;
                            closest = cmd;
                        }
                    }

                    if (closest && bestDistance <= 2) { 
                        const msg = `⚠️ Lệnh "${currentPrefix}${cName}" không tồn tại.\n💡 Có phải bạn muốn dùng: "${currentPrefix}${closest}" không?\n📌 Hoặc gõ "${currentPrefix}menu" để xem tất cả các lệnh!`;
                        log.debug(`Typo detected: ${cName} -> ${closest} (dist: ${bestDistance})`);
                        await scopedApi.sendMessage({ msg }, threadId, type).catch(() => {});
                    } else {
                        log.debug(`Typo result: cName=${cName}, closest=${closest}, dist=${bestDistance}, totalCmds=${availableCommands.length}`);
                        const msg = `⚠️ Lệnh "${currentPrefix}${cName}" không tồn tại.\n📌 Gõ "${currentPrefix}menu" để xem danh sách lệnh của Bot!`;
                        await scopedApi.sendMessage({ msg }, threadId, type).catch(() => {});
                    }
                }
            }

        } catch (err) { log.error("Lỗi listener:", err.stack); }
        finally {
            // GIẢI PHÓNG BỘ NHỚ TRIỆT ĐỂ
            ctx?.stopWaitReaction?.();
            ctx = null;
            message = null;
        }
    });

    // Các listener khác
    listener.on("undo", async (undo) => {
        const { isGroup, data } = undo;
        const threadId = isGroup ? String(data.idTo || "") : String(data.uidFrom || "");
        const dMsg = data?.content?.deleteMsg || data?.content || {};
        const liveConfig = getConfig();
        const ctx = { api, undo, threadId, threadType: isGroup?1:0, senderId: String(data.uidFrom || ""), msgId: String(dMsg.globalMsgId || dMsg.msgId || ""), cliMsgId: String(dMsg.cliMsgId || ""), log, adminIds: liveConfig.admin?.ids || adminIds || [] };
        for (const evt of eventHandlers) { if (evt.handleUndo) await evt.handleUndo(ctx).catch(e => log.error(e.message)); }
    });

    listener.on("reaction", async (event) => {
        try {
            const type = event.threadType ?? (event.data?.threadType ?? 0);
            const data = event.data || event;
            const content = data.content;

            // --- CƠ CHẾ REACTION UNDO (GỘP) ---
            if (content?.rType !== -1) {
                const targetMsg = content?.rMsg?.[0];
                const targetGlobalId = targetMsg?.gMsgID || (type === 0 ? content?.msgId : null);
                const targetCliId = targetMsg?.cMsgID || content?.cliMsgId;

                log.debug(`[REACTION DEBUG] type: ${type} | rType: ${content?.rType} | targetGlobalId: ${targetGlobalId}`);
                log.debug(`[REACTION DEBUG] content: ${JSON.stringify(content).substring(0, 500)}`);
                if (targetGlobalId) {
                    // --- XÁC ĐỊNH TIN NHẮN CỦA BOT ---
                    const ownId = String(api.getOwnId());
                    const cached = messageCache.get(targetGlobalId) || messageCache.get(targetCliId);
                    let targetIsBot = cached ? (String(cached.senderId) === ownId) : false;
                    
                    if (!targetIsBot) {
                        const senderOfOriginalMsg = String(content.msgSender || data.uidOwner || data.fuid || data.ownerId || "");
                        if (senderOfOriginalMsg === ownId) targetIsBot = true;
                    }

                    // Thu hồi tin dựa trên danh sách trong config.json
                    const rIcon = String(content?.rIcon || "");
                    const rType = String(content?.rType || "");
                    const currentCfg = getConfig();
                    const deleteIcons = currentCfg.bot?.deleteReactions || ["186", ":-@", "r35", "/-angry", "😡", "😠", ":-h", ":-H", "r20"];
                    const isDeleteReaction = deleteIcons.includes(rIcon) || deleteIcons.includes(`r${rType}`);

                    const actorId = String(event.userId || data.uidFrom || data.userId || "");
                    const reactionAdminIds = currentCfg.admin?.ids || adminIds || [];
                    const isActorAdmin = reactionAdminIds.includes(actorId);

                    log.debug(`[REACTION] Icon: ${rIcon} | Type: ${rType} | IsBotMsg: ${targetIsBot} | ActorAdmin: ${isActorAdmin} | Delete: ${isDeleteReaction}`);

                    // Chỉ thực hiện nếu đúng icon Phẫn nộ VÀ (Tin đó của bot HOẶC Người thả là Admin)
                    if (isDeleteReaction && (targetIsBot || isActorAdmin)) {
                        log.chat("EVENT", "ReactionUndo", event.threadId, `Thu hồi tin nhắn Bot (ID: ${targetGlobalId})`);
                        let actualType = type;
                        if (cached && cached.isGroup !== undefined) actualType = cached.isGroup ? 1 : 0;
                        else if (cached && cached.type !== undefined) actualType = cached.type;

                        const threadId = event.threadId || (cached ? cached.threadId : "");
                        const payload = { msgId: String(targetGlobalId), cliMsgId: String(Date.now()) };

                        try {
                            await api.undo(payload, threadId, actualType);
                        } catch (e) {
                            if (actualType === 0) { // 0 is direct message
                                try {
                                    await api.undo(payload, threadId, 1); // fallback to group
                                    return;
                                } catch (e2) {
                                    log.error(`[REACTION DEBUG] undoMessage error (Group fallback): ${e2.message}`);
                                }
                            } else {
                                log.error(`[REACTION DEBUG] undoMessage error: ${e.message}`);
                            }
                            // Fallback xóa local nếu undo thất bại
                            try {
                                const delPayload = { threadId: event.threadId, type, data: { msgId: String(targetGlobalId), cliMsgId: String(targetCliId || Date.now()), uidFrom: String(ownId) } };
                                await api.deleteMessage(delPayload, true);
                            } catch {}
                        }
                    }
                }
            }
            // ─────────────────────────────────

            const ctx = { api, event: data, reaction: event, threadId: event.threadId, threadType: type, isGroup: type === 1, log };
            for (const evt of eventHandlers) {
                if (typeof evt.handleReaction === "function") {
                    await evt.handleReaction(ctx).catch(e => log.error(`Lỗi reaction [${evt.name}]:`, e.message));
                }
            }
        } catch (err) { log.error("Lỗi listener reaction:", err.message); }
    });

    listener.on("group_event", async (event) => {
        // Cập nhật cache admin trực tiếp bằng sourceId từ event (không cần fetch lại Zalo API)
        const act = event.data?.act || event.data?.actType || event.data?.eventType || "";
        const tid = event.threadId;
        const rawData = event.data?.content || event.data?.data;
        let parsed = null;
        try {
            parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;
        } catch {}
        const affectedUid = String(parsed?.sourceId || parsed?.targetId || parsed?.userId || "");

        if (affectedUid && tid) {
            if (act === "add_admin") {
                groupAdminManager.addToCache(tid, affectedUid);
            } else if (act === "remove_admin") {
                groupAdminManager.removeFromCache(tid, affectedUid);
            } else if (act === "change_owner") {
                groupAdminManager.clearCache(tid); // Owner đổi thì fetch lại cho chắc
            }
        }

        if (!rentalManager.isRented(event.threadId) && !adminIds.includes(event.data?.uidFrom)) return;
        const ctx = { api, event, threadId: event.threadId, threadType: 1, isGroup: true, adminIds, log };
        for (const evt of eventHandlers) { if (evt.handleGroupEvent) await evt.handleGroupEvent(ctx).catch(e => log.error(e.message)); }
    });

    listener.start();
    log.success(`Bot Titan đã sẵn sàng! Prefix: "${prefix}"`);

    // Quét lịch sử (Memory Safe - Quét 100 tin để lấy dữ liệu tương tác ban đầu)
    (async () => {
        try {
            const groupsResp = await api.getAllGroups().catch(() => ({ gridVerMap: {} }));
            const groupIds = Object.keys(groupsResp.gridVerMap || {});
            for (const gId of groupIds) {
                if (!rentalManager.isRented(gId)) continue;
                // Quét 100 tin nhắn gần nhất để tính tương tác ban đầu
                const history = await api.getGroupChatHistory(gId, 100).catch(() => []);
                const historyMessages = extractHistoryMessages(history);

                if (!Array.isArray(history)) {
                    const keys = history && typeof history === "object" ? Object.keys(history).slice(0, 8).join(", ") : "";
                    log.debug(`[SCAN HISTORY] Non-array response for ${gId}: type=${typeof history}${keys ? ` keys=${keys}` : ""}`);
                }

                for (const msg of historyMessages) {
                    const cData = {
                        content: typeof msg.content === "string" ? msg.content : (msg.content?.text || null),
                        senderName: msg.dName || "User", senderId: String(msg.uidFrom || ""), threadId: gId, type: 1,
                        msgId: msg.msgId, cliMsgId: msg.cliMsgId, globalMsgId: msg.globalMsgId,
                        data: msg
                    };
                    if (msg.msgId) {
                        messageCache.set(msg.msgId, cData);
                        // Cập nhật tương tác từ lịch sử (đã có chống đếm trùng bên trong statsManager)
                        statsManager.addMessage(gId, cData.senderId, cData.senderName, null, msg.msgId);
                    }
                }
            }
            log.success("Đã hoàn tất quét lịch sử tương tác 100 tin nhắn!");
        } catch (e) { log.error("Lỗi quét lịch sử:", e.message); }
    })();
}
