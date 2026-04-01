import fs from "node:fs";
import path from "node:path";
import { log } from "../logger.js";
import db, { dbQuery } from "./db.js";

const settingsPath = path.join(process.cwd(), "src", "modules", "cache", "thread_settings.json");

export const threadSettingsManager = {
    _migrated: false,

    migrate() {
        if (this._migrated) return;
        try {
            if (fs.existsSync(settingsPath)) {
                log.info("[Settings] Đang chuyển đổi dữ liệu Settings từ JSON sang SQLite...");
                const raw = fs.readFileSync(settingsPath, "utf-8");
                const jsonData = JSON.parse(raw);
                
                const stmt = db.prepare('INSERT OR REPLACE INTO thread_settings (thread_id, key, value) VALUES (?, ?, ?)');
                db.transaction((data) => {
                    for (const [tid, settings] of Object.entries(data)) {
                        for (const [key, val] of Object.entries(settings)) {
                            stmt.run(String(tid), key, JSON.stringify(val));
                        }
                    }
                })(jsonData);
                
                log.success("[Settings] Di chuyển Settings thành công!");
                fs.renameSync(settingsPath, settingsPath + ".bak");
            }
        } catch (e) {
            log.error("[Settings] Lỗi Migration:", e.message);
        }
        this._migrated = true;
    },

    load() {
        this.migrate();
    },

    save() {
        // SQLite tự động lưu
    },

    get(threadId, key, defaultValue = false) {
        this.load();
        const val = dbQuery.getSetting(threadId, key);
        return val === null ? defaultValue : val;
    },

    set(threadId, key, value) {
        this.load();
        dbQuery.setSetting(threadId, key, value);
    },

    toggle(threadId, key) {
        const current = this.get(threadId, key, false);
        this.set(threadId, key, !current);
        return !current;
    },
    getAll(threadId) {
        this.load();
        return dbQuery.getThreadSettings(threadId);
    },

    isAdminOnly(threadId) {
        return this.get(threadId, "adminOnly", false);
    }
};
