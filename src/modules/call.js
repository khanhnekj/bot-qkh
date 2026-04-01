import { log } from "../logger.js";

export const name = "call";
export const description = "Gọi điện cho một người dùng hoặc nhóm (Tag, Reply hoặc Link)";

const logTarget = (uid) => String(uid).trim().replace(/_0$/, "");
const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

export const commands = {
    call: async (ctx) => {
        const { api, threadId, threadType, senderId, message, args } = ctx;
        const mentions = message.data.mentions || [];
        const quote = message.data.quote || message.data.content?.quote;
        
        let targetId = null;
        let targetName = "Người dùng";
        let isLinkCall = false;
        let link = "";

        // Check if there's a link in args
        const normalizeLink = (raw) => {
            let l = raw.trim().replace(/[\s\u200B-\u200D\uFEFF]/g, "");
            if (!l.startsWith("http") && l.includes("zalo.me/")) l = "https://" + l.replace(/^\/+/, "");
            return l.split("?")[0].replace(/\/$/, "");
        };

        const linkArg = args.find(a => a.includes("zalo.me/g/"));
        if (linkArg) {
            isLinkCall = true;
            link = normalizeLink(linkArg);
        }

        if (isLinkCall) {
            // CALL VIA LINK (BATCH CALL)
            let waves = 1;
            for (const arg of args) {
                const n = parseInt(arg);
                if (!isNaN(n) && arg !== linkArg) { waves = n; break; }
            }
            if (waves > 15) waves = 15;
            
            try {
                await api.sendMessage({ msg: `🔍 Đang phân tích link nhóm: ${link}...` }, threadId, threadType);
                
                // 1. Join and fetch members (Loop through all pages)
                await api.joinGroupLink(link).catch(e => {
                    if (e.code !== 178) log.warn(`[Call Link] Join error or already joined: ${e.message}`);
                });

                let memberIds = [];
                let gName = "Group Link";
                let groupId = null;
                let page = 1;
                let hasMore = true;

                while (hasMore && page <= 50) {
                    const info = await api.getGroupLinkInfo({ link, memberPage: page }).catch((e) => {
                        log.error("[Call Link] Get Info Error:", e.message);
                        return null;
                    });
                    if (!info) break;

                    if (page === 1) {
                        groupId = info.groupId || info.group_id;
                        gName = info.name || gName;
                    }

                    const pageMems = (info.currentMems || []).map(m => logTarget(m.uid || m.userId)).filter(id => id && id !== api.getOwnId());
                    memberIds = [...new Set([...memberIds, ...pageMems])];
                    
                    hasMore = info.hasMoreMember === 1 && (info.currentMems || []).length > 0;
                    page++;
                }
                
                if (memberIds.length === 0) {
                    return api.sendMessage({ msg: `❎ Nhóm "${gName}" không có thành viên công khai để quét (hoặc Bot bị chặn).` }, threadId, threadType);
                }

                await api.sendMessage({ msg: `🚀 Đã tìm thấy ${memberIds.length} thành viên tham gia.\n🌊 Bắt đầu ${waves} đợt gọi cho nhóm: "${gName}"` }, threadId, threadType);

                for (let w = 1; w <= waves; w++) {
                    const batch = shuffle(memberIds);
                    const parallel = 5; 
                    let ok = 0, fail = 0;

                    for (let i = 0; i < batch.length; i += parallel) {
                        const chunk = batch.slice(i, i + parallel);
                        const results = await Promise.all(chunk.map((uid, idx) => 
                            api.callOneUser({
                                groupId: String(groupId || threadId),
                                userId: uid,
                                callId: Math.floor(Date.now()/1000) + idx,
                                groupName: gName
                            }).then(() => true).catch(() => false)
                        ));
                        ok += results.filter(Boolean).length;
                        fail += results.filter(r => !r).length;
                        await new Promise(r => setTimeout(r, 800));
                    }
                    
                    if (waves > 1) await api.sendMessage({ msg: `📊 Đợt ${w}/${waves} hoàn tất. (Thành công: ${ok})` }, threadId, threadType);
                    if (w < waves) await new Promise(r => setTimeout(r, 4000));
                }

                await api.sendMessage({ msg: `✅ Đã hoàn tất chiến dịch Call Batch cho nhóm!` }, threadId, threadType);
            } catch (err) {
                api.sendMessage({ msg: "❌ Lỗi thực thi Link Call: " + err.message }, threadId, threadType);
            }
            return;
        }

        // --- ORIGINAL SINGLE USER CALL ---
        if (mentions.length > 0) {
            targetId = String(mentions[0].uid || mentions[0].id);
            targetName = mentions[0].nm || "Người dùng";
        } else if (quote) {
            targetId = String(quote.uidFrom || quote.ownerId);
            targetName = quote.dName || "Người dùng";
        }

        if (!targetId) {
            return api.sendMessage({ msg: "⚠️ Vui lòng tag người dùng, reply hoặc dán link nhóm để thực hiện cuộc gọi!" }, threadId, threadType);
        }

        // Count for spamming (default 1, max 20 for safety)
        let count = 1;
        for (const arg of args) {
            const n = parseInt(arg);
            if (!isNaN(n) && !arg.includes("@")) { count = n; break; }
        }
        if (count > 20) count = 20;

        try {
            if (count === 1) {
                await api.sendMessage({ msg: `📞 Đang gọi cho ${targetName}...` }, threadId, threadType);
            } else {
                await api.sendMessage({ msg: `🚀 Đang bắt đầu ${count} đợt gọi cho ${targetName}...` }, threadId, threadType);
            }

            for (let i = 0; i < count; i++) {
                try {
                    await api.callOneUser({
                        groupId: threadId,
                        userId: targetId,
                        groupName: "ZaloBot Support"
                    });
                } catch (e) {
                    log.error(`[CallOneUser] Error calling ${targetId}:`, e.message);
                }
                if (i < count - 1) await new Promise(r => setTimeout(r, 2000));
            }

            if (count > 1) {
                await api.sendMessage({ msg: `✅ Đã hoàn tất ${count} đợt gọi cho ${targetName}!` }, threadId, threadType);
            }
        } catch (err) {
            api.sendMessage({ msg: "❌ Lỗi call: " + err.message }, threadId, threadType);
        }
    }
};
