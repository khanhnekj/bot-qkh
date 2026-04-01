import axios from 'axios';
import { log } from '../logger.js';

const THREADS_APP_ID = '238260118697367';
const THREADS_COOKIE = `ig_did=AC3B101C-D80D-4B67-BEB2-49F5D7603D30; mid=aB3SpwALAAE8f-Di32SQTDACmyZ6; ps_l=1; ps_n=1; csrftoken=W9G3NyIJieT1Ct6rTpthehjC1BZoNVmf; ds_user_id=39234257602; sessionid=39234257602%3AINcSJDR813OQDa%3A4%3AAYg4qN81sLy3x4SThfwgUKjvvulA709f28TXFeVNeg`;
const THREADS_X_LSD = 'YaDGsagq11oaqrTjPM2bjx';
const THREADS_X_CSRF = 'W9G3NyIJieT1Ct6rTpthehjC1BZoNVmf';
/**
 * Trình tải dữ liệu từ Threads sử dụng GraphQL
 * @param {string} url - Link bài viết Threads
 */
export async function downloadThreads(url) {
    try {
        // 1. Chuẩn hóa URL và lấy shortcode
        const match = url.match(/threads\.(?:net|com)\/(?:t|@[\w.-]+\/post)\/([\w-]+)/);
        if (!match) throw new Error("URL Threads không hợp lệ");
        const shortcode = match[1];
        
        // 2. Tự động giải mã shortcode sang Numeric ID (đảm bảo độ chính xác 100%)
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let actualID = BigInt(0);
        for (const char of shortcode) {
            const idx = alphabet.indexOf(char);
            if (idx === -1) continue;
            actualID = (actualID * BigInt(64)) + BigInt(idx);
        }
        const postID = actualID.toString();

        // 3. Gọi GraphQL API của Meta
        const variables = {
            "postID": postID,
            "__relay_internal__pv__BarcelonaHasDearAlgoConsumptionrelayprovider": true,
            "__relay_internal__pv__BarcelonaIsLoggedInrelayprovider": true,
            "__relay_internal__pv__BarcelonaHasEventBadgerelayprovider": false,
            "__relay_internal__pv__BarcelonaThreadsWebCachingImprovementsrelayprovider": true,
            "__relay_internal__pv__BarcelonaIsSearchDiscoveryEnabledrelayprovider": false,
            "__relay_internal__pv__BarcelonaHasCommunitiesrelayprovider": true,
            "__relay_internal__pv__BarcelonaHasGameScoreSharerelayprovider": true,
            "__relay_internal__pv__BarcelonaHasPublicViewCountCardrelayprovider": true,
            "__relay_internal__pv__BarcelonaHasScorecardCommunityrelayprovider": false,
            "__relay_internal__pv__BarcelonaHasMusicrelayprovider": false,
            "__relay_internal__pv__BarcelonaHasGhostPostEmojiActivationrelayprovider": false,
            "__relay_internal__pv__BarcelonaOptionalCookiesEnabledrelayprovider": true,
            "__relay_internal__pv__BarcelonaHasDearAlgoWebProductionrelayprovider": false,
            "__relay_internal__pv__BarcelonaIsCrawlerrelayprovider": false,
            "__relay_internal__pv__BarcelonaHasDisplayNamesrelayprovider": false,
            "__relay_internal__pv__BarcelonaHasCommunityTopContributorsrelayprovider": false,
            "__relay_internal__pv__BarcelonaCanSeeSponsoredContentrelayprovider": false,
            "__relay_internal__pv__BarcelonaShouldShowFediverseM075Featuresrelayprovider": true,
            "__relay_internal__pv__BarcelonaIsInternalUserrelayprovider": false
        };

        const formParams = new URLSearchParams({
            'doc_id': '26179113831782631',
            'variables': JSON.stringify(variables),
            'lsd': THREADS_X_LSD,
            'jazoest': '26241'
        });

        const { data: res } = await axios.post('https://www.threads.com/graphql/query', formParams, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-ig-app-id': THREADS_APP_ID,
                'x-fb-lsd': THREADS_X_LSD,
                'x-csrftoken': THREADS_X_CSRF,
                'x-fb-friendly-name': 'BarcelonaPostColumnPageQuery',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
                'Cookie': THREADS_COOKIE
            }
        });

        const info = res.data?.media;
        if (!info) {
            throw new Error("Không tìm thấy dữ liệu media cho bài viết này.");
        }

        // 4. Phân loại nội dung
        const attachments = [];
        const caption = info.caption?.text || "";
        const author = `${info.user?.full_name || info.user?.username} (@${info.user?.username})`;

        // Xử lý Carousel (8)
        if (info.carousel_media && info.carousel_media.length > 0) {
            info.carousel_media.forEach(item => {
                if (item.video_versions && item.video_versions.length > 0) {
                    attachments.push({ type: "Video", url: item.video_versions[0].url });
                } else if (item.image_versions2?.candidates?.length > 0) {
                    attachments.push({ type: "Photo", url: item.image_versions2.candidates[0].url });
                }
            });
        } 
        // Xử lý Video đơn lẻ (2)
        else if (info.video_versions && info.video_versions.length > 0) {
            attachments.push({ type: "Video", url: info.video_versions[0].url });
        } 
        // Xử lý Voice Note / Audio (11)
        else if (info.audio?.audio_src) {
            attachments.push({ type: "Audio", url: info.audio.audio_src });
        }
        // Xử lý Ảnh đơn lẻ (1)
        else if (info.image_versions2?.candidates?.length > 0) {
            attachments.push({ type: "Photo", url: info.image_versions2.candidates[0].url });
        }

        return {
            id: postID,
            message: caption,
            author: author,
            like: info.like_count?.toLocaleString() || "0",
            comment: info.text_post_app_info?.direct_reply_count?.toLocaleString() || "0",
            repost: info.text_post_app_info?.repost_count?.toLocaleString() || "0",
            reshare: info.text_post_app_info?.reshare_count?.toLocaleString() || "0",
            cover: info.image_versions2?.candidates?.[0]?.url || null,
            attachments: attachments,
            source: "Threads"
        };

    } catch (error) {
        log.error("Lỗi tại threadsDownloader:", error.message);
        throw error;
    }
}
