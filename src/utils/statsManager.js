import fs from "node:fs";
import path from "node:path";
import { log } from "../logger.js";
import db, { dbQuery } from "./db.js";

const statsPath = path.join(process.cwd(), "src", "modules", "cache", "stats.json");

export const statsManager = {
    _migrated: false,

    migrate() {
        if (this._migrated) return;
        try {
            if (fs.existsSync(statsPath)) {
                log.info("[Stats] Đang chuyển đổi dữ liệu Stats từ JSON sang SQLite...");
                const raw = fs.readFileSync(statsPath, "utf-8");
                const jsonData = JSON.parse(raw);
                
                // Thêm cột join_date nếu chưa có
                try { db.exec("ALTER TABLE stats ADD COLUMN join_date INTEGER;"); } catch (e) { }

                const statsExist = db.prepare('SELECT count(*) as count FROM stats').get().count;
                if (statsExist === 0) {
                    const insert = db.prepare(`
                        INSERT INTO stats (thread_id, user_id, name, total, day, week, exp, level, role, points, join_date) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `);
                    const transaction = db.transaction((data) => {
                        for (const [tid, threadData] of Object.entries(data)) {
                            if (!threadData.members) continue;
                            for (const [uid, m] of Object.entries(threadData.members)) {
                                insert.run(
                                    String(tid), String(uid), String(m.name || "Người dùng"),
                                    Number(m.total || 0), Number(m.day || 0), Number(m.week || 0),
                                    Number(m.exp || (m.total * 10) || 0), Number(m.level || 1),
                                    String(m.role || "Thành viên"), Number(m.points || 0),
                                    Number(m.joinDate || Date.now())
                                );
                            }
                        }
                    });
                    transaction(jsonData);
                    log.success("[Stats] Di chuyển Stats thành công!");
                }
                fs.renameSync(statsPath, statsPath + ".bak");
            }
        } catch (e) {
            log.error("[Stats] Lỗi Migration:", e.message);
        }
        this._migrated = true;
    },

    load() {
        this.migrate();
    },

    save() {
        // SQLite tự động lưu
    },

    setRole(threadId, uid, role) {
        this.load();
        const stat = dbQuery.getStat(threadId, uid);
        if (stat) {
            dbQuery.setStat(threadId, uid, stat.name, stat.total, stat.day, stat.week, stat.exp, stat.level, role, stat.points, stat.join_date);
        } else {
            dbQuery.setStat(threadId, uid, "Người dùng", 0, 0, 0, 0, 1, role, 0, Date.now());
        }
    },

    addMessage(threadId, senderId, senderName, role = null, msgId = null) {
        this.load();
        
        // Chống đếm trùng bằng msgId (cho cả History Scan và Realtime)
        if (msgId && dbQuery.isProcessed(msgId)) return;
        if (msgId) dbQuery.markProcessed(msgId);

        let stat = dbQuery.getStat(threadId, senderId);
        
        if (!stat) {
            stat = {
                name: senderName,
                total: 0, day: 0, week: 0,
                exp: 0, level: 1, role: role || "Thành viên", points: 0
            };
        }

        const newTotal = stat.total + 1;
        const newDay = stat.day + 1;
        const newWeek = stat.week + 1;
        const newExp = stat.exp + 10; // 10 exp per msg
        const newLevel = Math.floor(0.1 * Math.sqrt(newExp)) + 1;
        const finalRole = role || stat.role || "Thành viên";
        const finalJoinDate = stat.join_date || Date.now();

        dbQuery.setStat(threadId, senderId, senderName, newTotal, newDay, newWeek, newExp, newLevel, finalRole, stat.points, finalJoinDate);
    },

    getStats(threadId, senderId) {
        this.load();
        return dbQuery.getStat(threadId, senderId);
    },

    getTop(threadId, type = "total", limit = 10) {
        this.load();
        // Chuyển đổi mapping tên cột cho SQLite nếu cần
        const validTypes = ["total", "day", "week", "exp", "level", "points"];
        const orderType = validTypes.includes(type) ? type : "total";
        return dbQuery.getThreadStats(threadId, orderType, limit);
    },

    getAllThreads() {
        this.load();
        return dbQuery.allThreadIds();
    },

    resetDayAll() {
        this.load();
        dbQuery.clearDayStats();
    },

    resetWeekAll() {
        this.load();
        dbQuery.clearWeekStats();
    }
};
