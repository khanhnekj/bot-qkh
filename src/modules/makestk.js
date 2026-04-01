export const name = "makestk";
export const description = "Reply ảnh để biến nó thành Nhãn dán Zalo (Custom Sticker)";

export const commands = {
    makestk: async (ctx) => {
        const { api, threadId, threadType, prefix, message } = ctx;

        // Bắt bot đọc tin nhắn đang được Reply xem có ảnh (photo/gif) không
        const quotedMsg = message.data?.quote;
        if (!quotedMsg || !quotedMsg.attach) {
            return ctx.reply("⚠️ Sếp phải Reply (trả lời) 1 bức ảnh hoặc ảnh GIF cơ!");
        }

        try {
            let targetUrl = null;
            const raw = typeof quotedMsg.attach === "string" ? quotedMsg.attach : JSON.stringify(quotedMsg.attach || {});

            // Cách 1: Cố gắng Parse JSON từ Quote (Gọn và chuẩn nhất với JXL hiện tại)
            try {
                let parsed = typeof quotedMsg.attach === "string" ? JSON.parse(quotedMsg.attach) : quotedMsg.attach;
                if (Array.isArray(parsed)) parsed = parsed[0]; // Nếu là mảng thì lấy phần tử đầu
                
                if (parsed) {
                    targetUrl = parsed.href || parsed.link || parsed.thumb || parsed.hdUrl || parsed.thumbUrl;
                }
            } catch (e) { }

            // Cách 2: Regex Fallback (xử lý luôn cả các dấu gạch chéo bị escape như https:\/\/...)
            if (!targetUrl) {
                // Regex tìm link, bất chấp bị escape \/ hay không
                const imgRegex = /https?:(?:\\?\/){2}[^"'\s]+?\.(?:jpg|jpeg|png|gif|webp|jxl)[^"'\s]*/i;
                const match = imgRegex.exec(raw) || imgRegex.exec(quotedMsg.text || "");
                if (match) targetUrl = match[0];
            }

            if (!targetUrl) {
                return ctx.reply("⚠️ Lỗi: Không thể trích xuất đường dẫn ảnh. Đảm bảo Zalo lưu ảnh chuẩn nhé sếp.");
            }

            // Giải mã string bị escape (vd: https:\/\/ biến thành https://)
            targetUrl = targetUrl.replace(/\\\//g, '/');
            targetUrl = targetUrl.replace("https://zalo-api.zadn.vn/api/emoticon/sprite?eid=", "");

            await ctx.reply("✨ Đang niệm chú để 'luyện' ảnh này thành Sticker...");

            // Gọi tuyệt kỹ cấm thuật NQD
            await api.sendCustomSticker({
                staticImgUrl: targetUrl,
                animationImgUrl: targetUrl,
                width: 300,
                height: 300,
                threadId,
                type: threadType,
                quote: ctx.message.data // Reply
            });
            
        } catch (error) {
            ctx.reply(`⚠️ Ép ảnh thành sticker thất bại: ${error.message}`);
        }
    }
};
