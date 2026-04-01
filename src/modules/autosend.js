import fs from "node:fs";
import path from "node:path";
import moment from "moment-timezone";
import axios from "axios";
import { exec } from "child_process";
import { createCanvas, loadImage } from "canvas";
import ffmpegStatic from "ffmpeg-static";
const ffmpeg = (typeof ffmpegStatic === "object" && ffmpegStatic.path) ? ffmpegStatic.path : ffmpegStatic;
import { log } from "../logger.js";
import { rentalManager } from "../utils/rentalManager.js";
import { threadSettingsManager } from "../utils/threadSettingsManager.js";
import { statsManager } from "../utils/statsManager.js";
import { tempDir } from "../utils/io-json.js";
import { searchNCT } from "../utils/nhaccuatui.js";
import { autoSendHotMusic } from "./hotMusic.js";

const HISTORY_PATH = path.join(process.cwd(), "src/modules/cache/autosend_history.json");

const MEDIA_PATHS = {
    video_gai: path.join(process.cwd(), "src/modules/cache/vdgai.json"),
    anime: path.join(process.cwd(), "src/modules/cache/vdanime.json"),
    anh_gai: path.join(process.cwd(), "src/modules/cache/gai.json")
};

const sysBrand = "[ 🔔 SYSTEM NOTIFICATION ] : ";

// --- THIẾT LẬP THÔNG BÁO THEO GIỜ CỦA USER ---
const notificationSetting = [
    { timer: '06:00:00 AM', message: ['Chúc mọi người buổi sáng vui vẻ😉', 'Buổi sáng đầy năng lượng nhaa các bạn😙', 'Dậy đi học và đi làm nào mọi người ơi😁', 'Dậy sớm thành công rồi đó, cố lên nhé!💪'] },
    { timer: '08:00:00 AM', message: ['Dậy đê ngủ như heo😒', 'Tính nướng tới bao giờ đây😠', 'Ai chưa dậy thì lỡ giờ học giờ làm ráng chịu đó nha🤨'] },
    { timer: '11:30:00 AM', message: ['Chúc mọi người buổi trưa vui vẻ😋', 'Cả sáng mệt mỏi rùi nghỉ ngơi nạp năng lượng nào!!😴', 'Đến giờ ăn trưa rồi nè, đừng bỏ bữa nhé🍱'] },
    { timer: '01:00:00 PM', message: ['Chúc mọi người buổi chiều vui vẻ🙌', 'Chúc mọi người buổi chiều đầy năng lượng😼', 'Nghỉ trưa xíu rồi bắt đầu buổi chiều nha😇'] },
    { timer: '05:00:00 PM', message: ['Hết giờ làm rồi về nhà thôi mọi người 😎', 'Chiều rồi, xả stress thôi nào 🎉', 'Đi làm hay đi học về nhớ tắm rửa ăn uống nha 🚿🍚'] },
    { timer: '07:16:00 PM', message: ['Tối rồi, nghỉ ngơi đi mọi người 🥱', 'Tối nay có ai rảnh đi chơi hông nè? 😜', 'Nhớ ăn tối đầy đủ nhé, giữ sức khỏe 💪'] },
    { timer: '10:00:00 PM', message: ['Khuya ròi ngủ đuy😴', 'Tới giờ lên giường ngủ rùi😇', 'Ngủ sớm cho da đẹp dáng xinh nha💤'] },
    { timer: '11:00:00 PM', message: ['Chúc mọi người ngủ ngon😴', 'Khuya rùi ngủ ngon nhé các bạn😇', 'Tắt điện thoại và đi ngủ thôi 📴🛌'] },
    { timer: '12:00:00 AM', message: ['Bây giờ bot sẽ ngủ😗', 'Bot ngủ đây tạm biệt mọi người😘', 'Chúc ai còn thức một đêm an yên nhé🌙'] }
];

const notificationTemplate = `➢𝐍𝐨𝐭𝐢𝐟𝐢𝐜𝐚𝐭𝐢𝐨𝐧🏆\n➝ Bây Giờ Là: %time_now\n➝ Đây Là Tin Nhắn Tự Động\n━━━━━━━━━━━\n[ 𝗡𝗢̣̂𝗜 𝗗𝗨𝗡𝗚 ]  %content`;

// --- HÀM HỖ TRỢ ---
function loadHistory() { try { if (!fs.existsSync(HISTORY_PATH)) return []; return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8")); } catch { return []; } }
function saveHistory(data) { try { fs.writeFileSync(HISTORY_PATH, JSON.stringify(data, null, 2), "utf-8"); } catch { } }

async function getUniqueMedia(type) {
    try {
        if (type === "hotmusic" || type === "nct") {
            const hotSongs = await searchNCT("top 10 nhạc trẻ");
            return hotSongs[Math.floor(Math.random() * hotSongs.length)] || null;
        }
        const filePath = MEDIA_PATHS[type] || MEDIA_PATHS.video_gai;
        if (!fs.existsSync(filePath)) return null;
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const list = Array.isArray(data) ? data : (data.urls || data.data || []);
        if (list.length === 0) return null;
        const history = loadHistory();
        const filtered = list.filter(url => !history.includes(url));
        const targetList = filtered.length > 0 ? filtered : list;
        if (filtered.length === 0) saveHistory([]);
        const selected = targetList[Math.floor(Math.random() * targetList.length)];
        if (filtered.length > 0) { history.push(selected); if (history.length > 1000) history.shift(); saveHistory(history); }
        return selected;
    } catch (e) { return null; }
}

async function processImage(inputPath, outputPath, hour) {
    try {
        const img = await loadImage(inputPath);
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        const overlayW = 400, overlayH = 120, x = 30, y = 30;
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(x, y, overlayW, overlayH);
        ctx.strokeStyle = "#00afea"; ctx.lineWidth = 4; ctx.strokeRect(x, y, overlayW, overlayH);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 35px Sans"; ctx.fillText(`THÔNG BÁO GIỜ MỚI`, x + 20, y + 50);
        ctx.fillStyle = "#00afea"; ctx.font = "bold 45px Sans"; ctx.fillText(`${hour}:00`, x + 20, y + 100);
        fs.writeFileSync(outputPath, canvas.toBuffer("image/jpeg")); return true;
    } catch (e) { return false; }
}

async function processVideo(inputPath, outputPath, hour) {
    return new Promise((resolve) => {
        const drawtext = `drawtext=text='THÔNG BÁO GIỜ MỚI - ${hour}\\:00':fontcolor=white:fontsize=40:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-80`;
        const cmd = `"${ffmpeg}" -y -i "${inputPath}" -vf "${drawtext}" -codec:a copy -t 15 "${outputPath}"`;
        exec(cmd, (err) => resolve(!err));
    });
}

// --- TICKER CHÍNH ---
export async function startAutosendTicker(api) {
    log.system("⏳ Động cơ Autosend v4.6 (Consolidated Media) đã sẵn sàng!");

    let lastHourProcessed = moment().tz("Asia/Ho_Chi_Minh").hour();

    setInterval(async () => {
        const nowMoment = moment().tz("Asia/Ho_Chi_Minh");
        const hour = nowMoment.hour();
        const timeNowStr = nowMoment.format('hh:mm:ss A'); // So khớp định dạng "06:00:00 AM"

        // 1. CHẾ ĐỘ THÔNG BÁO GIỜ CHÍNH XÁC (NOTIF)
        const matchedNoti = notificationSetting.find(item => item.timer === timeNowStr);
        if (matchedNoti) {
            log.info(`[Autosend] Phát hiện giờ thông báo: ${timeNowStr}`);
            handleNotificationBroadcast(api, matchedNoti, timeNowStr).catch(e => log.error("Noti broadcast fail:", e.message));
        }

        // 2. CHẾ ĐỘ GIỜ MỚI (HOURLY)
        if (hour !== lastHourProcessed) {
            log.info(`[Autosend] Kích hoạt giờ mới: ${hour}:00`);
            lastHourProcessed = hour;
            const threads = statsManager.getAllThreads();
            for (const tid of threads) {
                const config = threadSettingsManager.get(tid, "autosend", { enabled: false, type: "video_gai" });
                if (!config.enabled || !rentalManager.isRented(tid)) continue;
                if (config.type === "hotmusic") {
                    api.sendMessage({ msg: `[ 🔔 SYSTEM NOTIFICATION ]\n─────────────────\n💎 Bây giờ là: ${hour}:00\n🔥 Đang chọn ngẫu nhiên bài hát Remix/Zing Chart hot nhất gửi các bạn! 🚀` }, tid, 1).catch(()=>{});
                    autoSendHotMusic(api, log).catch(e => log.error(`HotMusic error for ${tid}:`, e.message));
                    continue;
                }
                sendMediaForThread(api, tid, config, hour).catch(e => log.error(`Autosend error for ${tid}:`, e.message));
            }
        }
    }, 1000); 
}

async function handleNotificationBroadcast(api, matched, timeStr) {
    const randomMessage = matched.message[Math.floor(Math.random() * matched.message.length)];
    const msg = notificationTemplate
        .replace(/%time_now/g, timeStr)
        .replace(/%content/g, randomMessage);

    // Tải media ngẫu nhiên tự dộng (dùng chung video_gai cache)
    let mediaPath = null;
    const driveUrl = await getUniqueMedia("video_gai");
    if (driveUrl) {
        try {
            const tempFile = path.join(tempDir, `noti_${Date.now()}.mp4`);
            const res = await axios({ method: 'get', url: driveUrl, responseType: 'stream', timeout: 60000 });
            const writer = fs.createWriteStream(tempFile);
            res.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            if (fs.existsSync(tempFile)) mediaPath = tempFile;
        } catch (e) { log.error("Load Noti Media fail:", e.message); }
    }

    const threads = statsManager.getAllThreads();
    for (const tid of threads) {
        const config = threadSettingsManager.get(tid, "autosend", { enabled: false });
        if (!config.enabled || !rentalManager.isRented(tid)) continue;

        if (mediaPath) {
            await api.sendVideoUnified({ videoPath: mediaPath, msg: msg, threadId: tid, threadType: 1 }).catch(() => { });
        } else {
            await api.sendMessage({ msg: msg, ttl: 300000 }, tid, 1).catch(() => { });
        }
    }

    if (mediaPath && fs.existsSync(mediaPath)) setTimeout(() => { try { fs.unlinkSync(mediaPath); } catch { } }, 15000);
}

async function sendMediaForThread(api, tid, config, hour) {
    const media = await getUniqueMedia(config.type);
    if (!media) return;
    const msgCaption = `[ 🔔 SYSTEM NOTIFICATION ]\n─────────────────\n💎 Bây giờ là: ${hour}:00\n✨ Chúc nhóm mình một giờ mới tốt lành! 🚀\n─────────────────`;
    if (config.type === "nct") {
        const stream = media.streamURL?.find(s => s.type === "320") || media.streamURL?.[0];
        if (stream?.stream) {
            await api.sendMessage({ msg: msgCaption + `\n🎼 Gợi ý nhạc giờ mới: ${media.name}` }, tid, 1);
            await api.sendVoiceNative({ voiceUrl: stream.stream, duration: media.duration || 0, threadId: tid, threadType: 1 });
        }
        return;
    }
    const mediaUrl = typeof media === 'string' ? media : (media.urls?.[0] || media.url);
    const tempIn = path.join(tempDir, `in_${Date.now()}_${tid}.tmp`);
    const tempOut = path.join(tempDir, `out_${Date.now()}_${tid}.${config.type === "anh_gai" ? "jpg" : "mp4"}`);
    try {
        const response = await axios({ method: 'get', url: mediaUrl, responseType: 'stream', timeout: 60000 });
        const writer = fs.createWriteStream(tempIn); response.data.pipe(writer);
        await new Promise((res, rej) => { writer.on('finish', res); writer.on('error', rej); });
        const isVideo = config.type !== "anh_gai";
        let success = false;
        if (isVideo) success = await processVideo(tempIn, tempOut, hour); else success = await processImage(tempIn, tempOut, hour);
        const finalFile = success ? tempOut : tempIn;
        if (isVideo) await api.sendVideoUnified({ videoPath: finalFile, msg: msgCaption, threadId: tid, threadType: 1 });
        else await api.sendMessage({ msg: msgCaption, attachments: [finalFile] }, tid, 1);
    } catch (err) { } finally {
        if (fs.existsSync(tempIn)) try { fs.unlinkSync(tempIn); } catch(e){}
        if (fs.existsSync(tempOut)) try { fs.unlinkSync(tempOut); } catch(e){}
    }
}

export const commands = {
    autosend: async (ctx) => {
        const { api, threadId, threadType, args, senderId, adminIds } = ctx;
        if (!adminIds.includes(String(senderId))) return;
        const action = args[0]?.toLowerCase();
        let config = threadSettingsManager.get(threadId, "autosend", { enabled: false, type: "video_gai" });
        if (action === "on") {
            config.enabled = true; threadSettingsManager.set(threadId, "autosend", config);
            return api.sendMessage({ msg: `${sysBrand}✅ Đã BẬT Autosend! Bot sẽ gửi Media giờ mới & Thông báo định kỳ.` }, threadId, threadType);
        } else if (action === "off") {
            config.enabled = false; threadSettingsManager.set(threadId, "autosend", config);
            return api.sendMessage({ msg: `${sysBrand}🚨 Đã TẮT Autosend.` }, threadId, threadType);
        } else if (["video", "anime", "anh", "nct", "hotmusic"].includes(action)) {
            const typeMap = { "video": "video_gai", "anime": "anime", "anh": "anh_gai", "nct": "nct", "hotmusic": "hotmusic" };
            config.enabled = true; config.type = typeMap[action]; threadSettingsManager.set(threadId, "autosend", config);
            return api.sendMessage({ msg: `${sysBrand}🎯 Đã đổi loại: ${action.toUpperCase()}!` }, threadId, threadType);
        } else {
            const status = config.enabled ? "ĐANG BẬT ✅" : "ĐANG TẮT ❌";
            let msg = `${sysBrand}[ ⚙️ CÀI ĐẶT AUTOSEND MULTI ]\n─────────────────\n💡 !autosend on/off | video | anime | anh | nct | hotmusic\n─────────────────\n📊 Trạng thái: ${status}\n🎁 Loại Media: ${config.type}\n🕒 Schedules: 06:00, 08:00, 11:30, 01:00, 05:00, 07:16, 10:00, 11:00, 12:00`;
            return api.sendMessage({ msg }, threadId, threadType);
        }
    }
};
