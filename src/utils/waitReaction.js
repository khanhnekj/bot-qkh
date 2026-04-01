const WAIT_TEXT = "chờ 1 tí";
const CLOCK_ICONS = ["181", "182", "183", "184", "185", "186"];

function buildReactionTarget(message, threadId, threadType) {
    const data = message?.data || message;
    const msgId = data?.msgId || data?.globalMsgId;
    if (!msgId || !threadId) return null;

    return {
        data: {
            msgId,
            cliMsgId: data?.cliMsgId,
            uidFrom: data?.uidFrom || data?.uid || data?.ownerId
        },
        threadId,
        type: threadType
    };
}

async function sendReaction(api, reaction, target) {
    if (!target) return false;
    try {
        await api.addReaction(reaction, target);
        return true;
    } catch {
        return false;
    }
}

export function createWaitReaction(api, message, threadId, threadType, options = {}) {
    const target = buildReactionTarget(message, threadId, threadType);
    const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : 2000;

    let started = false;
    let stopped = false;
    let timer = null;
    let clockIndex = 0;

    const start = () => {
        if (started || stopped || !target) return;

        started = true;
        void sendReaction(api, options.initialText || WAIT_TEXT, target);

        timer = setInterval(() => {
            const icon = CLOCK_ICONS[clockIndex % CLOCK_ICONS.length];
            clockIndex += 1;
            void sendReaction(api, { icon, rType: 75, source: 1 }, target);
        }, intervalMs);

        if (typeof timer.unref === "function") timer.unref();
    };

    const stop = (finalReaction = null) => {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        stopped = true;

        if (finalReaction) {
            void sendReaction(api, finalReaction, target);
        }
    };

    return {
        hasTarget: Boolean(target),
        isStarted: () => started,
        start,
        stop
    };
}

export function wrapApiWithWaitReaction(api, waitReaction) {
    return new Proxy(api, {
        get(target, prop) {
            const value = Reflect.get(target, prop);
            if (typeof value !== "function") return value;

            const propName = String(prop);
            
            // Bỏ qua không wrap 'sendCustomSticker' vì ZCA-JS định nghĩa hàm này là read-only/non-configurable
            // Cố tình wrap sẽ gây lỗi 'Proxy Invariant' khiến bot crash hoặc tạch lệnh gửi
            if (propName === "sendCustomSticker") return value;

            try {
                const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
                if (descriptor && descriptor.configurable === false) {
                    return value;
                }
            } catch (e) {}

            const bound = value.bind(target);
            if (!propName.startsWith("send") || propName === "sendTypingEvent") {
                return bound;
            }

            return (...args) => {
                waitReaction?.start();
                return bound(...args);
            };
        }
    });
}
