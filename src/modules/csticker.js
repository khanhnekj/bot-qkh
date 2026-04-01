import { mediaHelper } from "../utils/mediaHelper.js";

export const name = "csticker";
export const description = "Tạo và gửi Nhãn Dán Ảo (Ảnh động/Tĩnh) vào thẳng Zalo";

async function makeSticker(ctx, isAi = false) {
    const { message, api, args } = ctx;
    
    let staticUrl = "https://mystickermaker.app/assets/images/header-main-image.png"; 
    let animUrl = "https://media.tenor.com/T_iC1L0eZAEAAAAj/dance-cheems.webp"; 
    
    if (message.data && message.data.quote) {
        let quoteObj = message.data.quote;
        if (typeof quoteObj === "string") quoteObj = JSON.parse(quoteObj);
        
        let attachedUrl = mediaHelper.extractImageUrl(quoteObj.attach);
        if (!attachedUrl && quoteObj.attach) {
            try {
                const parsedAttach = typeof quoteObj.attach === "string" ? JSON.parse(quoteObj.attach) : quoteObj.attach;
                attachedUrl = parsedAttach.href || parsedAttach.src || parsedAttach.normalUrl || parsedAttach.hdUrl;
            } catch (e) {}
        }
        if (attachedUrl) {
            staticUrl = attachedUrl;
            animUrl = attachedUrl; 
        }
    }

    const input = args.join(" ");
    if (input) {
        const parts = input.split("|").map(t => t.trim());
        staticUrl = parts[0];
        animUrl = parts[1] || parts[0]; 
    }
    
    try {
        const iconType = isAi ? "✨ [ AI - STICKER ]" : "✨ [ Phép Thuật ]";
        await api.sendMessage({ msg: `${iconType} Đang hô biến ảnh thành Nhãn Dán (Sticker)...` }, message.threadId, message.type);
        
        // Thêm trường isAi = true (Nằm ở vị trí Tham số thứ 6)
        await api.sendCustomSticker(message, staticUrl, animUrl, parseInt("450"), parseInt("450"), isAi);
    } catch (e) {
        await api.sendMessage({ msg: "❌ Server Zalo báo Lỗi Cấm Cửa r! Error: " + e.message }, message.threadId, message.type);
    }
}

export const commands = {
    csticker: async (ctx) => {
        await makeSticker(ctx, false);
    },
    aisticker: async (ctx) => {
        await makeSticker(ctx, true);
    }
};
