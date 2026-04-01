import { ThreadType } from "zca-js";
import { rentalManager } from "../utils/rentalManager.js";
import { drawUserInfo } from "../utils/canvasHelper.js";
import { statsManager } from "../utils/statsManager.js";

export const name = "general";
export const description = "Lệnh cơ bản: help, ping, hello, info";

async function reply(ctx, text, ttl = 0) {
    const res = await ctx.api.sendMessage(
        { msg: text, quote: ctx.message.data, ttl },
        ctx.threadId,
        ctx.threadType
    );

    if (ttl > 0 && res && res.message) {
        setTimeout(async () => {
            try {
                await ctx.api.undo({
                    msgId: res.message.msgId,
                    cliMsgId: String(Date.now())
                }, ctx.threadId, ctx.threadType);
            } catch (err) {
                console.error("Lỗi tự thu hồi Menu sau 60s:", err.message);
            }
        }, ttl);
    }
    return res;
}

export const commands = {
    help: async (ctx) => {
        const { api, threadId, threadType, moduleInfo, prefix, args } = ctx;
        const input = args[0]?.toLowerCase();

        const hideCommands = ["help", "menu", "unmute", "mutelist", "unlock", "setkey", "linkon", "linkoff", "antilink", "antispam", "setavt", "rs"];

        // 1. Nếu là help [tên lệnh] -> Hiện chi tiết lệnh đó
        if (input && !["all", "trang"].includes(input) && isNaN(input)) {
            const mod = moduleInfo.find(m => m.commands.includes(input));
            if (mod) {
                const head = `[ 💡 CHI TIẾT LỆNH: ${prefix}${input} ]\n`;
                const msg = `${head}─────────────────\n◈ Module: ${mod.name}\n◈ Mô tả : ${mod.description || "Không có"}\n◈ Lệnh  : ${mod.commands.join(", ")}`;
                return api.sendMessage({
                    msg,
                    styles: [
                        { start: 2, len: head.length - 4, st: "b", type: "b" }, 
                        { start: 2, len: head.length - 4, st: "c_db342e", type: "c_db342e" }
                    ]
                }, threadId, threadType);
            }
        }

        // 2. Thu thập toàn bộ danh sách lệnh đơn lẻ
        const allCmds = [];
        moduleInfo.forEach(mod => {
            const visible = mod.commands.filter(c => !hideCommands.includes(c));
            visible.forEach(cmdName => {
                allCmds.push({
                    name: cmdName,
                    desc: mod.description || "Lệnh hỗ trợ hệ thống Bot."
                });
            });
        });

        // 3. Phân trang theo mẫu ảnh (6 lệnh/trang)
        const page = parseInt(input) || 1;
        const itemsPerPage = 8; // Tăng lên 8 lệnh mỗi trang cho đẹp
        const totalPages = Math.ceil(allCmds.length / itemsPerPage);
        
        if (page < 1 || page > totalPages) {
            return api.sendMessage({ msg: `⚠️ Trang ${page} không tồn tại. Hiện có ${totalPages} trang menu.` }, threadId, threadType);
        }

        const start = (page - 1) * itemsPerPage;
        const displayCmds = allCmds.slice(start, start + itemsPerPage);

        const icons = ["/-bd", "/-coffee", "/-fade", "/-break", "/-flag", "/-li", "/-heart", "/-strong", "/-cake"];
        const colors = ["c_db342e", "c_f27806", "c_f7b503", "c_15a85f"];

        const headerLine = `[ DANH SÁCH LỆNH - TRANG ${page} ]\n\n`;
        let menuText = headerLine;
        let styles = [
            { start: 0, len: headerLine.length - 2, st: "b" },
            { start: 0, len: headerLine.length - 2, st: "c_f27806" }
        ];

        displayCmds.forEach((cmd, i) => {
            const index = start + i + 1;
            const icon = icons[i % icons.length];
            const color = colors[i % colors.length];

            const prefixStr = `${index}. ${icon} Lệnh: `;
            const itemHeader = `${prefixStr}${cmd.name}\n`;
            const itemDesc = `  - Mô Tả: ${cmd.desc}\n\n`;

            const styleStart = menuText.length + prefixStr.length;
            styles.push({ start: styleStart, len: cmd.name.length, st: "b" });
            styles.push({ start: styleStart, len: cmd.name.length, st: color });

            menuText += itemHeader + itemDesc;
        });

        const up = process.uptime();
        const d = Math.floor(up / 86400);
        const h = Math.floor((up % 86400) / 3600);
        const m = Math.floor((up % 3600) / 60);

        const footerStart = menuText.length;
        const footer = `━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `- Trang: ${page}/${totalPages} | Tổng: ${allCmds.length} lệnh\n` +
            `- Hoạt động: ${d > 0 ? d + "d " : ""}${h}h ${m}p\n` +
            `- HD: ${prefix}help [trang] hoặc [tên lệnh]\n` +
            `- Premium Bot System /-heart\n` +
            `- Tự thu hồi sau 15 giây`;

        const line2 = `- Trang: ${page}/${totalPages} | Tổng: ${allCmds.length} lệnh\n`;
        styles.push({ start: footerStart + 28, len: line2.length - 1, st: "b" });
        styles.push({ start: footerStart + 28, len: line2.length - 1, st: "c_0000ff" });

        const finalMsg = menuText + footer;
        const res = await api.sendMessage({
            msg: finalMsg,
            styles,
            ttl: 15000
        }, threadId, threadType);

        if (res && res.message) {
            setTimeout(async () => {
                try {
                    await api.undo({ msgId: res.message.msgId, cliMsgId: String(Date.now()) }, threadId, threadType);
                } catch {}
            }, 15000);
        }
    },

    menu: async (ctx) => {
        return commands.help(ctx);
    },

    hello: async (ctx) => {
        await reply(ctx, `👋 Xin chào ${ctx.senderName || ctx.senderId}!\n✨ Tôi là Hệ thống Bot thông minh Zalo.\n👉 Hãy gõ !menu để khám phá tính năng nhé!`);
    },

    info: async (ctx) => {
        const { api, threadId, threadType, senderId, args, message, adminIds } = ctx;

        let targetId = senderId;
        if (message.data?.mentions?.length > 0) {
            targetId = message.data.mentions[0].uid;
        } else if (message.data?.quote?.ownerId) {
            targetId = message.data.quote.ownerId;
        } else if (args[0] && /^\d+$/.test(args[0])) {
            targetId = args[0];
        }

        try {
            const result = await api.getUserInfo(String(targetId));
            if (!result || Object.keys(result).length === 0) {
                return reply(ctx, `⚠️ Không tìm thấy thông tin cho ID: ${targetId}`);
            }

            const profiles = result.changed_profiles || result;
            const user = profiles[String(targetId)] || Object.values(profiles)[0] || result;

            if (!user || !user.userId) {
                return reply(ctx, `⚠️ Không tìm thấy thông tin cho ID: ${targetId}`);
            }

            const displayName = user.zaloName || user.displayName || "Không rõ";
            const avatar = user.fullAvt || user.avt || user.avatar || user.thumbUrl || user.thumbnail || user.picture || "";

            let genderStr = "Không rõ";
            if (user.gender === 0) genderStr = "🚹 Nam";
            else if (user.gender === 1) genderStr = "🚺 Nữ";

            let bdayStr = "Ẩn";
            if (user.sdob) bdayStr = user.sdob;
            else if (user.dob && user.dob !== 0) bdayStr = `${user.dob}`;

            let onlineStr = "Không rõ";
            if (user.lastActionTime) {
                const diff = Math.floor((Date.now() - user.lastActionTime) / 60000);
                if (diff < 2) onlineStr = "🟢 Đang online";
                else if (diff < 60) onlineStr = `🟡 ${diff} phút trước`;
                else if (diff < 1440) onlineStr = `🔴 ${Math.floor(diff / 60)} giờ trước`;
                else onlineStr = `⚫ ${Math.floor(diff / 1440)} ngày trước`;
            }
            if (user.isActive === 1 || user.isActivePC === 1) {
                const diff = Math.floor((Date.now() - user.lastActionTime) / 60000);
                if (diff < 5) onlineStr = "🟢 Đang online";
            }

            const type = ctx.isGroup ? "Nhóm" : "Cá nhân";
            const expiry = rentalManager.getExpiry(ctx.threadId);

            const fields = [
                { icon: "🆔", label: "UID", value: String(targetId) },
                { icon: user.gender === 0 ? "🚹" : "🚺", label: "Giới tính", value: genderStr.replace(/🚹 |🚺 /g, "") },
                { icon: "🟢", label: "Trạng thái", value: onlineStr.replace(/🟢 |🟡 |🔴 |⚫ /g, "") },
                { icon: "🎂", label: "Sinh nhật", value: bdayStr },
            ];
            if (user.phoneNumber) fields.push({ icon: "📱", label: "SĐT", value: user.phoneNumber });
            if (user.createdTs) {
                const createdDate = new Date(user.createdTs * 1000).toLocaleDateString("vi-VN");
                fields.push({ icon: "📅", label: "Ngày tạo", value: createdDate });
            }
            fields.push({ icon: "📂", label: "Thread", value: `${threadId.slice(0, 12)}... (${type})` });
            fields.push({ icon: "⏳", label: "Hạn Bot", value: expiry });

            const userStats = statsManager.getStats(ctx.threadId, targetId);
            const rank = userStats?.role || (adminIds.includes(String(targetId)) ? "Admin" : "Thành viên");

            const { default: fs } = await import("node:fs");
            const { default: pathMod } = await import("node:path");
            const buffer = await drawUserInfo({
                displayName,
                username: user.username || "",
                avatar,
                bio: user.status || "",
                onlineStatus: onlineStr.includes("Đang online") ? "online" : "offline",
                rank,
                fields
            });

            const tmpFile = pathMod.join(process.cwd(), `info_card_${Date.now()}.png`);
            fs.writeFileSync(tmpFile, buffer);
            try {
                await api.sendMessage({ msg: `👤 Info: ${displayName}`, attachments: [tmpFile] }, threadId, threadType);
            } finally {
                if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
            }
        } catch (e) {
            console.error("[INFO CMD ERROR]", e);
            await reply(ctx, `⚠️ Không thể lấy thông tin user: ${e.message}`);
        }
    },

    getinfo: async (ctx) => {
        return commands.info(ctx);
    },

    system: async (ctx) => {
        const { moduleInfo, eventHandlers } = ctx;
        const memory = process.memoryUsage();
        const rss = (memory.rss / 1024 / 1024).toFixed(2);
        const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
        const heapTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);

        const up = process.uptime();
        const d = Math.floor(up / 86400);
        const h = Math.floor((up % 86400) / 3600);
        const m = Math.floor((up % 3600) / 60);
        const s = Math.floor(up % 60);

        let msg = `[ ⚙️ HỆ THỐNG BOT ]\n`;
        msg += `─────────────────\n`;
        msg += `◈ Uptime: ${d > 0 ? d + "d " : ""}${h}h ${m}m ${s}s\n`;
        msg += `◈ RAM (RSS): ${rss} MB\n`;
        msg += `◈ RAM (Heap): ${heapUsed} / ${heapTotal} MB\n`;
        msg += `◈ Modules: ${moduleInfo.length}\n`;
        msg += `◈ Event Handlers: ${eventHandlers.length}\n`;
        msg += `◈ Node.js: ${process.version}\n`;
        msg += `◈ Hệ điều hành: ${process.platform} (${process.arch})\n`;
        msg += `─────────────────\n`;
        msg += `💡 Ghi chú: Nếu RAM vượt quá 512MB trong thời gian dài, hãy cân nhắc khởi động lại cụm bot!`;

        await reply(ctx, msg);
    },

    id: async (ctx) => {
        const { api, message, senderId, threadId, threadType } = ctx;

        let id = senderId;
        let targetNameText = "bạn";

        if (message.data?.mentions?.length > 0) {
            id = message.data.mentions[0].uid;
            targetNameText = "người được tag";
        } else if (message.data?.quote) {
            id = message.data.quote.ownerId;
            targetNameText = "người được reply";
        }

        let realName = "";
        try {
            const result = await api.getUserInfo(String(id));
            const user = result[id] || Object.values(result)[0];
            if (user) realName = `\n👤 Tên: ${user.displayName || user.zaloName || "Không rõ"}`;
        } catch { }

        return ctx.api.sendMessage({ msg: `🆔 ID của ${targetNameText} là: ${id}${realName}` }, threadId, threadType);
    },
};
