import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import { spawn, execSync } from "node:child_process";
import FormData from "form-data";
import { log } from "../logger.js";
import pkgCanvas from "canvas";
const { createCanvas, loadImage } = pkgCanvas;
import { removeBackground as libRemoveBg } from "@imgly/background-removal-node";
import { loadConfig } from "../utils/config.js";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const { writeFileSync } = fs;

const DEFAULT_REMOVEBG_KEYS = [
    "t4Jf1ju4zEpiWbKWXxoSANn4",
    "CTWSe4CZ5AjNQgR8nvXKMZBd",
    "PtwV35qUq557yQ7ZNX1vUXED",
    "wGXThT64dV6qz3C6AhHuKAHV",
    "82odzR95h1nRp97Qy7bSRV5M",
    "4F1jQ7ZkPbkQ6wEQryokqTmo",
    "4F1jQ7ZkPbkQ6wEQryokqTmo",
    "sBssYDZ8qZZ4NraJhq7ySySR",
    "NuZtiQ53S2F5CnaiYy4faMek",
    "f8fujcR1G43C1RmaT4ZSXpwW"
];

function getRemoveBgKeys() {
    const keys = loadConfig().removebg?.keys;
    return Array.isArray(keys) && keys.length > 0 ? keys : DEFAULT_REMOVEBG_KEYS;
}

let sharpLibPromise = null;

async function getSharp() {
    if (!sharpLibPromise) {
        sharpLibPromise = import("sharp")
            .then(mod => mod.default || mod)
            .catch(() => null);
    }
    return sharpLibPromise;
}

async function getImageUploadInfo(input) {
    const buffer = input instanceof Buffer ? input : fs.readFileSync(input);
    const sharp = await getSharp();
    if (!sharp) {
        return { buffer, format: "png", filename: "image.png", contentType: "image/png" };
    }
    try {
        const meta = await sharp(buffer, { animated: true }).metadata();
        const format = (meta.format || "png").toLowerCase();
        const extMap = {
            jpeg: "jpg",
            jpg: "jpg",
            png: "png",
            webp: "webp",
            gif: "gif",
            avif: "avif",
            tiff: "tiff"
        };
        const ext = extMap[format] || "png";
        const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;
        return { buffer, format, filename: `image.${ext}`, contentType };
    } catch {
        return { buffer, format: "png", filename: "image.png", contentType: "image/png" };
    }
}

async function normalizeImageBuffer(input, tempKey = Date.now()) {
    const sourceBuffer = input instanceof Buffer ? input : fs.readFileSync(input);
    const sharp = await getSharp();
    if (sharp) {
        try {
            return await sharp(sourceBuffer, { animated: true }).png().toBuffer();
        } catch {}
    }
    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const tempInput = path.join(tempDir, `rmbg_src_${tempKey}`);
    const tempOutput = path.join(tempDir, `rmbg_src_${tempKey}.png`);
    try {
        fs.writeFileSync(tempInput, sourceBuffer);
        await ffmpegToPng(tempInput, tempOutput);
        return fs.readFileSync(tempOutput);
    } finally {
        if (fs.existsSync(tempInput)) try { fs.unlinkSync(tempInput); } catch { }
        if (fs.existsSync(tempOutput)) try { fs.unlinkSync(tempOutput); } catch { }
    }
}

async function prepareStickerPng(inputPath, outputPath) {
    const img = await loadImage(inputPath);
    const srcCanvas = createCanvas(img.width, img.height);
    const srcCtx = srcCanvas.getContext("2d");
    srcCtx.drawImage(img, 0, 0);

    const imageData = srcCtx.getImageData(0, 0, img.width, img.height);
    const { data, width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const stack = [];

    const idxOf = (x, y) => y * width + x;
    const isBgCandidate = (x, y) => {
        const p = idxOf(x, y) * 4;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        const a = data[p + 3];
        if (a < 16) return true;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const nearWhite = r >= 238 && g >= 238 && b >= 238;
        const lowSaturation = (max - min) <= 18;
        return nearWhite && lowSaturation;
    };

    const seed = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = idxOf(x, y);
        if (visited[i] || !isBgCandidate(x, y)) return;
        visited[i] = 1;
        stack.push([x, y]);
    };

    for (let x = 0; x < width; x++) {
        seed(x, 0);
        seed(x, height - 1);
    }
    for (let y = 0; y < height; y++) {
        seed(0, y);
        seed(width - 1, y);
    }

    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const p = idxOf(x, y) * 4;
        data[p + 3] = 0;
        seed(x + 1, y);
        seed(x - 1, y);
        seed(x, y + 1);
        seed(x, y - 1);
    }

    srcCtx.putImageData(imageData, 0, 0);

    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const a = data[idxOf(x, y) * 4 + 3];
            if (a > 24) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX === -1 || maxY === -1) {
        fs.writeFileSync(outputPath, srcCanvas.toBuffer("image/png"));
        return outputPath;
    }

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const outSize = 512;
    const pad = Math.round(outSize * 0.08);
    const scale = Math.min((outSize - pad * 2) / cropW, (outSize - pad * 2) / cropH);
    const drawW = Math.max(1, Math.round(cropW * scale));
    const drawH = Math.max(1, Math.round(cropH * scale));
    const dx = Math.round((outSize - drawW) / 2);
    const dy = Math.round((outSize - drawH) / 2);

    const outCanvas = createCanvas(outSize, outSize);
    const outCtx = outCanvas.getContext("2d");
    outCtx.clearRect(0, 0, outSize, outSize);
    outCtx.drawImage(srcCanvas, minX, minY, cropW, cropH, dx, dy, drawW, drawH);

    fs.writeFileSync(outputPath, outCanvas.toBuffer("image/png"));
    return outputPath;
}

async function removeBackgroundWithRemoveBg(input) {
    try {
        log.system(`[STK] Đang gửi ảnh lên remove.bg để xóa nền...`);
        const uploadInfo = await getImageUploadInfo(input);
        const apiKeys = getRemoveBgKeys();
        const apiKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
        if (!apiKey) throw new Error("Chưa có remove.bg API key.");

        const form = new FormData();
        form.append("size", "auto");
        form.append("image_file", uploadInfo.buffer, {
            filename: uploadInfo.filename,
            contentType: uploadInfo.contentType
        });

        const response = await axios.post("https://api.remove.bg/v1.0/removebg", form, {
            data: form,
            responseType: "arraybuffer",
            timeout: 60000,
            headers: {
                ...form.getHeaders(),
                "X-Api-Key": apiKey
            },
            validateStatus: () => true
        });

        if (response.status !== 200) {
            let details = "";
            try {
                details = Buffer.from(response.data).toString("utf-8");
            } catch {}
            throw new Error(`remove.bg status ${response.status}${details ? `: ${details.slice(0, 200)}` : ""}`);
        }

        log.system(`[STK] remove.bg đã xóa nền xong! ✨`);
        return Buffer.from(response.data);

    } catch (e) {
        const msg = e.response?.data?.errors?.[0]?.title || e.message;
        throw new Error(`remove.bg Error: ${msg}`);
    }
}

/**
 * Hàm xóa nền tổng hợp: Thử remove.bg trước, thất bại dùng AI nội bộ
 */
async function removeBackground(input) {
    try {
        return await removeBackgroundWithRemoveBg(input);
    } catch (removeBgErr) {
        log.warn(`[RemoveBackground] remove.bg lỗi (${removeBgErr.message}) -> Chuyển sang dùng AI nội bộ...`);
        try {
            const startTime = Date.now();
            const normalizedBuffer = await normalizeImageBuffer(input, startTime);
            const blob = await libRemoveBg(new Blob([normalizedBuffer], { type: "image/png" }));
            const buffer = Buffer.from(await blob.arrayBuffer());
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            log.system(`[STK] Xóa nền AI nội bộ hoàn tất sau ${duration}s!`);
            return buffer;
        } catch (localErr) {
            log.error(`[RemoveBackground] AI nội bộ cũng lỗi: ${localErr.message}`);
            throw localErr;
        }
    }
}

async function kieaiGenerateAndWait() { return null; }
function getKieaiKey() { return null; }

export const name = "stk";
export const version = "2.5.0";
export const credits = "VLjnh";
export const description = "Tạo sticker từ ảnh/GIF/video. Sub: xoay [tốc độ] [thời gian] (xoay), tron (crop tròn), xt [tốc độ] [thời gian] (xoay+tròn, hỗ trợ video), xn (xóa nền), ai (vẽ AI). VD: .stk xt 2 8s (nhanh x2, 8 giây)";

const ffmpegPath = (typeof ffmpeg === "object" && ffmpeg.path) ? ffmpeg.path : ffmpeg;
const ffprobePath = (typeof ffprobe === "object" && ffprobe.path) ? ffprobe.path : ffprobe;

const BOT_NAME = "LauNa";

async function uploadToCatbox(filePath) {
    if (!fs.existsSync(filePath)) {
        log.error(`Catbox: file không tồn tại: ${filePath}`);
        return null;
    }
    const size = fs.statSync(filePath).size;
    try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("fileToUpload", fs.createReadStream(filePath));

        const response = await axios.post("https://catbox.moe/user/api.php", form, {
            headers: form.getHeaders(),
            timeout: 30000,
            validateStatus: () => true,
        });

        const url = typeof response.data === "string" ? response.data.trim() : null;
        if (url && url.startsWith("http")) {
            return url;
        }
        log.error(`Catbox trả về không phải URL: ${String(response.data).slice(0, 200)}`);
        return null;
    } catch (e) {
        log.error(`Catbox lỗi network: ${e?.code || e?.message}`);
        return null;
    }
}

const ZALO_DL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Referer": "https://chat.zalo.me/",
    "Accept": "image/jpeg,image/png,image/webp,image/*,*/*;q=0.8",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
};

async function downloadWithRetry(mediaUrl, dest, retries = 4, extraHeaders = {}) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.get(mediaUrl, {
                responseType: "arraybuffer",
                headers: { ...ZALO_DL_HEADERS, ...extraHeaders },
                timeout: 40000,
                maxRedirects: 5,
            });
            fs.writeFileSync(dest, Buffer.from(response.data));
            return true;
        } catch (e) {
            if (attempt === retries) throw e;
            await new Promise(r => setTimeout(r, 1500 * attempt));
        }
    }
}

async function convertToWebp(mediaUrl, uniqueId, removeBg = false) {
    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tRaw = path.join(tempDir, `in_raw_${uniqueId}.img`);
    const tIn = path.join(tempDir, `in_${uniqueId}.png`);
    const tPrepared = path.join(tempDir, `in_prepared_${uniqueId}.png`);
    const tOut = path.join(tempDir, `out_${uniqueId}.webp`);

    try {
        await downloadWithRetry(mediaUrl, tRaw);
        await ffmpegToPng(tRaw, tIn);

        if (!fs.existsSync(tIn)) {
            log.error(`STK: tải ảnh thất bại — file không tồn tại`);
            return null;
        }

        if (removeBg === true) {
            const rmbgBuffer = await removeBackground(tIn);
            fs.writeFileSync(tIn, rmbgBuffer);
        } else {
            // Tự động bo góc cho ảnh không xóa nền
            const roundedBuf = await applyRoundedCorners(tIn, 40);
            fs.writeFileSync(tIn, roundedBuf);
        }

        await prepareStickerPng(tIn, tPrepared);
        fs.copyFileSync(tPrepared, tIn);

        const inSize = fs.statSync(tIn).size;
        if (inSize < 100) {
            log.error(`STK: file ảnh quá nhỏ (${inSize} bytes) — có thể tải bị lỗi`);
            return null;
        }

        const cmdArgs = [
            "-y",
            "-threads", "1",
            "-i", tIn,
            "-vf", "scale='if(gt(iw,ih),min(iw,512),-1)':'if(gt(iw,ih),-1,min(ih,512))',pad=512:512:(512-iw)/2:(512-ih)/2:color=0x00000000",
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            "-vsync", "0",
            tOut
        ];

        const ffmpegStderr = [];
        await new Promise((resolve, reject) => {
            const ffmpeg = spawn(ffmpegPath, cmdArgs);
            ffmpeg.stderr.on("data", d => ffmpegStderr.push(String(d)));
            ffmpeg.on("close", (code) => {
                if (code === 0) resolve();
                else {
                    const errLog = ffmpegStderr.join("").slice(-500);
                    log.error(`STK: ffmpeg code=${code}\n${errLog}`);
                    reject(new Error(`ffmpeg code ${code}`));
                }
            });
            ffmpeg.on("error", (e) => {
                log.error(`STK: ffmpeg spawn lỗi — ${e?.code || e?.message}`);
                reject(e);
            });
        });

        if (fs.existsSync(tOut) && fs.statSync(tOut).size > 0) {
            return tOut;
        }
        log.error(`STK: file webp không tồn tại sau convert`);
        return null;
    } catch (e) {
        log.error(`STK: lỗi convert — ${e?.message || e?.code || String(e)}`);
        return null;
    } finally {
        if (fs.existsSync(tRaw)) try { fs.unlinkSync(tRaw); } catch { }
        if (fs.existsSync(tPrepared)) try { fs.unlinkSync(tPrepared); } catch { }
        if (fs.existsSync(tIn)) try { fs.unlinkSync(tIn); } catch { }
    }
}

async function sendCustomStickerWithRetry(api, payload, retries = 3) {
    for (let i = 1; i <= retries; i++) {
        try {
            await api.sendCustomSticker(payload);
            return true;
        } catch (e) {
            const msg = e?.message || String(e);
            log.warn(`STK: gửi sticker lần ${i} thất bại — ${msg}`);
            if (i < retries) await new Promise(r => setTimeout(r, 2000 * i));
            else throw e;
        }
    }
}

export async function convertAndSendSticker(api, mediaUrl, threadId, threadType, senderId, removeBg = false) {
    const uniqueId = `${senderId}_${Date.now()}`;
    const webpPath = await convertToWebp(mediaUrl, uniqueId, removeBg);

    if (!webpPath) {
        log.error(`STK: convertToWebp trả null — ảnh không được chuyển đổi`);
        return false;
    }

    try {
        const webpUrl = await uploadToCatbox(webpPath);
        if (!webpUrl) return false;

        await sendCustomStickerWithRetry(api, {
            animationImgUrl: webpUrl,
            staticImgUrl: webpUrl,
            threadId,
            type: 1,
            width: 512,
            height: 512
        });
        return true;
    } finally {
        if (fs.existsSync(webpPath)) try { fs.unlinkSync(webpPath); } catch { }
    }
}

function extractMediaUrlFromAttach(attachData) {
    if (!attachData) return null;
    let data = attachData;
    if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { return null; }
    }
    const url = data.hdUrl || data.url || data.href || data.thumbUrl;
    if (!url) return null;
    const final = Array.isArray(url) ? url[0] : url;
    return decodeURIComponent(String(final).replace(/\\\//g, "/"));
}

function extractMediaUrlFromMessage(message) {
    const raw = message?.data || {};

    const attachments = raw.attachments || [];
    for (const att of attachments) {
        const url = att?.hdUrl || att?.fileUrl || att?.url || att?.href;
        if (url && typeof url === "string" && url.startsWith("http")) {
            return decodeURIComponent(String(url).replace(/\\\//g, "/"));
        }
    }

    const msgAttach = raw.msgAttach || raw.attach;
    if (msgAttach) {
        const url = extractMediaUrlFromAttach(msgAttach);
        if (url) return url;
    }

    return null;
}

// ─── XÓA NỀN — dùng global.removeBackground (src/utils/core/removebg.js) ────

async function convertPngToWebpSticker(pngPath, uniqueId) {
    const tempDir = path.dirname(pngPath);
    const outPath = path.join(tempDir, `stk_xn_${uniqueId}.webp`);

    const cmdArgs = [
        "-y", "-threads", "1", "-i", pngPath,
        "-vf", "scale='if(gt(iw,ih),min(iw,512),-1)':'if(gt(iw,ih),-1,min(ih,512))'",
        "-c:v", "libwebp",
        "-lossless", "0",
        "-compression_level", "2",
        "-q:v", "75",
        "-loop", "0",
        "-an", "-vsync", "0",
        outPath
    ];

    await new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, cmdArgs);
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg code ${code}`)));
        ff.on("error", reject);
    });

    return fs.existsSync(outPath) && fs.statSync(outPath).size > 0 ? outPath : null;
}

async function getMediaUrl(message) {
    const raw = message?.data || {};
    let url = extractMediaUrlFromMessage(message);
    if (!url && raw.quote?.attach) url = extractMediaUrlFromAttach(raw.quote.attach);
    return url;
}

async function xoaNenHandler(ctx, makeSticker = false) {
    const { api, threadId, threadType, message, senderId, senderName } = ctx;
    const tag = `@${senderName} `;

    const mediaUrl = await getMediaUrl(message);
    if (!mediaUrl) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Reply vào ảnh hoặc đính kèm ảnh để tớ xóa nền nhé!` },
            threadId, threadType
        );
    }

    const action = makeSticker ? "Đang xóa nền + tạo sticker" : "Đang xóa nền ảnh";
    await api.sendMessage({
        msg: tag + `${BOT_NAME}: ${action}, chờ xíu nha~ ✨`,
        mentions: [{ uid: senderId, pos: 0, len: tag.length }]
    }, threadId, threadType);

    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const ts = Date.now();
    const pngPath = path.join(tempDir, `rmbg_${ts}.png`);
    let webpPath = null;
    const rawImgPath = path.join(tempDir, `rmbg_raw_${ts}.img`);

    // Lấy Zalo session cookie từ api context (CDN Zalo cần cookie để download)
    let sessionHeaders = {};
    try {
        const zaloCtx = api.getContext?.() || {};
        const jar = zaloCtx.cookie;
        if (jar) {
            let cookieStr = "";
            if (typeof jar.getCookieStringSync === "function") {
                // Thử các domain CDN phổ biến của Zalo
                const domains = [
                    "https://zalo.me",
                    "https://chat.zalo.me",
                    "https://cover-talk.zadn.vn",
                    "https://zmp3-attach.zadn.vn",
                ];
                for (const d of domains) {
                    const s = jar.getCookieStringSync(d);
                    if (s) { cookieStr = s; break; }
                }
            } else if (typeof jar === "string") {
                cookieStr = jar;
            }
            if (cookieStr) sessionHeaders = { "Cookie": cookieStr };
        }
    } catch (_) { }

    try {
        try {
            await downloadWithRetry(mediaUrl, rawImgPath, 4, sessionHeaders);
        } catch (dlErr) {
            const status = dlErr?.response?.status;
            if (status === 410 || status === 404) {
                throw new Error("Link ảnh đã hết hạn. Cậu gửi lại ảnh mới rồi thử lại nhé!");
            }
            const code = dlErr?.code || dlErr?.message || String(dlErr);
            throw new Error(`Tải ảnh thất bại (${status || code})`);
        }
        await ffmpegToPng(rawImgPath, pngPath);
        const resultBuf = await removeBackground(pngPath);
        fs.writeFileSync(pngPath, resultBuf);

        if (makeSticker) {
            // Xóa nền → WebP sticker → Catbox → gửi sticker
            webpPath = await convertPngToWebpSticker(pngPath, ts);
            if (!webpPath) throw new Error("Chuyển đổi WebP thất bại.");

            const webpUrl = await uploadToCatbox(webpPath);
            if (!webpUrl) throw new Error("Upload Catbox thất bại.");

            await api.sendCustomSticker({
                animationImgUrl: webpUrl,
                staticImgUrl: webpUrl,
                threadId,
                type: 1,
                width: 512,
                height: 512
            });
        } else {
            // Chỉ xóa nền → gửi PNG
            await api.sendMessage(
                { msg: `✅ ${BOT_NAME}: Xóa nền xong!`, attachments: [pngPath] },
                threadId, threadType
            );
        }
    } catch (e) {
        let errMsg;
        if (e instanceof AggregateError) {
            const inner = e.errors?.[0];
            errMsg = `Lỗi kết nối mạng (${inner?.code || inner?.message || "network error"})`;
        } else {
            errMsg = e?.message || String(e) || "Lỗi không xác định";
        }
        log.error(`Lỗi XóaNền: ${errMsg}`);
        await api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Xóa nền lỗi rồi! ${errMsg}` },
            threadId, threadType
        );
    } finally {
        try { if (fs.existsSync(rawImgPath)) fs.unlinkSync(rawImgPath); } catch { }
        try { if (fs.existsSync(pngPath)) fs.unlinkSync(pngPath); } catch { }
        try { if (webpPath && fs.existsSync(webpPath)) fs.unlinkSync(webpPath); } catch { }
    }
}

async function stkHandler(ctx, removeBg = false) {
    const { api, threadId, threadType, message, senderId, senderName } = ctx;
    const raw = message?.data || {};
    const quote = raw.quote;

    if (!quote || !quote.attach) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Hãy reply vào ảnh hoặc GIF để tớ làm sticker nhé!` },
            threadId, threadType
        );
    }

    const tag = `@${senderName} `;
    try {
        const mediaUrl = extractMediaUrlFromAttach(quote.attach);
        if (!mediaUrl) {
            return api.sendMessage(
                { msg: `➜ ❌ ${BOT_NAME}: Hông lấy được link ảnh rồi. Cậu thử lại với ảnh khác nhé!` },
                threadId, threadType
            );
        }

        const actionTxt = removeBg ? "Đang làm sticker xóa phông" : "Đang làm sticker";
        await api.sendMessage({
            msg: tag + `${BOT_NAME}: ${actionTxt} cho cậu, chờ xíu nha~ ✨`,
            mentions: [{ uid: senderId, pos: 0, len: tag.length }]
        }, threadId, threadType);

        const ok = await convertAndSendSticker(api, mediaUrl, threadId, threadType, senderId, removeBg);
        if (!ok) {
            api.sendMessage(
                { msg: `➜ ❌ ${BOT_NAME}: Làm sticker lỗi rồi! Có thể do ảnh không đúng định dạng đó.` },
                threadId, threadType
            );
        }
    } catch (e) {
        const errMsg = e?.message || String(e);
        log.error(`Lỗi STK: ${errMsg}`);
        api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Lỗi hệ thống: ${errMsg}` },
            threadId, threadType
        );
    }
}

async function taostkHandler(ctx) {
    const { api, threadId, threadType, message, senderId, senderName } = ctx;
    const tag = `@${senderName} `;

    const mediaUrl = extractMediaUrlFromMessage(message);

    if (!mediaUrl) {
        const raw = message?.data || {};
        const quote = raw.quote;
        if (quote?.attach) {
            return stkHandler(ctx);
        }
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Cậu đính kèm ảnh/GIF vào tin nhắn hoặc reply vào ảnh để tớ tạo sticker nhé!` },
            threadId, threadType
        );
    }

    try {
        await api.sendMessage({
            msg: tag + `${BOT_NAME}: Đang tạo sticker từ ảnh cậu gửi, chờ xíu nha~ ✨`,
            mentions: [{ uid: senderId, pos: 0, len: tag.length }]
        }, threadId, threadType);

        const ok = await convertAndSendSticker(api, mediaUrl, threadId, threadType, senderId, senderName);
        if (!ok) {
            api.sendMessage(
                { msg: `➜ ❌ ${BOT_NAME}: Không tạo được sticker. Cậu thử ảnh khác xem sao nha!` },
                threadId, threadType
            );
        }
    } catch (e) {
        const errMsg = e?.message || String(e);
        log.error(`Lỗi TAOSTK: ${errMsg}`);
        api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Lỗi: ${errMsg}` },
            threadId, threadType
        );
    }
}

// ─── AI STICKER ───────────────────────────────────────────────────────────────
const POLLINATIONS_URL = (prompt) =>
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true&enhance=true&model=flux&seed=${Date.now()}`;

async function stkiaHandler(ctx) {
    const { api, threadId, threadType, senderId, senderName, args } = ctx;
    const tag = `@${senderName} `;
    const prompt = args.join(" ").trim();

    if (!prompt) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Cậu nhập mô tả để tớ vẽ sticker nhé!\nVD: .stk ai mèo cute chibi nền trắng` },
            threadId, threadType
        );
    }

    const loadMsg = await api.sendMessage({
        msg: tag + `${BOT_NAME}: Đang vẽ sticker AI cho cậu: "${prompt}" ⏳`,
        mentions: [{ uid: senderId, pos: 0, len: tag.length }]
    }, threadId, threadType).catch(() => null);

    const tempDir = path.join(process.cwd(), "src/modules/cache/");
    fs.mkdirSync(tempDir, { recursive: true });
    const uniqueId = `${senderId}_${Date.now()}`;
    const pngPath = path.join(tempDir, `stkia_${uniqueId}.png`);
    let webpPath = null;

    try {
        let imageUrl = null;
        const hasKie = !!getKieaiKey();

        if (hasKie) {
            try {
                const urls = await kieaiGenerateAndWait(prompt, { model: "4o", size: "1:1", nVariants: 1 });
                imageUrl = urls?.[0] || null;
            } catch (kieErr) {
                log.warn(`[stkia] kie.ai lỗi: ${kieErr.message} — fallback Pollinations`);
            }
        }

        if (!imageUrl) {
            imageUrl = POLLINATIONS_URL(prompt);
        }
        await downloadWithRetry(imageUrl, pngPath, 3);

        const rmbgBuffer = await removeBackground(pngPath);
        fs.writeFileSync(pngPath, rmbgBuffer);

        webpPath = await convertPngToWebpSticker(pngPath, uniqueId);
        if (!webpPath) throw new Error("Chuyển WebP thất bại");

        const webpUrl = await uploadToCatbox(webpPath);
        if (!webpUrl) throw new Error("Upload Catbox thất bại");

        await sendCustomStickerWithRetry(api, {
            staticImgUrl: webpUrl,
            animationImgUrl: webpUrl,
            threadId,
            type: 1,
            width: 512,
            height: 512,
        });

        if (loadMsg?.data?.msgId) {
            api.undo({ msgId: loadMsg.data.msgId, cliMsgId: loadMsg.data.cliMsgId }, threadId, threadType).catch(() => { });
        }
    } catch (e) {
        log.error(`[stkia] Lỗi: ${e.message}`);
        api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Tạo sticker AI lỗi: ${e.message}` },
            threadId, threadType
        );
    } finally {
        for (const f of [pngPath, webpPath]) {
            if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch { }
        }
    }
}

// ─── HELPER: FFMPEG convert bất kỳ ảnh → PNG (xử lý JXL, AVIF, ...) ─────────
function ffmpegToPng(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ff = spawn(ffmpegPath, [
            "-y", "-threads", "1", "-i", inputPath,
            "-frames:v", "1", "-f", "image2", outputPath
        ]);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg→png code ${code}: ${errs.join("").slice(-200)}`)));
        ff.on("error", reject);
    });
}

// ─── HELPER: CROP TRÒN bằng skia-canvas (nhận path file, tự xử lý JXL) ──────
async function cropCircleFromPath(rawPath, pngPath) {
    // Đảm bảo là PNG trước khi đưa vào canvas
    await ffmpegToPng(rawPath, pngPath);
    const { createCanvas, loadImage } = await import("canvas");
    const img = await loadImage(pngPath);
    const size = Math.min(img.width, img.height, 512);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    const scale = size / Math.min(img.width, img.height);
    const sx = (img.width * scale - size) / 2;
    const sy = (img.height * scale - size) / 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -sx, -sy, img.width * scale, img.height * scale);
    return canvas.toBuffer("image/png");
}

// ─── HELPER: Bo góc bằng Canvas ─────────────────────────────────────────────
async function applyRoundedCorners(pngPath, radius = 40) {
    const img = await loadImage(pngPath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");

    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(img.width - radius, 0);
    ctx.quadraticCurveTo(img.width, 0, img.width, radius);
    ctx.lineTo(img.width, img.height - radius);
    ctx.quadraticCurveTo(img.width, img.height, img.width - radius, img.height);
    ctx.lineTo(radius, img.height);
    ctx.quadraticCurveTo(0, img.height, 0, img.height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(img, 0, 0);
    return canvas.toBuffer("image/png");
}

// ─── HELPER: Detect video bằng magic bytes + ffprobe fallback ────────────────
function isVideoFileMagic(filePath) {
    try {
        const buf = Buffer.alloc(12);
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buf, 0, 12, 0);
        fs.closeSync(fd);
        if (buf.slice(4, 8).toString("ascii") === "ftyp") return true;
        if (buf.slice(0, 4).toString("ascii") === "RIFF" &&
            buf.slice(8, 11).toString("ascii") === "AVI") return true;
        if (buf[0] === 0x1a && buf[1] === 0x45 &&
            buf[2] === 0xdf && buf[3] === 0xa3) return true;
        if (buf.slice(0, 3).toString("ascii") === "FLV") return true;
    } catch { }
    return false;
}

function detectIsVideoWithFfprobe(filePath) {
    return new Promise((resolve) => {
        const ff = spawn(ffprobePath, [
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            filePath
        ]);
        let out = "";
        ff.stdout.on("data", d => out += d);
        ff.on("close", () => {
            try {
                const info = JSON.parse(out);
                const hasAudio = info.streams?.some(s => s.codec_type === "audio");
                if (hasAudio) return resolve(true);
                const vStream = info.streams?.find(s => s.codec_type === "video");
                const dur = parseFloat(vStream?.duration || "0");
                const frames = parseInt(vStream?.nb_frames || "0", 10);
                resolve(frames > 30 || dur > 1);
            } catch { resolve(false); }
        });
        ff.on("error", () => resolve(false));
    });
}

async function isVideoFile(filePath) {
    if (isVideoFileMagic(filePath)) return true;
    return detectIsVideoWithFfprobe(filePath);
}

// ─── HELPER: VIDEO → xoay animated webp (không dùng -loop 1) ─────────────────
function ffmpegVideoRotateToWebp(inputPath, outputPath, duration = 4, fps = 15, speed = 1) {
    return new Promise((resolve, reject) => {
        const args = [
            "-y", "-threads", "1",
            "-i", inputPath,
            "-vf", [
                "scale=360:360:force_original_aspect_ratio=decrease",
                "pad=360:360:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                `rotate=2*PI*t*${speed}:c=0x00000000:ow=512:oh=512`,
                "format=rgba"
            ].join(","),
            "-t", String(duration),
            "-r", String(fps),
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            outputPath
        ];
        const ff = spawn(ffmpegPath, args);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg video-rotate code ${code}\n${errs.join("").slice(-300)}`)));
        ff.on("error", reject);
    });
}

// ─── HELPER: VIDEO → circle crop animated webp (không dùng -loop 1) ──────────
function ffmpegVideoCircleToWebp(inputPath, outputPath, duration = 4, fps = 15) {
    return new Promise((resolve, reject) => {
        const vf = [
            "scale=512:512:force_original_aspect_ratio=increase",
            "crop=512:512",
            "format=rgba",
            "geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='if(lte(pow(X-W/2\\,2)+pow(Y-H/2\\,2)\\,pow(min(W\\,H)/2\\,2))\\,alpha(X\\,Y)\\,0)'"
        ].join(",");
        const args = [
            "-y", "-threads", "1",
            "-i", inputPath,
            "-vf", vf,
            "-t", String(duration),
            "-r", String(fps),
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            outputPath
        ];
        const ff = spawn(ffmpegPath, args);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg video-circle code ${code}\n${errs.join("").slice(-300)}`)));
        ff.on("error", reject);
    });
}

// ─── HELPER: FFMPEG CIRCLE MASK + XOAY → webp animated (ảnh tĩnh) ───────────
function ffmpegCircleRotateToWebp(inputPath, outputPath, duration = 3, fps = 20, speed = 1) {
    return new Promise((resolve, reject) => {
        const vf = [
            "scale=512:512:force_original_aspect_ratio=increase",
            "crop=512:512",
            "format=rgba",
            "geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='if(lte(pow(X-W/2\\,2)+pow(Y-H/2\\,2)\\,pow(min(W\\,H)/2\\,2))\\,alpha(X\\,Y)\\,0)'",
            `rotate=2*PI*t*${speed}:c=0x00000000:ow=512:oh=512`,
            "format=rgba"
        ].join(",");
        const args = [
            "-y", "-threads", "1",
            "-loop", "1", "-i", inputPath,
            "-vf", vf,
            "-t", String(duration),
            "-r", String(fps),
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            outputPath
        ];
        const ff = spawn(ffmpegPath, args);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg circle-rotate code ${code}\n${errs.join("").slice(-400)}`)));
        ff.on("error", reject);
    });
}

// ─── HELPER: VIDEO → circle mask + xoay animated webp ────────────────────────
function ffmpegVideoCircleRotateToWebp(inputPath, outputPath, duration = 4, fps = 15, speed = 1) {
    return new Promise((resolve, reject) => {
        const vf = [
            "scale=512:512:force_original_aspect_ratio=increase",
            "crop=512:512",
            "format=rgba",
            "geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='if(lte(pow(X-W/2\\,2)+pow(Y-H/2\\,2)\\,pow(min(W\\,H)/2\\,2))\\,alpha(X\\,Y)\\,0)'",
            `rotate=2*PI*t*${speed}:c=0x00000000:ow=512:oh=512`,
            "format=rgba"
        ].join(",");
        const args = [
            "-y", "-threads", "1",
            "-i", inputPath,
            "-vf", vf,
            "-t", String(duration),
            "-r", String(fps),
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            outputPath
        ];
        const ff = spawn(ffmpegPath, args);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg video-circle-rotate code ${code}\n${errs.join("").slice(-400)}`)));
        ff.on("error", reject);
    });
}

// ─── HELPER: FFMPEG XOAY → webp animated ─────────────────────────────────────
function ffmpegRotateToWebp(inputPath, outputPath, duration = 2, fps = 20, speed = 1) {
    return new Promise((resolve, reject) => {
        const args = [
            "-y", "-threads", "1",
            "-loop", "1", "-i", inputPath,
            "-vf", [
                "scale=360:360:force_original_aspect_ratio=decrease",
                "pad=360:360:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
                `rotate=2*PI*t*${speed}:c=0x00000000:ow=512:oh=512`,
                "format=rgba"
            ].join(","),
            "-t", String(duration),
            "-r", String(fps),
            "-c:v", "libwebp",
            "-lossless", "0",
            "-compression_level", "2",
            "-q:v", "75",
            "-loop", "0",
            "-an",
            outputPath
        ];
        const ff = spawn(ffmpegPath, args);
        const errs = [];
        ff.stderr.on("data", d => errs.push(String(d)));
        ff.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg rotate code ${code}\n${errs.join("").slice(-300)}`)));
        ff.on("error", reject);
    });
}

// ─── STK TRÒN ─────────────────────────────────────────────────────────────────
async function stkTronHandler(ctx) {
    const { api, threadId, threadType, message, senderId, senderName } = ctx;
    const tag = `@${senderName} `;
    const mediaUrl = await getMediaUrl(message);
    if (!mediaUrl) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Reply vào ảnh hoặc đính kèm ảnh để tớ crop tròn nhé!` },
            threadId, threadType
        );
    }

    await api.sendMessage({
        msg: tag + `${BOT_NAME}: Đang crop tròn sticker, chờ xíu nha~ ✨`,
        mentions: [{ uid: senderId, pos: 0, len: tag.length }]
    }, threadId, threadType);

    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const uid = `${senderId}_${Date.now()}`;
    const rawPath = path.join(tempDir, `tron_raw_${uid}`);
    const pngPath = path.join(tempDir, `tron_${uid}.png`);
    const circlePath = path.join(tempDir, `tron_circle_${uid}.png`);
    let webpPath = null;

    try {
        await downloadWithRetry(mediaUrl, rawPath);

        const isVideo = await isVideoFile(rawPath);
        if (isVideo) {
            // Video input: circle crop toàn bộ frames → animated webp
            webpPath = path.join(tempDir, `tron_vid_${uid}.webp`);
            await ffmpegVideoCircleToWebp(rawPath, webpPath);
        } else {
            // Ảnh: crop tròn qua skia-canvas → static webp
            const circleBuf = await cropCircleFromPath(rawPath, pngPath);
            fs.writeFileSync(circlePath, circleBuf);
            webpPath = await convertPngToWebpSticker(circlePath, uid);
        }

        if (!webpPath || !fs.existsSync(webpPath) || fs.statSync(webpPath).size === 0)
            throw new Error("Chuyển WebP thất bại");

        const webpUrl = await uploadToCatbox(webpPath);
        if (!webpUrl) throw new Error("Upload Catbox thất bại");

        await sendCustomStickerWithRetry(api, {
            animationImgUrl: webpUrl, staticImgUrl: webpUrl,
            threadId, type: 1, width: 512, height: 512
        });
    } catch (e) {
        log.error(`[stk tron] ${e.message}`);
        api.sendMessage({ msg: `➜ ❌ ${BOT_NAME}: Lỗi crop tròn: ${e.message}` }, threadId, threadType);
    } finally {
        for (const f of [rawPath, pngPath, circlePath, webpPath]) {
            if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch { }
        }
    }
}

// ─── HELPER: parse tốc độ xoay từ args ───────────────────────────────────────
function parseSpeed(args) {
    const speedMap = { cham: 0.5, chậm: 0.5, slow: 0.5, nhanh: 2, fast: 2, rtnhanh: 3, "rất nhanh": 3 };
    for (const a of args) {
        const lc = a.toLowerCase();
        if (speedMap[lc] !== undefined) return speedMap[lc];
        // chỉ parse số thuần (không có 's') làm tốc độ
        if (!/s$/.test(lc)) {
            const n = parseFloat(lc);
            if (!isNaN(n) && n > 0 && n <= 10) return n;
        }
    }
    return 1;
}

// ─── HELPER: parse thời lượng từ args (VD: 5s, 8s) ──────────────────────────
function parseDuration(args, defaultDur) {
    for (const a of args) {
        const lc = a.toLowerCase();
        const m = lc.match(/^(\d+(?:\.\d+)?)s$/);
        if (m) {
            const n = parseFloat(m[1]);
            if (n >= 1 && n <= 30) return n;
        }
    }
    return defaultDur;
}

// ─── STK XOAY ─────────────────────────────────────────────────────────────────
async function stkXoayHandler(ctx) {
    const { api, threadId, threadType, message, senderId, senderName, args } = ctx;
    const tag = `@${senderName} `;
    const speed = parseSpeed(args || []);
    const duration = parseDuration(args || [], 5);
    const mediaUrl = await getMediaUrl(message);
    if (!mediaUrl) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Reply vào ảnh/video hoặc đính kèm ảnh/video để tớ làm sticker xoay nhé!\nVD: .stk xoay 2 (nhanh x2), .stk xoay 8s (8 giây), .stk xoay 2 8s (nhanh x2, 8 giây)` },
            threadId, threadType
        );
    }

    const extraTxt = [speed !== 1 ? `tốc độ x${speed}` : "", duration !== 5 ? `${duration}s` : ""].filter(Boolean).join(", ");
    await api.sendMessage({
        msg: tag + `${BOT_NAME}: Đang tạo sticker xoay${extraTxt ? ` (${extraTxt})` : ""}, chờ xíu nha~ ✨`,
        mentions: [{ uid: senderId, pos: 0, len: tag.length }]
    }, threadId, threadType);

    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const uid = `${senderId}_${Date.now()}`;
    const rawPath = path.join(tempDir, `xoay_raw_${uid}`);
    const pngPath = path.join(tempDir, `xoay_${uid}.png`);
    const webpPath = path.join(tempDir, `xoay_${uid}.webp`);

    try {
        await downloadWithRetry(mediaUrl, rawPath);

        const isVideo = await isVideoFile(rawPath);
        if (isVideo) {
            await ffmpegVideoRotateToWebp(rawPath, webpPath, duration, 15, speed);
        } else {
            await ffmpegToPng(rawPath, pngPath);
            await ffmpegRotateToWebp(pngPath, webpPath, duration, 20, speed);
        }

        if (!fs.existsSync(webpPath) || fs.statSync(webpPath).size === 0)
            throw new Error("ffmpeg không tạo được file webp");

        const webpUrl = await uploadToCatbox(webpPath);
        if (!webpUrl) throw new Error("Upload Catbox thất bại");

        await sendCustomStickerWithRetry(api, {
            animationImgUrl: webpUrl, staticImgUrl: webpUrl,
            threadId, type: 1, width: 512, height: 512
        });
    } catch (e) {
        log.error(`[stk xoay] ${e.message}`);
        api.sendMessage({ msg: `➜ ❌ ${BOT_NAME}: Lỗi sticker xoay: ${e.message}` }, threadId, threadType);
    } finally {
        for (const f of [rawPath, pngPath, webpPath]) {
            if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch { }
        }
    }
}

// ─── STK XOAY + TRÒN (kết hợp) — hỗ trợ ảnh + video + tốc độ ───────────────
async function stkXoayTronHandler(ctx) {
    const { api, threadId, threadType, message, senderId, senderName, args } = ctx;
    const tag = `@${senderName} `;
    const speed = parseSpeed(args || []);
    const duration = parseDuration(args || [], 5);
    const mediaUrl = await getMediaUrl(message);
    if (!mediaUrl) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Reply vào ảnh/video hoặc đính kèm ảnh/video để tớ làm sticker xoay tròn nhé!\nVD: .stk xt 2 (nhanh x2), .stk xt 8s (8 giây), .stk xt 2 8s (nhanh x2, 8 giây)` },
            threadId, threadType
        );
    }

    const extraTxt = [speed !== 1 ? `tốc độ x${speed}` : "", duration !== 5 ? `${duration}s` : ""].filter(Boolean).join(", ");
    await api.sendMessage({
        msg: tag + `${BOT_NAME}: Đang tạo sticker xoay tròn${extraTxt ? ` (${extraTxt})` : ""}, chờ xíu nha~ ✨`,
        mentions: [{ uid: senderId, pos: 0, len: tag.length }]
    }, threadId, threadType);

    const tempDir = path.join(process.cwd(), "src/modules/cache/stk_temp");
    fs.mkdirSync(tempDir, { recursive: true });
    const uid = `${senderId}_${Date.now()}`;
    const rawPath = path.join(tempDir, `xt_raw_${uid}`);
    const pngPath = path.join(tempDir, `xt_${uid}.png`);
    const webpPath = path.join(tempDir, `xt_${uid}.webp`);

    try {
        await downloadWithRetry(mediaUrl, rawPath);

        const isVideo = await isVideoFile(rawPath);
        if (isVideo) {
            // Video: circle mask + xoay trong 1 pipeline, không cần chuyển PNG
            await ffmpegVideoCircleRotateToWebp(rawPath, webpPath, duration, 15, speed);
        } else {
            // Ảnh: chuyển PNG trước (xử lý JXL, AVIF, WEBP...) → circle + xoay
            await ffmpegToPng(rawPath, pngPath);
            await ffmpegCircleRotateToWebp(pngPath, webpPath, duration, 20, speed);
        }

        if (!fs.existsSync(webpPath) || fs.statSync(webpPath).size === 0)
            throw new Error("ffmpeg không tạo được file webp");

        const webpUrl = await uploadToCatbox(webpPath);
        if (!webpUrl) throw new Error("Upload Catbox thất bại");

        await sendCustomStickerWithRetry(api, {
            animationImgUrl: webpUrl, staticImgUrl: webpUrl,
            threadId, type: 1, width: 512, height: 512
        });
    } catch (e) {
        log.error(`[stk xt] ${e.message}`);
        api.sendMessage({ msg: `➜ ❌ ${BOT_NAME}: Lỗi sticker xoay tròn: ${e.message}` }, threadId, threadType);
    } finally {
        for (const f of [rawPath, pngPath, webpPath]) {
            if (f && fs.existsSync(f)) try { fs.unlinkSync(f); } catch { }
        }
    }
}

// ─── STICKER PACK (BẮT WEB ZALO) ──────────────────────────────────────────────
async function stkgoiHandler(ctx) {
    const { api, threadId, threadType, args } = ctx;
    const keyword = args.join(" ").trim() || "cute";

    try {
        await api.sendMessage(
            { msg: `${BOT_NAME}: Đang tìm sticker pack "${keyword}" trên Zalo... 🔍` },
            threadId, threadType
        );

        const raw = await api.searchSticker(keyword, 20);

        const data = raw?.data || raw;
        const packs = data?.sticker_catelist || data?.catelist || data?.packs || [];
        const stickerList = data?.sticker_list || data?.stickers || [];

        if (packs.length === 0 && stickerList.length === 0) {
            return api.sendMessage(
                {
                    msg: `${BOT_NAME}: Không tìm thấy sticker pack nào cho "${keyword}".\n` +
                        `📦 Raw keys: ${Object.keys(data || {}).join(", ") || "(trống)"}`
                },
                threadId, threadType
            );
        }

        if (packs.length > 0) {
            const pack = packs[0];
            const cateId = pack.cate_id || pack.id || pack.catId;
            const packName = pack.name || pack.cate_name || `Pack ${cateId}`;

            let info = `📦 Sticker pack: ${packName} (ID: ${cateId})\n`;
            info += `Tổng packs tìm được: ${packs.length}\n`;

            if (cateId) {
                const detail = await api.getStickerCategoryDetail(cateId).catch(() => null);
                const stickers = detail?.data?.stickers || detail?.stickers || [];
                info += `Số sticker trong pack: ${stickers.length}`;

                if (stickers.length > 0) {
                    const s = stickers[Math.floor(Math.random() * stickers.length)];
                    await api.sendMessage({ msg: info }, threadId, threadType);
                    return api.sendSticker(s, threadId, threadType);
                }
            }

            return api.sendMessage({ msg: info }, threadId, threadType);
        }

        if (stickerList.length > 0) {
            const s = stickerList[Math.floor(Math.random() * stickerList.length)];
            await api.sendMessage(
                { msg: `${BOT_NAME}: Tìm được ${stickerList.length} sticker cho "${keyword}" 🎉` },
                threadId, threadType
            );
            return api.sendSticker(s, threadId, threadType);
        }
    } catch (e) {
        log.error(`[stkgoi] Lỗi: ${e.message}`);
        api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Lỗi bắt sticker pack: ${e.message}` },
            threadId, threadType
        );
    }
}

async function stkLinkHandler(ctx) {
    const { api, threadId, threadType, message, senderId, senderName, args } = ctx;
    const tag = `@${senderName} `;

    const mediaUrl = await getMediaUrl(message);
    if (!mediaUrl) {
        return api.sendMessage(
            { msg: `➜ 💡 ${BOT_NAME}: Hãy reply vào ảnh hoặc Sticker để tớ tạo link sticker (.zalostk) nhé!\nCú pháp: .stk link [Tên_Watermark]` },
            threadId, threadType
        );
    }

    try {

        let removeBg = false;
        let watermark = "LauNa_Bot";
        if (args.length > 0) {
            if (args[0].toLowerCase() === "xn") {
                removeBg = true;
                watermark = args.slice(1).join("_") || "LauNa_Bot";
            } else {
                watermark = args.join("_");
            }
        }
        watermark = watermark.replace(/ /g, "_");

        await api.sendMessage({
            msg: tag + `${BOT_NAME}: Đang kéo file và úp mây Zalo để đóng mộc Watermark ${removeBg ? "(+ Xóa nền) " : ""}cho cậu nha~ ✨`,
            mentions: [{ uid: senderId, pos: 0, len: tag.length }]
        }, threadId, threadType);

        const uniqueId = `stklink_${Date.now()}`;
        const filePath = await convertToWebp(mediaUrl, uniqueId, removeBg); // ÉP KIỂU WEBP STICKER CHUẨN ZALO
        
        if (!filePath || !fs.existsSync(filePath)) {
            throw new Error("Không thể convert hình thành sticker webp!");
        }

        // API Upload native của ZCA-JS sẽ trả về [{ fileId, fileUrl, hdUrl... }]
        const uploadResults = await api.uploadAttachment(filePath, threadId, threadType);
        if (!uploadResults || uploadResults.length === 0) {
            throw new Error("Upload Zalo CDN thất bại!");
        }
        
        const uploadedUrl = uploadResults[0].hdUrl || uploadResults[0].fileUrl || uploadResults[0].url || uploadResults[0].normalUrl;
        if (!uploadedUrl) throw new Error("Server Zalo không nhả lại link ảnh gốc!");
        
        // Ghép mộc parameter ảo đằng sau để lừa phần mềm Zalo bung Sticker
        const finalLink = `${uploadedUrl}?Sticker_By_${watermark}.zalostk`;

        // 1. Gửi link text để user có thể copy/share
        await api.sendMessage({ msg: `🔗 Link Sticker: ${finalLink}` }, threadId, threadType);

        // 2. Ép gửi ra dạng Sticker thực thụ
        await sendCustomStickerWithRetry(api, {
            animationImgUrl: finalLink,
            staticImgUrl: finalLink,
            threadId,
            type: 1,
            width: 512,
            height: 512
        });

        if (fs.existsSync(filePath)) try { fs.unlinkSync(filePath); } catch(e){}
    } catch (e) {
        const errMsg = e?.message || String(e);
        log.error(`Lỗi STK LINK: ${errMsg}`);
        api.sendMessage(
            { msg: `➜ ❌ ${BOT_NAME}: Á đù, lỗi hệ thống: ${errMsg}` },
            threadId, threadType
        );
    }
}

export const commands = {
    stk: async (ctx) => {
        const sub = (ctx.args?.[0] || "").toLowerCase();
        if (sub === "xn" || sub === "xoanen") return xoaNenHandler(ctx, true);
        if (sub === "xp" || sub === "xoaphong") return stkHandler(ctx, true);
        if (sub === "ai") return stkiaHandler({ ...ctx, args: ctx.args.slice(1) });
        if (sub === "tron" || sub === "tròn") return stkTronHandler({ ...ctx, args: ctx.args.slice(1) });
        if (sub === "xoay") return stkXoayHandler({ ...ctx, args: ctx.args.slice(1) });
        if (sub === "xt" || sub === "xoaytron") return stkXoayTronHandler({ ...ctx, args: ctx.args.slice(1) });
        if (sub === "link") return stkLinkHandler({ ...ctx, args: ctx.args.slice(1) });
        await stkHandler(ctx);
    },
    stkxp: async (ctx) => {
        await stkHandler(ctx, true);
    },
    taostk: async (ctx) => {
        await taostkHandler(ctx);
    },
    xoanen: async (ctx) => {
        await xoaNenHandler(ctx, false);
    },
    xn: async (ctx) => {
        await xoaNenHandler(ctx, false);
    },
    stkgoi: async (ctx) => {
        await stkgoiHandler(ctx);
    },
};
