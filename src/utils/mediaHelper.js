/**
 * Helper utility for extracting media information from Zalo messages
 */

export const mediaHelper = {
    /**
     * Extracts a direct image URL from a Zalo message attachment or params
     * @param {any} attach - The attachment object or string from message.data.attach
     * @returns {string|null} - The HD or original image URL
     */
    extractImageUrl(attach) {
        if (!attach) return null;
        if (typeof attach === "string" && attach.startsWith("http")) return attach;
        try {
            let attachObj = typeof attach === "string" ? JSON.parse(attach) : attach;

            // Handle array of attachments (Album) or single object
            const items = Array.isArray(attachObj) ? attachObj : [attachObj];
            
            for (const item of items) {
                let url = null;
                // Priority paths in Zalo message structure
                if (item.params) {
                    let paramsObj = typeof item.params === "string" ? JSON.parse(item.params) : item.params;
                    if (paramsObj.hd) url = paramsObj.hd;
                    else if (paramsObj.url) url = paramsObj.url;
                    else if (paramsObj.href) url = paramsObj.href;
                }

                if (!url && item.href) url = item.href;
                if (!url && item.url) url = item.url;
                if (!url && item.hdUrl) url = item.hdUrl;
                if (!url && item.thumb) url = item.thumb;

                if (url && typeof url === 'string') {
                    url = url.trim().replace(/^"|"$/g, '');
                    if (url.startsWith("http")) return url;
                }
            }
        } catch (e) { }
        return null;
    },

    extractVideoUrl(attach) {
        if (!attach) return null;
        if (typeof attach === "string" && attach.startsWith("http")) return attach;
        try {
            let attachObj = typeof attach === "string" ? JSON.parse(attach) : attach;
            const items = Array.isArray(attachObj) ? attachObj : [attachObj];
            for (const item of items) {
                let url = null;
                
                // Zalo giấu link video sâu bên trong object params y như ảnh
                if (item.params) {
                    let paramsObj = typeof item.params === "string" ? JSON.parse(item.params) : item.params;
                    if (paramsObj.url) url = paramsObj.url;
                    else if (paramsObj.href) url = paramsObj.href;
                }

                if (!url && item.href) url = item.href;
                if (!url && item.url) url = item.url;

                if (url && typeof url === 'string') {
                    url = url.trim().replace(/^"|"$/g, '');
                    if (url.startsWith("http")) return url;
                }
            }
        } catch(e) {}
        return null;
    },

    /**

     * Checks if the message content or data identifies as a sticker
     */
    isSticker(data, content) {
        const STICKER_URL_REGEX = /zfcloud\.zdn\.vn.*StickerBy|sticker.*\.webp/i;
        if (data.stickerId || data.sticker_id) return true;
        if (data.msgType === "chat.sticker" || data.msgType === 36 || data.msgType === "36") return true;
        if (typeof content === "string" && (content === "[STICKER]" || STICKER_URL_REGEX.test(content))) return true;
        return false;
    },

    /**
     * Checks if the message content or data identifies as a photo
     */
    isPhoto(data, content) {
        if (!data) return false;
        if (this.isSticker(data, content)) return false;
        
        // Zalo message types for photos:
        // 2: Single photo, 32: Album/Multi-photo
        const msgType = String(data.msgType || "");
        const isPhotoType = msgType === "2" || msgType === "32" || msgType === "chat.photo" || data.mediaType === 1;
        
        const hasPhotoAttach = (typeof data.attach === "string" && (data.attach.includes("chat.photo") || data.attach.includes(".jpg") || data.attach.includes(".png")));
        const hasPhotoContent = (data.type === "photo" || (data.content && typeof data.content === "object" && data.content.type === "photo"));

        return isPhotoType || hasPhotoAttach || hasPhotoContent;
    },

    /**
     * Checks if the message content or data identifies as a video
     */
    isVideo(data, content) {
        if (!data) return false;
        if (this.isSticker(data, content)) return false;
        
        const msgType = String(data.msgType || "").toLowerCase();
        const isVideoType = msgType === "5" || msgType === "3" || msgType === "44" || data.mediaType === 2 || msgType.includes("video");
        
        const hasVideoAttach = (typeof data.attach === "string" && (data.attach.toLowerCase().includes("video") || data.attach.includes(".mp4")));
        const hasVideoContent = (data.type === "video" || (data.content && typeof data.content === "object" && data.content.type === "video"));

        return isVideoType || hasVideoAttach || hasVideoContent;
    }
};
