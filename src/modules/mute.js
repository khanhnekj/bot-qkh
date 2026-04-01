import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { statsManager } from "../utils/statsManager.js";

export const name = "mute";
export const description = "Quản lý cấm chat người dùng (Admin Bot)";

const MUTE_FILE = path.join(process.cwd(), "src", "modules", "cache", "mutes.json");

function loadMutes() {
    try {
        if (!existsSync(MUTE_FILE)) return {};
        const content = readFileSync(MUTE_FILE, "utf-8");
        if (!content.trim()) return {}; 
        const raw = JSON.parse(content);
        return Array.isArray(raw) ? {} : raw;
    } catch { return {}; }
}

function saveMutes(obj) {
    writeFileSync(MUTE_FILE, JSON.stringify(obj, null, 2), "utf-8");
}

function getMutedInBox(threadId) {
    const all = loadMutes();
    return all[threadId] || [];
}

function setMutedInBox(threadId, list) {
    const all = loadMutes();
    const clean = [...new Set(list.filter(id => /^\d+$/.test(String(id))))];
    if (clean.length === 0) delete all[threadId];
    else all[threadId] = clean;
    saveMutes(all);
    return clean;
}

// Lấy tên tối ưu
async function getTargetName(api, userId, membersCache = null) {
    if (!userId) return "Người dùng";
    const uidStr = String(userId);
    
    // 1. Lấy từ kết quả getGroupMembers() (Truyền danh sách ID vào mới đúng)
    if (membersCache && Array.isArray(membersCache)) {
        // zca-js hoặc trả về array [{uid, dName, zaloName}], hoặc obj map
        const member = membersCache.find(m => String(m.uid) === uidStr);
        if (member?.dName || member?.zaloName) return member.dName || member.zaloName;
    }

    // 2. Thử từ StatsManager
    const stats = statsManager.getStats(null, uidStr);
    if (stats?.name && stats.name !== "Người dùng") return stats.name;
    
    // 3. Fallback dùng getUserInfo (nếu là bạn bè)
    try {
        const u = await api.getUserInfo(uidStr);
        const user = u[uidStr] || Object.values(u)[0];
        if (user?.displayName || user?.zaloName) return user.displayName || user.zaloName;
    } catch { }
    
    return `ID: ${uidStr}`;
}

function getTargetId(ctx, input) {
    if (ctx.message.data.mentions?.length > 0) {
        const mention = ctx.message.data.mentions.find(m => m.uid !== "-1" && m.uid !== -1);
        if (mention) return String(mention.uid);
    }
    if (ctx.message.data.quote) {
        return String(ctx.message.data.quote.uidFrom || ctx.message.data.quote.ownerId);
    }
    if (input && /^\d+$/.test(String(input))) return String(input);
    return null;
}

export const commands = {
    mute: async (ctx) => {
        if (!ctx.adminIds.includes(String(ctx.senderId))) {
            return ctx.reply("⚠️ Bạn không có quyền sử dụng lệnh này (Yêu cầu Admin Bot).");
        }

        const { args, prefix, threadId, api } = ctx;
        const sub = args[0]?.toLowerCase();

        if (!sub) {
            let help = `╭─── 🔇 [ QUẢN LÝ MUTE ]\n`;
            help += `│ ❯ ${prefix}mute add [tag/reply] ➥ Khóa mõm\n`;
            help += `│ ❯ ${prefix}mute del [tag/reply] ➥ Mở khóa\n`;
            help += `│ ❯ ${prefix}mute list ➥ Danh sách box\n`;
            help += `╰───────────────\n`;
            help += `💡 Mute sẽ tự động xóa tin nhắn người đó gửi!`;
            return ctx.reply(help);
        }

        if (sub === "list") {
            const mutedUsers = getMutedInBox(threadId);
            if (mutedUsers.length === 0) return ctx.reply("✨ Hiện tại box này chưa có ai bị khóa mõm!");

            const loadingMsg = await ctx.reply("⏳ Đang tra danh sách, sếp chờ tí...");
            
            try {
                // api.getGroupMembers trong zca-js NQD fork nhận vào danh sách UIDs, không phải threadId
                let membersData = [];
                try {
                    membersData = await api.getGroupMembers(mutedUsers);
                } catch { }
                
                let msg = `╭─── 🔇 [ DANH SÁCH BIỆT GIAM ]\n`;
                const names = await Promise.all(mutedUsers.map(uid => getTargetName(api, uid, membersData)));
                
                msg += mutedUsers.map((uid, idx) => `│ ❯ ${names[idx]} (${uid})`).join("\n");
                msg += `\n╰───────────────\n💡 Có ${mutedUsers.length} đối tượng đang bị khóa mõm.`;
                
                return ctx.reply(msg);
            } catch (e) {
                return ctx.reply("⚠️ Có lỗi khi lấy danh sách tên, sếp thử lại nhé!");
            }
        }

        if (sub === "add") {
            const targetId = getTargetId(ctx, args[1]);
            if (!targetId) return ctx.reply(`⚠️ Tag hoặc reply tin nhắn của đối tượng cần xử lý!`);

            const mutedUsers = getMutedInBox(threadId);
            if (mutedUsers.includes(targetId)) return ctx.reply(`◈ Đối tượng này vốn đã bị xích rồi nè sếp!`);

            // Chỉ fetch 1 tên khi add
            let memberData = [];
            try { memberData = await api.getGroupMembers([targetId]); } catch {}
            const targetName = await getTargetName(api, targetId, memberData);

            setMutedInBox(threadId, [...mutedUsers, targetId]);

            let successMsg = `╭─── 🔇 [ THỰC THI CẤM CHAT ]\n`;
            successMsg += `│ 👤 Đối tượng: ${targetName}\n`;
            successMsg += `│ 🆔 ID: ${targetId}\n`;
            successMsg += `│ 🔐 Trạng thái: Đã khóa mõm!\n`;
            successMsg += `╰───────────────\n`;
            successMsg += `✨ Mọi tin nhắn của đối tượng này sẽ bị Hân xóa sạch!`;
            return ctx.reply(successMsg);
        }

        if (sub === "del" || sub === "remove" || sub === "unmute" || sub === "unlock") {
            const targetId = getTargetId(ctx, args[1]);
            if (!targetId) return ctx.reply(`⚠️ Cần tag hoặc reply để thả đối tượng!`);

            const mutedUsers = getMutedInBox(threadId);
            if (!mutedUsers.includes(targetId)) return ctx.reply(`◈ Đối tượng này đang tự do mà sếp?`);

            let memberData = [];
            try { memberData = await api.getGroupMembers([targetId]); } catch {}
            const targetName = await getTargetName(api, targetId, memberData);

            setMutedInBox(threadId, mutedUsers.filter(id => id !== targetId));

            let unMsg = `╭─── 🔊 [ LÀNH LẠI VỚI NHAU ]\n`;
            unMsg += `│ 👤 Đối tượng: ${targetName}\n`;
            unMsg += `│ 🆔 ID: ${targetId}\n`;
            unMsg += `│ 🔓 Trạng thái: Tự do!\n`;
            unMsg += `╰───────────────\n`;
            unMsg += `✨ Người dùng này đã có thể chat lại bình thường.`;
            return ctx.reply(unMsg);
        }

        return ctx.reply(`⚠️ Lệnh không hợp lệ! Dùng "${prefix}mute" để xem hướng dẫn.`);
    }
};
