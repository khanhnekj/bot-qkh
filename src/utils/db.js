import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { log } from '../logger.js';

const dbPath = path.join(process.cwd(), 'src', 'modules', 'cache', 'database.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // Chế độ ghi đồng thời cực nhanh

// ─── KHỞI TẠO CÁC BẢNG ───
db.exec(`
    -- Bảng thuê bot
    CREATE TABLE IF NOT EXISTS rentals (
        thread_id TEXT PRIMARY KEY,
        exp INTEGER,
        tier TEXT DEFAULT 'normal'
    );

    -- Bảng cài đặt nhóm (tắt/mở tính năng)
    CREATE TABLE IF NOT EXISTS thread_settings (
        thread_id TEXT,
        key TEXT,
        value TEXT,
        PRIMARY KEY (thread_id, key)
    );

    -- Bảng thống kê tương tác
    CREATE TABLE IF NOT EXISTS stats (
        thread_id TEXT,
        user_id TEXT,
        name TEXT,
        total INTEGER DEFAULT 0,
        day INTEGER DEFAULT 0,
        week INTEGER DEFAULT 0,
        exp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        role TEXT DEFAULT 'Thành viên',
        points INTEGER DEFAULT 0,
        join_date INTEGER,
        PRIMARY KEY (thread_id, user_id)
    );

    -- Bảng vi phạm (Anti-Nude, Anti-Link...)
    CREATE TABLE IF NOT EXISTS violations (
        thread_id TEXT,
        user_id TEXT,
        type TEXT,
        count INTEGER DEFAULT 0,
        last_reset INTEGER,
        PRIMARY KEY (thread_id, user_id, type)
    );

    -- Bảng tin nhắn đã xử lý tương tác (Chống đếm trùng khi scan history)
    CREATE TABLE IF NOT EXISTS processed_messages (
        msg_id TEXT PRIMARY KEY
    );
`);

// Thêm cột join_date nếu chưa có
try { db.exec("ALTER TABLE stats ADD COLUMN join_date INTEGER;"); } catch (e) { }

export default db;

// --- Helper Functions ---
export const dbQuery = {
    // Rental
    getRent: (tid) => db.prepare('SELECT * FROM rentals WHERE thread_id = ?').get(String(tid)),
    allRents: () => db.prepare('SELECT * FROM rentals').all(),
    setRent: (tid, exp, tier) => db.prepare('INSERT OR REPLACE INTO rentals (thread_id, exp, tier) VALUES (?, ?, ?)').run(String(tid), exp, tier),
    delRent: (tid) => db.prepare('DELETE FROM rentals WHERE thread_id = ?').run(String(tid)),

    // Settings
    getSetting: (tid, key) => {
        const row = db.prepare('SELECT value FROM thread_settings WHERE thread_id = ? AND key = ?').get(String(tid), key);
        if (!row) return null;
        try { return JSON.parse(row.value); } catch { return row.value; }
    },
    setSetting: (tid, key, value) => {
        if (value === null) {
            db.prepare('DELETE FROM thread_settings WHERE thread_id = ? AND key = ?').run(String(tid), key);
        } else {
            const valStr = JSON.stringify(value);
            db.prepare('INSERT OR REPLACE INTO thread_settings (thread_id, key, value) VALUES (?, ?, ?)').run(String(tid), key, valStr);
        }
    },
    getThreadSettings: (tid) => db.prepare('SELECT * FROM thread_settings WHERE thread_id = ?').all(String(tid)),

    // Stats
    getStat: (tid, uid) => db.prepare('SELECT * FROM stats WHERE thread_id = ? AND user_id = ?').get(String(tid), String(uid)),
    setStat: (tid, uid, name, total, day, week, exp, level, role, points, joinDate) => {
        db.prepare(`
            INSERT OR REPLACE INTO stats (thread_id, user_id, name, total, day, week, exp, level, role, points, join_date) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(String(tid), String(uid), name, total, day, week, exp, level, role, points, joinDate || Date.now());
    },
    getThreadStats: (tid, type = 'total', limit = 10) => 
        db.prepare(`SELECT * FROM stats WHERE thread_id = ? ORDER BY ${type} DESC LIMIT ?`).all(String(tid), limit),
    
    clearDayStats: () => db.prepare('UPDATE stats SET day = 0').run(),
    clearWeekStats: () => db.prepare('UPDATE stats SET week = 0').run(),
    allStats: () => db.prepare('SELECT * FROM stats').all(),
    allThreadIds: () => db.prepare('SELECT DISTINCT thread_id FROM stats').all().map(r => r.thread_id),
    
    // Processed Messages (History Scan)
    isProcessed: (msgId) => !!db.prepare('SELECT 1 FROM processed_messages WHERE msg_id = ?').get(String(msgId)),
    markProcessed: (msgId) => db.prepare('INSERT OR IGNORE INTO processed_messages (msg_id) VALUES (?)').run(String(msgId))
};
