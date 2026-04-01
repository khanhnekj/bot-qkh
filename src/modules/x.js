import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { log } from "../logger.js";
import { downloadv1, downloadv2, info } from "../utils/xDownloader.js";

export const name = "x";
export const description = "Tiện ích X (Twitter) - Tải video, tra cứu user profile";

// ================= COMMAND LOGIC =================

export const commands = {
    x: async (ctx) => {
        const { api, args, threadId, threadType, prefix } = ctx;
        const subCmd = args[0]?.toLowerCase();

        if (!subCmd) {
            return api.sendMessage({ msg: `[ 🐦 X (TWITTER) SYSTEM ]\n─────────────────\n`
                + `‣ ${prefix}x down [Link] ➥ Tải ảnh/video Twitter\n`
                + `‣ ${prefix}x info [Username] ➥ Xem thông tin profile\n`
                + `─────────────────`
            }, threadId, threadType);
        }

        try {
            if (subCmd === "down") {
                const url = args[1];
                if (!url) return api.sendMessage({ msg: "⚠️ Vui lòng cung cấp link Twitter/X!" }, threadId, threadType);
                
                await api.sendMessage({ msg: "⏳ Đang lấy dữ liệu từ X..." }, threadId, threadType);
                const data = await downloadv2(url);
                if (!data) {
                    // fallback v1
                    const v1 = await downloadv1(url);
                    if (v1.error) return api.sendMessage({ msg: `❌ Lỗi: ${v1.error}` }, threadId, threadType);
                    
                    let msgT = `[ 🐦 X DOWNLOAD ]\n👤: ${v1.author}\n📝: ${v1.title}`;
                    return api.sendMessage({ msg: msgT, attachments: v1.media }, threadId, threadType);
                }

                let dlMsg = `[ 🐦 X DOWNLOAD ]\n👤: ${data.author}\n📝: ${data.message}\n👀 ${data.views || 0} · ❤️ ${data.like || 0} · 💬 ${data.comment || 0} · 🔄 ${data.retweets || 0}`;
                const medias = data.attachments.map(a => a.url);

                await api.sendMessage({ msg: dlMsg, attachments: medias }, threadId, threadType);

            } else if (subCmd === "info") {
                const username = args[1];
                if (!username) return api.sendMessage({ msg: "⚠️ Vui lòng nhập Username Twitter!" }, threadId, threadType);

                await api.sendMessage({ msg: "🔍 Đang tra cứu thông tin..." }, threadId, threadType);
                const user = await info(username);
                if (!user) return api.sendMessage({ msg: "⚠️ Không tìm thấy user hoặc profile bị ẩn." }, threadId, threadType);

                const txt = `[ 👤 THÔNG TIN X PROFILE ]\n`
                    + `📛 Tên: ${user.name}\n`
                    + `🆔 Username: @${user.screen_name}\n`
                    + `👥 Follower: ${user.followers?.toLocaleString() || 0}\n`
                    + `👣 Đang follow: ${user.following?.toLocaleString() || 0}\n`
                    + `📝 Tiểu sử: ${user.description || 'Không có'}\n`
                    + `📅 Tham gia: ${user.created_at}`;

                await api.sendMessage({ msg: txt, attachments: [user.avatar] }, threadId, threadType);

            } else {
                return api.sendMessage({ msg: `⚠️ Chức năng không hợp lệ!` }, threadId, threadType);
            }
        } catch (e) {
            log.error("X cmd err:", e.message);
            await api.sendMessage({ msg: `❌ Lỗi xử lý: ${e.message}` }, threadId, threadType);
        }
    }
};
