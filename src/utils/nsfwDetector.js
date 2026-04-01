import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { log } from '../logger.js';

// Cài đặt cứng đường dẫn máy cưa Video
const fPath = (typeof ffmpegStatic === "object" && ffmpegStatic.path) ? ffmpegStatic.path : ffmpegStatic;
const fpPath = (typeof ffprobeStatic === "object" && ffprobeStatic.path) ? ffprobeStatic.path : ffprobeStatic;

ffmpeg.setFfmpegPath(fPath);
ffmpeg.setFfprobePath(fpPath);

export const nsfwDetector = {
    /**
     * Dùng ffmpeg trích xuất 1 bức ảnh ngay giữa Video
     */
    extractVideoFrame(videoUrl) {
        return new Promise((resolve, reject) => {
            const tempPath = path.join(process.cwd(), `tmp_${Date.now()}.jpg`);
            ffmpeg(videoUrl)
                .screenshots({
                    timestamps: ['50%'], // Chụp ảnh đúng khoảnh khắc 50%
                    filename: path.basename(tempPath),
                    folder: path.dirname(tempPath),
                    size: '640x480'
                })
                .on('end', () => resolve(tempPath))
                .on('error', (err) => reject(err));
        });
    },

    /**
     * API Phụ: NSFW Categorize (Dùng khi Zalo nghẽn)
     */
    async fallbackNSFWConfig(fileUrlOrPath, isLocal = false) {
        log.info(`[Fallback AI] Kích hoạt Trạm phụ NSFW Categorize do Zalo quá tải...`);
        const tempPath = isLocal ? fileUrlOrPath : path.join(process.cwd(), `nsfw_tmp_${Date.now()}.jpg`);
        try {
            if (!isLocal) {
                const downloadResp = await axios({
                    url: fileUrlOrPath, method: 'GET', responseType: 'stream', timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const writer = fs.createWriteStream(tempPath);
                downloadResp.data.pipe(writer);
                await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });
            }

            const form = new FormData();
            form.append('image', fs.createReadStream(tempPath));

            const response = await axios.post("https://nsfw-categorize.it/api/upload", form, {
                headers: {
                    ...form.getHeaders(),
                    'Accept': 'application/json',
                    'Origin': 'https://nsfw-categorize.it',
                    'Referer': 'https://nsfw-categorize.it/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'x-requested-with': 'XMLHttpRequest'
                },
                timeout: 20000
            });

            const res = response.data;
            if (res && res.status === "OK" && res.data) {
                // Nhất quyết chỉ mổ xẻ dựa trên cờ Nude thực tế
                const isNude = res.data.nsfw === true;
                return {
                    isNSFW: isNude,
                    confidence: res.data.confidence,
                    classification: isNude ? "NỘI DUNG NHẠY CẢM (AIFallback)" : "SẠCH (AIFallback)",
                    quota: res.quota
                };
            }
            return null;
        } catch (e) {
            log.error(`[Fallback AI] Lỗi Trạm Khẩn cấp: ${e.message}`);
            return null;
        } finally {
            if (!isLocal && fs.existsSync(tempPath)) try { fs.unlinkSync(tempPath); } catch (e) {}
        }
    },

    /**
     * Kêu gọi Zalo AI (Zalo Brain) xét xử Ảnh hoặc Video
     */
    async checkUrl(api, url, isVideo = false) {
        if (!url || !api) return null;
        
        let targetFileOrUrl = url;
        let isLocalFrame = false;

        try {
            if (isVideo) {
                targetFileOrUrl = await this.extractVideoFrame(url);
                isLocalFrame = true; 
            }

            // Go! Quăng cho AI checkImage() của Zalo xem xét
            let isNSFW = false;
            let dirtyScore = 0;
            
            try {
                const aiResult = await api.checkImage(targetFileOrUrl);
                log.debug(`[Zalo AI Dữ liệu thật]: ${JSON.stringify(aiResult)}`);
                
                const resultData = aiResult?.data || aiResult; 
                
                if (resultData) {
                    const isDirty = resultData.is_dirty_content === 1 || resultData.is_dirty === 1;
                    const score = resultData.score || 0;

                    dirtyScore = score * 100;

                    if (isDirty || score > 0.68) {
                        isNSFW = true;
                    }
                }
                
                return {
                    isNSFW,
                    confidence: Math.round(dirtyScore),
                    classification: isNSFW ? "KHIÊU DÂM/NỘI DUNG XẤU" : "SẠCH",
                    quota: "Vô Hạn (Zalo AI)"
                };
            } catch (aiErr) {
                // Zalo AI rớt mạng vì bất kỳ lý do gì => Chuyển sang Web API NSFW Categorize
                log.warn(`[Zalo AI] Đứt gánh (${aiErr.message}). Nảy qua Trạm Phụ Quốc Tế!`);
                const fallbackResult = await this.fallbackNSFWConfig(targetFileOrUrl, isLocalFrame);
                if (fallbackResult) return fallbackResult;
                throw aiErr;
            }

        } catch (error) {
            log.warn(`[Zalo AI Scanner] Lỗi khi nhận dạng Tệp: ${error.message}`);
            return null;
        } finally {
            if (isLocalFrame && fs.existsSync(targetFileOrUrl)) {
                try { fs.unlinkSync(targetFileOrUrl); } catch (e) { }
            }
        }
    }
};
