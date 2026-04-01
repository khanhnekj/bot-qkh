import { log } from "../logger.js";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export const name = "adc";
export const description = "Upload hoặc thay thế code file trên server";

const SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    ".next",
    "dist",
    "build",
    ".replit-cache"
]);

function findFile(filename, startDir = process.cwd()) {

    const exactMatches = [];
    const nameMatches = [];

    function searchRecursive(dir, depth = 0) {

        if (depth > 8) return;

        try {

            const items = fs.readdirSync(dir);

            for (const item of items) {

                if (SKIP_DIRS.has(item)) continue;

                const fullPath = path.join(dir, item);

                let stat;
                try {
                    stat = fs.statSync(fullPath);
                } catch {
                    continue;
                }

                if (stat.isFile()) {

                    const isInModules = fullPath.includes("modules");

                    const fileInfo = {
                        path: fullPath,
                        isInModules
                    };

                    if (item === filename) {
                        exactMatches.push(fileInfo);
                        if (isInModules) return;
                    }

                    else if (path.parse(item).name === path.parse(filename).name) {
                        nameMatches.push(fileInfo);
                    }

                }

                else if (stat.isDirectory()) {
                    searchRecursive(fullPath, depth + 1);
                }

            }

        } catch { }

    }

    searchRecursive(startDir);

    const sortByPriority = arr =>
        arr.sort((a, b) => b.isInModules - a.isInModules);

    return [
        ...sortByPriority(exactMatches).map(f => f.path),
        ...sortByPriority(nameMatches).map(f => f.path)
    ];
}

export const commands = {

    adc: async (ctx) => {

        const { api, args, threadId, threadType, prefix, message } = ctx;

        let filename = args[0];
        let url = args[1];

        const quote = message?.data?.quote;

        if (filename === "add") {
            filename = args[1];
            url = quote?.msg?.trim() || quote?.content?.trim();
        }

        if (!filename) {

            let guide = `[ 📝 ADC TOOL ]\n`;
            guide += `─────────────────\n`;
            guide += `1. ${prefix}adc <file>\n`;
            guide += `➥ Xuất code file\n\n`;
            guide += `2. ${prefix}adc <file> <url>\n`;
            guide += `➥ Update hoặc tạo file\n\n`;
            guide += `3. ${prefix}adc add <file>\n`;
            guide += `➥ Reply link để tạo file\n`;
            guide += `─────────────────`;

            return api.sendMessage({ msg: guide }, threadId, threadType);
        }

        try {

            if (url && url.startsWith("http")) {

                const modulesDir = path.join(process.cwd(), "src", "modules");

                if (!fs.existsSync(modulesDir)) {
                    fs.mkdirSync(modulesDir, { recursive: true });
                }

                const finalName = filename.endsWith(".js") ? filename : filename + ".js";
                const filePath = path.join(modulesDir, finalName);

                const rawUrl = url.includes("?")
                    ? url + "&raw=true"
                    : url + "?raw=true";

                const content = (await axios.get(rawUrl)).data;

                fs.writeFileSync(filePath, content);

                const relative = path.relative(process.cwd(), filePath);

                return api.sendMessage({
                    msg:
                        `[ 🆕 SAVE FILE ]
─────────────────
📁 File: ${relative}
⏰ ${new Date().toLocaleString("vi-VN")}
─────────────────`
                }, threadId, threadType);
            }

            const foundFiles = findFile(filename);

            if (!foundFiles.length) {
                return api.sendMessage({
                    msg: `❌ Không tìm thấy file: ${filename}`
                }, threadId, threadType);
            }

            const filePath = foundFiles[0];

            const content = fs.readFileSync(filePath, "utf8");

            const uuid = uuidv4();

            const baseUrl = `https://nvhzxz.onrender.com/note/${uuid}`;

            await axios.put(baseUrl, content, {
                headers: {
                    "content-type": "text/plain; charset=utf-8"
                }
            });

            const rawUrl = `${baseUrl}?raw=true`;

            const relative = path.relative(process.cwd(), filePath);

            return api.sendMessage({
                msg:
                    `[ 📝 CODE EXPORT ]
─────────────────
📁 File: ${relative}

🔗 Raw:
${rawUrl}

✏️ Edit:
${baseUrl}
─────────────────`
            }, threadId, threadType);

        } catch (e) {

            log.error("⚠️ NOTE ERROR:", e.message);

            return api.sendMessage({
                msg: `⚠️ Lỗi: ${e.message}`
            }, threadId, threadType);
        }

    }

};
