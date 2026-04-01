import { statsManager } from "../utils/statsManager.js";
import { drawGroupCard } from "../utils/canvasHelper.js";
import { protectionManager } from "../utils/protectionManager.js";
import { hanManager } from "../utils/hanManager.js";
import { autoReactManager } from "../utils/autoReactManager.js";
import { tempDir } from "../utils/io-json.js";
import path from "node:path";
import fs from "node:fs";

export const name = "checktt";
export const description = "Kiểm tra tương tác nhóm: checktt, top";

async function reply(ctx, text) {
    await ctx.api.sendMessage(
        { msg: text, quote: ctx.message.data },
        ctx.threadId,
        ctx.threadType
    );
}

export const commands = {

    // !check [info/target] - Mặc định là check cá nhân, !check info là check box
    check: async (ctx) => {
        const arg = ctx.args[0]?.toLowerCase();
        if (arg === "info" || arg === "box") {
            return showGroupBox(ctx);
        }
        return commands.checktt(ctx);
    },

    // !checktt - Xem tương tác của bản thân hoặc người được tag
    checktt: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Lệnh này chỉ dùng trong nhóm!");

        let targetId = null;

        // 1. Kiểm tra tag (@)
        if (ctx.message.data.mentions && ctx.message.data.mentions.length > 0) {
            targetId = ctx.message.data.mentions[0].uid;
        }
        // 2. Kiểm tra reply
        else if (ctx.message.data.quote && ctx.message.data.quote.ownerId) {
            targetId = ctx.message.data.quote.ownerId;
        }
        // 3. Kiểm tra User ID truyền vào (nếu là số)
        else if (ctx.args[0] && /^\d+$/.test(ctx.args[0])) {
            targetId = ctx.args[0];
        }
        // 4. Kiểm tra 'all'
        else if (ctx.args[0]?.toLowerCase() === "all") {
            return checkAll(ctx);
        }
        // 5. Mặc định là bản thân
        else {
            targetId = ctx.senderId;
        }

        const stats = statsManager.getStats(ctx.threadId, targetId);

        if (!stats) return reply(ctx, "⚠️ Hiện chưa có dữ liệu tương tác cho người này.");

        const now = Date.now();
        const daysInGroup = Math.floor((now - (stats.join_date || now)) / (1000 * 60 * 60 * 24));
        const joinDateStr = new Date(stats.join_date || now).toLocaleDateString("vi-VN");

        let msg = `[ 📊 TƯƠNG TÁC CÁ NHÂN ]\n`;
        msg += `─────────────────\n`;
        msg += `👤 Name: ${stats.name}\n`;
        msg += `🆔 ID: ${targetId}\n`;
        msg += `🎖️ Chức vụ: ${stats.role || "Thành viên"}\n`;
        msg += `📅 Ngày vào: ${joinDateStr}\n`;
        msg += `⏱️ Thời gian: ${daysInGroup} ngày vừa qua\n`;
        msg += `─────────────────\n`;
        msg += `💬 Hôm nay: ${stats.day} tin nhắn\n`;
        msg += `💬 Tuần này: ${stats.week} tin nhắn\n`;
        msg += `💬 Tổng: ${stats.total} tin nhắn\n`;
        msg += `─────────────────\n`;
        msg += `🔥 Hãy tích cực tương tác nhé! ✨`;

        await reply(ctx, msg);
    },

    // !top [total/day/week] - Xem bảng xếp hạng
    top: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Lệnh này chỉ dùng trong nhóm!");

        const typeMap = {
            "all": "total",
            "total": "total",
            "day": "day",
            "week": "week"
        };
        const typeArg = ctx.args[0]?.toLowerCase() || "total";
        const type = typeMap[typeArg] || "total";
        const typeName = type === "day" ? "NGÀY" : (type === "week" ? "TUẦN" : "TỔNG");

        const topList = statsManager.getTop(ctx.threadId, type, 10);

        if (topList.length === 0) return reply(ctx, "⚠️ Chưa có dữ liệu tương tác trong nhóm này.");

        let boxName = "Nhóm";
        try {
            const groupRes = await ctx.api.getGroupInfo(ctx.threadId);
            // Log để debug chính xác cấu trúc API hiện tại
            // console.log("[Debug] getGroupInfo:", JSON.stringify(groupRes).substring(0, 200));

            // Thử các trường hợp phổ biến của zca-js/Zalo API
            const info = groupRes.gridInfoMap?.[ctx.threadId] || groupRes[ctx.threadId] || groupRes;
            boxName = info?.gName || info?.gname || info?.name || info?.title || "Nhóm";
        } catch (e) {
            console.error("Lỗi lấy tên nhóm:", e.message);
        }

        let msg = `[ 🏆 TOP TƯƠNG TÁC ${typeName} ]\n`;
        msg += `─────────────────\n`;
        msg += `📂 Box: ${boxName}\n`;
        msg += `─────────────────\n`;

        topList.forEach((u, i) => {
            const medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i + 1}.`));
            msg += `${medal} ${u.name}: ${u[type]} tin nhắn\n`;
        });

        msg += `─────────────────\n`;
        msg += `✨ Dùng !checktt để xem chi tiết bản thân.`;

        await reply(ctx, msg);
    }

};

async function checkAll(ctx) {
    const { api, threadId, threadType, log } = ctx;

    // Lấy toàn bộ danh sách thành viên từ statsManager
    const topList = statsManager.getTop(threadId, "total", 100); // Lấy tối đa 100 người cho gọn

    if (topList.length === 0) return reply(ctx, "⚠️ Chưa có dữ liệu tương tác trong nhóm này.");

    let boxName = "Nhóm";
    try {
        const groupRes = await api.getGroupInfo(threadId);
        const info = groupRes.gridInfoMap?.[threadId] || groupRes[threadId] || groupRes;
        boxName = info?.gName || info?.gname || info?.name || info?.title || "Nhóm";
    } catch (e) { }

    let msg = `[ 📊 TỔNG TƯƠNG TÁC NHÓM ]\n`;
    msg += `─────────────────\n`;
    msg += `📂 Box: ${boxName}\n`;
    msg += `👥 Tổng số: ${topList.length} thành viên đã nhắn tin\n`;
    msg += `─────────────────\n\n`;

    topList.forEach((u, i) => {
        const medal = i === 0 ? "🥇" : (i === 1 ? "🥈" : (i === 2 ? "🥉" : `${i + 1}.`));
        msg += `${medal} ${u.name}: ${u.total} (Hôm nay: ${u.day})\n`;
    });

    msg += `\n─────────────────\n`;
    msg += `✨ Dùng !checktt để xem chi tiết bản thân.`;

    await reply(ctx, msg);
}

async function showGroupBox(ctx) {
    if (!ctx.isGroup) return reply(ctx, "⚠️ Lệnh này chỉ dùng trong nhóm!");

    try {
        ctx.api.sendTypingEvent(ctx.threadId, ctx.threadType).catch(() => { });

        const res = await ctx.api.getGroupInfo(ctx.threadId);
        const info = res.gridInfoMap?.[ctx.threadId] || res;

        if (!info) return reply(ctx, "⚠️ Không tìm thấy thông tin nhóm.");

        const groupName = info.groupName || info.name || "Nhóm không tên";
        const groupId = ctx.threadId;
        const avatar = info.fullAvt || info.avt || info.thumbUrl || "";
        const memberCount = info.totalMember || (info.memVerList ? info.memVerList.length : "?");
        const creatorId = info.creatorId || "?";
        const adminIds = info.adminIds || [];
        
        let creatorName = creatorId;
        let adminProfiles = [];
        try {
            // Fetch names and avatars for creator and all admins
            const allAdminIds = [...new Set([creatorId, ...adminIds])].filter(id => id && id !== "?");
            const userRes = await ctx.api.getUserInfo(allAdminIds);
            const profiles = userRes?.changed_profiles || userRes || {};
            
            creatorName = profiles[creatorId]?.displayName || profiles[creatorId]?.zaloName || creatorId;
            
            // Map to profiles: [Owner, Admin1, Admin2...]
            adminProfiles = allAdminIds.map(id => {
                const p = profiles[id] || profiles.changed_profiles?.[id] || {};
                return {
                    uid: id,
                    name: p.displayName || p.zaloName || p.name || id,
                    avatar: p.fullAvt || p.avt || p.avatar || p.thumbnail || p.picture || ""
                };
            });
        } catch { }

        // Lấy thông tin tương tác tổng quát
        const boxStats = statsManager.getTop(groupId, "total", 1);
        const topUser = boxStats[0] ? `${boxStats[0].name} (${boxStats[0].total} 💬)` : "Chưa có";

        const settings = [
            { label: "Anti-Link", value: protectionManager.isEnabled(groupId, "link") ? "ON" : "OFF" },
            { label: "Anti-Spam", value: protectionManager.isEnabled(groupId, "spam") ? "ON" : "OFF" },
            { label: "Bé Hân", value: hanManager.isEnabled(groupId) ? "ON" : "OFF" },
            { label: "Auto React", value: autoReactManager.get(groupId).enabled ? "ON" : "OFF" },
        ];

        // Lấy avatar của một số thành viên tiêu biểu (Ưu tiên Admin, Key Vàng, Bạc)
        let memberAvatarUrls = [];
        try {
            const memList = info.memVerList || [];
            const allUids = memList.map(m => m.split("_")[0]);
            
            // Sắp xếp UIDs theo chức vụ
            const roleWeight = { "Admin": 100, "Vàng": 50, "Key Vàng": 50, "Bạc": 20, "Key Bạc": 20, "Thành viên": 0 };
            const sortedUids = allUids.sort((a, b) => {
                const roleA = statsManager.getStats(groupId, a)?.role || "Thành viên";
                const roleB = statsManager.getStats(groupId, b)?.role || "Thành viên";
                return (roleWeight[roleB] || 0) - (roleWeight[roleA] || 0);
            });

            const topMems = sortedUids.slice(0, 15);
            if (topMems.length > 0) {
                const profilesRes = await ctx.api.getUserInfo(topMems);
                const profiles = profilesRes?.changed_profiles || profilesRes || {};
                memberAvatarUrls = topMems.map(uid => {
                    const p = profiles[uid] || profiles.changed_profiles?.[uid] || {};
                    return p.fullAvt || p.avt || p.avatar || p.thumbnail || p.picture || "";
                }).filter(url => url !== "");
            }
        } catch (err) {
            console.error("Lỗi lấy avatar thành viên:", err.message);
        }

        const imgBuf = await drawGroupCard({
            groupName,
            groupId: groupId.slice(0, 15) + "...",
            avatar,
            memberCount,
            creatorName,
            createdTime: info.createdTime ? new Date(parseInt(info.createdTime)).toLocaleDateString("vi-VN") : "Đang cập nhật",
            description: `Top Fan: ${topUser}`,
            settings,
            memberAvatarUrls,
            adminProfiles
        });

        const tmpPath = path.join(tempDir, `check_box_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, imgBuf);

        await ctx.api.sendMessage({ 
            msg: `📂 Thông tin Box: ${groupName}`, 
            attachments: [tmpPath] 
        }, ctx.threadId, ctx.threadType).catch((err) => {
            console.error("Lỗi gửi tin nhắn kèm ảnh:", err.message);
            return reply(ctx, "⚠️ Lỗi khi gửi ảnh Canvas, hãy kiểm tra lại log.");
        });

        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (e) {
        console.error("[CHECK BOX ERROR]", e);
        await reply(ctx, `⚠️ Lỗi: ${e.message}`);
    }
}
