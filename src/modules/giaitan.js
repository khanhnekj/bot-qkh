export const name = "giaitan";
export const description = "Giải tán nhóm hoàn toàn (⚠ Nguy hiểm - Cần xác nhận)";

export const commands = {
    giaitan: async (ctx) => {
        const { api, threadId, threadType, adminIds, senderId, args } = ctx;

        // Tầng 1: Ngăn chặn dùng lệnh ngoài Nhóm (DM/Cá nhân không có nhóm mà giải tán)
        if (threadType !== 1) {
            return api.sendMessage({ msg: "⚠️ Lệnh giải tán chỉ có thể dùng cho Group chat Zalo!" }, threadId, threadType);
        }

        // Tầng 2: Ngăn chặn người ngoài lạm quyền (Chỉ Bot Admin mới được ấn nút bom)
        if (!adminIds.includes(String(senderId))) {
            return api.sendMessage({ msg: "❌ BÁO ĐỘNG ĐỎ: Bạn không phải người nắm giữ Chìa Khóa Quản Trị Hệ Thống. Từ chối cấp quyền Giải Tán Nhóm!" }, threadId, threadType);
        }

        const confirm = args[0]?.toLowerCase();

        // Tầng 3: Chống thao tác nhầm / Cần ký xác nhận
        if (confirm !== "xacnhan") {
            const warningCode = `⚠️ [ CẢNH BÁO NGUY HIỂM TỘT ĐỘ ] ⚠️\n` +
                                `Lệnh này sẽ GIẢI TÁN HOÀN TOÀN nhóm hiện tại.\n` +
                                `Mọi tin nhắn, kho hình ảnh và thành viên sẽ bị "đá bay" vĩnh viễn khỏi Zalo, không có cơ hội khôi phục.\n\n` +
                                `👉 Nếu bạn thực sự muốn bấm nút tự hủy (Yêu cầu Bot phải là Trưởng Nhóm), hãy gõ chính xác:\n\n` +
                                `-giaitan xacnhan`;
            return api.sendMessage({ msg: warningCode }, threadId, threadType);
        }

        try {
            await api.sendMessage({ msg: "💣 Khởi động giao thức tự hủy Nhóm...\nĐếm ngược..." }, threadId, threadType);
            
            // Lệnh kích nổ! Kêu gọi Máy Chủ Zalo
            await api.disperseGroup(threadId);

            // Đoạn này thực tế Nhóm có thể đã nổ tung trước khi tin nhắn cuối kịp báo cáo:
            console.log(`[HỆ THỐNG] Đã giải tán thành công nhóm mang số hiệu: ${threadId}`);
        } catch (error) {
            return api.sendMessage({ 
                msg: `❌ TRỤC TRẶC KỸ THUẬT QUÁ TRÌNH PHÁ HỦY:\nLỗi báo về: ${error.message}\n\n👉 NGUYÊN NHÂN: Bot KHÔNG PHẢI là Chủ Tọa (Trưởng Nhóm). Hãy nhượng quyền Trưởng Nhóm cho Bot rồi bấm nút lại!` 
            }, threadId, threadType);
        }
    }
};
