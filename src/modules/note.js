export const name = "note";
export const description = "Quản lý Bảng tin / Ghi chú Nhóm (Thêm, Sửa, Lấy danh sách)";

export const commands = {
    note: async (ctx) => {
        const { api, threadId, threadType, args, log } = ctx;
        
        // Zalo chỉ hỗ trợ API Ghi Chú cho Nhóm
        if (threadType !== 1) {
            return api.sendMessage({ msg: "⚠️ Lệnh ghi chú chỉ dùng được trong Nhóm!" }, threadId, threadType);
        }

        const cmd = args[0]?.toLowerCase();
        
        if (cmd === "add") {
            const title = args.slice(1).join(" ");
            if (!title) return api.sendMessage({ msg: "⚠️ Vui lòng gõ nội dung ghi chú!\nCú pháp: -note add <nội dung>" }, threadId, threadType);
            
            try {
                // PinAct: true -> Tự động Ghim lên ghim nhóm
                await api.createNote({ title: title, pinAct: true }, threadId);
                return api.sendMessage({ msg: "✅ Đã tạo và Ghim ghi chú mới thành công!" }, threadId, threadType);
            } catch (e) {
                if (log) log.error("Lỗi note add:", e.message);
                return api.sendMessage({ msg: `❌ Không tạo được ghi chú: ${e.message}` }, threadId, threadType);
            }
        }
        
        if (cmd === "list") {
            try {
                // Lấy 20 tin ghim/ghi chú mới nhất
                const board = await api.getListBoard({ page: 1, count: 20 }, threadId);
                if (!board || !board.items || board.items.length === 0) {
                    return api.sendMessage({ msg: "📭 Nhóm này sạch bóng, chưa có ghi chú nào!" }, threadId, threadType);
                }
                
                let text = "📋 [ DANH SÁCH GHI CHÚ NHÓM ]\n─────────────────\n";
                // Lọc ra các ghi chú (BoardType = 2)
                const noteItems = board.items.filter(item => item.boardType == 2);
                
                for (let i = 0; i < noteItems.length; i++) {
                    const item = noteItems[i];
                    let title = "Không rõ nội dung";
                    try {
                        const paramsObj = typeof item.data.params === "string" ? JSON.parse(item.data.params) : item.data.params;
                        title = paramsObj?.title || title;
                    } catch(e) {}
                    text += `[${i + 1}] ID: ${item.data.id}\n📝 ND: ${title.slice(0, 100)}${title.length > 100 ? "..." : ""}\n\n`;
                }
                
                text += `👉 Dùng lệnh: -note edit <STT> <Nội dung mới>\n`;
                return api.sendMessage({ msg: text }, threadId, threadType);
            } catch (e) {
                if (log) log.error("Lỗi note list:", e.message);
                return api.sendMessage({ msg: `❌ Lỗi lấy danh sách ghi chú: ${e.message}` }, threadId, threadType);
            }
        }

        if (cmd === "edit") {
            const idTarget = args[1];
            const newContent = args.slice(2).join(" ");
            
            if (!idTarget || !newContent) {
                return api.sendMessage({ msg: "⚠️ Dùng sai rồi! Chuẩn là: -note edit <Số thứ tự> <Nội dung thay thế>" }, threadId, threadType);
            }
            
            try {
                const board = await api.getListBoard({ page: 1, count: 20 }, threadId);
                if (!board || !board.items) return api.sendMessage({ msg: "❌ Bảng tin dường như trống trơn." }, threadId, threadType);
                
                const noteItems = board.items.filter(item => item.boardType == 2);
                let targetNote = null;
                
                // Chọn bằng STT (nhỏ hơn 5 ký tự) hoặc ID (dài ngoằng)
                if (idTarget.length < 5 && !isNaN(idTarget)) {
                    const idx = parseInt(idTarget) - 1;
                    if (idx >= 0 && idx < noteItems.length) targetNote = noteItems[idx];
                } else {
                    targetNote = noteItems.find(item => item.data.id === idTarget);
                }
                
                if (!targetNote) {
                    return api.sendMessage({ msg: `⚠️ Tìm lòi mắt không thấy ghi chú nào có Số Thứ Tự/ID là: ${idTarget}` }, threadId, threadType);
                }
                
                // Chém nội dung cũ, đắp nội dung mới và Ghim nó lại!
                await api.editNote({ topicId: targetNote.data.id, title: newContent, pinAct: true }, threadId);
                return api.sendMessage({ msg: `✅ Thành công thay máu ghi chú số [${idTarget}] rồi nhé!` }, threadId, threadType);
            } catch (e) {
                if (log) log.error("Lỗi note edit:", e.message);
                return api.sendMessage({ msg: `❌ Thất bại: ${e.message}\n(Có thể Bot không phải phó nhóm/nhóm trưởng nên không có quyền sửa Ghi chú của người khác)` }, threadId, threadType);
            }
        }
        
        // Hướng dẫn
        return api.sendMessage({ msg: "📌 [ QUẢN LÝ GHI CHÚ ]\n─────────────────\n👉 1. Thêm mới: -note add <nội dung>\n👉 2. Danh sách: -note list\n👉 3. Sửa ghi chú: -note edit <STT> <Nội dung mới>\n\nVí dụ: -note edit 1 Cập nhật luật mới..." }, threadId, threadType);
    }
};
