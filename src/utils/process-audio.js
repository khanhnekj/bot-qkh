import axios from "axios";
import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPkg from "ffmpeg-static";
const ffmpegPath = (typeof ffmpegPkg === "object" && ffmpegPkg.path) ? ffmpegPkg.path : ffmpegPkg;
import ffprobePath from "ffprobe-static";
import { pipeline } from "node:stream/promises";
import { log } from "../logger.js";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path || ffprobePath);

const tempDir = path.resolve(process.cwd(), "Downloads", "zl");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

export async function convertToAAC(inputPath) {
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(path.dirname(inputPath), `${baseName}.aac`);
    
    try {
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('aac')
                .audioBitrate('128k')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
        return outputPath;
    } catch (error) {
        log.error("Lỗi Convert AAC:", error.message);
        throw error;
    }
}

export async function getFileSize(filePath) {
    try { return fs.statSync(filePath).size; } catch { return 0; }
}

export async function uploadAudioFile(filePath, api, threadId, threadType) {
    let aacPath = null;
    try {
        const fileSize = await getFileSize(filePath);
        const ext = path.extname(filePath).toLowerCase();
        let finalPath = filePath;

        // Ép convert nếu không phải aac/m4a hoặc file quá lớn
        if (fileSize > 9 * 1024 * 1024 || (ext !== ".aac" && ext !== ".m4a")) {
            log.info(`◈ Đang tối ưu định dạng audio...`);
            aacPath = await convertToAAC(filePath);
            finalPath = aacPath;
        }

        const results = await api.uploadAttachment(finalPath, threadId, threadType);
        if (!results || results.length === 0) throw new Error("Upload Zalo thất bại.");

        const voiceUrl = results[0].fileUrl || results[0].url;

        const metadata = await new Promise((resolve) => {
            ffmpeg.ffprobe(finalPath, (err, meta) => {
                if (err) resolve({ format: { duration: 0 } });
                else resolve(meta);
            });
        });
        const duration = Math.round((metadata.format?.duration || 0) * 1000);

        return {
            voiceUrl,
            fileSize: await getFileSize(finalPath),
            duration,
            filePath: finalPath
        };
    } catch (error) {
        log.error("Lỗi upload Audio:", error.message);
        throw error;
    } finally {
        if (aacPath && fs.existsSync(aacPath)) fs.unlinkSync(aacPath);
    }
}

export async function extractAudioFromVideo(input, api, threadId, threadType) {
    const vPath = path.join(tempDir, `v_${Date.now()}.mp4`);
    const aPath = path.join(tempDir, `a_${Date.now()}.aac`);

    try {
        if (typeof input === 'string' && input.startsWith('http')) {
            const res = await axios({ url: input, method: 'GET', responseType: 'stream' });
            await pipeline(res.data, fs.createWriteStream(vPath));
        } else if (Buffer.isBuffer(input)) {
            fs.writeFileSync(vPath, input);
        } else {
            fs.copyFileSync(input, vPath);
        }

        await new Promise((resolve, reject) => {
            ffmpeg(vPath).vn().audioCodec('aac').audioBitrate('128k')
                .on('end', resolve).on('error', reject).save(aPath);
        });

        return await uploadAudioFile(aPath, api, threadId, threadType);
    } finally {
        [vPath, aPath].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
    }
}

export async function createSpinningSticker(imageUrl, outputPath) {
    const tempIn = path.join(tempDir, `in_${Date.now()}.png`);
    try {
        const resp = await axios({ url: imageUrl, responseType: "arraybuffer" });
        fs.writeFileSync(tempIn, Buffer.from(resp.data));
        const cmd = `"${ffmpegPath}" -y -i "${tempIn}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,rotate=2*PI*t/2:c=none:ow='iw':oh='ih',format=rgba,geq=r='r(X,Y)':a='if(gt(hypot(X-256,Y-256),256),0,alpha(X,Y))'" -t 2 -loop 0 -vcodec libwebp -lossless 0 -q:v 70 "${outputPath}"`;
        await new Promise((resolve, reject) => {
            exec(cmd, (err) => err ? reject(err) : resolve());
        });
        return true;
    } catch { return false; }
    finally { if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn); }
}

export default { convertToAAC, getFileSize, uploadAudioFile, extractAudioFromVideo, createSpinningSticker };