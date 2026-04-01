export const name = "customstk";
export const description = "Gửi thử nhãn dán NQD (Custom Sticker) bá đạo";

export const commands = {
    customstk: async (ctx) => {
        const { api, threadId, threadType, prefix } = ctx;

        // Ảnh gốc, sẽ hiển thị lúc sticker chưa load xong (Thường dùng ảnh nhỏ/tĩnh)
        const staticImgUrl = "https://i.ibb.co/VvzK8gT/pepe-sad.png";
        
        // Ảnh động (Bắt buộc dùng GIF hoặc WEBP động) - Zalo sẽ lấy cái này làm animation
        const animationImgUrl = "https://media.tenor.com/_q14vofGXY8AAAAj/pepe-dance.gif";

        // Gửi thông báo nhỏ mồi trước
        await ctx.reply("✨ Đang triệu hồi Nhãn dán NQD (Custom Sticker)... Sếp xem nó ảo tới mức nào nhé!");

        try {
            // "Cấm thuật" sendCustomSticker: Ép file GIF biến thành 1 dán nhãn Zalo!
            // Khi nhấn vào không bị chình ình cái ảnh to, mà nó sẽ hiện popup sticker gốc
            await api.sendCustomSticker({
                staticImgUrl,
                animationImgUrl,
                width: 200,      // Kích thước dài x rộng sticker
                height: 200,     // Chỉnh to / nhỏ tùy ý (thường là 200x200 hoặc 300x300)
                threadId,
                type: threadType, // Gửi trả vào đúng cái group (hoặc đoạn chat) vừa rồi
                quote: ctx.message.data // Reply chính cái tin nhắn sếp vừa gõ lệnh
            });
            
        } catch (error) {
            ctx.reply(`⚠️ Triệu hồi lỗi rồi sếp ơi: ${error.message}`);
        }
    }
};
