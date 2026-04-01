import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { autoReactManager } from "../utils/autoReactManager.js";
import { protectionManager } from "../utils/protectionManager.js";
import { hanManager } from "../utils/hanManager.js";
import { drawGroupCard } from "../utils/canvasHelper.js";
import { tempDir } from "../utils/io-json.js";
import { log } from "../logger.js";
import { statsManager } from "../utils/statsManager.js";

const ROLES = {
    "Admin": 100,
    "Vàng": 50,
    "Bạc": 20,
    "Thành viên": 0
};

function getLevel(uid, threadId, adminIds) {
    if (adminIds.includes(String(uid))) return ROLES["Admin"];
    const stats = statsManager.getStats(threadId, uid);
    return ROLES[stats?.role] || 0;
}

const pendingMemberRequests = new Map();

export const name = "group";
export const description = "Quản lý nhóm (đổi tên, lấy info, kích/thêm thành viên...)";

async function reply(ctx, text) {
    await ctx.api.sendMessage(
        { msg: text, quote: ctx.message.data },
        ctx.threadId,
        ctx.threadType
    );
}

export const commands = {

    groupname: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Lệnh này chỉ dùng được trong nhóm!");
        
        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Bạn cần ít nhất [Key Bạc] để đổi tên nhóm!");
        }

        const newName = ctx.args.join(" ");
        if (!newName) return reply(ctx, "◈ Dùng: !groupname [tên mới]");

        try {
            await ctx.api.changeGroupName(newName, ctx.threadId);
            await reply(ctx, `✦ Đã đổi tên nhóm thành: ${newName}`);
        } catch (e) {
            await reply(ctx, `⚠️ Lỗi khi đổi tên: ${e.message}`);
        }
    },


    cardinfo: async (ctx) => {
        if (!ctx.isGroup) {
            return reply(ctx, "⚠️ Lệnh này chỉ dùng được trong nhóm!");
        }

        try {
            ctx.api.sendTypingEvent(ctx.threadId, ctx.threadType).catch(() => { });

            const res = await ctx.api.getGroupInfo(ctx.threadId);
            const info = res.gridInfoMap?.[ctx.threadId] || res;

            if (!info) {
                return reply(ctx, "⚠️ Không tìm thấy thông tin nhóm.");
            }

            const groupName = info.groupName || info.name || "Nhóm không tên";
            const groupId = ctx.threadId;
            const avatar = info.fullAvt || info.avt || info.thumbUrl || "";
            const memberCount = info.totalMember || (info.memVerList ? info.memVerList.length : "?");
            const creatorId = info.creatorId || "?";
            const desc = info.desc || "";

            // Lấy tên người tạo
            let creatorName = creatorId;
            try {
                const userRes = await ctx.api.getUserInfo(creatorId);
                const u = userRes?.[creatorId] || userRes;
                creatorName = u?.displayName || u?.zaloName || creatorId;
            } catch { }

            // Lấy cài đặt hiện tại của bot trong nhóm
            // Lấy cài đặt hiện tại của bot trong nhóm
            const antiLink = protectionManager.isEnabled(groupId, "link");
            const antiSpam = protectionManager.isEnabled(groupId, "spam");
            const hanEnabled = hanManager.isEnabled(groupId);
            const reactConfig = autoReactManager.get(groupId);

            const settings = [
                { label: "Anti-Link", value: antiLink ? "ON" : "OFF", color: antiLink ? "#10b981" : "#94a3b8" },
                { label: "Anti-Spam", value: antiSpam ? "ON" : "OFF", color: antiSpam ? "#10b981" : "#94a3b8" },
                { label: "Bé Hân", value: hanEnabled ? "ON" : "OFF", color: hanEnabled ? "#10b981" : "#94a3b8" },
                { label: "Auto React", value: reactConfig.enabled ? "ON" : "OFF", color: reactConfig.enabled ? "#10b981" : "#94a3b8" },
            ];

            // Lấy avatar của một số thành viên tiêu biểu
            let memberAvatarUrls = [];
            try {
                const memList = info.memVerList || [];
                const topMems = memList.slice(0, 15).map(m => m.split("_")[0]); // Lấy UID từ "UID_VER"
                if (topMems.length > 0) {
                    const profilesRes = await ctx.api.getUserInfo(topMems);
                    const profiles = profilesRes?.changed_profiles || profilesRes || {};
                    memberAvatarUrls = topMems.map(uid => {
                        const p = profiles[uid] || {};
                        return p.fullAvt || p.avt || "";
                    }).filter(url => url !== "");
                }
            } catch (err) {
                log.error("Lỗi lấy avatar thành viên:", err.message);
            }

            const imgBuf = await drawGroupCard({
                groupName,
                groupId,
                avatar,
                memberCount,
                creatorName,
                createdTime: info.createdTime ? new Date(parseInt(info.createdTime)).toLocaleDateString("vi-VN") : "Đang cập nhật",
                description: desc,
                settings,
                memberAvatarUrls
            });

            const tmpPath = path.join(tempDir, `cardinfo_${Date.now()}.png`);
            fs.writeFileSync(tmpPath, imgBuf);

            await ctx.api.sendMessage({ 
                msg: `👤 Info: ${groupName}`, 
                attachments: [tmpPath] 
            }, ctx.threadId, ctx.threadType).catch((err) => {
                log.error("Lỗi gửi tin nhắn kèm ảnh:", err.message);
                return reply(ctx, `[ 📊 CARD INFO ]\n───\n◈ Tên: ${groupName}\n◈ ID: ${groupId}\n◈ Thành viên: ${memberCount}\n◈ Người tạo: ${creatorName}`);
            });

            try { fs.unlinkSync(tmpPath); } catch { }
        } catch (e) {
            log.error("Lỗi cardinfo:", e.message);
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    },



    groupinfo: async (ctx) => {
        if (!ctx.isGroup) {
            return reply(ctx, "⚠️ Lệnh này chỉ dùng được trong nhóm!");
        }
        try {
            const res = await ctx.api.getGroupInfo(ctx.threadId);
            const info = res.gridInfoMap?.[ctx.threadId] || res;

            if (!info) {
                return reply(ctx, "⚠️ Không tìm thấy thông tin nhóm.");
            }

            const memberCount = info.totalMember || (info.memVerList ? info.memVerList.length : "Không rõ");
            const creatorId = info.creatorId ? info.creatorId : "Không rõ";

            // Lấy tên người tạo
            let creatorName = creatorId;
            if (creatorId && creatorId !== "Không rõ") {
                try {
                    const uInfo = await ctx.api.getUserInfo(creatorId);
                    const user = uInfo[creatorId] || Object.values(uInfo)[0];
                    creatorName = user?.displayName || user?.zaloName || creatorId;
                } catch { }
            }

            let msg = `[ 👥 THÔNG TIN NHÓM ]\n`;
            msg += `─────────────────\n`;
            msg += `◈ Tên: ${info.groupName || info.name || "Không tên"}\n`;
            msg += `◈ Thành viên: ${memberCount}\n`;
            msg += `◈ Người tạo: ${creatorName}\n`;
            msg += `─────────────────\n`;
            msg += `✨ Chúc nhóm mọi điều tốt đẹp!`;
            await reply(ctx, msg);
        } catch (e) {
            log.error("Lỗi groupinfo:", e.message);
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    },


    leave: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Chỉ dùng trong nhóm!");

        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Vàng"]) {
            return reply(ctx, "⚠️ Chỉ Admin hoặc [Key Vàng] mới có quyền ra lệnh rời nhóm!");
        }

        await reply(ctx, "👋 Tạm biệt mọi người! Bot xin phép rời nhóm.");
        try {
            await ctx.api.leaveGroup(ctx.threadId);
        } catch (e) {
            await reply(ctx, `⚠️ Không thể rời nhóm: ${e.message}`);
        }
    },


    add: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Chỉ dùng trong nhóm!");
        
        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Bạn cần ít nhất [Key Bạc] để thêm thành viên!");
        }

        const phone = ctx.args[0];
        if (!phone) return reply(ctx, "◈ Dùng: !add [số điện thoại]");

        try {
            await ctx.api.addUserToGroup(phone, ctx.threadId);
            await reply(ctx, `✅ Đã gửi lời mời hoặc thêm SĐT ${phone} vào nhóm.`);
        } catch (e) {
            await reply(ctx, `⚠️ Lỗi thêm thành viên: ${e.message}`);
        }
    },


    groupavatar: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Lệnh này chỉ dùng được trong nhóm!");

        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Bạn cần ít nhất [Key Bạc] để đổi ảnh nhóm!");
        }

        const quote = ctx.message.data.quote;
        if (!quote) {
            let guide = `[ 🖼️ ĐỔI ẢNH NHÓM ]\n`;
            guide += `─────────────────\n`;
            guide += `◈ Hãy phản hồi (reply) vào một tấm ảnh.\n`;
            guide += `◈ Gõ lệnh: !setavt\n`;
            guide += `─────────────────\n`;
            guide += `✨ Bot sẽ cập nhật ảnh đại diện nhóm ngay!`;
            return reply(ctx, guide);
        }


        let attach;
        try {
            attach = typeof quote.attach === "string" ? JSON.parse(quote.attach) : quote.attach;
        } catch (e) {
            return reply(ctx, "⚠️ Dữ liệu ảnh không hợp lệ.");
        }

        const imageUrl = attach?.hdUrl || attach?.href || attach?.url;
        if (!imageUrl) {
            return reply(ctx, "⚠️ Không tìm thấy ảnh trong tin nhắn được reply.");
        }

        const cleanUrl = decodeURIComponent(imageUrl.replace(/\\\//g, "/"));
        const tempPath = path.join(tempDir, `temp_avt_${Date.now()}.jpg`);

        const clockEmojis = ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛"];
        let clockIdx = 0;
        const reactionInterval = setInterval(() => {
            if (ctx.message && ctx.message.data) {
                ctx.api.addReaction({ icon: clockEmojis[clockIdx % clockEmojis.length], rType: 75, source: 1 }, {
                    data: { msgId: ctx.message.data.msgId || ctx.message.data.globalMsgId, cliMsgId: ctx.message.data.cliMsgId },
                    threadId: ctx.threadId, type: ctx.threadType
                }).catch(() => { });
                clockIdx++;
            }
        }, 2000);

        try {
            const response = await axios({
                method: "get",
                url: cleanUrl,
                responseType: "stream"
            });

            const writer = fs.createWriteStream(tempPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
            });

            await ctx.api.changeGroupAvatar(tempPath, ctx.threadId);
            await reply(ctx, "✅ Đã cập nhật ảnh đại diện nhóm thành công!");

        } catch (err) {
            await reply(ctx, `⚠️ Lỗi: ${err.message}`);
        } finally {
            clearInterval(reactionInterval);
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    },

    setavt: async (ctx) => {
        return commands.groupavatar(ctx);
    },



    linkon: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Chỉ dùng trong nhóm!");
        
        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Bạn phải có [Key Bạc] mới được mở link nhóm!");
        }

        try {
            const res = await ctx.api.enableGroupLink(ctx.threadId);
            await reply(ctx, `✦ Đã mở link nhóm!\n➥ Link: ${res.link}`);
        } catch (e) {
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    },

    linkoff: async (ctx) => {
        if (!ctx.isGroup) return reply(ctx, "⚠️ Chỉ dùng trong nhóm!");
        
        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Bạn phải có [Key Bạc] mới được tắt link nhóm!");
        }

        try {
            await ctx.api.disableGroupLink(ctx.threadId);
            await reply(ctx, "✦ Đã khóa link tham gia nhóm.");
        } catch (e) {
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    },

    pending: async (ctx) => {
        if (!ctx.isGroup) {
            // Trường hợp nhắn riêng: Duyệt lời mời vào nhóm
            try {
                const data = await ctx.api.getGroupInvites();
                const invites = data.invitations || data.list || data.invites || [];

                if (invites.length === 0) {
                    return reply(ctx, "✅ Bot hông có lời mời vào nhóm nào mới sếp ơi!");
                }

                let msg = `[ 📩 LỜI MỜI VÀO NHÓM ]\n`;
                msg += `─────────────────\n`;
                msg += `➥ Phản hồi STT để Bot vào nhóm.\n\n`;
                
                const sessionInvites = [];
                invites.forEach((inv, index) => {
                    const gi = inv.groupInfo || inv;
                    const gName = gi.name || gi.groupName || gi.gname || "Nhóm không tên";
                    const gId = gi.groupId || gi.grid || inv.groupId;
                    const inviterName = inv.inviterInfo?.displayName || inv.inviterName || "Ẩn danh";
                    const memberCount = gi.totalMember || gi.memberIds?.length || "?";
                    
                    msg += `${index + 1}. ${gName}\n   🆔: ${gId}\n   👥 Mem: ${memberCount}\n   👤 Mời bởi: ${inviterName}\n\n`;
                    sessionInvites.push({ index: index + 1, id: gId, name: gName });
                });
                
                msg += `─────────────────\n`;
                msg += `💡 Nhắn STT (vd: "1") để đồng ý vào nhóm.\n`;
                msg += `💡 Dùng: !duyet on/off [ID nhóm]`;

                pendingMemberRequests.set(`${ctx.threadId}-${ctx.senderId}`, { list: sessionInvites, type: "invites" });
                setTimeout(() => {
                    pendingMemberRequests.delete(`${ctx.threadId}-${ctx.senderId}`);
                }, 60000);

                await reply(ctx, msg);
            } catch (e) {
                await reply(ctx, `⚠️ Lỗi khi lấy danh sách mời: ${e.message}`);
            }
            return;
        }

        // Trường hợp trong nhóm: Duyệt thành viên chờ duyệt
        const senderLevel = getLevel(ctx.senderId, ctx.threadId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Chỉ Admin hoặc [Key Bạc] mới có quyền xem hàng chờ!");
        }

        try {
            const data = await ctx.api.getGroupMembersJoinRequest(ctx.threadId);
            const list = data.users || [];

            if (list.length === 0) {
                return reply(ctx, "✅ Hiện tại không có yêu cầu tham gia nào.");
            }

            let msg = `[ ⏳ DANH SÁCH CHỜ DUYỆT ]\n`;
            msg += `─────────────────\n`;
            const sessionRequests = [];
            list.forEach((user, index) => {
                msg += `${index + 1}. ${user.displayName || "Không tên"}\n   🆔: ${user.uid}\n`;
                sessionRequests.push({ index: index + 1, uid: user.uid, name: user.displayName });
            });
            msg += `─────────────────\n`;
            msg += `➥ Phản hồi số thứ tự (STT) để duyệt.\n`;
            msg += `💡 Dùng: !duyet on [ID] để chấp nhận\n`;
            msg += `💡 Dùng: !duyet off [ID] để từ chối\n`;
            msg += `💡 Dùng: !duyet all để chấp nhận tất cả`;

            pendingMemberRequests.set(`${ctx.threadId}-${ctx.senderId}`, { list: sessionRequests, groupId: ctx.threadId, type: "members" });
            setTimeout(() => {
                pendingMemberRequests.delete(`${ctx.threadId}-${ctx.senderId}`);
            }, 60000);

            await reply(ctx, msg);
        } catch (e) {
            log.error(`Lỗi lấy danh sách chờ:`, e.message);
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    },

    duyet: async (ctx) => {
        let targetGroupId = ctx.threadId;
        let args = [...ctx.args];

        if (!ctx.isGroup) {
            // Trường hợp nhắn riêng: !duyet [on/off/all] [ID nhóm] [ID member]
            // Hoặc: !duyet [ID nhóm] [on/off/all] [ID member]
            // Để đơn giản, ta qui định: !duyet [on/off/all] [ID nhóm] [ID member]
            targetGroupId = args[1];
            if (!targetGroupId || !/^\d+$/.test(targetGroupId)) {
                return reply(ctx, "◈ Khi nhắn riêng, dùng: !duyet [on/off/all] [ID nhóm] [ID member (nếu có)]");
            }
            // Loại bỏ group ID khỏi danh sách args để logic sau không nhầm nó là member ID
            args.splice(1, 1);
        }
        
        const senderLevel = getLevel(ctx.senderId, targetGroupId, ctx.adminIds);
        if (senderLevel < ROLES["Bạc"]) {
            return reply(ctx, "⚠️ Chỉ Admin hoặc [Key Bạc] mới có quyền duyệt thành viên!");
        }

        const action = args[0]?.toLowerCase();
        let isApprove = true;
        let actionText = "Chấp nhận (on)";

        if (["off", "no", "bo", "huy", "reject"].includes(action)) {
            isApprove = false;
            actionText = "Từ chối (off)";
        } else if (action === "all") {
            isApprove = true;
            actionText = "Chấp nhận tất cả";
        } else if (action !== "on") {
            return reply(ctx, "◈ Dùng: !duyet [on/off/all] [ID member (nếu có)]");
        }

        const targetIds = args.slice(1).filter(id => /^\d+$/.test(id));

        try {
            if (targetIds.length > 0) {
                await ctx.api.handleGroupPendingMembers({ members: targetIds, isApprove }, targetGroupId);
                await reply(ctx, `✅ Đã ${actionText} ${targetIds.length} thành viên: ${targetIds.join(", ")} tại nhóm ${targetGroupId}`);
            } else {
                await ctx.api.handleGroupPendingMembers(targetGroupId, isApprove);
                await reply(ctx, `✅ Đã thực hiện ${actionText} thành công cho toàn bộ hàng chờ tại nhóm ${targetGroupId}!`);
            }
        } catch (e) {
            log.error(`Lỗi duyệt thành viên:`, e.message);
            await reply(ctx, `⚠️ Lỗi: ${e.message}`);
        }
    }
};

export async function handle(ctx) {
    const { content, threadId, senderId, api, message } = ctx;
    if (!content || message.isSelf) return false;

    const key = `${threadId}-${senderId}`;
    const pendingData = pendingMemberRequests.get(key);

    if (pendingData && /^\d+$/.test(content.trim())) {
        const choiceIdx = parseInt(content.trim());
        const { list: pendingList, groupId, type } = pendingData;
        const target = pendingList.find(u => u.index === choiceIdx);
        
        if (target) {
            try {
                if (type === "invites") {
                    const result = await api.handleGroupInvite(target.id, true);
                    if (result?.status === "pending") {
                        await api.sendMessage({ msg: `⏳ Đã gửi yêu cầu vào nhóm ${target.name}, đang chờ admin nhóm duyệt nha sếp! ✨` }, threadId, ctx.threadType);
                    } else {
                        await api.sendMessage({ msg: `✅ Đã chấp nhận vào nhóm: ${target.name}` }, threadId, ctx.threadType);
                    }
                } else if (type === "members") {
                    await api.handleGroupPendingMembers({ members: [target.uid], isApprove: true }, groupId);
                    await api.sendMessage({ msg: `✅ Đã duyệt thành viên: ${target.name} (${target.uid}) tại nhóm ${groupId}` }, threadId, ctx.threadType);
                }
                
                const newList = pendingList.filter(u => u.index !== choiceIdx);
                if (newList.length === 0) pendingMemberRequests.delete(key);
                else pendingMemberRequests.set(key, { list: newList, groupId, type });
                return true;
            } catch (e) {
                await api.sendMessage({ msg: `⚠️ Lỗi khi xử lý: ${e.message}` }, threadId, ctx.threadType);
            }
        }
    }
    return false;
}

