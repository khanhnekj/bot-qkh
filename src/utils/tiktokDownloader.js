import axios from "axios";

/**
 * Download TikTok video via SnapTik API
 * Trả về thông tin đầy đủ: author, title, videoUrl, audioUrl, cover, stats
 */
export async function downloadTikTok(url) {
    try {
        const { data } = await axios.get(`https://tikwm.com/api/?url=${encodeURIComponent(url)}`, {
            timeout: 20000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
            }
        });

        if (!data || data.code !== 0) {
            console.error('Lỗi TikWM:', data?.msg || "Không rõ nguyên nhân");
            return null;
        }

        const item = data.data;
        const author = item.author || {};
        
        // Luôn ưu tiên images nếu có (Slideshow)
        let images = item.images || [];
        let videoUrl = item.play || item.wmplay || null;

        // Nếu có images, xóa videoUrl để tránh gửi cả hai (trừ khi bot cấu hình khác)
        if (images.length > 0) {
            videoUrl = null;
        }

        return {
            title: item.title || item.content_desc?.[0] || `Video TikTok`,
            author: author.nickname || author.unique_id || "Người dùng TikTok",
            avatar: author.avatar || null,
            videoUrl: videoUrl,
            audioUrl: item.music || item.music_info?.play || null,
            cover: item.cover || item.origin_cover || null,
            images: images,
            stats: {
                views: item.play_count || 0,
                likes: item.digg_count || 0,
                comments: item.comment_count || 0,
                shares: item.share_count || 0
            }
        };
    } catch (error) {
        console.error('Lỗi downloadTikTok (TikWM):', error.message);
        return null;
    }
}
