import fs from "node:fs";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { log } from "../logger.js";
import { drawYanh3dSearch } from "../utils/canvasHelper.js";

try { ffmpeg.setFfmpegPath(ffmpegStatic); } catch {}
try { ffmpeg.setFfprobePath(ffprobeStatic.path); } catch {}

export const name = "yanh3d";
export const description = "Search va tai phim tu yanhh3d";

const BASE_URL = "https://yanhh3d.cx";
const CACHE_DIR = path.join(process.cwd(), "src/modules/cache");
const DEFAULT_MAX_SEND_SIZE = 100 * 1024 * 1024;
const searchSessions = new Map();
const episodeSessions = new Map();

const DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
};

let cachedCookie = "";
let cachedCsrf = "";

function getZaloMaxSendSize(api) {
    const appCtx = api?.getContext?.() || api?.context || api?.ctx || {};
    const sharefile = appCtx?.settings?.features?.sharefile || {};
    const maxSizeMb = Number(sharefile.max_size_share_file_v3 || sharefile.max_size_share_file || 0);
    if (!Number.isFinite(maxSizeMb) || maxSizeMb <= 0) return DEFAULT_MAX_SEND_SIZE;

    // Giu mot it headroom de tranh vuot nguong do lam tron metadata/CDN.
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

function absoluteUrl(url) {
    try {
        return new URL(url, BASE_URL).toString();
    } catch {
        return url;
    }
}

function fallbackTitleFromUrl(pageUrl = "") {
    try {
        const { pathname } = new URL(pageUrl, BASE_URL);
        const parts = pathname.split("/").filter(Boolean)
            .filter((part) => !/^sever\d+$/i.test(part))
            .filter((part) => !/^tap-\d+(?:\.\d+)?$/i.test(part));
        const slug = parts[0] || "";
        if (!slug) return "";
        return slug
            .split("-")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    } catch {
        return "";
    }
}

function normalizeMovieTitle(rawTitle, pageUrl = "") {
    let title = String(rawTitle || "").replace(/\s+/g, " ").trim();
    if (!title) return fallbackTitleFromUrl(pageUrl) || "Movie";

    title = title
        .replace(/\s*[\|\-]\s*YanHH3D.*$/i, "")
        .replace(/\s+(?:Tập|Tap)\s*\d+(?:\.\d+)?(?:\s*[-:]\s*[^|]+)?\s*(?:Thuyết Minh|Vietsub)?$/i, "")
        .replace(/\s+(?:Thuyết Minh|Vietsub)$/i, "")
        .replace(/^Xem\s+/i, "")
        .trim();

    return title || fallbackTitleFromUrl(pageUrl) || "Movie";
}

function normalizeCookies(setCookie = []) {
    return setCookie.map((item) => item.split(";")[0]).join("; ");
}

async function bootstrapSession(keyword = "test") {
    const res = await axios.get(`${BASE_URL}/search?keysearch=${encodeURIComponent(keyword)}`, {
        headers: DEFAULT_HEADERS,
        timeout: 15000
    });
    cachedCookie = normalizeCookies(res.headers["set-cookie"] || []);
    const html = typeof res.data === "string" ? res.data : "";
    cachedCsrf = html.match(/meta name="csrf-token" content="([^"]+)"/i)?.[1] || "";
}

async function searchYanhh3d(keyword) {
    if (!cachedCookie || !cachedCsrf) await bootstrapSession(keyword);

    const res = await axios.get(`${BASE_URL}/ajax/search/suggest`, {
        params: { keyword },
        headers: {
            ...DEFAULT_HEADERS,
            "Accept": "*/*",
            "Referer": `${BASE_URL}/search?keysearch=${encodeURIComponent(keyword)}`,
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-TOKEN": cachedCsrf,
            "Cookie": cachedCookie
        },
        timeout: 15000
    });

    const html = res.data?.data || "";
    const $ = cheerio.load(html);
    return $("ul.limit-search li a").map((_, el) => ({
        title: $(el).attr("title")?.trim() || $(el).find(".title-search").text().trim(),
        url: absoluteUrl($(el).attr("href") || ""),
        thumb: absoluteUrl($(el).find("img").attr("src") || ""),
        meta: $(el).find(".ep-search").text().trim()
    })).get().filter((item) => item.title && item.url);
}

async function fetchHtml(url, referer = BASE_URL) {
    const res = await axios.get(absoluteUrl(url), {
        headers: {
            ...DEFAULT_HEADERS,
            "Referer": referer,
            ...(cachedCookie ? { "Cookie": cachedCookie } : {})
        },
        timeout: 20000,
        maxRedirects: 5
    });
    return typeof res.data === "string" ? res.data : JSON.stringify(res.data);
}

function parseMoviePage(html, pageUrl) {
    const $ = cheerio.load(html);
    const titleCandidates = [
        $(".film-name").first().text().trim(),
        $(".dynamic-name").first().text().trim(),
        $("meta[property='og:title']").attr("content") || "",
        $(".breadcrumb-item.active").last().text().trim(),
        $(".film-name a").first().text().trim(),
        $("title").text().trim(),
        fallbackTitleFromUrl(pageUrl)
    ];
    const title = normalizeMovieTitle(titleCandidates.find(Boolean) || "", pageUrl);
    const poster = absoluteUrl(
        $(".film-poster img").first().attr("src")
        || $(".anis-cover").attr("style")?.match(/url\((.*?)\)/)?.[1]
        || $("meta[property='og:image']").attr("content")
        || ""
    );

    const episodeNodes = $("#top-comment .ssl-item.ep-item").length
        ? $("#top-comment .ssl-item.ep-item")
        : $("#episodes-content .ssl-item.ep-item");

    const episodes = episodeNodes.map((_, el) => {
        const href = absoluteUrl($(el).attr("href") || "");
        const name = $(el).find(".ep-name").text().trim()
            || $(el).attr("title")?.trim()
            || $(el).text().replace(/\s+/g, " ").trim();
        return { name, url: href };
    }).get().filter((item) => item.url);

    const seen = new Set();
    const uniqueEpisodes = episodes.filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });

    uniqueEpisodes.sort((a, b) => {
        const an = parseFloat((a.name || "").replace(/[^\d.]/g, "")) || 0;
        const bn = parseFloat((b.name || "").replace(/[^\d.]/g, "")) || 0;
        return an - bn;
    });

    return { title, poster, pageUrl, episodes: uniqueEpisodes };
}

function getWatchUrlFromMoviePage(html) {
    const $ = cheerio.load(html);
    const links = $(".film-buttons a[href], a.btn-play[href], a[href*='/tap-']").map((_, el) => {
        const href = absoluteUrl($(el).attr("href") || "");
        return href;
    }).get().filter(Boolean);

    const preferred = links.find((href) => /\/tap-\d+(\?|$)/i.test(href) && !/\/sever\d+\//i.test(href));
    if (preferred) return preferred;

    return links.find((href) => /\/tap-\d+(\?|$)/i.test(href)) || "";
}

function parseWatchSources(html) {
    const $ = cheerio.load(html);
    const sources = $("#list_sv a[data-src]").map((_, el) => ({
        label: $(el).text().trim() || $(el).attr("name") || "server",
        url: absoluteUrl($(el).attr("data-src") || "")
    })).get().filter((item) => item.url);

    const unique = [];
    const seen = new Set();
    for (const item of sources) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        unique.push(item);
    }
    return unique;
}

const STREAM_REGEXES = [
    /data-src="([^"]+)"/gi,
    /["'](https?:\/\/[^"' ]+\.(?:m3u8|mp4)[^"' ]*)["']/gi,
    /file\s*:\s*["']([^"']+)["']/gi,
    /source\s*:\s*["']([^"']+)["']/gi,
    /hlsUrl\s*[:=]\s*["']([^"']+)["']/gi,
    /url\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/gi
];

async function resolvePlayableUrls(url, referer = BASE_URL, depth = 0) {
    if (!url || depth > 2) return [];
    const abs = absoluteUrl(url);
    if (/\.(m3u8|mp4)(\?|$)/i.test(abs)) return [abs];

    try {
        const html = await fetchHtml(abs, referer);
        const found = new Set();

        for (const regex of STREAM_REGEXES) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(html)) !== null) {
                const nextUrl = absoluteUrl(match[1].replace(/\\\//g, "/"));
                if (/\.(m3u8|mp4)(\?|$)/i.test(nextUrl)) found.add(nextUrl);
            }
        }

        if (found.size > 0) return [...found];

        const nested = [...new Set(
            [...html.matchAll(/data-src="([^"]+)"/gi)].map((m) => absoluteUrl(m[1]))
        )];
        for (const nestedUrl of nested) {
            const resolved = await resolvePlayableUrls(nestedUrl, abs, depth + 1);
            if (resolved.length) return resolved;
        }
    } catch {}

    return [];
}

function sourcePriority(label) {
    const text = (label || "").toUpperCase();
    if (text.includes("HD")) return 100;
    if (text.includes("1080")) return 90;
    if (text.includes("LINK")) return 80;
    if (text.includes("4K")) return 70;
    return 50;
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

async function compressVideo(inputPath, outputPath, targetSize = DEFAULT_MAX_SEND_SIZE) {
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
}

async function downloadMp4(url, outputPath, referer = BASE_URL) {
    const writer = fs.createWriteStream(outputPath);
    const response = await axios.get(url, {
        responseType: "stream",
        timeout: 30000,
        headers: {
            ...DEFAULT_HEADERS,
            "Referer": referer
        }
    });

    await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on("finish", resolve);
        writer.on("error", reject);
    });
}

async function downloadHls(url, outputPath, referer = BASE_URL) {
    await new Promise((resolve, reject) => {
        ffmpeg(url)
            .inputOptions([
                "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
                "-user_agent", DEFAULT_HEADERS["User-Agent"],
                "-headers",
                `Referer: ${referer}\r\nOrigin: ${new URL(referer).origin}\r\nAccept: */*\r\nAccept-Language: vi-VN,vi;q=0.9\r\n`
            ])
            .outputOptions(["-c copy", "-bsf:a aac_adtstoasc", "-movflags +faststart"])
            .output(outputPath)
            .on("end", resolve)
            .on("error", reject)
            .run();
    });
}

async function downloadPlayableUrl(url, outputPath, referer = BASE_URL) {
    if (/\.mp4(\?|$)/i.test(url)) {
        await downloadMp4(url, outputPath, referer);
        return;
    }
    await downloadHls(url, outputPath, referer);
}

async function pickPlayableSource(sources, referer) {
    const sorted = [...sources].sort((a, b) => sourcePriority(b.label) - sourcePriority(a.label));
    for (const source of sorted) {
        const resolved = await resolvePlayableUrls(source.url, referer);
        if (resolved.length) {
            return {
                label: source.label,
                pageUrl: source.url,
                playableUrls: resolved
            };
        }
    }
    return null;
}

function formatEpisodeList(episodes) {
    return episodes.slice(0, 30).map((ep, index) => `${index + 1}. ${ep.name || `Tap ${index + 1}`}`).join("\n");
}

function buildSearchText(results = []) {
    return results.map((item, index) =>
        `${index + 1}. ${item.title}${item.meta ? `\n   ${item.meta}` : ""}`
    ).join("\n");
}

function mapSearchItemsToCanvas(results = []) {
    return results.map((item) => {
        const meta = String(item.meta || "").trim();
        const quality = meta.match(/\[([^\]]+)\]/)?.[1]?.trim() || "";
        const episodeCurrent = meta.replace(/\s*\[[^\]]+\]\s*/g, "").trim();

        return {
            title: item.title,
            thumb: item.thumb,
            meta,
            origin_name: "YanHH3D",
            quality,
            episode_current: episodeCurrent
        };
    });
}

export const commands = {
    yanh3d: async (ctx) => {
        const { api, args, threadId, threadType, senderId, prefix } = ctx;
        const query = args.join(" ").trim();

        if (!query) {
            return api.sendMessage({
                msg: `Dung: ${prefix}yanh3d <tu khoa>\nVi du: ${prefix}yanh3d tu la vo than`
            }, threadId, threadType);
        }

        try {
            await api.sendMessage({ msg: `Dang tim tren yanh3d: "${query}"...` }, threadId, threadType);
            const items = await searchYanhh3d(query);

            if (!items.length) {
                return api.sendMessage({ msg: `Khong tim thay ket qua cho "${query}".` }, threadId, threadType);
            }

            const results = items.slice(0, 5);
            searchSessions.set(`${threadId}-${senderId}`, results);
            setTimeout(() => searchSessions.delete(`${threadId}-${senderId}`), 120000);

            const textFallback = buildSearchText(results);

            try {
                ensureCacheDir();
                const canvasItems = mapSearchItemsToCanvas(results);
                const buffer = await drawYanh3dSearch(canvasItems, query);
                const tmpPath = path.join(CACHE_DIR, `yanh3d_search_${Date.now()}.png`);
                fs.writeFileSync(tmpPath, buffer);

                await api.sendMessage({
                    msg: `Tim thay ${items.length} ket qua - reply so (1-${results.length}) de xem danh sach tap.`,
                    attachments: [tmpPath]
                }, threadId, threadType);
                safeUnlink(tmpPath, 3000);
            } catch (canvasError) {
                log.warn(`[yanh3d] search canvas fail: ${canvasError.message}`);
                await api.sendMessage({
                    msg: `[YANH3D SEARCH]\n${textFallback}\n\nReply so (1-${results.length}) de xem danh sach tap.`
                }, threadId, threadType);
            }
        } catch (error) {
            log.error("[yanh3d] Search error:", error.message);
            await api.sendMessage({ msg: `Loi tim kiem: ${error.message}` }, threadId, threadType);
        }
    }
};

export async function handle(ctx) {
    const { content, senderId, threadId, api, threadType } = ctx;
    const num = parseInt(content?.trim(), 10);
    if (Number.isNaN(num) || num < 1) return false;

    const searchKey = `${threadId}-${senderId}`;
    const episodeKey = `${threadId}-${senderId}-yanh3d-ep`;

    if (episodeSessions.has(episodeKey)) {
        const data = episodeSessions.get(episodeKey);
        const episode = data.episodes[num - 1];
        const maxSendSize = getZaloMaxSendSize(api);
        if (!episode) {
            await api.sendMessage({ msg: `Khong co tap ${num}. Chon 1-${data.episodes.length}.` }, threadId, threadType);
            return true;
        }

        ensureCacheDir();
        const baseName = `yanh3d_${Date.now()}`;
        const rawPath = path.join(CACHE_DIR, `${baseName}.mp4`);
        const compressedPath = path.join(CACHE_DIR, `${baseName}_compressed.mp4`);

        try {
            await api.sendMessage({ msg: `Dang lay source cho ${data.title} - ${episode.name}...` }, threadId, threadType);

            const watchHtml = await fetchHtml(episode.url, data.pageUrl);
            const sources = parseWatchSources(watchHtml);
            if (!sources.length) {
                return api.sendMessage({ msg: "Khong tim thay source phat tren trang tap nay." }, threadId, threadType);
            }

            const picked = await pickPlayableSource(sources, episode.url);
            if (!picked) {
                return api.sendMessage({ msg: "Khong resolve duoc link m3u8/mp4." }, threadId, threadType);
            }

            await api.sendMessage({ msg: `Dang tai video tu server ${picked.label}...` }, threadId, threadType);

            let downloaded = false;
            for (const playableUrl of picked.playableUrls) {
                try {
                    safeUnlink(rawPath);
                    await downloadPlayableUrl(playableUrl, rawPath, picked.pageUrl || episode.url);
                    if (fs.existsSync(rawPath) && fs.statSync(rawPath).size > 10240) {
                        downloaded = true;
                        break;
                    }
                } catch (error) {
                    log.warn(`[yanh3d] download fail ${playableUrl}: ${error.message}`);
                }
            }

            if (!downloaded) {
                return api.sendMessage({
                    msg: `Tai video that bai.\nTrang tap: ${episode.url}\nNguon: ${picked.pageUrl || "N/A"}`
                }, threadId, threadType);
            }

            let sendPath = rawPath;
            let stat = fs.statSync(sendPath);

            if (stat.size > maxSendSize) {
                await api.sendMessage({
                    msg: `Video goc ${(stat.size / 1024 / 1024).toFixed(1)} MB, dang nen lai...`
                }, threadId, threadType);
                try {
                    safeUnlink(compressedPath);
                    await compressVideo(rawPath, compressedPath, maxSendSize);
                    const compressedStat = fs.statSync(compressedPath);
                    if (compressedStat.size < stat.size) {
                        sendPath = compressedPath;
                        stat = compressedStat;
                    }
                } catch (error) {
                    log.warn(`[yanh3d] compress fail: ${error.message}`);
                }
            }

            if (stat.size > maxSendSize) {
                await api.sendMessage({
                    msg: `[YANH3D]\n${data.title} - ${episode.name}\nFile van qua lon (${(stat.size / 1024 / 1024).toFixed(1)} MB).\nGioi han hien tai: ${(maxSendSize / 1024 / 1024).toFixed(1)} MB.\nTap: ${episode.url}`
                }, threadId, threadType);
                return true;
            }

            if (api.sendVideoUnified) {
                await api.sendVideoUnified({
                    videoPath: sendPath,
                    thumbnailUrl: data.poster,
                    msg: `${data.title} - ${episode.name}`,
                    threadId,
                    threadType
                });
            } else {
                await api.sendMessage({
                    msg: `${data.title} - ${episode.name}`,
                    attachments: [sendPath]
                }, threadId, threadType);
            }

            await api.sendMessage({
                msg: `Da gui tap ${num}/${data.episodes.length}. Reply so tap khac de tai tiep.`
            }, threadId, threadType);
            return true;
        } catch (error) {
            log.error("[yanh3d] Episode error:", error.message);
            await api.sendMessage({ msg: `Loi tai tap: ${error.message}` }, threadId, threadType);
            return true;
        } finally {
            safeUnlink(rawPath, 3000);
            safeUnlink(compressedPath, 3000);
        }
    }

    if (!searchSessions.has(searchKey)) return false;

    const movie = searchSessions.get(searchKey)[num - 1];
    if (!movie) return false;
    searchSessions.delete(searchKey);

    try {
        await api.sendMessage({ msg: `Dang lay danh sach tap cho "${movie.title}"...` }, threadId, threadType);
        const html = await fetchHtml(movie.url);
        let info = parseMoviePage(html, movie.url);

        if (!info.episodes.length) {
            const watchUrl = getWatchUrlFromMoviePage(html);
            if (watchUrl) {
                const watchHtml = await fetchHtml(watchUrl, movie.url);
                const watchInfo = parseMoviePage(watchHtml, watchUrl);
                info = {
                    ...info,
                    title: watchInfo.title || info.title,
                    poster: watchInfo.poster || info.poster,
                    pageUrl: watchInfo.pageUrl || info.pageUrl,
                    episodes: watchInfo.episodes
                };
            }
        }

        info.title = normalizeMovieTitle(info.title || movie.title, info.pageUrl || movie.url);
        if (!info.title || info.title === "Movie") {
            info.title = normalizeMovieTitle(movie.title, movie.url);
        }

        if (!info.episodes.length) {
            return api.sendMessage({ msg: "Phim nay khong co danh sach tap." }, threadId, threadType);
        }

        episodeSessions.set(episodeKey, info);
        setTimeout(() => episodeSessions.delete(episodeKey), 15 * 60 * 1000);

        await api.sendMessage({
            msg: `[YANH3D]\n${info.title}\nTong so tap: ${info.episodes.length}\n\n${formatEpisodeList(info.episodes)}${info.episodes.length > 30 ? `\n...va ${info.episodes.length - 30} tap nua` : ""}\n\nReply so tap de bot tai mp4.`
        }, threadId, threadType);
        return true;
    } catch (error) {
        log.error("[yanh3d] Detail error:", error.message);
        await api.sendMessage({ msg: `Loi lay danh sach tap: ${error.message}` }, threadId, threadType);
        return true;
    }
}
