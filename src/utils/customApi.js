import { readFileSync, statSync, existsSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ThreadType } from "zca-js";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const fPath = (typeof ffmpegStatic === "object" && ffmpegStatic.path) ? ffmpegStatic.path : ffmpegStatic;
const fpPath = (typeof ffprobeStatic === "object" && ffprobeStatic.path) ? ffprobeStatic.path : ffprobeStatic;

ffmpeg.setFfmpegPath(fPath);
ffmpeg.setFfprobePath(fpPath);

function ensureRemoteFileExtension(fileUrl, ext) {
    if (!fileUrl) return fileUrl;
    if (new RegExp(`\\.${ext}(?:\\?|$)`, "i").test(fileUrl)) return fileUrl;
    return `${fileUrl}/${Date.now()}.${ext}`;
}

export function registerCustomApi(api, log) {
    const safeCustom = (name, fn) => {
        try {
            // Nếu đã tồn tại mà không cho phép ghi đè, ta thử catch lỗi xíu
            if (typeof api[name] !== "function") {
                api.custom(name, fn);
            } else {
                // Thử ghi đè trực tiếp, nếu lỗi thì thôi (vì khả năng cao là đã đăng ký rồi)
                try {
                    api[name] = async (arg) => {
                        const ctx = api.context || (api.getContext ? api.getContext() : {});
                        return await fn({ ctx, utils: ctx.utils, props: arg });
                    };
                } catch (e) {
                    if (log) log.debug(`Không thể ghi đè custom API [${name}] (có thể do thuộc tính read-only).`);
                }
            }
        } catch (e) {
            if (log) log.warn(`[sendVideoUnified] Player fallback: ${e.message}`);
            if (log) log.warn(`[sendVideoUnified] Player fallback: ${e.message}`);
            if (log) log.error(`Lỗi đăng ký custom API [${name}]: ${e.message}`);
        }
    };

    const base = api.zpwServiceMap?.other_contact?.[0] || "https://other-contact-wpa.chat.zalo.me";

    // --- VOICE APIs ---
    safeCustom("uploadVoice", async ({ ctx, utils, props }) => {
        const { filePath, threadId, threadType } = props;
        const results = await api.uploadAttachment(filePath, threadId, threadType);
        if (!results || results.length === 0) throw new Error("Upload attachment thất bại.");
        const result = results[0];
        return { voiceId: result.fileId, voiceUrl: result.fileUrl || result.url };
    });

    safeCustom("sendVoiceNative", async ({ ctx, utils, props }) => {
        let { voiceUrl, threadId, threadType, duration = 0, fileSize = 0, ttl = 1800000 } = props;
        const isGroup = String(threadType) === "1" || threadType === 1;
        const clientId = Date.now().toString();
        const msgInfo = { voiceUrl: String(voiceUrl), m4aUrl: String(voiceUrl), fileSize: Number(fileSize) || 0, duration: Number(duration) || 0 };
        const params = isGroup ? { grid: threadId.toString(), visibility: 0, ttl: Number(ttl), zsource: -1, msgType: 3, clientId, msgInfo: JSON.stringify(msgInfo), imei: ctx.imei }
            : { toId: threadId.toString(), ttl: Number(ttl), zsource: -1, msgType: 3, clientId, msgInfo: JSON.stringify(msgInfo), imei: ctx.imei };
        const serviceURL = isGroup ? `${api.zpwServiceMap.file[0]}/api/group/forward` : `${api.zpwServiceMap.file[0]}/api/message/forward`;
        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        const response = await utils.request(utils.makeURL(serviceURL, { zpw_ver: 667, zpw_type: 24 }), { method: "POST", body: new URLSearchParams({ params: encryptedParams }) });
        return await utils.resolve(response);
    });

    safeCustom("sendVoiceUnified", async ({ ctx, utils, props }) => {
        const { filePath, threadId, threadType } = props;
        let finalPath = filePath, tempFile = null;
        try {
            const ext = path.extname(filePath).toLowerCase();
            if (ext !== ".aac" && ext !== ".m4a") {
                tempFile = path.join(process.cwd(), `src/modules/cache/voice_${Date.now()}.aac`);
                await new Promise((resolve, reject) => { ffmpeg(filePath).audioCodec('aac').audioBitrate('128k').on('end', resolve).on('error', reject).save(tempFile); });
                finalPath = tempFile;
            }
            const metadata = await new Promise((resolve, reject) => { ffmpeg.ffprobe(finalPath, (err, meta) => err ? reject(err) : resolve(meta)); });
            const duration = Math.round((metadata.format.duration || 0) * 1000);
            const fileSize = metadata.format.size || statSync(finalPath).size;
            const uploadResults = await api.uploadAttachment(finalPath, threadId, threadType);
            if (!uploadResults || uploadResults.length === 0) throw new Error("Upload lên Zalo thất bại.");
            let remoteUrl = uploadResults[0].fileUrl || uploadResults[0].url;
            if (!remoteUrl.endsWith(".aac")) remoteUrl += `/${Date.now()}.aac`;
            try {
                return await api.sendVoiceNative({ voiceUrl: remoteUrl, duration, fileSize, threadId, threadType });
            } catch (err) {
                return await api.sendVoice({ voiceUrl: remoteUrl, ttl: 0 }, threadId, threadType);
            }
        } finally { if (tempFile && existsSync(tempFile)) try { unlinkSync(tempFile); } catch { } }
    });

    // --- PHOTO API ---
    safeCustom("sendImageEnhanced", async ({ ctx, utils, props }) => {
        const { imageUrl, threadId, threadType, width = 720, height = 1280, msg = "", mentions } = props;
        const isGroup = String(threadType) === "1" || threadType === 1;
        const payload = { clientId: Date.now().toString(), desc: msg, oriUrl: String(imageUrl), thumbUrl: String(imageUrl), hdUrl: String(imageUrl), normalUrl: String(imageUrl), url: String(imageUrl), width: Number(width), height: Number(height), zsource: -1, ttl: 0 };
        if (isGroup) { payload.grid = threadId.toString(); payload.visibility = 0; if (mentions) payload.mentionInfo = JSON.stringify(mentions); } else { payload.toId = threadId.toString(); }
        let baseUrl = isGroup ? `${api.zpwServiceMap.file[0]}/api/group/photo_url` : `${api.zpwServiceMap.file[0]}/api/message/photo_url`;
        const encryptedParams = utils.encodeAES(JSON.stringify(payload));
        const res = await utils.request(utils.makeURL(baseUrl, { zpw_ver: 667, zpw_type: 24 }), { method: "POST", body: new URLSearchParams({ params: encryptedParams }) });
        return await utils.resolve(res);
    });

    // --- VIDEO API ---
    safeCustom("sendVideoEnhanced", async ({ ctx, utils, props }) => {
        const { videoUrl, thumbnailUrl, duration = 0, width = 720, height = 1280, fileSize, msg, mentions, threadId, threadType } = props;
        const isGroup = String(threadType) === "1" || threadType === 1;
        const clientId = Date.now();
        const msgInfo = JSON.stringify({ videoUrl, thumbUrl: thumbnailUrl, duration: Math.floor(Number(duration) || 0), width: Math.floor(Number(width) || 720), height: Math.floor(Number(height) || 1280), fileSize: Math.floor(Number(fileSize) || 0), properties: { color: -1, size: -1, type: 1003, subType: 0, ext: { sSrcType: -1, sSrcStr: "", msg_warning_type: 0 } }, title: msg || "" });
        const params = isGroup ? { grid: threadId, visibility: 0, clientId: String(clientId), ttl: 0, zsource: 704, msgType: 5, msgInfo, imei: ctx.imei }
            : { toId: threadId, clientId: String(clientId), ttl: 0, zsource: 704, msgType: 5, msgInfo, imei: ctx.imei, title: msg || "" };
        if (isGroup && mentions) params.mentionInfo = JSON.stringify(mentions);
        const serviceURL = isGroup ? `${api.zpwServiceMap.file[0]}/api/group/forward` : `${api.zpwServiceMap.file[0]}/api/message/forward`;
        const encryptedParams = utils.encodeAES(JSON.stringify(params));
        const response = await utils.request(utils.makeURL(serviceURL, { zpw_ver: 667, zpw_type: 24 }), { method: "POST", body: new URLSearchParams({ params: encryptedParams }) });
        return await utils.resolve(response);
    });

    safeCustom("sendVideoUnified", async ({ ctx, utils, props }) => {
        const { videoPath, thumbnailUrl, thumbnailPath, msg, threadId, threadType } = props;
        try {
            const metadata = await new Promise((resolve, reject) => { ffmpeg.ffprobe(videoPath, (err, meta) => err ? reject(err) : resolve(meta)); });
            const stream = metadata.streams.find(s => s.codec_type === 'video');
            const durationMs = Math.max(0, Math.round(Number(metadata.format.duration || 0) * 1000));
            const width = stream?.width || 720;
            const height = stream?.height || 1280;
            const fileSize = metadata.format.size || statSync(videoPath).size;

            const uploadResults = await api.uploadAttachment(videoPath, threadId, threadType);
            if (!uploadResults || uploadResults.length === 0) throw new Error("Upload Video thất bại.");
            const uploadedVideoUrl = uploadResults[0].fileUrl || uploadResults[0].url;
            const videoUrl = ensureRemoteFileExtension(uploadedVideoUrl, "mp4");
            let resolvedThumbnailUrl = thumbnailUrl;

            if (!resolvedThumbnailUrl && thumbnailPath && existsSync(thumbnailPath)) {
                const uploadedThumb = await api.uploadAttachment(thumbnailPath, threadId, threadType);
                const thumb = uploadedThumb?.[0] || {};
                resolvedThumbnailUrl = thumb.normalUrl || thumb.hdUrl || thumb.thumbUrl || thumb.fileUrl || thumb.url;
            }

            if (!resolvedThumbnailUrl) {
                const thumbDir = path.join(process.cwd(), "src/modules/cache");
                if (!existsSync(thumbDir)) mkdirSync(thumbDir, { recursive: true });
                const generatedThumbPath = path.join(thumbDir, `video_thumb_${Date.now()}.jpg`);
                await new Promise((resolve, reject) => {
                    ffmpeg(videoPath)
                        .on("end", resolve)
                        .on("error", reject)
                        .screenshots({
                            count: 1,
                            timemarks: ["0.2"],
                            filename: path.basename(generatedThumbPath),
                            folder: path.dirname(generatedThumbPath),
                            size: "640x?"
                        });
                });

                if (existsSync(generatedThumbPath)) {
                    const uploadedThumb = await api.uploadAttachment(generatedThumbPath, threadId, threadType);
                    const thumb = uploadedThumb?.[0] || {};
                    resolvedThumbnailUrl = thumb.normalUrl || thumb.hdUrl || thumb.thumbUrl || thumb.fileUrl || thumb.url;
                    try { unlinkSync(generatedThumbPath); } catch { }
                }
            }

            if (!resolvedThumbnailUrl) throw new Error("Khong tao/upload duoc thumbnail cho video");

            return await api.sendVideoEnhanced({ videoUrl, thumbnailUrl: resolvedThumbnailUrl, duration: durationMs, width, height, fileSize, msg, threadId, threadType });
        } catch (e) {
            return await api.sendMessage({ msg: (msg || "") + "\n\n(Lỗi Player: Gửi dưới dạng tệp)", attachments: [videoPath] }, threadId, threadType);
        }
    });

    // --- CALL API ---
    safeCustom("callOneUser", async ({ ctx, utils, props }) => {
        const { userId, groupId, groupName, typeRequest = 1 } = props;
        const callURL = utils.makeURL(`${base}/api/message/call`, { zpw_ver: 667, zpw_type: 24 });
        const reqParams = { [groupId ? "groupId" : "toId"]: String(groupId || userId), chatType: groupId ? "group" : "user", typeRequest: Number(typeRequest) || 1, imei: ctx.imei, clientId: Date.now() };
        const encParams = utils.encodeAES(JSON.stringify(reqParams));
        const res = await utils.request(callURL, { method: "POST", body: new URLSearchParams({ params: encParams }) });
        const requestData = await utils.resolve(res);
        if (requestData.error) throw new Error(requestData.error.message || "Lỗi yêu cầu gọi");
        let pData = {};
        try { pData = typeof requestData.params === 'string' ? JSON.parse(requestData.params) : requestData.params || {}; } catch {}
        const srvs = pData.callSetting?.servers || requestData.servers || [];
        const sess = pData.callSetting?.session || requestData.session || "";
        if (!sess || srvs.length === 0) throw new Error(`Zalo denied permission (Status: ${requestData.status})`);
        const hostId = requestData.partnerIds?.[0] ? String(requestData.partnerIds[0]) : String(userId);
        const params2 = { callId: pData.callId || requestData.callId, callType: 1, data: JSON.stringify({ codec: "", data: JSON.stringify({ groupAvatar: "", groupName: groupName || "Zalo Call", hostCall: pData.hostCall || "", maxUsers: 8, noiseId: [hostId] }), extendData: "", rtcpAddress: srvs[0].rtcpaddr || "", rtcpAddressIPv6: srvs[0].rtcpaddrIPv6 || "", rtpAddress: srvs[0].rtpaddr || "", rtpAddressIPv6: srvs[0].rtpaddrIPv6 || "", }), session: sess, partners: JSON.stringify([hostId]), groupId: String(groupId || userId) };
        const enc2 = utils.encodeAES(JSON.stringify(params2));
        const res2 = await utils.request(callURL, { method: "POST", body: new URLSearchParams({ params: enc2 }) });
        return await utils.resolve(res2);
    });

    // --- STICKER API (NATIVE ENHANCED) ---
    // --- STICKER API (NATIVE ENHANCED) ---
    safeCustom("sendCustomSticker", async ({ ctx, utils, props }) => {
        let { staticImgUrl, animationImgUrl, threadId, threadType, width = 512, height = 512, ttl = 0, quote } = props;
        const isGroup = String(threadType) === "1" || threadType === 1;
        
        const payload = {
            clientId: Date.now().toString(),
            title: "",
            oriUrl: String(staticImgUrl),
            thumbUrl: String(staticImgUrl),
            hdUrl: String(staticImgUrl),
            normalUrl: String(staticImgUrl),
            url: String(staticImgUrl),
            width: Number(width),
            height: Number(height),
            properties: JSON.stringify({
                subType: 0, 
                color: -1, 
                size: -1, 
                type: 3, 
                ext: JSON.stringify({ sSrcStr: "AI Sticker", sSrcType: 1 })
            }),
            contentId: Date.now(),
            webp: JSON.stringify({
                width: Number(width),
                height: Number(height),
                url: String(animationImgUrl)
            }),
            zsource: 704,
            ttl: Number(ttl) || 0
        };

        if (quote) {
            const qObj = typeof quote === "string" ? JSON.parse(quote) : quote;
            payload.refMessage = qObj.cliMsgId?.toString() || qObj.msgId?.toString();
        }

        if (isGroup) {
            payload.grid = threadId.toString();
            payload.visibility = 0;
        } else {
            payload.toId = threadId.toString();
        }

        const serviceURL = isGroup ? `${api.zpwServiceMap.file[0]}/api/group/photo_url` : `${api.zpwServiceMap.file[0]}/api/message/photo_url`;
        const encryptedParams = utils.encodeAES(JSON.stringify(payload));
        const response = await utils.request(utils.makeURL(serviceURL, { zpw_ver: 667, zpw_type: 24 }), {
            method: "POST",
            body: new URLSearchParams({ params: encryptedParams })
        });
        
        return await utils.resolve(response);
    });
}
