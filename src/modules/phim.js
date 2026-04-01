import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import { log } from "../logger.js";
import { drawMovieSearch, drawMovieDetail } from "../utils/canvasHelper.js";

function resolveBin(name) {
    try {
        const cmd = process.platform === "win32" ? `where ${name}` : `which ${name}`;
        return execSync(cmd, { encoding: "utf8" }).trim().split(/\r?\n/)[0].trim() || name;
    } catch {
        return name;
    }
}

try { ffmpeg.setFfmpegPath(resolveBin("ffmpeg")); } catch {}
try { ffmpeg.setFfprobePath(resolveBin("ffprobe")); } catch {}

export const name = "phim";
export const description = "Tim kiem va xem phim tu PhimAPI";

const PHIMAPI = "https://phimapi.com";
const CACHE_DIR = path.join(process.cwd(), "src/modules/cache");
const pendingPhimSearch = new Map();
const pendingPhimEpisodes = new Map();
const DEFAULT_ZALO_MAX_VIDEO_SIZE = 100 * 1024 * 1024;

const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    "Referer": `${PHIMAPI}/`,
    "Origin": PHIMAPI,
};

let sessionCookie = "";

function getZaloMaxVideoSize(api) {
    const appCtx = api?.getContext?.() || api?.context || api?.ctx || {};
    const sharefile = appCtx?.settings?.features?.sharefile || {};
    const maxSizeMb = Number(sharefile.max_size_share_file_v3 || sharefile.max_size_share_file || 0);
    if (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0) return DEFAULT_ZALO_MAX_VIDEO_SIZE;

    const safeMb = Math.max(32, maxSizeMb - 5);
    return safeMb * 1024 * 1024;
}

function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function safeUnlink(filePath, delay = 0) {
    const remove = () => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {}
    };
    if (delay > 0) setTimeout(remove, delay);
    else remove();
}

async function sendMsg(ctx, text) {
    await ctx.api.sendMessage({ msg: text, quote: ctx.message?.data }, ctx.threadId, ctx.threadType);
}

async function getSessionCookie() {
    try {
        const res = await axios.get(`${PHIMAPI}/danh-sach/phim-moi-cap-nhat?page=1`, {
            headers: BROWSER_HEADERS,
            timeout: 8000
        });
        const setCookie = res.headers["set-cookie"];
        if (setCookie) {
            sessionCookie = setCookie.map((c) => c.split(";")[0]).join("; ");
        }
    } catch {}
}

async function apiGet(url, retries = 2) {
    const headers = { ...BROWSER_HEADERS };
    if (sessionCookie) headers.Cookie = sessionCookie;

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await axios.get(url, { headers, timeout: 10000 });
            if (res.data?.status === false && res.data?.msg === "hmmm!") {
                await getSessionCookie();
                headers.Cookie = sessionCookie;
                continue;
            }
            return res.data;
        } catch (error) {
            if (i === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 800 * (i + 1)));
        }
    }

    throw new Error("Khong the ket noi API phim");
}

async function getLatest(page = 1) {
    return apiGet(`${PHIMAPI}/danh-sach/phim-moi-cap-nhat?page=${page}`);
}

async function getDetail(slug) {
    const endpoints = [
        `${PHIMAPI}/phim/${slug}`,
        `${PHIMAPI}/v1/api/phim/${slug}`
    ];
    let lastErr = null;
    for (const url of endpoints) {
        try {
            const data = await apiGet(url);
            if (data) return data;
        } catch (error) {
            lastErr = error;
        }
    }
    throw lastErr || new Error("Khong lay duoc thong tin phim");
}

const SEARCH_ENDPOINTS = [
    (kw) => `${PHIMAPI}/v1/api/tim-kiem?keyword=${encodeURIComponent(kw)}`,
    (kw) => `${PHIMAPI}/tim-kiem?keyword=${encodeURIComponent(kw)}`,
    (kw) => `https://ophim17.cc/tim-kiem?keyword=${encodeURIComponent(kw)}`
];

async function searchPhim(keyword) {
    if (!sessionCookie) await getSessionCookie();
    let lastErr = null;

    for (const buildUrl of SEARCH_ENDPOINTS) {
        try {
            const data = await apiGet(buildUrl(keyword));
            const items = data?.items || data?.data?.items || [];
            if (data?.status === false && !items.length) continue;
            if (!items.length) continue;
            return { ...data, items };
        } catch (error) {
            lastErr = error;
        }
    }

    throw lastErr || new Error("API tim kiem khong kha dung, hay thu .phim de duyet phim moi");
}

function buildCdnReferers(m3u8Url) {
    const referers = [
        "https://phimapi.com/",
        "https://player.phimapi.com/",
        "https://ophim1.com/",
        "https://kkphim.vip/",
        "https://www.phimmoi.net/",
        "https://vip.opstream17.com/",
        "https://player.ophim.dev/"
    ];

    try {
        const url = new URL(m3u8Url);
        const cdnOrigin = `${url.protocol}//${url.host}/`;
        if (!referers.includes(cdnOrigin)) referers.unshift(cdnOrigin);
    } catch {}

    return referers;
}

async function downloadM3U8(m3u8Url, outputPath) {
    const referers = buildCdnReferers(m3u8Url);
    let lastErr = null;

    for (const referer of referers) {
        safeUnlink(outputPath);
        try {
            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error("Timeout 90s")), 90000);
                const origin = new URL(referer).origin;
                ffmpeg(m3u8Url)
                    .inputOptions([
                        "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
                        "-user_agent", BROWSER_HEADERS["User-Agent"],
                        "-headers",
                        `Referer: ${referer}\r\nOrigin: ${origin}\r\nAccept: */*\r\nAccept-Language: vi-VN,vi;q=0.9\r\n`
                    ])
                    .outputOptions(["-c copy", "-bsf:a aac_adtstoasc", "-movflags +faststart"])
                    .output(outputPath)
                    .on("end", () => {
                        clearTimeout(timer);
                        resolve();
                    })
                    .on("error", (error) => {
                        clearTimeout(timer);
                        reject(error);
                    })
                    .run();
            });

            if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10240) return;
            throw new Error("File qua nho sau khi tai");
        } catch (error) {
            lastErr = error;
            safeUnlink(outputPath, 1000);
        }
    }

    throw lastErr || new Error("Khong tai duoc M3U8 tu bat ky CDN nao");
}

async function getVideoDuration(inputPath) {
    return await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(inputPath, (error, metadata) => {
            if (error) return reject(error);
            const duration = Number(metadata?.format?.duration || 0);
            if (!duration || !Number.isFinite(duration)) {
                return reject(new Error("Khong lay duoc thoi luong video"));
            }
            resolve(duration);
        });
    });
}

async function compressVideoForZalo(inputPath, outputPath, targetSize = DEFAULT_ZALO_MAX_VIDEO_SIZE) {
    const duration = await getVideoDuration(inputPath);
    const audioBitrateK = 48;
    const targetTotalBitrate = Math.floor((targetSize * 8) / duration / 1000);
    const videoBitrateK = Math.max(220, targetTotalBitrate - audioBitrateK - 16);

    await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoCodec("libx264")
            .audioCodec("aac")
            .audioBitrate(`${audioBitrateK}k`)
            .videoBitrate(`${videoBitrateK}k`)
            .size("640x?")
            .outputOptions([
                "-preset veryfast",
                "-crf 31",
                "-maxrate 900k",
                "-bufsize 1800k",
                "-movflags +faststart"
            ])
            .output(outputPath)
            .on("end", resolve)
            .on("error", reject)
            .run();
    });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size <= 10240) {
        throw new Error("Nen video that bai");
    }
}

const FALLBACK_SOURCES = [
    {
        name: "ophim17",
        detail: (slug) => `https://ophim17.cc/phim/${slug}`,
        normalize: (data) => data?.episodes || data?.data?.episodes || []
    },
    {
        name: "kkphim",
        detail: (slug) => `https://kkphim.vip/phim/${slug}`,
        normalize: (data) => data?.episodes || data?.data?.episodes || []
    },
    {
        name: "phimmoichil",
        detail: (slug) => `https://phimmoichil.net/phim/${slug}`,
        normalize: (data) => data?.episodes || data?.data?.episodes || []
    },
    {
        name: "movieapi",
        detail: (slug) => `https://movieapi.dev/phim/${slug}`,
        normalize: (data) => data?.episodes || data?.data?.episodes || []
    }
];

const ALT_EMBED_REGEXES = [
    /file\s*:\s*["']([^"']*\.m3u8[^"']*)/gi,
    /source\s*:\s*["']([^"']*\.m3u8[^"']*)/gi,
    /["'](https?:\/\/[^"']+\.m3u8[^"']*)/gi,
    /url\s*:\s*["']([^"']*\.m3u8[^"']*)/gi,
    /"hls"\s*:\s*"([^"]+)"/gi,
    /hlsUrl\s*[:=]\s*["']([^"']+\.m3u8[^"']*)/gi
];

function tryGetHost(url) {
    try {
        return new URL(url).host;
    } catch {
        return url?.slice(0, 40) || "?";
    }
}

async function scrapeM3u8FromPage(url) {
    try {
        const res = await axios.get(url, {
            headers: { ...BROWSER_HEADERS, Referer: url },
            timeout: 12000,
            maxRedirects: 5
        });
        const html = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        const found = new Set();
        for (const regex of ALT_EMBED_REGEXES) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const streamUrl = match[1].replace(/\\/g, "");
                if (streamUrl.startsWith("http") && streamUrl.includes(".m3u8")) found.add(streamUrl);
            }
        }
        return [...found];
    } catch {
        return [];
    }
}

async function scrapeFallbackM3u8(slug, epIndex = 0, epName = "") {
    const results = [];

    for (const src of FALLBACK_SOURCES) {
        try {
            const data = await apiGet(src.detail(slug), 1);
            const servers = src.normalize(data).filter((server) => server?.server_data?.length > 0);
            if (!servers.length) continue;

            for (const server of servers) {
                const ep = server.server_data[epIndex] || server.server_data.find((item) =>
                    item.name && epName && (item.name === epName || item.slug === epName)
                );
                if (ep?.link_m3u8?.startsWith("http")) {
                    results.push({ url: ep.link_m3u8, source: src.name });
                }
            }
        } catch {}
    }

    return results;
}

function buildWatchLink(ep) {
    if (ep.link_embed) return ep.link_embed;
    if (ep.link_m3u8) return `https://player.phimapi.com/player/?url=${encodeURIComponent(ep.link_m3u8)}`;
    return null;
}

export const commands = {
    phim: async (ctx) => {
        const { api, threadId, threadType, senderId, args } = ctx;
        const query = args.join(" ").trim();
        const pageMatch = query.match(/^(?:trang\s*|t|p)(\d+)$/i);
        const isPageOnly = !query || pageMatch || /^\d+$/.test(query);
        const page = pageMatch ? parseInt(pageMatch[1], 10) : (/^\d+$/.test(query) ? parseInt(query, 10) : 1);

        if (!query || isPageOnly) {
            const pageNum = Math.max(1, page);
            await sendMsg(ctx, `Dang tai phim moi trang ${pageNum}...`);

            try {
                const data = await getLatest(pageNum);
                const items = data?.items || data?.data?.items || [];
                if (!items.length) return sendMsg(ctx, `Khong con phim o trang ${pageNum}.`);

                ensureCacheDir();
                const results = items.slice(0, 5);
                const buffer = await drawMovieSearch(results, `PHIM MOI - TRANG ${pageNum}`);
                const tmpPath = path.join(CACHE_DIR, `phim_search_${Date.now()}.png`);
                fs.writeFileSync(tmpPath, buffer);

                pendingPhimSearch.set(`${threadId}-${senderId}`, results);
                await api.sendMessage({
                    msg: `Phim moi trang ${pageNum} - reply so (1-5) de xem chi tiet.\nXem trang khac: .phim trang 2`,
                    attachments: [tmpPath]
                }, threadId, threadType);
                safeUnlink(tmpPath);
                setTimeout(() => pendingPhimSearch.delete(`${threadId}-${senderId}`), 120000);
            } catch (error) {
                log.error("[Phim] Latest error:", error.message);
                await sendMsg(ctx, `Loi tai danh sach phim: ${error.message}`);
            }
            return;
        }

        try {
            await sendMsg(ctx, `Dang tim kiem: "${query}"...`);
            const data = await searchPhim(query);
            const items = data?.items || data?.data?.items || [];
            if (!items.length) return sendMsg(ctx, `Khong tim thay phim voi tu khoa: "${query}"`);

            ensureCacheDir();
            const results = items.slice(0, 5);
            const buffer = await drawMovieSearch(results, query);
            const tmpPath = path.join(CACHE_DIR, `phim_search_${Date.now()}.png`);
            fs.writeFileSync(tmpPath, buffer);

            pendingPhimSearch.set(`${threadId}-${senderId}`, results);
            await api.sendMessage({
                msg: `Tim thay ${items.length} ket qua - reply so (1-5) de xem chi tiet.`,
                attachments: [tmpPath]
            }, threadId, threadType);
            safeUnlink(tmpPath);
            setTimeout(() => pendingPhimSearch.delete(`${threadId}-${senderId}`), 120000);
        } catch (error) {
            log.error("[Phim] Search error:", error.message);
            await sendMsg(ctx, error.message);
        }
    }
};

export async function handle(ctx) {
    const { content, senderId, threadId, api, threadType } = ctx;
    const trimmed = content?.trim();
    const num = parseInt(trimmed, 10);
    const searchKey = `${threadId}-${senderId}`;
    const episodeKey = `${threadId}-${senderId}-ep`;

    if (Number.isNaN(num) || num < 1) return false;

    if (pendingPhimEpisodes.has(episodeKey)) {
        const epData = pendingPhimEpisodes.get(episodeKey);
        const episodes = epData.episodes;
        const idx = num - 1;

        if (idx >= episodes.length) {
            await api.sendMessage({ msg: `Khong co tap ${num}. Chon tu 1-${episodes.length}.` }, threadId, threadType);
            return true;
        }

        if (epData._timeout) clearTimeout(epData._timeout);
        epData._timeout = setTimeout(() => pendingPhimEpisodes.delete(episodeKey), 15 * 60 * 1000);

        const ep = episodes[idx];
        const epName = ep.name || `Tap ${num}`;
        const movieName = epData.movieName || "Phim";
        const watchLink = buildWatchLink(ep);
        const primaryM3u8s = [ep.link_m3u8, ...(ep._fallbackM3u8 || [])].filter((url) => url?.startsWith("http"));

        await api.sendMessage({ msg: `Dang tai "${epName}" - "${movieName}"...` }, threadId, threadType);

        const tmpBase = Date.now();
        const tmpMp4 = path.join(CACHE_DIR, `phim_ep_${tmpBase}.mp4`);
        const tmpCompressedMp4 = path.join(CACHE_DIR, `phim_ep_${tmpBase}_compressed.mp4`);
        let downloaded = false;

        for (const streamUrl of primaryM3u8s) {
            try {
                await downloadM3U8(streamUrl, tmpMp4);
                if (fs.existsSync(tmpMp4) && fs.statSync(tmpMp4).size > 10240) {
                    downloaded = true;
                    break;
                }
            } catch (error) {
                log.warn(`[Phim] CDN1 that bai (${tryGetHost(streamUrl)}): ${error.message}`);
            }
        }

        if (!downloaded && epData.slug) {
            log.warn("[Phim] CDN chinh fail -> thu nguon phu");
            await api.sendMessage({ msg: "CDN chinh that bai, dang tim nguon phu..." }, threadId, threadType);
            try {
                const altLinks = await scrapeFallbackM3u8(epData.slug, idx, ep.name || "");
                for (const { url, source } of altLinks) {
                    try {
                        await downloadM3U8(url, tmpMp4);
                        if (fs.existsSync(tmpMp4) && fs.statSync(tmpMp4).size > 10240) {
                            downloaded = true;
                            log.warn(`[Phim] Tai thanh cong tu nguon phu [${source}]`);
                            break;
                        }
                    } catch (error) {
                        log.warn(`[Phim] Nguon phu [${source}] fail: ${error.message}`);
                    }
                }
            } catch (error) {
                log.warn(`[Phim] Scrape nguon phu loi: ${error.message}`);
            }
        }

        if (!downloaded && ep.link_embed) {
            log.warn("[Phim] Thu scrape embed page");
            try {
                const embedLinks = await scrapeM3u8FromPage(ep.link_embed);
                for (const url of embedLinks) {
                    try {
                        await downloadM3U8(url, tmpMp4);
                        if (fs.existsSync(tmpMp4) && fs.statSync(tmpMp4).size > 10240) {
                            downloaded = true;
                            log.warn("[Phim] Tai thanh cong tu embed scrape");
                            break;
                        }
                    } catch (error) {
                        log.warn(`[Phim] Embed scrape fail: ${error.message}`);
                    }
                }
            } catch (error) {
                log.warn(`[Phim] Scrape embed loi: ${error.message}`);
            }
        }

        try {
            if (downloaded) {
                const maxVideoSize = getZaloMaxVideoSize(api);
                let sendPath = tmpMp4;
                let stat = fs.statSync(sendPath);
                const originalSizeMB = (stat.size / 1024 / 1024).toFixed(1);

                if (stat.size > maxVideoSize) {
                    await api.sendMessage({
                        msg: `Video goc ${originalSizeMB} MB, dang tu dong nen de gui Zalo...`
                    }, threadId, threadType);
                    try {
                        safeUnlink(tmpCompressedMp4);
                        await compressVideoForZalo(tmpMp4, tmpCompressedMp4, maxVideoSize);
                        const compressedStat = fs.statSync(tmpCompressedMp4);
                        if (compressedStat.size < stat.size) {
                            sendPath = tmpCompressedMp4;
                            stat = compressedStat;
                        }
                    } catch (error) {
                        log.warn(`[Phim] Nen video that bai: ${error.message}`);
                    }
                }

                const sizeMB = (stat.size / 1024 / 1024).toFixed(1);

                if (stat.size > maxVideoSize) {
                    await api.sendMessage({
                        msg: `[ ${movieName} ]\n${epName} - file van qua lon sau khi nen (${sizeMB} MB)\nGioi han hien tai: ${(maxVideoSize / 1024 / 1024).toFixed(1)} MB\n\nXem online:\n${watchLink || "Khong co link"}`
                    }, threadId, threadType);
                } else if (api.sendVideoUnified) {
                    await api.sendVideoUnified({
                        videoPath: sendPath,
                        thumbnailUrl: epData?.poster,
                        msg: `${movieName} - ${epName}`,
                        threadId,
                        threadType
                    });
                    await api.sendMessage({
                        msg: `Tap ${num}/${episodes.length} | Go so tap khac (1-${episodes.length}) de doi.`
                    }, threadId, threadType);
                } else {
                    await api.sendMessage({
                        msg: `${movieName} - ${epName}`,
                        attachments: [sendPath]
                    }, threadId, threadType);
                }
            } else {
                await api.sendMessage({
                    msg: `[ ${movieName} ]\nTap: ${epName}\nTat ca CDN va nguon phu deu that bai.\n\nXem online:\n${watchLink || "Khong co link"}\n\nGo so tap khac (1-${episodes.length}) de thu tap khac.`
                }, threadId, threadType);
            }
        } finally {
            safeUnlink(tmpMp4, 3000);
            safeUnlink(tmpCompressedMp4, 3000);
        }

        return true;
    }

    if (!pendingPhimSearch.has(searchKey) || num > 5) return false;

    const movies = pendingPhimSearch.get(searchKey);
    const movie = movies[num - 1];
    if (!movie) return false;

    pendingPhimSearch.delete(searchKey);
    await api.sendMessage({ msg: `Dang tai chi tiet "${movie.name || movie.slug}"...` }, threadId, threadType);

    try {
        const detail = await getDetail(movie.slug);
        const movieInfo = detail?.movie || detail?.data?.item || {};
        const rawEpisodes = detail?.episodes || detail?.data?.episodes || [];
        const allServers = rawEpisodes.filter((server) => server?.server_data?.length > 0);

        let episodeList = [];
        if (allServers.length > 0) {
            episodeList = allServers[0].server_data.map((ep, i) => {
                const fallbackLinks = allServers.slice(1)
                    .map((server) => server.server_data?.[i]?.link_m3u8)
                    .filter(Boolean);
                return { ...ep, _fallbackM3u8: fallbackLinks };
            });
        }

        if (!episodeList.length) {
            await api.sendMessage({ msg: "Phim nay chua co tap nao hoac dang cap nhat." }, threadId, threadType);
            return true;
        }

        ensureCacheDir();
        const buffer = await drawMovieDetail(movieInfo, episodeList);
        const tmpPath = path.join(CACHE_DIR, `phim_detail_${Date.now()}.png`);
        fs.writeFileSync(tmpPath, buffer);

        const epEntry = {
            episodes: episodeList,
            movieName: movieInfo.name || movie.name,
            poster: movieInfo.poster_url || movieInfo.thumb_url || movieInfo.poster || movieInfo.thumb || "",
            slug: movie.slug,
            _timeout: null
        };
        epEntry._timeout = setTimeout(() => pendingPhimEpisodes.delete(episodeKey), 15 * 60 * 1000);
        pendingPhimEpisodes.set(episodeKey, epEntry);

        const epNames = episodeList
            .slice(0, 20)
            .map((ep, i) => `${i + 1}.${ep.name || `Tap ${i + 1}`}`)
            .join("  ");

        await api.sendMessage({
            msg: `${movieInfo.name || movie.name}\n${episodeList.length} tap\n-----------------\n${epNames}${episodeList.length > 20 ? `\n...va ${episodeList.length - 20} tap nua` : ""}\n-----------------\nGo so tap de tai va xem.`,
            attachments: [tmpPath]
        }, threadId, threadType);
        safeUnlink(tmpPath);
    } catch (error) {
        log.error("[Phim] Detail error:", error.message);
        await api.sendMessage({ msg: `Loi lay chi tiet phim: ${error.message}` }, threadId, threadType);
    }

    return true;
}

getSessionCookie().catch(() => {});
