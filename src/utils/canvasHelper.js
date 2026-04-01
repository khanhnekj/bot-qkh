import { createCanvas, registerFont, loadImage } from "canvas";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

const fontPath = path.join(process.cwd(), "src/modules/cache/BeVietnamPro-Bold.ttf");
const emojiPath = path.join(process.cwd(), "src/modules/cache/NotoEmoji-Bold.ttf");

// Register fonts once
try {
    registerFont(fontPath, { family: "BeVietnamPro", weight: "bold" });
    registerFont(fontPath, { family: "BeVietnamProBold" });
    registerFont(emojiPath, { family: "NotoEmoji", weight: "bold" });
    registerFont(emojiPath, { family: "NotoEmojiBold" });
} catch (e) { }

/**
 * Shared Utils
 */
const msToTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

function drawRoundRect(ctx, x, y, width, height, radius) {
    if (radius === undefined) radius = 0;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

/**
 * MUSIC CANVAS FUNCTIONS
 */

export async function drawSoundCloudSearch(songs, query) {
    const width = 1280;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const themeColor = "#ff5500"; // SoundCloud Orange

    // 1. Background Dark Premium
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "rgba(255, 85, 0, 0.2)");
    bgGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Header & Hướng dẫn (In thẳng lên Canvas)
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px BeVietnamProBold, 'Segoe UI Emoji', Arial, Sans";
    ctx.fillText("SOUNDCLOUD", 50, 80);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "bold 24px BeVietnamProBold, 'Segoe UI Emoji', Arial, Sans";
    ctx.fillText(`KẾT QUẢ: ${query.toUpperCase()}`, 480, 75);

    // 3. Grid Setup (2 Cột x 5 Hàng)
    const paddingX = 50;
    const paddingY = 120;
    const itemW = 570;
    const itemH = 100;
    const gapX = 40;
    const gapY = 15;

    for (let i = 0; i < Math.min(songs.length, 10); i++) {
        const s = songs[i];
        const col = i >= 5 ? 1 : 0;
        const row = i % 5;
        const x = paddingX + (col * (itemW + gapX));
        const y = paddingY + (row * (itemH + gapY));

        // Card Box
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        drawRoundRect(ctx, x, y, itemW, itemH, 20);
        ctx.fill();

        // Thumb
        try {
            const thumbUrl = (s.thumbnail || s.thumb || s.artwork_url || "").replace("t120x120", "t240x240");
            if (thumbUrl) {
                const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, x + 10, y + 10, 80, 80, 15);
                ctx.clip();
                ctx.drawImage(img, x + 10, y + 10, 80, 80);
                ctx.restore();
            }
        } catch (e) { }

        // Index Badge (STT)
        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px BeVietnamProBold, Sans";
        ctx.textAlign = "center";
        ctx.fillText(i + 1, x + 10, y + 17);

        // Name & Artist
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, 'Segoe UI Emoji', 'Microsoft YaHei', Arial, Sans";
        let title = s.title || "No Title";
        if (ctx.measureText(title).width > 420) {
            let tr = Array.from(title);
            while (ctx.measureText(tr.join("") + "...").width > 420 && tr.length > 0) tr.pop();
            title = tr.join("") + "...";
        }
        ctx.fillText(title, x + 105, y + 40);

        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = "18px BeVietnamPro, NotoEmojiBold, 'Segoe UI Emoji', 'Microsoft YaHei', Arial, Sans";
        let artist = s.user?.username || "Artist";
        if (ctx.measureText(artist).width > 300) {
            let ta = Array.from(artist);
            while (ctx.measureText(ta.join("") + "...").width > 300 && ta.length > 0) ta.pop();
            artist = ta.join("") + "...";
        }
        const durStr = typeof s.duration === 'number' ? msToTime(s.duration) : (s.duration || "00:00");
        ctx.fillText(`${artist}  •  ${durStr}`, x + 105, y + 80);
    }

    // Branding chân trang
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "bold 16px BeVietnamPro, Sans";
    ctx.fillText("POWERED BY ZALO BOT • DGK SYSTEM", width / 2, height - 20);

    return canvas.toBuffer("image/png");
}

export async function drawZingSearch(songs, query, sourceName = "ZING MP3") {
    const sourceUpper = sourceName.toUpperCase();
    const isScl = sourceUpper === "SOUNDCLOUD";
    const isNct = sourceUpper === "NHACCUATUI";
    const isYt = sourceUpper.includes("YOUTUBE");
    const isSpt = sourceUpper === "SPOTIFY";

    // Theme Colors
    let themeColor = "#8a3ab9"; // Default Zing Purple
    if (isScl) themeColor = "#ff5500"; 
    else if (isNct) themeColor = "#00afea"; 
    else if (isYt) themeColor = "#ff0000"; 
    else if (isSpt) themeColor = "#1DB954"; 

    const width = 1280;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background Phẳng (Dark)
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, `${themeColor}33`); // 20% opacity
    bgGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Header & Hướng dẫn
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px BeVietnamProBold, 'Segoe UI Emoji', Arial, Sans";
    ctx.fillText(sourceUpper.replace(" MUSIC", ""), 50, 80);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "bold 24px BeVietnamProBold, 'Segoe UI Emoji', Arial, Sans";
    ctx.fillText(`KẾT QUẢ: ${query.toUpperCase()}`, 480, 75);

    // Dòng hướng dẫn quan trọng (In vào Badge Box)
    const instrText = "➜ PHẢN HỒI STT (1-10) ĐỂ TẢI NHẠC";
    ctx.font = "bold 26px BeVietnamProBold, Sans";
    const textWidth = ctx.measureText(instrText).width;
    const badgeW = textWidth + 60;
    const badgeH = 55;
    const badgeX = width - badgeW - 50;
    const badgeY = 45;

    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 15;
    ctx.fillStyle = themeColor;
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(instrText, badgeX + (badgeW / 2), badgeY + 36);

    // 3. Grid Setup (2 Cột x 5 Hàng)
    const paddingX = 50;
    const paddingY = 120;
    const itemW = 570;
    const itemH = 100;
    const gapX = 40;
    const gapY = 15;

    for (let i = 0; i < Math.min(songs.length, 10); i++) {
        const s = songs[i];
        const col = i >= 5 ? 1 : 0;
        const row = i % 5;
        const x = paddingX + (col * (itemW + gapX));
        const y = paddingY + (row * (itemH + gapY));

        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        drawRoundRect(ctx, x, y, itemW, itemH, 20);
        ctx.fill();

        try {
            const thumbUrl = (s.thumbnail || s.thumb || s.artwork_url || "").replace("w94", "w240");
            if (thumbUrl) {
                const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, x + 10, y + 10, 80, 80, 15);
                ctx.clip();
                
                const imgRatio = img.width / img.height;
                let sWidth = img.width, sHeight = img.height, sx = 0, sy = 0;
                if (imgRatio > 1) {
                    sWidth = img.height;
                    sx = (img.width - sWidth) / 2;
                } else {
                    sHeight = img.width;
                    sy = (img.height - sHeight) / 2;
                }
                ctx.drawImage(img, sx, sy, sWidth, sHeight, x + 10, y + 10, 80, 80);
                ctx.restore();
            }
        } catch (e) { }

        ctx.fillStyle = themeColor;
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 18px BeVietnamProBold, Sans";
        ctx.textAlign = "center";
        ctx.fillText(i + 1, x + 10, y + 17);

        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, 'Segoe UI Emoji', 'Microsoft YaHei', Arial, Sans";
        let title = s.title || "No Title";
        if (ctx.measureText(title).width > 420) {
            let tr = Array.from(title);
            while (ctx.measureText(tr.join("") + "...").width > 420 && tr.length > 0) tr.pop();
            title = tr.join("") + "...";
        }
        ctx.fillText(title, x + 105, y + 40);

        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = "18px BeVietnamPro, NotoEmojiBold, 'Segoe UI Emoji', 'Microsoft YaHei', Arial, Sans";
        let artist = s.artistsNames || (s.user ? s.user.username : "Artist");
        if (ctx.measureText(artist).width > 300) {
            let ta = Array.from(artist);
            while (ctx.measureText(ta.join("") + "...").width > 300 && ta.length > 0) ta.pop();
            artist = ta.join("") + "...";
        }
        
        let duration = "00:00";
        if (s.duration) {
            if (typeof s.duration === 'string' && s.duration.includes(':')) {
                duration = s.duration;
            } else {
                const secs = Number(s.duration);
                // > 10000 => miliseconds (SoundCloud), ngược lại là giây (Zing/NCT)
                const totalSec = secs > 10000 ? Math.floor(secs / 1000) : secs;
                const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
                const ss = (totalSec % 60).toString().padStart(2, '0');
                duration = `${mm}:${ss}`;
            }
        }
        ctx.fillText(`${artist}  •  ${duration}`, x + 105, y + 80);
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "bold 16px BeVietnamPro, Sans";
    ctx.fillText(`POWERED BY ZALO BOT • ${sourceUpper} SYSTEM`, width / 2, height - 20);

    return canvas.toBuffer("image/png");
}


export async function drawZingPlayer(song) {
    const width = 1100;
    const height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const sourceUpper = (song.sourceName || "Zing MP3").toUpperCase();
    const isScl = sourceUpper === "SOUNDCLOUD";
    const isNct = sourceUpper === "NHACCUATUI";
    const isYt = sourceUpper.includes("YOUTUBE");

    let themeColor = "#8a3ab9"; // Default Zing Purple
    let themeColorSecondary = "#5e1a8a";
    if (isScl) {
        themeColor = "#ff5500";
        themeColorSecondary = "#cc4400";
    } else if (isNct) {
        themeColor = "#00afea";
        themeColorSecondary = "#0086b3";
    } else if (isYt) {
        themeColor = "#ff0000";
        themeColorSecondary = "#800000";
    }

    let img = null;
    try {
        const thumbUrl = (song.thumbnail || song.thumb || "").replace("w94", "w500");
        if (thumbUrl && thumbUrl.startsWith("http")) {
            const response = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
            img = await loadImage(Buffer.from(response.data));
        }
    } catch (e) { }

    // 1. Vibrant Background Gradient (Platform Specific)
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, themeColorSecondary);
    bgGrad.addColorStop(1, themeColor);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur
    if (img) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.filter = 'blur(60px)';
        ctx.drawImage(img, -100, -100, width + 200, height + 200);
        ctx.restore();
    }

    // 2. Main Card (Dark Glass)
    const cardW = 900;
    const cardH = 360;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2;

    // Card Shadow
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 40;
    ctx.fillStyle = "rgba(15, 15, 20, 0.85)";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 35);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 3. Album Art (Rectangular/Square on the left)
    const artSize = cardH; // Flush with top/bottom
    if (img) {
        ctx.save();
        drawRoundRect(ctx, cardX, cardY, artSize, artSize, 35);
        ctx.clip();

        // Calculate aspect ratio for object-fit: cover
        const imgRatio = img.width / img.height;
        const targetRatio = 1; // Square
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        if (imgRatio > targetRatio) {
            // Image is wider, crop horizontally
            sWidth = img.height * targetRatio;
            sx = (img.width - sWidth) / 2;
        } else {
            // Image is taller, crop vertically
            sHeight = img.width / targetRatio;
            sy = (img.height - sHeight) / 2;
        }

        // Draw the image properly scaled and centered
        ctx.drawImage(img, sx, sy, sWidth, sHeight, cardX, cardY, artSize, artSize);
        ctx.restore();
    } else {
        ctx.fillStyle = "#222";
        drawRoundRect(ctx, cardX, cardY, artSize, artSize, 35);
        ctx.fill();
    }

    // Light border for art to separate from text area
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + artSize, cardY);
    ctx.lineTo(cardX + artSize, cardY + cardH);
    ctx.stroke();

    // 4. Content Area (Right Side)
    const textZoneX = cardX + artSize + 40;
    const textZoneW = cardW - artSize - 80;

    // Platform Name
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "bold 20px BeVietnamProBold, Sans";
    ctx.fillText(sourceUpper, textZoneX, cardY + 60);

    // Divider Line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(textZoneX, cardY + 75);
    ctx.lineTo(cardX + cardW - 40, cardY + 75);
    ctx.stroke();

    // Song Title (Large, Bold, Uppercase)
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px BeVietnamProBold, NotoEmojiBold, Sans";
    let title = (song.title || "Unknown").toUpperCase();
    if (ctx.measureText(title).width > textZoneW) {
        let truncated = title;
        while (ctx.measureText(truncated + "...").width > textZoneW && truncated.length > 0) truncated = truncated.slice(0, -1);
        title = truncated + "...";
    }
    ctx.fillText(title, textZoneX, cardY + 160);

    // Artist Names
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "bold 34px BeVietnamProBold, NotoEmojiBold, Sans";
    let artists = (song.artistsNames || "Unknown Artist").toUpperCase();
    if (ctx.measureText(artists).width > textZoneW) {
        let truncated = artists;
        while (ctx.measureText(truncated + "...").width > textZoneW && truncated.length > 0) truncated = truncated.slice(0, -1);
        artists = truncated + "...";
    }
    ctx.fillText(artists, textZoneX, cardY + 220);

    // Metadata / Status
    ctx.fillStyle = themeColor;
    ctx.font = "bold 20px BeVietnamProBold, Sans";
    if (song.processTime) {
        ctx.fillText(`⚡ PROCESSING: ${song.processTime}S`, textZoneX, cardY + 265);
    }

    // Duration (Bottom Right)
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "bold 28px BeVietnamProBold, Sans";
    // duration có thể là: string "mm:ss", number giây, hoặc number mili-giây
    let durationStr = "00:00";
    if (song.duration) {
        if (typeof song.duration === 'string' && song.duration.includes(':')) {
            durationStr = song.duration;
        } else {
            const secs = Number(song.duration);
            // Nếu > 10000 thì là ms (SoundCloud trả về ms), còn lại là giây (Zing, NCT)
            const totalSec = secs > 10000 ? Math.floor(secs / 1000) : secs;
            const mm = Math.floor(totalSec / 60).toString().padStart(2, '0');
            const ss = (totalSec % 60).toString().padStart(2, '0');
            durationStr = `${mm}:${ss}`;
        }
    }
    ctx.fillText(durationStr, cardX + cardW - 40, cardY + cardH - 40);

    return canvas.toBuffer("image/png");
}

export async function drawZingPlaylist(playlistInfo, songs) {
    const CARD_W = 700;
    const CARD_H = 100;
    const PADDING = 50;
    const HEADER_HEIGHT = 450;
    const FOOTER_HEIGHT = 60;
    const CARD_GAP = 15;

    const width = 800;
    const displaySongs = songs.slice(0, 10);
    const height = HEADER_HEIGHT + (displaySongs.length * (CARD_H + CARD_GAP)) + FOOTER_HEIGHT;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0f172a");
    bgGrad.addColorStop(0.5, "#1e293b");
    bgGrad.addColorStop(1, "#0f172a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.arc(0, 0, 400, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8b5cf6";
    ctx.beginPath(); ctx.arc(width, 500, 400, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 2. Playlist Header
    let playlistImg = null;
    try {
        const thumbUrl = (playlistInfo.thumbnailM || playlistInfo.thumbnail || "").replace("w165", "w600");
        if (thumbUrl && thumbUrl.startsWith("http")) {
            const response = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
            playlistImg = await loadImage(Buffer.from(response.data));

            // Draw blurred background under header
            ctx.save();
            ctx.filter = 'blur(50px)';
            ctx.globalAlpha = 0.4;
            ctx.drawImage(playlistImg, -100, -100, width + 200, HEADER_HEIGHT + 100);
            ctx.restore();
        }
    } catch (e) { }

    // Playlist Thumbnail
    const thumbSize = 240;
    const thumbX = (width - thumbSize) / 2;
    const thumbY = 40;
    if (playlistImg) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 30;
        drawRoundRect(ctx, thumbX, thumbY, thumbSize, thumbSize, 25);
        ctx.clip();
        ctx.drawImage(playlistImg, thumbX, thumbY, thumbSize, thumbSize);
        ctx.restore();
    }

    // Playlist Title
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px BeVietnamProBold, NotoEmojiBold, Sans";
    ctx.fillText(playlistInfo.title || "Zing MP3 Playlist", width / 2, thumbY + thumbSize + 55);

    // Playlist Artists/Description
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "bold 20px BeVietnamPro, Sans";
    const subTitle = playlistInfo.artistsNames || "Zing MP3 Official";
    ctx.fillText(subTitle, width / 2, thumbY + thumbSize + 85);

    // "TOP RANKING" Label
    ctx.fillStyle = "#3b82f6";
    drawRoundRect(ctx, width / 2 - 80, thumbY + thumbSize + 110, 160, 35, 17.5);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 18px BeVietnamProBold, Sans";
    ctx.fillText("BẢNG XẾP HẠNG", width / 2, thumbY + thumbSize + 134);

    // 3. Songs List
    ctx.textAlign = "left";
    for (let i = 0; i < displaySongs.length; i++) {
        const s = displaySongs[i];
        const y = HEADER_HEIGHT + (i * (CARD_H + CARD_GAP));
        const x = (width - CARD_W) / 2;

        // Card
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        drawRoundRect(ctx, x, y, CARD_W, CARD_H, 15);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        ctx.stroke();

        // Rank Number & Status
        const rank = i + 1;
        ctx.textAlign = "center";

        // Vẽ số thứ hạng
        ctx.fillStyle = (i < 3) ? (i === 0 ? "#fbbf24" : (i === 1 ? "#94a3b8" : "#92400e")) : "#ffffff";
        ctx.font = "bold 34px BeVietnamProBold, Sans";
        ctx.fillText(rank, x + 40, y + CARD_H / 2 + 5);

        // Vẽ trạng thái tăng/giảm hạng (Vét thông tin từ API)
        const status = s.rakingStatus || 0; // 1: up, -1: down, 0: stable, 2: new
        ctx.font = "bold 14px BeVietnamProBold, Sans";
        if (status === 1) {
            ctx.fillStyle = "#10b981"; // Green
            ctx.fillText("▲ " + (s.lastRank - rank || 1), x + 40, y + CARD_H / 2 + 25);
        } else if (status === -1) {
            ctx.fillStyle = "#ef4444"; // Red
            ctx.fillText("▼ " + (rank - s.lastRank || 1), x + 40, y + CARD_H / 2 + 25);
        } else if (status === 2) {
            ctx.fillStyle = "#3b82f6"; // Blue
            ctx.fillText("NEW", x + 40, y + CARD_H / 2 + 25);
        } else {
            ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
            ctx.fillText("-", x + 40, y + CARD_H / 2 + 25);
        }

        // Song Thumb
        try {
            const songThumbUrl = (s.thumbnail || s.thumb || "").replace("w94", "w240");
            if (songThumbUrl) {
                const response = await axios.get(songThumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(response.data));
                ctx.save();
                drawRoundRect(ctx, x + 85, y + 10, 80, 80, 12);
                ctx.clip();
                ctx.drawImage(img, x + 85, y + 10, 80, 80);
                ctx.restore();
            }
        } catch (e) { }

        // Info
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, Sans";
        let title = s.title;
        if (ctx.measureText(title).width > 420) title = title.substring(0, 25) + "...";
        ctx.fillText(title, x + 185, y + 40);

        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.font = "18px BeVietnamPro, Sans";
        let artist = s.artistsNames || "Unknown";
        if (ctx.measureText(artist).width > 420) artist = artist.substring(0, 30) + "...";
        ctx.fillText(artist, x + 185, y + 68);

        // Vét sạch thông tin: Lượt nghe | Điểm (nếu có)
        ctx.fillStyle = "#9deadd";
        ctx.font = "bold 16px BeVietnamPro, Sans";
        let extraInfo = [];
        if (s.listen) extraInfo.push(`🎧 ${s.listen.toLocaleString("vi-VN")}`);
        if (s.score) extraInfo.push(`🔥 ${s.score.toLocaleString("vi-VN")} điểm`);

        ctx.fillText(extraInfo.join("  |  "), x + 185, y + 92);

        // VIP Label
        if (s.streamingStatus === 3 || s.isVIP) {
            ctx.fillStyle = "#fbbf24";
            ctx.font = "bold 14px BeVietnamProBold, Sans";
            ctx.fillText("VIP", x + CARD_W - 50, y + 35);
        }
    }

    return canvas.toBuffer("image/png");
}

/**
 * WEATHER CANVAS FUNCTIONS
 */

export async function drawWeatherCard(data) {
    const width = 800, height = 1250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#334155");
    bg.addColorStop(1, "#0f172a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const margin = 30;
    const boxBg = "rgba(45, 45, 45, 0.8)";
    const textColor = "#ffffff";

    /** 1. TOP BOX: CURRENT WEATHER **/
    ctx.save();
    drawRoundRect(ctx, margin, margin, width - margin * 2, 280, 40);
    ctx.fillStyle = boxBg;
    ctx.fill();

    ctx.textAlign = "left";
    ctx.fillStyle = textColor;
    ctx.font = "bold 44px BeVietnamProBold, Sans";
    ctx.fillText(data.location.split(",")[0], margin + 30, margin + 70);

    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "bold 26px BeVietnamPro, Sans";
    ctx.fillText("Thời tiết hiện tại", margin + 30, margin + 115);

    ctx.textAlign = "right";
    ctx.fillStyle = textColor;
    ctx.font = "bold 34px BeVietnamPro, Sans";
    ctx.fillText(data.time, width - margin - 30, margin + 70);

    try {
        const icon = await loadImage(data.current.icon);
        ctx.drawImage(icon, margin + 30, margin + 150, 100, 100);
    } catch (e) { }

    ctx.textAlign = "left";
    ctx.font = "bold 90px BeVietnamProBold, Sans";
    ctx.fillText(`${Math.round(data.current.temp)}°`, margin + 150, margin + 225);
    ctx.font = "bold 28px BeVietnamPro, Sans";
    ctx.fillText("C", margin + 255, margin + 195);

    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "24px BeVietnamPro, Sans";
    ctx.fillText(`RealFeel® ${Math.round(data.current.feelsLike)}°`, margin + 150, margin + 260);
    ctx.fillText(data.current.condition, margin + 30, margin + 270);

    const rightLabelX = width - 280;
    const rightValX = width - margin - 30;
    const rows = [
        { l: "RealFeel Shade™", v: `${Math.round(data.current.temp - 1)}°` },
        { l: "Gió", v: `BTB ${Math.round(data.current.wind)} km/h` },
        { l: "Gió giật mạnh", v: `${Math.round(data.current.windGust)} km/h` },
        { l: "Chất lượng không khí", v: data.current.aqiLevel, c: data.current.aqiLevel === "Tốt" ? "#4ade80" : "#facc15" }
    ];

    rows.forEach((r, i) => {
        const y = margin + 130 + i * 42;
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "22px BeVietnamPro, Sans";
        ctx.fillText(r.l, rightLabelX, y);
        ctx.textAlign = "right";
        ctx.fillStyle = r.c || "#fff";
        ctx.fillText(r.v, rightValX, y);
    });
    ctx.restore();

    /** 2. HOURLY BOX **/
    ctx.save();
    const hourlyY = 340;
    drawRoundRect(ctx, margin, hourlyY, width - margin * 2, 220, 30);
    ctx.fillStyle = boxBg;
    ctx.fill();

    const hourW = (width - margin * 2) / 7;
    for (let i = 0; i < 7; i++) {
        const h = data.hourly[i];
        if (!h) break;
        const x = margin + i * hourW + hourW / 2;

        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "bold 24px BeVietnamPro, Sans";
        ctx.fillText(h.time, x, hourlyY + 45);

        try {
            const icon = await loadImage(h.icon);
            ctx.drawImage(icon, x - 35, hourlyY + 60, 70, 70);
        } catch (e) { }

        ctx.fillStyle = "#fff";
        ctx.font = "bold 26px BeVietnamPro, Sans";
        ctx.fillText(`${Math.round(h.temp)}°`, x, hourlyY + 160);

        ctx.fillStyle = "#93c5fd";
        ctx.font = "18px BeVietnamPro, Sans";
        ctx.fillText(`💧${h.pop}%`, x, hourlyY + 195);
    }
    ctx.restore();

    /** 3. ASTRONOMY & AQI **/
    ctx.save();
    const astroY = 590;
    const colW = (width - margin * 2 - 20) / 4;

    const drawSubBox = (x, y, w, h, icon, title, val1, val2) => {
        drawRoundRect(ctx, x, y, w, h, 20);
        ctx.fillStyle = boxBg;
        ctx.fill();
        ctx.textAlign = "center";
        ctx.fillStyle = "#fbbf24";
        ctx.font = "30px NotoEmoji";
        ctx.fillText(icon, x + w / 2, y + 45);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 22px BeVietnamPro, Sans";
        ctx.fillText(title, x + w / 2, y + 85);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "18px BeVietnamPro, Sans";
        ctx.fillText(val1, x + w / 2, y + 115);
        ctx.fillText(val2, x + w / 2, y + 145);
    };

    drawSubBox(margin, astroY, colW * 1.5, 220, "☀️", data.astronomy.sunDuration, `Mọc: ${data.astronomy.sunrise}`, `Lặn: ${data.astronomy.sunset}`);
    drawSubBox(margin + colW * 1.5 + 10, astroY, colW * 1.5, 220, "🌕", "Mặt Trăng", `Mọc: ${data.astronomy.moonrise}`, `Lặn: ${data.astronomy.moonset}`);

    const aqiX = margin + colW * 3 + 20;
    const aqiW = (width - margin) - aqiX;
    drawRoundRect(ctx, aqiX, astroY, aqiW, 220, 20);
    ctx.fillStyle = boxBg;
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px BeVietnamPro, Sans";
    ctx.fillText("Chất lượng không khí", aqiX + 20, astroY + 40);
    ctx.fillStyle = data.current.aqiLevel === "Tốt" ? "#4ade80" : "#facc15";
    ctx.fillText(data.current.aqiLevel, aqiX + 20, astroY + 75);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "16px BeVietnamPro, Sans";
    wrapText(ctx, data.current.aqiText, aqiX + 20, astroY + 110, aqiW - 40, 22);
    ctx.restore();

    /** 4. DAILY LIST **/
    ctx.save();
    const dailyY = 840;
    drawRoundRect(ctx, margin, dailyY, width - margin * 2, 320, 30);
    ctx.fillStyle = "rgba(20, 20, 20, 0.4)";
    ctx.fill();

    for (let i = 0; i < data.daily.length; i++) {
        const d = data.daily[i];
        const y = dailyY + 30 + i * 90;
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px BeVietnamPro, Sans";
        ctx.fillText(d.date, margin + 20, y + 15);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "18px BeVietnamPro, Sans";
        ctx.fillText(d.dayName, margin + 20, y + 45);

        try {
            const icon = await loadImage(d.icon);
            ctx.drawImage(icon, margin + 100, y - 5, 70, 70);
        } catch (e) { }

        ctx.fillStyle = "#fff";
        ctx.font = "bold 32px BeVietnamPro, Sans";
        ctx.fillText(`${Math.round(d.high)}°`, margin + 180, y + 25);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "24px BeVietnamPro, Sans";
        ctx.fillText(`${Math.round(d.low)}°`, margin + 250, y + 25);

        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "20px BeVietnamPro, Sans";
        const summary = d.condition;
        ctx.fillText(summary, margin + 330, y + 15);
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.fillText(summary, margin + 330, y + 45);

        ctx.textAlign = "right";
        ctx.fillStyle = "#93c5fd";
        ctx.font = "bold 24px BeVietnamPro, Sans";
        ctx.fillText(`${d.pop}% 💧`, width - margin - 30, y + 25);

        if (i < data.daily.length - 1) {
            ctx.strokeStyle = "rgba(255,255,255,0.05)";
            ctx.beginPath(); ctx.moveTo(margin + 20, y + 75); ctx.lineTo(width - margin - 20, y + 75); ctx.stroke();
        }
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText("Hệ thống Zalo Bot - Dự báo thời tiết thông minh v4.5", width / 2, height - 35);

    return canvas.toBuffer("image/png");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(" ");
    let line = "";
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + " ";
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

/**
 * USER INFO CANVAS
 */
const infoBgPath = path.join(process.cwd(), "src", "utils", "assets", "info_bg.jpg");

export async function drawUserInfo({ displayName, username, avatar, bio, onlineStatus, rank = "Thành viên", fields = [] }) {
    const width = 800, height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background
    let bgImg = null;
    try {
        if (fs.existsSync(infoBgPath)) bgImg = await loadImage(infoBgPath);
    } catch { }

    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        // Darker overlay for bright backgrounds (like yellow)
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, width, height);
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, width, height);
        bgGrad.addColorStop(0, "#0f172a");
        bgGrad.addColorStop(1, "#1e293b");
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
    }

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.arc(0, 0, 350, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // Rank Config
    const isGold = rank === "Vàng" || rank === "Key Vàng";
    const isSilver = rank === "Bạc" || rank === "Key Bạc";
    const isAdmin = rank === "Admin";
    const isVIP = isGold || isSilver || isAdmin;

    let rankColor = "#94a3b8";
    let glowColor = "rgba(148, 163, 184, 0.4)";
    if (isAdmin) { rankColor = "#ef4444"; glowColor = "rgba(239, 68, 68, 0.6)"; }
    else if (isGold) { rankColor = "#fbbf24"; glowColor = "rgba(251, 191, 36, 0.6)"; }
    else if (isSilver) { rankColor = "#cbd5e1"; glowColor = "rgba(203, 213, 225, 0.5)"; }

    // Avatar
    const avX = 90, avY = 90, avR = 75;
    let avImg = null;
    try {
        if (avatar && avatar.startsWith("http")) {
            const res = await axios.get(avatar, { responseType: 'arraybuffer', timeout: 5000 });
            avImg = await loadImage(Buffer.from(res.data));
        }
    } catch (e) { }

    // Outer Glow / Ring
    if (isVIP) {
        ctx.save();
        ctx.shadowColor = rankColor;
        ctx.shadowBlur = 25;
        ctx.strokeStyle = rankColor;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(avX, avY, avR + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    } else {
        const statusColor = onlineStatus === "online" ? "#10b981" : "#94a3b8";
        ctx.strokeStyle = statusColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(avX, avY, avR + 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    if (avImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
    } else {
        ctx.fillStyle = "#334155";
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    }

    // Rank Badge (Bottom Right of Avatar)
    if (isVIP) {
        const bx = avX + 45, by = avY + 45, br = 22;
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        
        // Ribbon or Circle
        ctx.fillStyle = rankColor;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.textAlign = "center";
        ctx.fillStyle = isAdmin ? "#fff" : "#000";
        ctx.font = "bold 14px BeVietnamProBold, Sans";
        let label = isAdmin ? "ADM" : (isGold ? "GOLD" : "SILV");
        ctx.fillText(label, bx, by + 5);
        ctx.restore();
    }

    // Online dot
    const statusColor = onlineStatus === "online" ? "#10b981" : "#94a3b8";
    ctx.fillStyle = statusColor;
    ctx.beginPath(); 
    ctx.arc(avX + avR * 0.75, avY - avR * 0.75, 12, 0, Math.PI * 2); 
    ctx.fill();
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Name & Username
    const textX = avX + avR + 50;
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    ctx.font = "bold 38px BeVietnamProBold, NotoEmojiBold, Sans";
    ctx.fillText(displayName || "Zalo User", textX, 70);

    if (username) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "20px BeVietnamPro, Sans";
        ctx.fillText(`@${username}`, textX, 95);
    }

    if (bio) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "italic 18px BeVietnamPro, Sans";
        ctx.fillText(bio.substring(0, 60), textX, 125);
    }

    // 3. Fields Section (Single column on the left to avoid character)
    const fieldStartX = 40;
    const fieldStartY = 190;
    const fieldGap = 55;
    const boxWidth = 380;

    fields.slice(0, 6).forEach((f, i) => {
        const fx = fieldStartX;
        const fy = fieldStartY + i * fieldGap;

        // Background box
        // Darker glass effect for better contrast on bright yellow
        ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
        drawRoundRect(ctx, fx, fy, boxWidth, 48, 12);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.font = "bold 20px NotoEmoji, BeVietnamProBold, Sans";
        ctx.fillStyle = rankColor === "#94a3b8" ? "#60a5fa" : rankColor;
        ctx.fillText(f.icon || "•", fx + 15, fy + 30);

        ctx.font = "bold 13px BeVietnamProBold, Sans";
        ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        ctx.fillText(f.label.toUpperCase(), fx + 45, fy + 18);

        ctx.font = "bold 17px BeVietnamPro, Sans";
        ctx.fillStyle = "#fff";
        ctx.fillText(String(f.value || "—").substring(0, 35), fx + 45, fy + 38);
    });

    return canvas.toBuffer("image/png");
}

/**
 * MIXCLOUD CANVAS FUNCTIONS
 */
export async function drawMcSearch(results, query) {
    const CARD_H = 130, CARD_GAP = 18, PADDING = 40;
    const width = 800, height = 150 + (results.length * (CARD_H + CARD_GAP)) + 90;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0a0a1a"); bg.addColorStop(1, "#1a1a2e");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ff6b35";
    ctx.beginPath(); ctx.arc(width, 0, 280, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    ctx.textAlign = "center";
    ctx.fillStyle = "#ff6b35";
    ctx.font = "bold 42px BeVietnamProBold, Sans";
    ctx.shadowColor = "#ff6b35"; ctx.shadowBlur = 15;
    ctx.fillText("MIXCLOUD", width / 2, 75);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "20px BeVietnamPro, Sans";
    ctx.fillText(`"${query}"`, width / 2, 112);

    ctx.textAlign = "left";
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const y = 140 + i * (CARD_H + CARD_GAP);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        drawRoundRect(ctx, PADDING, y, width - PADDING * 2, CARD_H, 18);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,107,53,0.2)"; ctx.stroke();

        try {
            const thumbUrl = r.picture_url || r.thumbnail || "";
            if (thumbUrl.startsWith("http")) {
                const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, PADDING + 12, y + 12, 106, 106, 12); ctx.clip();
                ctx.drawImage(img, PADDING + 12, y + 12, 106, 106);
                ctx.restore();
            }
        } catch (e) {
            ctx.fillStyle = "#333"; drawRoundRect(ctx, PADDING + 12, y + 12, 106, 106, 12); ctx.fill();
        }

        const tx = PADDING + 135;
        ctx.fillStyle = "#fff"; ctx.font = "bold 24px BeVietnamProBold, NotoEmojiBold, Sans";
        let name = (r.name || "Unknown").substring(0, 30);
        ctx.fillText(name, tx, y + 42);

        ctx.fillStyle = "#ff6b35"; ctx.font = "bold 18px BeVietnamPro, Sans";
        ctx.fillText(r.user?.name || r.artist || "Unknown", tx, y + 72);

        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "16px BeVietnamPro, Sans";
        const dur = r.duration ? `⏱️ ${Math.floor(r.duration / 60)}:${String(Math.floor(r.duration % 60)).padStart(2, '0')}` : "";
        ctx.fillText(dur, tx, y + 100);

        ctx.fillStyle = "#ff6b35";
        ctx.beginPath(); ctx.arc(width - PADDING - 30, y + CARD_H / 2, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px BeVietnamPro, Sans"; ctx.textAlign = "center";
        ctx.fillText(i + 1, width - PADDING - 30, y + CARD_H / 2 + 7);
        ctx.textAlign = "left";
    }

    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText(`➜ Trả lời 1-${results.length} để tải nhạc`, width / 2, height - 35);
    return canvas.toBuffer("image/png");
}

export async function drawMcPlayer(track) {
    const width = 800, height = 260;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    let img = null;
    try {
        const thumbUrl = track.picture_url || track.thumbnail || "";
        if (thumbUrl.startsWith("http")) {
            const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
            img = await loadImage(Buffer.from(res.data));
        }
    } catch (e) { }

    if (img) {
        ctx.save(); ctx.filter = 'blur(40px) brightness(0.5)';
        const sc = Math.max(width / img.width, height / img.height);
        ctx.drawImage(img, (width - img.width * sc) / 2, (height - img.height * sc) / 2, img.width * sc, img.height * sc);
        ctx.restore();
        ctx.fillStyle = "rgba(10,10,20,0.78)"; ctx.fillRect(0, 0, width, height);
    } else {
        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, "#0a0a1a"); bg.addColorStop(1, "#1a1a2e");
        ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    }

    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(0, 0, width, 40);
    ctx.fillStyle = "#ff6b35"; ctx.font = "bold 18px BeVietnamProBold, Sans"; ctx.textAlign = "center";
    ctx.fillText("MIXCLOUD", width / 2, 27);

    const cx = 150, cy = 147, r = 88;
    ctx.shadowColor = "#ff6b35"; ctx.shadowBlur = 20;
    ctx.strokeStyle = "rgba(255,107,53,0.5)"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    if (img) {
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2); ctx.restore();
    } else {
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = "#ff6b35"; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 9); ctx.lineTo(cx + 9, cy); ctx.lineTo(cx - 5, cy + 9);
    ctx.closePath(); ctx.fill();

    const tx = cx + r + 40; let cY = cy - 60;
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff"; ctx.font = "bold 28px BeVietnamProBold, NotoEmojiBold, Sans";
    let title = (track.name || "Unknown").substring(0, 28);
    ctx.fillText(title, tx, cY); cY += 42;
    ctx.fillStyle = "#ff6b35"; ctx.font = "bold 22px BeVietnamProBold, Sans";
    ctx.fillText(track.user?.name || track.artist || "Unknown", tx, cY); cY += 38;
    ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "20px BeVietnamPro, Sans";
    const durStr = track.duration ? `⏱️ ${Math.floor(track.duration / 60)}:${String(Math.floor(track.duration % 60)).padStart(2, '0')}` : "⏱️ --:--";
    ctx.fillText(durStr, tx, cY);

    const barY = height - 38, barW = 340, barH = 6;
    ctx.fillStyle = "rgba(255,255,255,0.1)"; drawRoundRect(ctx, tx, barY, barW, barH, 3); ctx.fill();
    ctx.fillStyle = "#ff6b35"; drawRoundRect(ctx, tx, barY, barW * 0.4, barH, 3); ctx.fill();

    return canvas.toBuffer("image/png");
}

/**
 * TIKTOK CANVAS FUNCTION
 */
export async function drawTikTokSearch(videos, title = "TIKTOK") {
    const CARD_H = 130, CARD_GAP = 16, PADDING = 40;
    const width = 800, height = 150 + (videos.length * (CARD_H + CARD_GAP)) + 90;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0d0d0d"); bg.addColorStop(1, "#1a0a1a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#69c9d0";
    ctx.beginPath(); ctx.arc(0, 0, 250, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ee1d52";
    ctx.beginPath(); ctx.arc(width, height, 250, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    ctx.textAlign = "center";
    ctx.shadowColor = "#ee1d52"; ctx.shadowBlur = 20;
    ctx.fillStyle = "#fff"; ctx.font = "bold 40px BeVietnamProBold, Sans";
    ctx.fillText(title.toUpperCase().substring(0, 40), width / 2, 75);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "18px BeVietnamPro, Sans";
    ctx.fillText(`${videos.length} kết quả`, width / 2, 110);

    ctx.textAlign = "left";
    for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        const y = 140 + i * (CARD_H + CARD_GAP);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        drawRoundRect(ctx, PADDING, y, width - PADDING * 2, CARD_H, 18);
        ctx.fill();
        ctx.strokeStyle = "rgba(238,29,82,0.2)"; ctx.stroke();

        try {
            const thumbUrl = v.origin_cover || v.cover || "";
            if (thumbUrl.startsWith("http")) {
                const res = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, PADDING + 10, y + 10, 110, 110, 12); ctx.clip();
                ctx.drawImage(img, PADDING + 10, y + 10, 110, 110);
                ctx.restore();
            }
        } catch (e) {
            ctx.fillStyle = "#222"; drawRoundRect(ctx, PADDING + 10, y + 10, 110, 110, 12); ctx.fill();
        }

        const tx = PADDING + 135;
        ctx.fillStyle = "#fff"; ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, Sans";
        let vTitle = (v.title || "Không tiêu đề").substring(0, 32);
        ctx.fillText(vTitle, tx, y + 38);

        ctx.fillStyle = "#69c9d0"; ctx.font = "bold 17px BeVietnamPro, Sans";
        ctx.fillText(`@${v.author?.unique_id || v.author?.uniqueId || "unknown"}`, tx, y + 62);

        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "15px BeVietnamPro, NotoEmojiBold, Sans";
        const likes = v.digg_count ? `❤️ ${(+v.digg_count).toLocaleString("vi-VN")}` : "";
        const dur = v.duration ? `⏱️ ${v.duration}s` : "";
        ctx.fillText([likes, dur].filter(Boolean).join("  |  "), tx, y + 90);

        const badgeColors = ["#ee1d52", "#ff6b35", "#fbbf24", "#10b981", "#3b82f6", "#8b5cf6"];
        ctx.fillStyle = badgeColors[i % badgeColors.length];
        ctx.beginPath(); ctx.arc(width - PADDING - 28, y + CARD_H / 2, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px BeVietnamPro, Sans"; ctx.textAlign = "center";
        ctx.fillText(i + 1, width - PADDING - 28, y + CARD_H / 2 + 7);
        ctx.textAlign = "left";
    }

    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "italic 17px BeVietnamPro, Sans";
    ctx.fillText(`➜ Phản hồi số 1-${videos.length} để tải video`, width / 2, height - 35);
    return canvas.toBuffer("image/png");
}

/**
 * PREMIUM WELCOME / GOODBYE CANVAS FUNCTIONS
 */

export async function drawWelcome(userInfo, groupName = "nhóm", approverName = "", joinTime = "") {
    const width = 1100, height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // LUXURY DESIGN SYSTEM
    const themeColor = "#00f2ea"; // Cyan/Neon Blue
    const themeColorSecondary = "#ff0050"; // Pink/Red

    // 1. Vibrant Animated-style Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0a0a0f");
    bgGrad.addColorStop(0.5, "#1a1a2e");
    bgGrad.addColorStop(1, "#0a0a0f");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur / Glows
    let avatarImg = null;
    try {
        const avUrl = (userInfo.avatar_251 || userInfo.avatar || userInfo.avatar_25 || "").replace("w94", "w500");
        if (avUrl.startsWith("http")) {
            const res = await axios.get(avUrl, { responseType: 'arraybuffer', timeout: 5000 });
            avatarImg = await loadImage(Buffer.from(res.data));

            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.filter = "blur(50px)";
            ctx.drawImage(avatarImg, -100, -100, width + 200, height + 200);
            ctx.restore();
        }
    } catch (e) { }

    // Modern Neon Blobs
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = themeColor;
    ctx.beginPath(); ctx.arc(0, 0, 400, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = themeColorSecondary;
    ctx.beginPath(); ctx.arc(width, height, 400, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 2. Main Glassmorphism Card
    const cardMargin = 40;
    const cardW = width - (cardMargin * 2);
    const cardH = height - (cardMargin * 2);
    const cardX = cardMargin;
    const cardY = cardMargin;

    // Card Shadow
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 30;
    ctx.fillStyle = "rgba(15, 15, 25, 0.8)";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Card Glass Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 3. Avatar on the left
    const avR = 100;
    const avX = cardX + 40 + avR;
    const avY = cardY + cardH / 2;

    // Outer Neon Ring
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 20;
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(avX, avY, avR + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (avatarImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatarImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
    } else {
        ctx.fillStyle = "#334155";
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    }

    // Inner White Border
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.stroke();

    // 4. Content Area
    const textX = avX + avR + 50;
    const centerT = cardY + cardH / 2;

    // User Name (Multicolor / Large)
    ctx.textAlign = "left";
    ctx.font = "bold 52px BeVietnamProBold, NotoEmojiBold, Sans";
    const displayName = (userInfo.displayName || userInfo.zaloName || "THÀNH VIÊN MỚI").toUpperCase();

    // Gradient text for name
    const nGrad = ctx.createLinearGradient(textX, 0, textX + ctx.measureText(displayName).width, 0);
    nGrad.addColorStop(0, themeColorSecondary);
    nGrad.addColorStop(1, themeColor);
    ctx.fillStyle = nGrad;
    ctx.fillText(displayName, textX, centerT - 50);

    // Divider
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(textX, centerT - 35);
    ctx.lineTo(cardX + cardW - 60, centerT - 35);
    ctx.stroke();

    // Join Message
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px BeVietnamProBold, Sans";
    const statusText = `✓ Đã tham gia vào `;
    ctx.fillText(statusText, textX, centerT + 20);

    const groupText = groupName.toUpperCase();
    ctx.fillStyle = themeColor;
    ctx.fillText(groupText, textX + ctx.measureText(statusText).width, centerT + 20);

    // Approver / Approval Info
    if (approverName) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "bold 24px BeVietnamPro, Sans";
        ctx.fillText(`Duyệt bởi: ${approverName}`, textX, centerT + 65);
    }

    // Footer Slogan
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = "italic 22px BeVietnamPro, Sans";
    ctx.fillText("✨ Gặp nhau là duyên, đồng hành là nghĩa ✨", cardX + cardW / 2 + avR, cardY + cardH - 30);

    // Extra Tag (e.g. Join Date)
    if (joinTime) {
        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "bold 16px BeVietnamPro, Sans";
        ctx.fillText(`📅 ${joinTime}`, cardX + 30, height - 15);
    }

    return canvas.toBuffer("image/png");
}

export async function drawGoodbye(userInfo, groupName = "nhóm") {
    const width = 1100, height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const themeColor = "#fbbf24"; // Amber/Gold
    const themeColorSecondary = "#ef4444"; // Red/Danger

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0c0a09");
    bgGrad.addColorStop(0.5, "#1c1917");
    bgGrad.addColorStop(1, "#0c0a09");
    ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, width, height);

    // Glows
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = themeColorSecondary;
    ctx.beginPath(); ctx.arc(width, 0, 400, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    const cardMargin = 40;
    const cardW = width - (cardMargin * 2), cardH = height - (cardMargin * 2);
    const cardX = cardMargin, cardY = cardMargin;

    ctx.fillStyle = "rgba(24, 24, 27, 0.9)";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 40);
    ctx.fill();

    // Avatar on the left (Grayscale-ish)
    const avR = 100, avX = cardX + 40 + avR, avY = cardY + cardH / 2;
    try {
        const avUrl = (userInfo.avatar_251 || userInfo.avatar || userInfo.avatar_25 || "").replace("w94", "w500");
        if (avUrl.startsWith("http")) {
            const res = await axios.get(avUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const img = await loadImage(Buffer.from(res.data));
            ctx.save();
            ctx.filter = "grayscale(80%) brightness(0.7)";
            ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
            ctx.restore();
        }
    } catch (e) {
        ctx.fillStyle = "#27272a";
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(avX, avY, avR + 5, 0, Math.PI * 2); ctx.stroke();

    // Content
    const textX = avX + avR + 50;
    const centerT = cardY + cardH / 2;

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px BeVietnamProBold, NotoEmojiBold, Sans";
    const name = (userInfo.displayName || userInfo.zaloName || "THÀNH VIÊN").toUpperCase();
    ctx.fillText(name, textX, centerT - 40);

    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "bold 34px BeVietnamProBold, Sans";
    ctx.fillText("HẸN GẶP LẠI BẠN VÀO MỘT NGÀY KHÁC 🕊️", textX, centerT + 20);

    ctx.fillStyle = themeColorSecondary;
    ctx.font = "bold 24px BeVietnamPro, Sans";
    ctx.fillText(`Vừa rời khỏi ${groupName.toUpperCase()}`, textX, centerT + 70);

    return canvas.toBuffer("image/png");
}

/**
 * TAI XIU CANVAS FUNCTION
 */
export async function drawTaiXiu(dices, total, result, betInfoText) {
    const width = 600, height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Luxury Dark Background
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#0a0a1a");
    bgGrad.addColorStop(1, "#1a1a2e");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = result === "tai" ? "#fbbf24" : "#10b981";
    ctx.beginPath(); ctx.arc(width / 2, height / 2, 200, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px BeVietnamProBold, Sans";
    ctx.fillText("🎲 TÀI XỈU LUXURY 🎲", width / 2, 60);

    // Dices Section
    const diceIcons = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const gap = 120;
    const startX = width / 2 - gap;

    ctx.font = "bold 100px Sans";
    dices.forEach((d, i) => {
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        drawRoundRect(ctx, startX + i * gap - 50, 120, 100, 100, 20);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.fillText(diceIcons[d], startX + i * gap, 200);
    });

    // Total & Result
    ctx.font = "bold 40px BeVietnamProBold, Sans";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText(`${dices.join(" + ")} = ${total}`, width / 2, 260);

    // Big Result Text
    ctx.font = "bold 80px BeVietnamProBold, Sans";
    ctx.fillStyle = result === "tai" ? "#fbbf24" : "#10b981";
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 20;
    ctx.fillText(result.toUpperCase(), width / 2, 350);
    ctx.shadowBlur = 0;

    // Bet Info Text Box
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    drawRoundRect(ctx, 40, 380, width - 80, 80, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.stroke();

    ctx.font = "20px BeVietnamPro, Sans";
    ctx.fillStyle = "#ffffff";
    wrapText(ctx, betInfoText, width / 2, 420, width - 120, 25);

    return canvas.toBuffer("image/png");
}

/**
 * CAPCUT SEARCH CANVAS FUNCTION
 */
export async function drawCapCutSearch(templates, query) {
    const CARD_W = 540;
    const CARD_H = 140;
    const PADDING = 130;
    const HEADER_HEIGHT = 150;
    const FOOTER_HEIGHT = 100;
    const CARD_GAP = 20;

    const width = 800;
    const height = HEADER_HEIGHT + (templates.length * (CARD_H + CARD_GAP)) + FOOTER_HEIGHT;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Luxury Dark Background 
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#000000");
    bgGrad.addColorStop(0.5, "#0f172a");
    bgGrad.addColorStop(1, "#000000");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Glows
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ff0050"; // CapCut Pink
    ctx.beginPath(); ctx.arc(0, 0, 300, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#00f2ea"; // CapCut Cyan
    ctx.beginPath(); ctx.arc(width, height, 300, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // Title
    ctx.textAlign = "center";
    ctx.shadowColor = "#ff0050";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px BeVietnamProBold, Sans";
    ctx.fillText("CAPCUT SEARCH", width / 2, 75);
    ctx.shadowBlur = 0;

    ctx.font = "22px BeVietnamPro, Sans";
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fillText(`“${query}”`, width / 2, 115);

    ctx.textAlign = "left";
    for (let i = 0; i < templates.length; i++) {
        const t = templates[i];
        const y = HEADER_HEIGHT + (i * (CARD_H + CARD_GAP));
        const x = PADDING;

        // Card
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        drawRoundRect(ctx, x, y, CARD_W, CARD_H, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.stroke();

        // Thumbnail
        try {
            const thumbUrl = t.cover_url || t.cover || (t.video_template?.cover_url) || "";
            if (thumbUrl && thumbUrl.startsWith("http")) {
                const response = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 5000 });
                const img = await loadImage(Buffer.from(response.data));
                ctx.save();
                drawRoundRect(ctx, x + 15, y + 15, 110, 110, 15);
                ctx.clip();
                ctx.drawImage(img, x + 15, y + 15, 110, 110);
                ctx.restore();
            }
        } catch (e) {
            ctx.fillStyle = "#222";
            drawRoundRect(ctx, x + 15, y + 15, 110, 110, 15);
            ctx.fill();
        }

        const titleX = x + 145;
        // Title
        ctx.fillStyle = "#fff";
        ctx.font = "bold 24px BeVietnamProBold, Sans";
        let title = t.title || "No Title";
        if (ctx.measureText(title).width > CARD_W - 180) title = title.substring(0, 25) + "...";
        ctx.fillText(title, titleX, y + 50);

        // Author
        ctx.fillStyle = "#00f2ea";
        ctx.font = "bold 18px BeVietnamPro, Sans";
        const author = t.author?.name || "Unknown Author";
        ctx.fillText(`👤 ${author}`, titleX, y + 85);

        // Stats
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "16px BeVietnamPro, Sans";
        const usage = t.usage_amount ? (t.usage_amount / 1000).toFixed(1) + "k dùng" : "Hot";
        const duration = t.duration ? (t.duration / 1000).toFixed(1) + "s" : "";
        ctx.fillText(`🔥 ${usage}  |  ⏱️ ${duration}`, titleX, y + 115);

        // Badge Number
        ctx.fillStyle = "#ff0050";
        ctx.beginPath();
        ctx.arc(x + CARD_W - 40, y + CARD_H / 2, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 20px BeVietnamPro, Sans";
        ctx.textAlign = "center";
        ctx.fillText(i + 1, x + CARD_W - 40, y + CARD_H / 2 + 7);
        ctx.textAlign = "left";
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "italic 20px BeVietnamPro, Sans";
    ctx.fillText(`➜ Phản hồi số 1-${templates.length} để tải video`, width / 2, height - 40);

    return canvas.toBuffer("image/png");
}


/**
 * GROUP CARD INFO CANVAS (with member avatars & group bg)
 */
export async function drawGroupCard({ groupName, groupId, avatar, memberCount, creatorName, createdTime, description, settings = [], memberAvatarUrls = [], adminProfiles = [] }) {
    const width = 800, height = 420;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background
    let bgImg = null;
    try {
        if (fs.existsSync(infoBgPath)) bgImg = await loadImage(infoBgPath);
    } catch { }

    if (bgImg) {
        ctx.drawImage(bgImg, 0, 0, width, height);
        // Increase darkness for readability on yellow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, width, height);
    } else {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, width, height);
    }

    // 2. Decorative Glow (Left)
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#6366f1";
    ctx.beginPath(); ctx.arc(0, 0, 300, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 3. Group Header
    const avX = 80, avY = 80, avR = 55;
    let groupAvImg = null;
    try {
        if (avatar && avatar.startsWith("http")) {
            const res = await axios.get(avatar, { responseType: 'arraybuffer', timeout: 5000 });
            groupAvImg = await loadImage(Buffer.from(res.data));
        }
    } catch (e) { }

    ctx.shadowColor = "#6366f1";
    ctx.shadowBlur = 15;
    ctx.strokeStyle = "#6366f1";
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(avX, avY, avR + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    if (groupAvImg) {
        ctx.save();
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(groupAvImg, avX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();
    } else {
        ctx.fillStyle = "#1e1b4b";
        ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.fill();
    }

    const textX = avX + avR + 30;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px BeVietnamProBold, NotoEmojiBold, Sans";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.fillText(groupName || "Nhóm", textX, avY - 15);
    ctx.shadowBlur = 0;
    
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    const adminYStart = Math.max(avY + avR + 25, 155); // Guarantee clearance below Group Avatar
    ctx.fillStyle = "rgba(255, 215, 0, 0.9)";
    ctx.font = "bold 14px BeVietnamProBold, Sans";
    ctx.fillText("👑 BAN QUẢN TRỊ NHÓM", 40, adminYStart);

    // Arrange Admins horizontally to save space and avoid overlap
    const displayAdmins = adminProfiles.slice(0, 3);
    const adminSectionW = 360; 
    const singleAdW = adminSectionW / Math.max(displayAdmins.length, 1);

    for (let i = 0; i < displayAdmins.length; i++) {
        const ad = displayAdmins[i];
        const ay = adminYStart + 16; 
        const ax = 40 + i * singleAdW;
        const ar = 16; // Slightly bigger

        // Admin Avatar
        let adAvImg = null;
        try {
            if (ad.avatar && ad.avatar.startsWith("http")) {
                const res = await axios.get(ad.avatar, { responseType: 'arraybuffer', timeout: 2000 });
                adAvImg = await loadImage(Buffer.from(res.data));
            }
        } catch { }

        // Draw Avatar
        ctx.strokeStyle = i === 0 ? "#fbbf24" : "#cbd5e1"; // Gold for Owner, Silver for Admins
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar + 3, 0, Math.PI * 2); ctx.stroke();
        
        if (adAvImg) {
            ctx.save();
            ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(adAvImg, ax, ay, ar * 2, ar * 2);
            ctx.restore();
        } else {
            ctx.fillStyle = "#334155";
            ctx.beginPath(); ctx.arc(ax + ar, ay + ar, ar, 0, Math.PI * 2); ctx.fill();
        }

        // Admin Name
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px BeVietnamPro, Sans";
        let adName = ad.name;
        let maxTextW = singleAdW - (ar * 2) - 15;
        if (ctx.measureText(adName).width > maxTextW) {
            while (ctx.measureText(adName + "...").width > maxTextW && adName.length > 0) {
                adName = adName.slice(0, -1);
            }
            adName += "...";
        }
        ctx.fillText(adName, ax + ar * 2 + 12, ay + ar + 5);
    }

    // 5. MEMBER AVATARS
    const memAvSize = 34;
    const memOverlap = 10;
    const maxDisplay = Math.min(memberAvatarUrls.length, 12);
    const totalMemW = maxDisplay * (memAvSize - memOverlap) + memOverlap;
    const memStartX = 40 + (adminSectionW - totalMemW) / 2; // Center horizontally
    const memY = adminYStart + 60; // Push down clearly below Admins

    for (let i = 0; i < maxDisplay; i++) {
        const mx = memStartX + i * (memAvSize - memOverlap);
        const url = memberAvatarUrls[i];
        let mImg = null;
        try {
            if (url && url.startsWith("http")) {
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 2000 });
                mImg = await loadImage(Buffer.from(res.data));
            }
        } catch (e) { }

        ctx.fillStyle = "#0f172a";
        ctx.beginPath(); ctx.arc(mx + memAvSize/2, memY + memAvSize/2, memAvSize/2 + 1.5, 0, Math.PI * 2); ctx.fill();
        if (mImg) {
            ctx.save();
            ctx.beginPath(); ctx.arc(mx + memAvSize/2, memY + memAvSize/2, memAvSize/2, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(mImg, mx, memY, memAvSize, memAvSize);
            ctx.restore();
        }
    }
    
    // 6. BOTTOM SECTION: STATS & TOP FAN & SETTINGS
    const statsY = memY + 50; 
    const statsBoxH = 150; 
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    drawRoundRect(ctx, 40, statsY, adminSectionW, statsBoxH, 15);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#60a5fa";
    ctx.font = "bold 15px BeVietnamProBold, Sans";
    ctx.fillText("📊 THÔNG TIN BỔ SUNG:", 55, statsY + 25);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px BeVietnamPro, Sans";
    ctx.fillText(`📅 Ngày tạo: ${createdTime || "N/A"}`, 55, statsY + 50);
    ctx.fillText(`🏆 ${description || "Top Fan: Chưa cập nhật"}`, 220, statsY + 50);

    // Settings Row (Compact mode)
    const setY = statsY + 65;
    const setW = adminSectionW / 4; 
    
    settings.slice(0, 4).forEach((s, i) => {
        const sx = 40 + i * setW;
        const isON = s.value === "ON";

        ctx.fillStyle = isON ? "rgba(16, 185, 129, 0.15)" : "rgba(255, 255, 255, 0.05)";
        drawRoundRect(ctx, sx + 5, setY, setW - 10, 75, 10);
        ctx.fill();
        ctx.strokeStyle = isON ? "rgba(16, 185, 129, 0.4)" : "rgba(255, 255, 255, 0.1)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = isON ? "#fff" : "rgba(255, 255, 255, 0.4)";
        ctx.font = "bold 10px BeVietnamPro, Sans";
        ctx.fillText(s.label.toUpperCase(), sx + setW / 2, setY + 22);

        // Visual icon
        const iconY = setY + 50;
        ctx.fillStyle = isON ? "#10b981" : "#94a3b8";
        ctx.font = "bold 14px BeVietnamProBold, Sans";
        ctx.fillText(s.value, sx + setW / 2, iconY);
    });

    // 7. FOOTER
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.font = "italic 13px BeVietnamPro, Sans";
    ctx.fillText("✨ Chúc nhóm mọi điều tốt đẹp! | DGK System", 45, 400);

    return canvas.toBuffer("image/png");
}


export async function drawNoitu({ word, description, points, timeLeft, historyCount, skipsLeft, nextLetter, botAvatar, userName }) {
    const width = 800, height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background Gradient
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#1e3a8a"); // Blue-900
    bg.addColorStop(1, "#1e40af"); // Blue-800
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Subtle Grid Pattern
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i < width; i += 40) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
    }
    for (let i = 0; i < height; i += 40) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke();
    }

    // 2. Header
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, 0, width, 80);
    
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px BeVietnamProBold, Sans";
    ctx.textAlign = "left";
    ctx.fillText("NỐI TỪ VTV 🎮", 30, 52);

    // Stats on Header
    ctx.textAlign = "right";
    ctx.font = "bold 22px BeVietnamPro, Sans";
    ctx.fillStyle = "#fbbf24"; // Gold
    ctx.fillText(`Điểm: ${points}  |  Lượt: ${historyCount}  |  Bỏ qua: ${skipsLeft}/3`, width - 30, 50);

    // 3. Main Content Card
    const cardX = 30, cardY = 100, cardW = 740, cardH = 300;
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    drawRoundRect(ctx, cardX, cardY, cardW, cardH, 25);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.stroke();

    // 4. Timer Bar
    const timerW = (timeLeft / 30) * (cardW - 40);
    ctx.fillStyle = timeLeft > 10 ? "#10b981" : "#ef4444";
    drawRoundRect(ctx, cardX + 20, cardY + 20, Math.max(0, timerW), 10, 5);
    ctx.fill();

    // 5. Central Word
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 60px BeVietnamProBold, Sans";
    ctx.fillText(word.toUpperCase(), width / 2, cardY + 120);

    // Description text wrapping
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "italic 20px BeVietnamPro, Sans";
    wrapText(ctx, description || "Đang cập nhật định nghĩa...", width / 2, cardY + 170, cardW - 100, 28);

    // 6. Next Character Instruction
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 30px BeVietnamProBold, Sans";
    ctx.fillText(`HÃY Nối: ${nextLetter.toUpperCase()} ...`, width / 2, cardY + 260);

    // 7. Footer
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.fillRect(0, height - 60, width, 60);
    
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "16px BeVietnamPro, Sans";
    ctx.fillText("HD: Nhắn từ 2 chữ cái để nối. Nhắn '!noitu skip' để bỏ qua.", 30, height - 25);

    return canvas.toBuffer("image/png");
}

export async function drawVtv({ jumbled, points, timeLeft, round, userName, avatar }) {
    const width = 800, height = 500;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // Luxury Dark/Yellow Theme (VTV colors)
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#1a1a1a");
    bg.addColorStop(1, "#333333");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Yellow border
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 15;
    ctx.strokeRect(0, 0, width, height);

    // Header
    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(15, 15, width - 30, 80);
    
    ctx.fillStyle = "#000";
    ctx.font = "bold 40px BeVietnamProBold, Sans";
    ctx.textAlign = "center";
    ctx.fillText("VUA TIẾNG VIỆT 🇻🇳", width / 2, 70);

    // Main Content
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px BeVietnamPro, Sans";
    ctx.fillText(`VÒNG ${round}: NHẬN DIỆN`, width / 2, 160);

    // Jumbled Word Box
    const boxW = 600, boxH = 120;
    const boxX = (width - boxW) / 2, boxY = 190;
    ctx.fillStyle = "rgba(251, 191, 36, 0.1)";
    drawRoundRect(ctx, boxX, boxY, boxW, boxH, 20);
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 60px BeVietnamProBold, Sans";
    ctx.fillText(jumbled.toUpperCase(), width / 2, boxY + 80);

    // Timer and Info
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "bold 28px BeVietnamProBold, Sans";
    ctx.textAlign = "left";
    ctx.fillText(`⏳ ${timeLeft}s`, boxX + 20, boxY + boxH + 60);
    ctx.textAlign = "right";
    ctx.fillText(`🏆 Điểm: ${points}`, width - boxX - 20, boxY + boxH + 60);

    // Footer
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText("Hãy sắp xếp các chữ cái trên thành một từ có nghĩa!", width / 2, height - 50);

    return canvas.toBuffer("image/png");
}

export async function drawGoldPrice(goldList, updateTime) {
    const CARD_H = 75, CARD_GAP = 12, PADDING = 40;
    const HEADER_HEIGHT = 160;
    const FOOTER_HEIGHT = 120;
    const width = 800;
    const height = HEADER_HEIGHT + (goldList.length * (CARD_H + CARD_GAP)) + FOOTER_HEIGHT;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Luxury Dark & Gold Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#0c0a09");
    bgGrad.addColorStop(0.5, "#1c1917");
    bgGrad.addColorStop(1, "#0c0a09");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#fbbf24"; // Gold
    ctx.beginPath(); ctx.arc(0, 0, 450, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#92400e";
    ctx.beginPath(); ctx.arc(width, height, 400, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 2. Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 44px BeVietnamProBold, Sans";
    ctx.shadowColor = "#fbbf24"; ctx.shadowBlur = 15;
    ctx.fillText("BẢNG GIÁ VÀNG PHÚ QUÝ", width / 2, 75);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "bold 20px BeVietnamPro, Sans";
    ctx.fillText(updateTime || "Cập nhật hôm nay", width / 2, 115);

    // Table Header
    ctx.textAlign = "left";
    ctx.font = "bold 18px BeVietnamProBold, Sans";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("LOẠI VÀNG", PADDING + 30, 145);
    ctx.textAlign = "right";
    ctx.fillText("MUA VÀO", width - PADDING - 180, 145);
    ctx.fillText("BÁN RA", width - PADDING - 40, 145);

    // 3. Rows
    for (let i = 0; i < goldList.length; i++) {
        const item = goldList[i];
        const y = HEADER_HEIGHT + i * (CARD_H + CARD_GAP);
        
        ctx.fillStyle = "rgba(251, 191, 36, 0.04)";
        drawRoundRect(ctx, PADDING, y, width - PADDING * 2, CARD_H, 15);
        ctx.fill();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.1)";
        ctx.stroke();

        // Type
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 20px BeVietnamProBold, NotoEmojiBold, Sans";
        let type = item.type;
        if (ctx.measureText(type).width > 420) type = type.substring(0, 32) + "...";
        ctx.fillText(type, PADDING + 30, y + 45);

        // Buy/Sell
        ctx.textAlign = "right";
        ctx.font = "bold 22px BeVietnamProBold, Sans";
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(item.buy || "—", width - PADDING - 180, y + 45);
        ctx.fillStyle = "#ef4444";
        ctx.fillText(item.sell || "—", width - PADDING - 40, y + 45);
    }

    // 4. Footer
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText("Dữ liệu được cập nhật từ Phú Quý Group • DGK System", width / 2, height - 60);

    return canvas.toBuffer("image/png");
}

export async function drawFuelPrice(fuelList, updateTime) {
    const CARD_H = 80, CARD_GAP = 12, PADDING = 40;
    const HEADER_HEIGHT = 180;
    const FOOTER_HEIGHT = 120;
    const width = 800;
    const height = HEADER_HEIGHT + (fuelList.length * (CARD_H + CARD_GAP)) + FOOTER_HEIGHT;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. PVOIL Theme Background (Deep Blue Gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#075985"); // Blue 800
    bgGrad.addColorStop(1, "#1e1b4b"); // Navy
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Blur
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#ef4444"; 
    ctx.beginPath(); ctx.arc(width, 0, 400, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.arc(0, height, 350, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 2. Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px BeVietnamProBold, Sans";
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10;
    ctx.fillText("BẢNG GIÁ XĂNG DẦU PVOIL", width / 2, 75);
    ctx.shadowBlur = 0;

    // Red Decorative Line
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(width / 2 - 150, 90, 300, 4);

    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.font = "bold 22px BeVietnamPro, Sans";
    ctx.fillText(`🕒 Cập nhật: ${updateTime || "Mới nhất"}`, width / 2, 130);

    // Table Header
    ctx.textAlign = "left";
    ctx.font = "bold 18px BeVietnamProBold, Sans";
    ctx.fillStyle = "#bae6fd";
    ctx.fillText("SẢN PHẨM", PADDING + 30, 165);
    ctx.textAlign = "right";
    ctx.fillText("GIÁ (VNĐ/LÍT)", width - PADDING - 180, 165);
    ctx.fillText("THAY ĐỔI", width - PADDING - 30, 165);

    // 3. Rows
    for (let i = 0; i < fuelList.length; i++) {
        const item = fuelList[i];
        const y = HEADER_HEIGHT + i * (CARD_H + CARD_GAP);
        
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        drawRoundRect(ctx, PADDING, y, width - PADDING * 2, CARD_H, 20);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.stroke();

        // Product Name
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, Sans";
        ctx.fillText(item.name, PADDING + 30, y + 48);

        // Price
        ctx.textAlign = "right";
        ctx.font = "bold 26px BeVietnamProBold, Sans";
        ctx.fillStyle = "#facc15"; 
        ctx.fillText(item.price, width - PADDING - 180, y + 48);

        // Change
        ctx.font = "bold 18px BeVietnamProBold, Sans";
        const chg = item.change || "";
        if (chg.includes("+")) ctx.fillStyle = "#f87171"; 
        else if (chg.includes("-")) ctx.fillStyle = "#4ade80"; 
        else ctx.fillStyle = "#94a3b8";
        ctx.fillText(chg === "0" ? "—" : chg, width - PADDING - 30, y + 48);
    }

    // 4. Footer
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText("Dữ liệu được trích xuất từ PVOIL.com.vn • System by DGK", width / 2, height - 60);

    return canvas.toBuffer("image/png");
}

export async function drawXSMB(results, dateStr) {
    const width = 800;
    const headerH = 150;
    const footerH = 80;
    const rowH = 65;
    const padding = 40;
    const height = headerH + (9 * rowH) + footerH;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background (Red/Gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#c00");
    bgGrad.addColorStop(1, "#800");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Pattern
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#fff";
    for(let i=0; i<10; i++) {
        ctx.beginPath(); ctx.arc(Math.random()*width, Math.random()*height, 100, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // 2. Header
    ctx.textAlign = "center";
    ctx.fillStyle = "#ff0"; // Yellow
    ctx.font = "bold 50px BeVietnamProBold, Sans";
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10;
    ctx.fillText("XỔ SỐ MIỀN BẮC", width / 2, 70);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#fff";
    ctx.font = "bold 26px BeVietnamPro, Sans";
    ctx.fillText(`📅 Ngày mở thưởng: ${dateStr}`, width / 2, 115);

    // 3. Results Table
    const tableY = headerH;
    const labels = ["Mã ĐB", "Giải ĐB", "Giải Nhất", "Giải Nhì", "Giải Ba", "Giải Tư", "Giải Năm", "Giải Sáu", "Giải Bảy"];
    const prizeKeys = ["code", "db", "g1", "g2", "g3", "g4", "g5", "g6", "g7"];

    for (let i = 0; i < labels.length; i++) {
        const y = tableY + i * rowH;
        
        // Row BG
        ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)";
        ctx.fillRect(padding, y, width - padding * 2, rowH);

        // Label
        ctx.textAlign = "left";
        ctx.fillStyle = "#ff0";
        ctx.font = "bold 22px BeVietnamProBold, Sans";
        ctx.fillText(labels[i], padding + 20, y + 42);

        // Value
        ctx.textAlign = "center";
        let val = results[prizeKeys[i]] || "—";
        if (Array.isArray(val)) val = val.join("   ");
        
        if (i === 1) { // G.DB
            ctx.fillStyle = "#fff";
            ctx.font = "bold 34px BeVietnamProBold, Sans";
            ctx.shadowColor = "rgba(255, 255, 0, 0.5)"; ctx.shadowBlur = 15;
            ctx.fillText(val, width / 2 + 50, y + 45);
            ctx.shadowBlur = 0;
        } else {
            ctx.fillStyle = "#fff";
            ctx.font = "bold 24px BeVietnamProBold, Sans";
            ctx.fillText(val, width / 2 + 50, y + 42);
        }
    }

    // 4. Footer
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.font = "italic 18px BeVietnamPro, Sans";
    ctx.fillText("KQXS được cập nhật tự động từ xosodaiphat.com • By DGK", width / 2, height - 35);

    return canvas.toBuffer("image/png");
}

export async function drawAltp({ question, options, level, reward, timeLeft, lifelines, removedOptions = [] }) {
    const width = 1000;
    const height = 600;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background: Deep Blue Gradient (ALTP Style)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, "#000033");
    bgGrad.addColorStop(0.5, "#000066");
    bgGrad.addColorStop(1, "#000033");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Decorative Glows
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath(); ctx.arc(width/2, height/2, 400, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1.0;

    // 2. Header: Level & Reward
    ctx.textAlign = "left";
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 35px BeVietnamProBold, Sans";
    ctx.fillText(`CÂU HỎI SỐ ${level}`, 50, 60);

    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px BeVietnamProBold, Sans";
    ctx.fillText(`MỨC THƯỞNG: ${reward.toLocaleString("vi-VN")} Đ`, width - 50, 60);

    // 3. Question Box
    const qBoxW = 900;
    const qBoxH = 120;
    const qBoxX = (width - qBoxW) / 2;
    const qBoxY = 120;

    // Hexagon-like shape for ALTP
    ctx.beginPath();
    ctx.moveTo(qBoxX + 40, qBoxY);
    ctx.lineTo(qBoxX + qBoxW - 40, qBoxY);
    ctx.lineTo(qBoxX + qBoxW, qBoxY + qBoxH / 2);
    ctx.lineTo(qBoxX + qBoxW - 40, qBoxY + qBoxH);
    ctx.lineTo(qBoxX + 40, qBoxY + qBoxH);
    ctx.lineTo(qBoxX, qBoxY + qBoxH / 2);
    ctx.closePath();
    ctx.fillStyle = "rgba(0, 0, 100, 0.8)";
    ctx.fill();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px BeVietnamProBold, NotoEmojiBold, Sans";
    wrapText(ctx, question, width / 2, qBoxY + 50, qBoxW - 100, 35);

    // 4. Options
    const optW = 430;
    const optH = 70;
    const optGapX = 40;
    const optGapY = 20;
    const optStartY = qBoxY + qBoxH + 60;

    const opKeys = ["A", "B", "C", "D"];
    opKeys.forEach((key, i) => {
        if (removedOptions.includes(key)) return; // Skip drawing removed options

        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = (width - (optW * 2 + optGapX)) / 2 + col * (optW + optGapX);
        const y = optStartY + row * (optH + optGapY);

        ctx.beginPath();
        ctx.moveTo(x + 30, y);
        ctx.lineTo(x + optW - 30, y);
        ctx.lineTo(x + optW, y + optH / 2);
        ctx.lineTo(x + optW - 30, y + optH);
        ctx.lineTo(x + 30, y + optH);
        ctx.lineTo(x, y + optH / 2);
        ctx.closePath();
        ctx.fillStyle = "rgba(0, 0, 50, 0.9)";
        ctx.fill();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 24px BeVietnamProBold, Sans";
        ctx.fillText(`${key}:`, x + 40, y + optH / 2 + 8);

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 22px BeVietnamProBold, NotoEmojiBold, Sans";
        let optText = options[key];
        if (ctx.measureText(optText).width > optW - 100) optText = optText.substring(0, 25) + "...";
        ctx.fillText(optText, x + 80, y + optH / 2 + 8);
    });

    // 5. Lifelines & Timer
    const footerY = height - 100;
    
    // Lifelines (circles)
    const lifeR = 30;
    const lifeGap = 20;
    const lifeStartX = 80;
    
    const availableLifelines = ["50:50", "Gọi người thân", "Khán giả"];
    availableLifelines.forEach((l, i) => {
        const lx = lifeStartX + i * (lifeR * 2 + lifeGap);
        const ly = footerY + lifeR;
        
        ctx.beginPath(); ctx.arc(lx, ly, lifeR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 100, 0.8)";
        ctx.fill();
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.textAlign = "center";
        const isUsed = !lifelines.includes(l);
        if (isUsed) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; // Dim the used one
            ctx.beginPath(); ctx.arc(lx, ly, lifeR, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.textAlign = "center";
        ctx.fillStyle = isUsed ? "rgba(255,255,255,0.2)" : "#fbbf24";
        ctx.font = "bold 16px BeVietnamPro, Sans";
        let icon = i === 0 ? "50:50" : (i === 1 ? "☎️" : "📊");
        ctx.fillText(icon, lx, ly + 6);
    });

    // Timer Circle
    const timerX = width - 100;
    const timerY = footerY + lifeR;
    ctx.beginPath(); ctx.arc(timerX, timerY, 40, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath(); ctx.arc(timerX, timerY, 40, -Math.PI/2, (timeLeft/60) * Math.PI * 2 - Math.PI/2);
    ctx.strokeStyle = timeLeft > 15 ? "#10b981" : "#ef4444";
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px BeVietnamProBold, Sans";
    ctx.fillText(timeLeft, timerX, timerY + 10);

    return canvas.toBuffer("image/png");
}



export async function drawCotuong({ board, lastMove, possibleMoves }) {
    const width = 530;
    const height = 567;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const cachePath = path.join(process.cwd(), "src/modules/cache/cotuong");

    // Load static assets
    const bg = await loadImage(path.join(cachePath, "bg.png"));
    
    ctx.drawImage(bg, 0, 0);

    const spaceX = 57;
    const spaceY = 57;
    const startX = -2;
    const startY = 0;

    // Draw pieces
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const key = board[y][x];
            if (key) {
                const type = key.charAt(0).toLowerCase();
                const color = key.charAt(0) === key.charAt(0).toLowerCase() ? "r" : "b";
                const piecePath = path.join(cachePath, `${color}_${type}.png`);
                if (fs.existsSync(piecePath)) {
                    const pieceImg = await loadImage(piecePath);
                    ctx.drawImage(pieceImg, x * spaceX + startX, y * spaceY + startY);
                }
            }
        }
    }

    // Draw last move highlights
    if (lastMove) {
        const box = await loadImage(path.join(cachePath, "r_box.png"));
        const { from, to } = lastMove;
        ctx.drawImage(box, from.x * spaceX + startX, from.y * spaceY + startY);
        ctx.drawImage(box, to.x * spaceX + startX, to.y * spaceY + startY);
    }

    // Draw possible moves
    if (possibleMoves && Array.isArray(possibleMoves)) {
        const dot = await loadImage(path.join(cachePath, "dot.png"));
        for (const m of possibleMoves) {
            ctx.drawImage(dot, m[0] * spaceX + startX, m[1] * spaceY + startY);
        }
    }

    return canvas.toBuffer("image/png");
}

export async function drawBatchuImage(imageUrl) {
    const { createCanvas, loadImage } = await import("canvas");
    const size = 800;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    // Nền trắng và viền vàng đơn giản
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 15;
    ctx.strokeRect(10, 10, size - 20, size - 20);

    try {
        const img = await loadImage(imageUrl);
        const imgSize = 640;
        ctx.drawImage(img, (size - imgSize) / 2, (size - imgSize) / 2, imgSize, imgSize);
    } catch (e) {
        console.error("Lỗi vẽ ảnh Bắt chữ:", e.message);
    }

    return canvas.toBuffer("image/png");
}export async function drawCaro({ board, lastMove = null }) {
    const size = 16;
    const cellS = 60; // Increased for better clarity
    const width = size * cellS + 10;
    const height = size * cellS + 80; // Extra room for header

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. Header
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(5, 5, width - 10, 60);
    
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    ctx.font = "bold 32px BeVietnamProBold, Sans";
    ctx.fillText("▤ CỜ CARO ▤", width / 2, 35);

    // 3. Grid & Numbers
    ctx.strokeStyle = "#4b5563"; // Darker grid
    ctx.lineWidth = 1.5; // Thicker lines for sharpness
    ctx.font = "bold 18px BeVietnamPro, Sans";

    const startX = 5;
    const startY = 75;

    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const x = startX + c * cellS;
            const y = startY + r * cellS;
            const cellVal = board[r][c];
            const num = r * size + c + 1;

            ctx.strokeRect(x, y, cellS, cellS);

            if (cellVal === 0) {
                // Number
                ctx.fillStyle = "#9ca3af";
                ctx.fillText(num, x + cellS / 2, y + cellS / 2);
            } else {
                // Pieces
                ctx.font = "bold 42px BeVietnamProBold, Sans";
                if (cellVal === 1) { // X
                    ctx.fillStyle = "#dc2626"; // Darker Red
                    ctx.fillText("X", x + cellS / 2, y + cellS / 2);
                } else if (cellVal === 2) { // O
                    ctx.fillStyle = "#2563eb"; // Darker Blue
                    ctx.fillText("O", x + cellS / 2, y + cellS / 2);
                }
                ctx.font = "bold 18px BeVietnamPro, Sans";
            }

            // Highlight last move
            if (lastMove && lastMove.x === c && lastMove.y === r) {
                ctx.strokeStyle = "#ea580c"; // Orange-red
                ctx.lineWidth = 4;
                ctx.strokeRect(x + 3, y + 3, cellS - 6, cellS - 6);
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "#4b5563";
            }
        }
    }

    // 4. Footer hint
    ctx.textAlign = "center";
    ctx.fillStyle = "#111827";
    ctx.font = "bold 16px BeVietnamPro, Sans";
    if (lastMove) {
        ctx.fillText(`Ô gần nhất: ${lastMove.y * size + lastMove.x + 1}`, width / 2, height - 15);
    }

    return canvas.toBuffer("image/png");
}
export async function drawCaroLeaderboard(stats = []) {
    const width = 600;
    const height = 400 + (stats.length * 50);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // 1. Sleek Background
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#1f2937");
    gradient.addColorStop(1, "#111827");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 2. Header
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px BeVietnamProBold, Sans";
    ctx.textAlign = "center";
    ctx.fillText("🏆 BẢNG XẾP HẠNG CARO", width / 2, 60);

    // 3. Columns labels
    ctx.font = "bold 18px BeVietnamPro, Sans";
    ctx.fillStyle = "#9ca3af";
    ctx.textAlign = "left";
    ctx.fillText("HẠNG", 40, 110);
    ctx.fillText("NGƯỜI CHƠI", 120, 110);
    ctx.textAlign = "right";
    ctx.fillText("WINS", 450, 110);
    ctx.fillText("RATE %", 550, 110);

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 120);
    ctx.lineTo(570, 120);
    ctx.stroke();

    // 4. Rows
    stats.forEach((p, i) => {
        const y = 160 + i * 50;
        
        // Row background on hover (fake)
        ctx.fillStyle = i % 2 === 1 ? "rgba(255,255,255,0.03)" : "transparent";
        ctx.fillRect(30, y - 35, 540, 50);

        // Rank badge
        const rankColors = ["#fcd34d", "#d1d5db", "#b45309"];
        if (i < 3) {
            ctx.fillStyle = rankColors[i];
            ctx.beginPath();
            ctx.arc(55, y - 10, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#000";
            ctx.font = "bold 16px Arial";
            ctx.textAlign = "center";
            ctx.fillText(i + 1, 55, y - 4);
        } else {
            ctx.fillStyle = "#9ca3af";
            ctx.font = "16px BeVietnamPro, Sans";
            ctx.textAlign = "center";
            ctx.fillText(i + 1, 55, y - 4);
        }

        // Name
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 18px BeVietnamPro, Sans";
        const name = p.name ? (p.name.length > 20 ? p.name.substring(0, 18) + "..." : p.name) : "Người Chơi";
        ctx.fillText(name, 120, y - 4);

        // Stats
        ctx.textAlign = "right";
        ctx.fillStyle = "#fbbf24";
        ctx.fillText(p.wins || 0, 450, y - 4);

        const rate = p.matches > 0 ? ((p.wins / p.matches) * 100).toFixed(1) : "0.0";
        ctx.fillStyle = "#34d399";
        ctx.fillText(`${rate}%`, 550, y - 4);
    });

    return canvas.toBuffer("image/png");
}

export async function drawYanh3dSearch(items = [], query = "YANH3D") {
    const width = 1000;
    const height = 720;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#120f1f");
    bg.addColorStop(0.52, "#201423");
    bg.addColorStop(1, "#09090f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(249,115,22,0.18)";
    ctx.beginPath();
    ctx.arc(860, 96, 180, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(45,212,191,0.12)";
    ctx.beginPath();
    ctx.arc(130, 640, 210, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    drawRoundRect(ctx, 24, 24, 952, 672, 28);
    ctx.fill();

    ctx.fillStyle = "#fb923c";
    ctx.font = "bold 42px BeVietnamProBold, Sans";
    ctx.textAlign = "left";
    ctx.fillText("YANH3D SEARCH", 46, 66);

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "20px BeVietnamPro, Sans";
    const subtitle = `Ket qua cho: ${query}`.slice(0, 52);
    ctx.fillText(subtitle, 46, 98);

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    drawRoundRect(ctx, 760, 42, 176, 34, 16);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 16px BeVietnamProBold, Sans";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.min(items.length, 5)} ITEMS`, 848, 64);

    const startY = 128;
    const cardH = 104;
    const gap = 16;

    for (let i = 0; i < Math.min(items.length, 5); i++) {
        const item = items[i] || {};
        const y = startY + i * (cardH + gap);

        ctx.fillStyle = "rgba(255,255,255,0.055)";
        drawRoundRect(ctx, 38, y, 924, cardH, 22);
        ctx.fill();

        const accent = ctx.createLinearGradient(38, y, 38, y + cardH);
        accent.addColorStop(0, "#fb923c");
        accent.addColorStop(1, "#f43f5e");
        ctx.fillStyle = accent;
        drawRoundRect(ctx, 38, y, 8, cardH, 8);
        ctx.fill();

        const thumbX = 64;
        const thumbY = y + 10;
        const thumbW = 136;
        const thumbH = 84;

        try {
            const thumbUrl = item.thumb || item.image || item.poster_url || item.thumb_url;
            if (thumbUrl?.startsWith("http")) {
                const res = await axios.get(thumbUrl, { responseType: "arraybuffer", timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, thumbX, thumbY, thumbW, thumbH, 14);
                ctx.clip();
                ctx.drawImage(img, thumbX, thumbY, thumbW, thumbH);
                ctx.restore();
            }
        } catch {}

        ctx.fillStyle = "#fb923c";
        drawRoundRect(ctx, 54, y + 10, 34, 28, 14);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.font = "bold 17px BeVietnamProBold, Sans";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), 71, y + 30);

        const quality = item.quality || "";
        if (quality) {
            ctx.fillStyle = "rgba(45,212,191,0.18)";
            drawRoundRect(ctx, 838, y + 16, 92, 28, 14);
            ctx.fill();
            ctx.fillStyle = "#99f6e4";
            ctx.font = "bold 15px BeVietnamProBold, Sans";
            ctx.fillText(quality.slice(0, 10), 884, y + 35);
        }

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px BeVietnamProBold, NotoEmojiBold, Sans";
        let title = item.title || item.name || "Unknown";
        while (title.length > 0 && ctx.measureText(title).width > 580) {
            title = title.slice(0, -1);
        }
        if ((item.title || item.name || "").length > title.length) title += "...";
        ctx.fillText(title, 224, y + 38);

        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "18px BeVietnamPro, Sans";
        const statusLine = item.episode_current || item.meta || "Dang cap nhat";
        ctx.fillText(statusLine.slice(0, 54), 224, y + 68);

        ctx.fillStyle = "rgba(255,255,255,0.18)";
        drawRoundRect(ctx, 224, y + 78, 108, 18, 9);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.font = "bold 12px BeVietnamProBold, Sans";
        ctx.fillText("Nguon: YanHH3D", 236, y + 91);
    }

    ctx.fillStyle = "rgba(255,255,255,0.38)";
    ctx.textAlign = "center";
    ctx.font = "16px BeVietnamPro, Sans";
    ctx.fillText("Reply so thu tu de mo danh sach tap", width / 2, height - 26);

    return canvas.toBuffer("image/png");
}

export async function drawMovieSearch(items = [], query = "PHIM") {
    const width = 1000;
    const height = 700;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#111827");
    bg.addColorStop(1, "#030712");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 42px BeVietnamProBold, Sans";
    ctx.textAlign = "left";
    ctx.fillText("MOVIE SEARCH", 40, 60);

    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "22px BeVietnamPro, Sans";
    ctx.fillText(`${query}`.toUpperCase().slice(0, 40), 40, 95);

    const startY = 130;
    const cardH = 104;
    const gap = 16;

    for (let i = 0; i < Math.min(items.length, 5); i++) {
        const item = items[i] || {};
        const y = startY + i * (cardH + gap);

        ctx.fillStyle = "rgba(255,255,255,0.06)";
        drawRoundRect(ctx, 30, y, 940, cardH, 18);
        ctx.fill();

        const thumbX = 48;
        const thumbY = y + 12;
        const thumbW = 120;
        const thumbH = 80;

        try {
            const thumbUrl = item.poster_url || item.thumb_url || item.image || item.thumb;
            if (thumbUrl?.startsWith("http")) {
                const res = await axios.get(thumbUrl, { responseType: "arraybuffer", timeout: 5000 });
                const img = await loadImage(Buffer.from(res.data));
                ctx.save();
                drawRoundRect(ctx, thumbX, thumbY, thumbW, thumbH, 12);
                ctx.clip();
                ctx.drawImage(img, thumbX, thumbY, thumbW, thumbH);
                ctx.restore();
            }
        } catch {}

        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(58, y + 18, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.textAlign = "center";
        ctx.font = "bold 18px BeVietnamProBold, Sans";
        ctx.fillText(String(i + 1), 58, y + 24);

        ctx.textAlign = "left";
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 24px BeVietnamProBold, NotoEmojiBold, Sans";
        let title = item.name || item.title || item.slug || "Unknown";
        if (ctx.measureText(title).width > 720) {
            while (title.length > 0 && ctx.measureText(`${title}...`).width > 720) title = title.slice(0, -1);
            title += "...";
        }
        ctx.fillText(title, 190, y + 42);

        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.font = "18px BeVietnamPro, Sans";
        const meta = [
            item.origin_name || item.originName,
            item.year,
            item.quality,
            item.lang,
            item.episode_current
        ].filter(Boolean).join(" • ");
        ctx.fillText(meta || "Khong co mo ta", 190, y + 74);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.font = "16px BeVietnamPro, Sans";
    ctx.fillText("Reply so thu tu de xem chi tiet", width / 2, height - 26);

    return canvas.toBuffer("image/png");
}

export async function drawMovieDetail(movie = {}, episodes = []) {
    const width = 1000;
    const height = 760;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0f172a");
    bg.addColorStop(1, "#111827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255,255,255,0.05)";
    drawRoundRect(ctx, 30, 30, 940, 700, 24);
    ctx.fill();

    const posterX = 60;
    const posterY = 60;
    const posterW = 250;
    const posterH = 360;

    try {
        const posterUrl = movie.poster_url || movie.thumb_url || movie.poster || movie.thumb;
        if (posterUrl?.startsWith("http")) {
            const res = await axios.get(posterUrl, { responseType: "arraybuffer", timeout: 5000 });
            const img = await loadImage(Buffer.from(res.data));
            ctx.save();
            drawRoundRect(ctx, posterX, posterY, posterW, posterH, 18);
            ctx.clip();
            ctx.drawImage(img, posterX, posterY, posterW, posterH);
            ctx.restore();
        }
    } catch {}

    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px BeVietnamProBold, NotoEmojiBold, Sans";
    let title = movie.name || movie.title || movie.slug || "Movie";
    if (ctx.measureText(title).width > 600) {
        while (title.length > 0 && ctx.measureText(`${title}...`).width > 600) title = title.slice(0, -1);
        title += "...";
    }
    ctx.fillText(title, 340, 95);

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "20px BeVietnamPro, Sans";
    const infoLines = [
        `Ten goc: ${movie.origin_name || movie.originName || "N/A"}`,
        `Nam: ${movie.year || "N/A"}`,
        `Thoi luong: ${movie.time || "N/A"}`,
        `Chat luong: ${movie.quality || "N/A"}`,
        `Ngon ngu: ${movie.lang || "N/A"}`,
        `Trang thai: ${movie.status || "N/A"}`
    ];
    infoLines.forEach((line, index) => ctx.fillText(line, 340, 145 + index * 34));

    const categories = Array.isArray(movie.category) ? movie.category.map((c) => c.name).join(", ") : (movie.category || "N/A");
    const countries = Array.isArray(movie.country) ? movie.country.map((c) => c.name).join(", ") : (movie.country || "N/A");
    ctx.fillText(`The loai: ${categories}`.slice(0, 58), 340, 355);
    ctx.fillText(`Quoc gia: ${countries}`.slice(0, 58), 340, 389);

    ctx.fillStyle = "#f59e0b";
    ctx.font = "bold 24px BeVietnamProBold, Sans";
    ctx.fillText(`Danh sach tap (${episodes.length})`, 60, 470);

    const episodeText = episodes
        .slice(0, 24)
        .map((ep, i) => `${i + 1}. ${ep.name || `Tap ${i + 1}`}`)
        .join("   ");

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = "20px BeVietnamPro, Sans";
    const maxWidth = 880;
    const words = episodeText.split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (ctx.measureText(test).width <= maxWidth) current = test;
        else {
            if (current) lines.push(current);
            current = word;
        }
    }
    if (current) lines.push(current);

    lines.slice(0, 7).forEach((line, index) => {
        ctx.fillText(line, 60, 520 + index * 34);
    });

    if (episodes.length > 24) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText(`...va ${episodes.length - 24} tap nua`, 60, 520 + Math.min(lines.length, 7) * 34);
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.textAlign = "center";
    ctx.font = "16px BeVietnamPro, Sans";
    ctx.fillText("Reply so tap de bot tai va gui video", width / 2, height - 28);

    return canvas.toBuffer("image/png");
}
