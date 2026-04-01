import { getDetailPlaylist, getStreamZing, getZingChart } from "../utils/zingmp3.js";
import { rentalManager } from "../utils/rentalManager.js";
import { statsManager } from "../utils/statsManager.js";
import { threadSettingsManager } from "../utils/threadSettingsManager.js";
import { drawZingSearch, drawZingPlayer, drawZingPlaylist } from "../utils/canvasHelper.js";
import { uploadToTmpFiles } from "../utils/tmpFiles.js";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { log } from "../logger.js";
import { createSpinningSticker } from "../utils/process-audio.js";

export const name = "hotmusic";
export const version = "2.0.0";
export const description = "Tự động gửi nhạc Remix Thịnh Hành ngẫu nhiên mỗi giờ";

const PLAYLISTS = [
    { id: "Z6CZO0F6", name: "BẢNG XẾP HẠNG V-POP" },
    { id: "ZUAZ97OC", name: "REMIX THỊNH HÀNH" },
    { id: "ZING_CHART", name: "ZING CHART REALTIME" }
];

export const commands = {
    hotmusic: async (ctx) => {
        const { api, threadId, threadType, adminIds, senderId } = ctx;
        if (!adminIds.includes(String(senderId))) return;

        const selected = PLAYLISTS[Math.floor(Math.random() * PLAYLISTS.length)];
        await api.sendMessage({ msg: `🔍 Đang lấy dữ liệu từ: ${selected.name}...` }, threadId, threadType);
        await sendHotMusicToThread(api, threadId, threadType, selected);
    }
};

/**
 * Gửi nhạc hot nhất đến một thread cụ thể
 */
async function sendHotMusicToThread(api, threadId, threadType, selectedPlaylist) {
    try {
        const selected = selectedPlaylist || PLAYLISTS[Math.floor(Math.random() * PLAYLISTS.length)];
        let playlistData = null;
        let songs = [];

        if (selected.id === "ZING_CHART") {
            const chartData = await getZingChart();
            if (!chartData || !chartData.RTChart?.items) return;
            songs = chartData.RTChart.items;
            playlistData = {
                title: "Zing Chart Realtime",
                thumbnail: "https://zjs.zmdcdn.me/zmp3-desktop/dev/static/images/charthome-bg.png",
                artistsNames: "Cập nhật từng giờ"
            };
        } else {
            playlistData = await getDetailPlaylist(selected.id);
            if (!playlistData || !playlistData.song?.items) return;
            songs = playlistData.song.items;
        }

        // 1. Gửi bảng xếp hạng Canvas (Top 10)
        const topImgBuffer = await drawZingPlaylist(playlistData, songs.slice(0, 10));
        const topImgPath = path.join(process.cwd(), `src/modules/cache/top_hot_${Date.now()}.png`);
        fs.writeFileSync(topImgPath, topImgBuffer);

        const remoteTopUrl = await uploadToTmpFiles(topImgPath, api, threadId, threadType);
        const topMsg = `[ 🏆 ${selected.name} ]\n─────────────────\n✨ Top những bản nhạc bùng nổ nhất hôm nay!\n🔥 Đang chọn ngẫu nhiên bài hát để gửi cho bạn...`;

        if (remoteTopUrl) {
            await api.sendImageEnhanced({ imageUrl: remoteTopUrl, threadId, threadType, width: 800, height: 1300, msg: topMsg });
        } else {
            await api.sendMessage({ msg: topMsg, attachments: [topImgPath] }, threadId, threadType);
        }
        if (fs.existsSync(topImgPath)) try { fs.unlinkSync(topImgPath); } catch (e) { }

        // 2. Chọn ngẫu nhiên 1 bài không VIP
        const freeSongs = songs.filter(s => s.streamingStatus !== 3 && !s.isVIP).slice(0, 20);
        if (freeSongs.length === 0) return;

        const song = freeSongs[Math.floor(Math.random() * freeSongs.length)];
        const info = await getStreamZing(song.encodeId);
        const streamUrl = info?.["128"] || info?.["320"] || info?.default;
        if (!streamUrl || streamUrl === "VIP") return;

        const tempFile = path.join(process.cwd(), `src/modules/cache/hot_${Date.now()}.mp3`);
        const resAudio = await axios({ method: 'get', url: streamUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(tempFile);
        resAudio.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        // Gửi voice
        await api.sendVoiceUnified({ filePath: tempFile, threadId, threadType });

        // Player Card
        const playerImgBuffer = await drawZingPlayer(song);
        const playerPath = path.join(process.cwd(), `src/modules/cache/hot_p_${Date.now()}.png`);
        fs.writeFileSync(playerPath, playerImgBuffer);

        const remotePlayerUrl = await uploadToTmpFiles(playerPath, api, threadId, threadType);
        const statusMsg = `[ 🎶 RANDOM MUSIC ]\n─────────────────\n🎵 Title: ${song.title}\n👤 Artist: ${song.artistsNames}\n─────────────────`;

        if (remotePlayerUrl) {
            await api.sendImageEnhanced({ imageUrl: remotePlayerUrl, threadId, threadType, width: 800, height: 260, msg: statusMsg });
        } else {
            await api.sendMessage({ msg: statusMsg, attachments: [playerPath] }, threadId, threadType);
        }

        // Sticker đĩa quay
        const thumbnail = (song.thumbnail || song.thumb || "").replace("w94", "w500");
        if (thumbnail) {
            const spinPath = path.join(process.cwd(), `src/modules/cache/spin_hot_${Date.now()}.webp`);
            if (await createSpinningSticker(thumbnail, spinPath)) {
                const spinUrl = await uploadToTmpFiles(spinPath, api, threadId, threadType);
                if (spinUrl) await api.sendCustomSticker({ staticImgUrl: spinUrl, animationImgUrl: spinUrl, threadId, threadType, width: 512, height: 512 });
                if (fs.existsSync(spinPath)) try { fs.unlinkSync(spinPath); } catch (e) { }
            }
        }

        if (fs.existsSync(tempFile)) try { fs.unlinkSync(tempFile); } catch (e) { }
        if (fs.existsSync(playerPath)) try { fs.unlinkSync(playerPath); } catch (e) { }
    } catch (e) {
        log.error("[HotMusic Error]:", e.message);
    }
}

/**
 * Hàm chay tự động cho Autosend Ticker mỗi giờ
 */
export async function autoSendHotMusic(api, log) {
    const threads = statsManager.getAllThreads();
    const rentedThreads = threads.filter(tid => {
        const config = threadSettingsManager.get(tid, "autosend", null);
        return rentalManager.isRented(tid) && config && config.enabled && config.type === "hotmusic";
    });
    if (rentedThreads.length === 0) return;

    // Chọn ngẫu nhiên 1 trong các Playlist hoặc Zing Chart
    const selectedPlaylist = PLAYLISTS[Math.floor(Math.random() * PLAYLISTS.length)];
    let playlistData = null;
    let songs = [];

    try {
        if (selectedPlaylist.id === "ZING_CHART") {
            const chartData = await getZingChart();
            if (!chartData || !chartData.RTChart?.items) return;
            songs = chartData.RTChart.items;
            playlistData = { title: "Zing Chart", thumbnail: "https://zjs.zmdcdn.me/zmp3-desktop/dev/static/images/charthome-bg.png", artistsNames: "Cập nhật từng giờ" };
        } else {
            playlistData = await getDetailPlaylist(selectedPlaylist.id);
            if (!playlistData || !playlistData.song?.items) return;
            songs = playlistData.song.items;
        }

        const freeSongs = songs.filter(s => s.streamingStatus !== 3 && !s.isVIP).slice(0, 30);
        if (freeSongs.length === 0) return;

        const song = freeSongs[Math.floor(Math.random() * freeSongs.length)];
        const info = await getStreamZing(song.encodeId);
        const streamUrl = info?.["128"] || info?.["320"] || info?.default;
        if (!streamUrl || streamUrl === "VIP") return;

        const tempFile = path.join(process.cwd(), `src/modules/cache/auto_hot_${Date.now()}.mp3`);
        const response = await axios({ method: 'get', url: streamUrl, responseType: 'stream' });
        const writer = fs.createWriteStream(tempFile);
        response.data.pipe(writer);
        await new Promise((r) => writer.on("finish", r));

        // Chuẩn bị Canvas
        const playerImgBuffer = await drawZingPlayer(song);
        const playerImgPath = path.join(process.cwd(), `src/modules/cache/auto_hp_${Date.now()}.png`);
        fs.writeFileSync(playerImgPath, playerImgBuffer);

        const topImgBuffer = await drawZingPlaylist(playlistData, songs.slice(0, 10));
        const topImgPath = path.join(process.cwd(), `src/modules/cache/auto_hlist_${Date.now()}.png`);
        fs.writeFileSync(topImgPath, topImgBuffer);

        // Upload lấy link CDN dùng chung
        const anchorThread = rentedThreads[0];
        const remotePlayerUrl = await uploadToTmpFiles(playerImgPath, api, anchorThread, 1);
        const remoteTopUrl = await uploadToTmpFiles(topImgPath, api, anchorThread, 1);

        let spinUrlGlobal = null;
        const thumbnailSrc = (song.thumbnail || song.thumb || "").replace("w94", "w500");
        const tempSpin = path.join(process.cwd(), `src/modules/cache/auto_hspin_${Date.now()}.webp`);
        if (await createSpinningSticker(thumbnailSrc, tempSpin)) {
            spinUrlGlobal = await uploadToTmpFiles(tempSpin, api, anchorThread, 1);
            if (fs.existsSync(tempSpin)) try { fs.unlinkSync(tempSpin); } catch (e) { }
        }

        // Gửi tới tất cả các nhóm đã thuê
        for (const tid of rentedThreads) {
            try {
                const topMsg = `[ 🏆 ${selectedPlaylist.name} MỖI GIỜ ]\n─────────────────\n✨ Cập nhật bảng xếp hạng những bản nhạc đang hot nhất!`;
                if (remoteTopUrl) await api.sendImageEnhanced({ imageUrl: remoteTopUrl, threadId: tid, threadType: 1, width: 800, height: 1300, msg: topMsg });
                
                await api.sendVoiceUnified({ filePath: tempFile, threadId: tid, threadType: 1 });

                const playerMsg = `[ 🔥 RANDOM MUSIC ]\n─────────────────\n🎵 Title: ${song.title}\n👤 Artist: ${song.artistsNames}\n─────────────────\nChúc mọi người nghe nhạc vui vẻ! ❤️`;
                if (remotePlayerUrl) await api.sendImageEnhanced({ imageUrl: remotePlayerUrl, threadId: tid, threadType: 1, width: 800, height: 260, msg: playerMsg });

                if (spinUrlGlobal) await api.sendCustomSticker({ staticImgUrl: spinUrlGlobal, animationImgUrl: spinUrlGlobal, threadId: tid, threadType: 1, width: 512, height: 512 });
            } catch (err) { }
        }

        if (fs.existsSync(tempFile)) try { fs.unlinkSync(tempFile); } catch (e) { }
        if (fs.existsSync(playerImgPath)) try { fs.unlinkSync(playerImgPath); } catch (e) { }
        if (fs.existsSync(topImgPath)) try { fs.unlinkSync(topImgPath); } catch (e) { }
    } catch (e) {
        log.error("Lỗi autoSendHotMusic:", e.message);
    }
}
