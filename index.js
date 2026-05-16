const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeInMemoryStore,
    downloadMediaMessage,
    proto,
    getContentType,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const multer  = require('multer');
const pino    = require('pino');
const fs      = require('fs');
const path    = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

const PORT   = process.env.PORT   || 8080;
const SECRET = process.env.SECRET || 'mysecret123';

// ── TARGET GROUPS (for /send — bulk broadcast) ──
const TARGETS = [
  "120363408116455659@g.us"
];

// ══════════════════════════════════════════
//  IST HELPERS
// ══════════════════════════════════════════
function getISTMinutes() {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(Date.now() + istOffset);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function getISTDateString() {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(Date.now() + istOffset);
    return `${ist.getUTCFullYear()}-${ist.getUTCMonth()}-${ist.getUTCDate()}`;
}

// ══════════════════════════════════════════
//  SLEEP / BREAK SYSTEM (unchanged logic)
// ══════════════════════════════════════════
let todayStartTime = null;
let lastResetDate  = null;
let maxLongPauses  = Math.floor(Math.random() * 6) + 10;
let breaks         = [];
let lastPauseHour  = null;

function getTodayStartTime() {
    if (todayStartTime) return todayStartTime;
    todayStartTime = 480 + Math.floor(Math.random() * 60);
    const h = Math.floor(todayStartTime / 60);
    const m = String(todayStartTime % 60).padStart(2, '0');
    console.log(`🌅 WA Start time today: ${h}:${m} IST`);
    return todayStartTime;
}

function isSleepTime() {
    const current   = getISTMinutes();
    const startTime = getTodayStartTime();
    if (current >= startTime) return false;
    if (current < 60) return false;;
    return true;
}

function generateDailyBreaks() {
    breaks = [];
    function addBreaks(count, start, end) {
        for (let i = 0; i < count; i++) {
            breaks.push({ time: Math.floor(Math.random() * (end - start)) + start, taken: false });
        }
    }
    addBreaks(3, 8 * 60, 14 * 60);
    addBreaks(2, 14 * 60, 20 * 60);
    addBreaks(1, 20 * 60, 24 * 60);
    breaks.sort((a, b) => a.time - b.time);
}

function resetDaily() {
    const today = getISTDateString();
    if (lastResetDate !== today) {
        maxLongPauses  = Math.floor(Math.random() * 6) + 10;
        lastResetDate  = today;
        todayStartTime = null;
        generateDailyBreaks();
        console.log(`🔄 Reset day | Long pauses: ${maxLongPauses}`);
    }
}

function smartDelay() {
    const currentHour = new Date().getHours();
    if (lastPauseHour !== currentHour && Math.random() < 0.4) {
        lastPauseHour = currentHour;
        const longPause = (2 + Math.random()) * 60 * 1000;
        console.log(`⏸ Hourly pause ${(longPause / 60000).toFixed(1)} min`);
        return longPause;
    }
    return Math.floor(Math.random() * 3000) + 3000;
}

function shouldTakeBigBreak() {
    const current = getISTMinutes();
    for (let b of breaks) {
        if (!b.taken && current >= b.time) { b.taken = true; return true; }
    }
    return false;
}

function getBigBreak() { return (12 + Math.random() * 8) * 60 * 1000; }
function sleep(ms)      { return new Promise(r => setTimeout(r, ms)); }

// ══════════════════════════════════════════
//  BAILEYS CLIENT
//  Key memory advantages over whatsapp-web.js:
//  • No Puppeteer/Chromium — pure WebSocket (~50MB vs 400MB)
//  • getMessage returns undefined → Baileys doesn't cache history
//  • Silent pino logger (no log buffering)
//  • Auth stored in files, not RAM
// ══════════════════════════════════════════
let sock     = null;
let isReady  = false;
let isReconnecting = false;

const AUTH_FOLDER = './wa-session';
const logger = pino({ level: 'silent' }); // suppress Baileys internal logs

async function connectWA() {
    if (isReconnecting) return;
    isReconnecting = true;

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version }          = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logger,
        auth: state,
        // ── Memory optimizations ──────────────────────────────────
        // Don't fetch or cache message history — biggest memory saver
        getMessage: async (key) => {
        // Return a placeholder so Baileys doesn't retry forever
        return { conversation: '' };
    },
        // Don't sync full chat history on connect
        syncFullHistory: false,
        // Don't store messages in memory
        generateHighQualityLinkPreview: false,
        // Shorter timeouts = less buffer held in memory
        connectTimeoutMs: 30_000,
        keepAliveIntervalMs: 25_000,
        // ─────────────────────────────────────────────────────────
    });

    sock.ev.on('messages.upsert', () => {}); // consume silently

// Suppress Bad MAC noise from other people's messages
process.on('unhandledRejection', (err) => {
    if (err?.message?.includes('Bad MAC')) return; // ignore
    console.error('Unhandled:', err);
});

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('📱 QR received — scan it in WhatsApp → Linked Devices');
            // Print QR to console for Railway logs
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp connected via Baileys!');
            isReconnecting = false;
            // Short warmup then mark ready
            await sleep(5000);
            isReady = true;
            console.log('✅ WA Ready to send!');
            processQueue();
        }

        if (connection === 'close') {
            isReady = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.log(`⚠️ WA closed | code=${statusCode} | reconnect=${shouldReconnect}`);

            if (shouldReconnect) {
                isReconnecting = false; // allow reconnect
                await sleep(10_000);
                connectWA();
            } else {
                console.error('❌ Logged out — delete wa-session folder and restart to re-scan QR');
                isReconnecting = false;
            }
        }
    });
}

// ══════════════════════════════════════════
//  SEND HELPERS
// ══════════════════════════════════════════
async function sendToJid(jid, text, imageBuffer) {
    if (imageBuffer) {
        await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: text || '',
            mimetype: 'image/jpeg',
        });
    } else {
        await sock.sendMessage(jid, { text: text || '' });
    }
}

// ══════════════════════════════════════════
//  BULK QUEUE  (for /send — all TARGETS)
// ══════════════════════════════════════════
const queue = [];
let processing = false;

async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
        resetDaily();

        if (!isReady) {
            console.log('⏳ Waiting for WA to be ready...');
            await sleep(15000);
            continue;
        }

        const job = queue.shift();
        let batchAborted = false;

        for (let i = 0; i < TARGETS.length; i++) {
            // Quiet hours check
            while (isSleepTime()) {
                const cur = getISTMinutes();
                console.log(`🌙 Quiet hours... ${Math.floor(cur / 60)}:${String(cur % 60).padStart(2, '0')} IST`);
                await sleep(60000);
                resetDaily();
            }

            if (!isReady) {
                console.log('⚠️ WA lost mid-batch — waiting 20s...');
                await sleep(20000);
                if (!isReady) {
                    console.log('⚠️ Still not ready — re-queuing job');
                    queue.unshift(job);
                    batchAborted = true;
                    break;
                }
            }

            try {
                await sendToJid(TARGETS[i], job.text, job.imageBuffer);
                console.log(`✅ [BULK] ${i + 1}/${TARGETS.length} → ${TARGETS[i]}`);
            } catch (err) {
                console.error(`❌ [BULK] ${i + 1}/${TARGETS.length} failed: ${err.message}`);
                // Non-fatal — log and continue to next group
            }

            if (i < TARGETS.length - 1 && !batchAborted) {
                await sleep(smartDelay());
            }
        }

        if (batchAborted) {
            console.log('⏳ Waiting 20s before retry...');
            await sleep(20000);
            continue;
        }

        console.log('✅ Bulk batch done');

        if (shouldTakeBigBreak()) {
            const breakTime = getBigBreak();
            console.log(`🧍 Big break ${(breakTime / 60000).toFixed(1)} min`);
            await sleep(breakTime);
        }

        if (queue.length > 0) await sleep(smartDelay());

        // ── Explicit GC hint after each batch ──
        // Releases image buffers from completed jobs
        if (global.gc) global.gc();
    }

    processing = false;
}

// ══════════════════════════════════════════
//  API ROUTES
// ══════════════════════════════════════════
app.get('/', (req, res) => {
    res.json({
        status:   'running',
        whatsapp: isReady,
        queue:    queue.length,
        sleeping: isSleepTime(),
        memory:   process.memoryUsage(),
    });
});

// /send — bulk to all TARGETS (Amazon deals)
app.post('/send', upload.single('image'), (req, res) => {
    const secret = req.body?.secret || req.query?.secret;
    if (secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
    if (!isReady)          return res.status(503).json({ error: 'WhatsApp not ready' });

    queue.push({
        text:        req.body?.text || '',
        imageBuffer: req.file?.buffer || null,
    });

    processQueue();
    res.json({ success: true, queue: queue.length });
});

// /send-single — one specific group (Flipkart / CC deals)
app.post('/send-single', upload.single('image'), async (req, res) => {
    const secret = req.body?.secret || req.query?.secret;
    if (secret !== SECRET) return res.status(401).json({ error: 'Unauthorized' });
    if (!isReady)          return res.status(503).json({ error: 'WhatsApp not ready' });

    const target = req.body?.target;
    if (!target) return res.status(400).json({ error: 'Missing target group JID' });

    try {
        await sendToJid(target, req.body?.text || '', req.file?.buffer || null);
        console.log(`✅ [SINGLE] Sent to ${target}`);
        res.json({ success: true });
    } catch (err) {
        console.error(`❌ [SINGLE] Failed: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// ══════════════════════════════════════════
//  START
// ══════════════════════════════════════════
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

generateDailyBreaks();
connectWA();