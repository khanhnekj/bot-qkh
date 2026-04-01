import { readRawConfig, writeRawConfig } from "../utils/config.js";

export const name = "setreaction";
export const description = "Cài đặt icon thả cảm xúc để thu hồi tin nhắn Bot";

export const commands = {
    setreaction: async (ctx) => {
        const { api, args, threadId, threadType, adminIds, senderId } = ctx;

        // Chỉ Admin mới được đổi cấu hình hệ thống
        if (!adminIds.includes(String(senderId))) {
            return api.sendMessage({ msg: "⚠️ Chỉ Admin Bot mới có quyền thay đổi cấu hình Reaction." }, threadId, threadType);
        }

        let config;
        try {
            config = readRawConfig();
        } catch (e) {
            return api.sendMessage({ msg: "⚠️ Không thể đọc file config.json." }, threadId, threadType);
        }

        config.bot ??= {};
        if (!config.bot.deleteReactions) config.bot.deleteReactions = [];

        const sub = args[0]?.toLowerCase();
        const value = args[1];

        if (!sub || sub === "list") {
            const list = config.bot.deleteReactions.join(", ");
            return api.sendMessage({ msg: `[ 📋 DANH SÁCH ICON THU HỒI ]\n─────────────────\n✨ Các icon hiện tại: ${list || "Trống"}\n\n💡 Cách dùng:\n- !setreaction add <mã>\n- !setreaction del <mã>\n(Mã có thể là :-h, :-@, /-heart, 186, 20...)` }, threadId, threadType);
        }

        if (sub === "add" && value) {
            if (config.bot.deleteReactions.includes(value)) {
                return api.sendMessage({ msg: `⚠️ Icon "${value}" đã có trong danh sách rồi.` }, threadId, threadType);
            }
            config.bot.deleteReactions.push(value);
            writeRawConfig(config);
            return api.sendMessage({ msg: `✅ Đã thêm icon "${value}" vào danh sách thu hồi. Hãy gõ -rs để áp dụng.` }, threadId, threadType);
        }

        if ((sub === "del" || sub === "remove") && value) {
            const index = config.bot.deleteReactions.indexOf(value);
            if (index === -1) {
                return api.sendMessage({ msg: `⚠️ Icon "${value}" không có trong danh sách.` }, threadId, threadType);
            }
            config.bot.deleteReactions.splice(index, 1);
            writeRawConfig(config);
            return api.sendMessage({ msg: `✅ Đã xoá icon "${value}" khỏi danh sách thu hồi. Hãy gõ -rs để áp dụng.` }, threadId, threadType);
        }

        return api.sendMessage({ msg: "⚠️ Cú pháp không hợp lệ. Dùng: !setreaction add/del <mã>" }, threadId, threadType);
    }
};
