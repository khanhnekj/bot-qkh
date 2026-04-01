import { readdir } from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { log } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadEvents() {
    const handlers = [];
    const eventCommands = {};
    const failedEvents = [];

    let files;
    try {
        files = (await readdir(__dirname)).filter(
            (f) => f.endsWith(".js") && f !== "index.js"
        );
    } catch {
        return { handlers, eventCommands, errorCount: 0, failedEvents };
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            const modulePath = pathToFileURL(join(__dirname, file)).href + "?t=" + Date.now();
            const mod = await import(modulePath);
            if (typeof mod.handle !== "function" && typeof mod.handleReaction !== "function" && typeof mod.handleGroupEvent !== "function" && typeof mod.handleUndo !== "function") continue;

            const evtName = mod.name ?? file.replace(".js", "");
            handlers.push({
                name: evtName,
                description: mod.description ?? "",
                handle: mod.handle,
                handleGroupEvent: mod.handleGroupEvent,
                handleReaction: mod.handleReaction,
                handleUndo: mod.handleUndo
            });

            if (mod.commands && typeof mod.commands === "object") {
                for (const [cmd, handler] of Object.entries(mod.commands)) {
                    eventCommands[cmd] = handler;
                }
            }
            successCount++;
        } catch (e) {
            errorCount++;
            failedEvents.push({ file, error: e.message });
            log.error(`Event ${file} lỗi`, e.message);
        }
    }

    // Ưu tiên muteHandler lên đầu danh sách xử lý
    handlers.sort((a, b) => {
        if (a.name === "muteHandler") return -1;
        if (b.name === "muteHandler") return 1;
        return 0;
    });

    if (successCount > 0) log.system(`Tải thành công ${successCount} handler sự kiện.`);
    return { handlers, eventCommands, errorCount, failedEvents };
}
