import fs from "node:fs";
import path from "node:path";
import { log } from "../logger.js";
import db, { dbQuery } from "./db.js";

const rentalsPath = path.join(process.cwd(), "src", "modules", "cache", "rentals.json");

export const rentalManager = {
    _migrated: false,

    /**
     * Chuyển dữ liệu từ JSON sang SQLite nếu cần
     */
    migrate() {
        if (this._migrated) return;
        try {
            if (fs.existsSync(rentalsPath)) {
                log.info("[Rental] Đang chuyển đổi dữ liệu từ JSON sang SQLite...");
                const raw = fs.readFileSync(rentalsPath, "utf-8");
                const jsonData = JSON.parse(raw);
                
                // Kiểm tra xem database đã có dữ liệu chưa
                const existing = dbQuery.allRents();
                if (existing.length === 0) {
                    const insert = db.prepare('INSERT INTO rentals (thread_id, exp, tier) VALUES (?, ?, ?)');
                    const transaction = db.transaction((data) => {
                        for (const [tid, val] of Object.entries(data)) {
                            const exp = typeof val === "object" ? val.exp : val;
                            const tier = typeof val === "object" ? val.tier : "normal";
                            insert.run(String(tid), exp, tier);
                        }
                    });
                    transaction(jsonData);
                    log.success("[Rental] Di chuyển thành công!");
                }
                
                // Backup file JSON cũ
                fs.renameSync(rentalsPath, rentalsPath + ".bak");
            }
        } catch (e) {
            log.error("[Rental] Lỗi Migration:", e.message);
        }
        this._migrated = true;
    },

    load() {
        this.migrate();
    },

    save() {
        // Không cần save thủ công nữa vì SQLite tự lưu
    },

    addRent(threadId, days, tier = "normal") {
        this.load();
        const now = Date.now();
        const existing = dbQuery.getRent(threadId);
        
        let currentExp = now;
        if (existing) {
            currentExp = Math.max(existing.exp, now);
        }

        const msToAdd = days * 24 * 60 * 60 * 1000;
        const newExp = currentExp + msToAdd;

        dbQuery.setRent(threadId, newExp, tier);
        return newExp;
    },

    isRented(threadId) {
        this.load();
        const data = dbQuery.getRent(threadId);
        if (!data) return false;
        return data.exp > Date.now();
    },

    getTier(threadId) {
        this.load();
        const data = dbQuery.getRent(threadId);
        if (!data) return "none";
        return data.tier || "normal";
    },

    getExpiry(threadId) {
        this.load();
        const data = dbQuery.getRent(threadId);
        if (!data) return "Chưa thuê";
        if (data.exp <= Date.now()) return "Đã hết hạn";
        return `${new Date(data.exp).toLocaleString("vi-VN")} (${data.tier})`;
    },

    getAllRentals() {
        this.load();
        const now = Date.now();
        return dbQuery.allRents()
            .filter(r => r.exp > now)
            .map(r => ({
                id: r.thread_id,
                exp: r.exp,
                tier: r.tier
            }));
    },

    removeRent(threadId) {
        this.load();
        const result = dbQuery.delRent(threadId);
        return result.changes > 0;
    }
};
