import { Zalo } from "./src/api-zalo/index.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { log } from "./src/logger.js";
import { CONFIG_PATH, readRawConfig, writeRawConfig } from "./src/utils/config.js";

// Danh sách User-Agents phổ biến để giả lập các trình duyệt khác nhau
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1"
];

async function startLogin() {
    log.info("┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓");
    log.info("┃   ✦  ZALO QR LOGIN & EXTRACTOR  ✦  ┃");
    log.info("┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛");

    // Chọn ngẫu nhiên 1 User-Agent
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    log.info(`◈ Sử dụng Fake User-Agent:\n  ❯ ${randomUA}`);

    const zalo = new Zalo();

    // Lấy IMEI cũ từ config nếu có để tăng tỉ lệ thành công
    let existingImei = null;
    try {
        const config = readRawConfig();
        existingImei = config.credentials?.imei;
    } catch {}

    try {
        log.info("◈ Đang khởi tạo mã QR... Vui lòng mở file qr.png để quét.");

        // Thực hiện login QR
        const api = await zalo.loginQR({ userAgent: randomUA, imei: existingImei });

        log.info("✦ Đăng nhập thành công!");

        const ctx = api.getContext();
        const cookies = ctx.cookie;
        const imei = ctx.imei;

        log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        log.info("📊 THÔNG TIN ĐĂNG NHẬP CỦA BẠN:");
        log.info(`❯ imei: ${imei}`);
        log.info(`❯ userAgent: ${randomUA}`);
        log.info("❯ cookies: (Đã được định dạng JSON)");
        log.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        // Cập nhật vào config.json (Dùng path tuyệt đối để tránh lỗi khi chạy từ thư mục khác)
        const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
        const configPath = CONFIG_PATH || path.join(__dirname, "config.json");

        if (existsSync(configPath)) {
            try {
                const config = readRawConfig();

                config.credentials = {
                    imei: imei,
                    userAgent: randomUA,
                    cookies: cookies
                };

                writeRawConfig(config);
                log.info(`✦ Đã tự động cập nhật thông tin vào config.json`);
            } catch (err) {
                log.error("✖ Không thể cập nhật config.json:", err.message);
            }
        } else {
            log.warn(`⚠️ Không tìm thấy file config.json tại ${configPath}. Hãy copy thông tin trên thủ công.`);
        }

        log.info("✦ Hoàn tất! Bạn có thể tắt script này và chạy 'npm start' để mở Bot.");
        process.exit(0);

    } catch (error) {
        log.error("✖ Lỗi trong quá trình đăng nhập QR:", error.message);
        process.exit(1);
    }
}

startLogin();
