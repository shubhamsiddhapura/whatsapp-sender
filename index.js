const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

const PORT = process.env.PORT || 8080;
const SECRET = process.env.SECRET || 'mysecret123';

// ── TARGET GROUPS ──
const TARGETS = [
    "917595918075-1496324435@g.us",
    "917016873944-1593607947@g.us",
    "918200440146-1564379890@g.us",
    "919820029884-1582615821@g.us",
    "918780827111-1571551482@g.us",
    "919726940663-1577164424@g.us",
    "919714337053-1573543182@g.us",
    "917046988196-1572457916@g.us",
    "919586314787-1564666079@g.us",
    "919909484285-1564665349@g.us",
    "918199997555-1552496645@g.us",
    "918199997555-1553240232@g.us",
    "918199997555-1553257746@g.us",
    "918199997555-1553243527@g.us",
    "918199997555-1553247660@g.us",
    "919714054329-1554561390@g.us",
    "919104162630-1554257200@g.us",
    "917405307943-1552747436@g.us",
    "919714054329-1551859569@g.us",
    "919726940663-1530822428@g.us",
    "917405307943-1538235175@g.us",
    "14234915513-1531580853@g.us",
    "917405307943-1530432593@g.us",
    "919558504975-1527416161@g.us",
    "919726940663-1529860840@g.us",
    "919726940663-1527234935@g.us",
    "120363032264018586@g.us",
    "120363028561797157@g.us",
    "120363047844816477@g.us",
    "120363049791618063@g.us"
];

// ── IST HELPERS ──
function getISTMinutes() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + istOffset);
    return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function getISTDateString() {
    const istOffset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(Date.now() + istOffset);
    return `${ist.getUTCFullYear()}-${ist.getUTCMonth()}-${ist.getUTCDate()}`;
}

// ── SLEEP SYSTEM ──
let todayStartTime = null;
let lastResetDate = null;

function getTodayStartTime() {
    if (todayStartTime) return todayStartTime;
    todayStartTime = 480 + Math.floor(Math.random() * 60); // 8:00–9:00 AM IST
    const h = Math.floor(todayStartTime / 60);
    const m = String(todayStartTime % 60).padStart(2, '0');
    console.log(`🌅 WA Start time today: ${h}:${m} IST`);
    return todayStartTime;
}

function isSleepTime() {
    const current = getISTMinutes();
    const startTime = getTodayStartTime();
    if (current >= startTime) return false;
    if (current < 30) return false;
    return true;
}

// ── DAILY RESET ──
let maxLongPauses = Math.floor(Math.random() * 6) + 10;
let breaks = [];
let lastPauseHour = null;

function generateDailyBreaks() {
    breaks = [];
    function addBreaks(count, start, end) {
        for (let i = 0; i < count; i++) {
            const time = Math.floor(Math.random() * (end - start)) + start;
            breaks.push({ time, taken: false });
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
        maxLongPauses = Math.floor(Math.random() * 6) + 10;
        lastResetDate = today;
        todayStartTime = null;
        generateDailyBreaks();
        console.log(`🔄 Reset day | Long pauses: ${maxLongPauses}`);
    }
}

// ── DELAYS ──
function smartDelay() {
    const currentHour = new Date().getHours();
    let delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
    if (lastPauseHour !== currentHour && Math.random() < 0.4) {
        lastPauseHour = currentHour;
        const longPause = (2 + Math.random()) * 60 * 1000;
        console.log(`⏸ Hourly pause ${(longPause / 60000).toFixed(1)} min`);
        return longPause;
    }
    return delay;
}

function shouldTakeBigBreak() {
    const current = getISTMinutes();
    for (let b of breaks) {
        if (!b.taken && current >= b.time) {
            b.taken = true;
            return true;
        }
    }
    return false;
}

function getBigBreak() {
    return (12 + Math.random() * 8) * 60 * 1000;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── WHATSAPP CLIENT ──
let isReady = false;
let isReconnecting = false;
let client = null;

function createClient() {
    return new Client({
        authStrategy: new LocalAuth({ dataPath: './wa-session' }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
            ]
        }
    });
}

function scheduleReconnect() {
    if (isReconnecting) return;
    isReconnecting = true;
    isReady = false;
    console.log('🔄 Reconnecting in 15s...');
    setTimeout(async () => {
        try {
            await client.destroy();
            console.log('🗑️ Old client destroyed');
        } catch (e) {
            console.log('⚠️ Destroy error (ignored):', e.message);
        }
        client = createClient();
        setupClientEvents();
        client.initialize();
    }, 15000);
}

function setupClientEvents() {
    client.on('qr', () => {
        console.log('📱 QR code received — scan it!');
    });

    client.on('ready', () => {
        console.log('✅ WhatsApp connected! Warming up for 15s...');
        isReconnecting = false;
        // Warm-up delay — wait before marking ready to send
        setTimeout(() => {
            isReady = true;
            console.log('✅ WA Ready to send!');
            processQueue(); // resume queued jobs
        }, 15000);
    });

    client.on('disconnected', (reason) => {
        console.log(`⚠️ WA Disconnected: ${reason}`);
        isReady = false;
        scheduleReconnect();
    });

    client.on('auth_failure', (msg) => {
        console.error(`❌ Auth failure: ${msg}`);
        isReady = false;
        scheduleReconnect();
    });
}

// Handle Puppeteer crashes globally
process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (
        msg.includes('detached Frame') ||
        msg.includes('Target closed') ||
        msg.includes('Session closed') ||
        msg.includes('Protocol error') ||
        msg.includes('Cannot read properties of null')
    ) {
        console.log(`⚠️ Puppeteer crash caught globally: ${msg}`);
        if (!isReconnecting) {
            isReady = false;
            scheduleReconnect();
        }
        return;
    }
    console.error('Unhandled rejection:', reason);
});

// ── QUEUE ──
const queue = [];
let processing = false;

async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {

        resetDaily();

        // Wait for WhatsApp to be ready
        if (!isReady) {
            console.log('⏳ Waiting for WA to be ready...');
            await sleep(15000);
            continue;
        }

        const job = queue.shift();
        let batchAborted = false;

        for (let i = 0; i < TARGETS.length; i++) {

            // 🌙 Sleep check
            while (isSleepTime()) {
                const current = getISTMinutes();
                console.log(`🌙 Quiet hours... IST ${Math.floor(current / 60)}:${String(current % 60).padStart(2, '0')}`);
                await sleep(60000);
                resetDaily();
            }

            // Check WA still ready before each message
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

            const jid = TARGETS[i];

            try {
                if (job.imageBuffer) {
                    const media = new MessageMedia(
                        'image/jpeg',
                        job.imageBuffer.toString('base64'),
                        'deal.jpg'
                    );
                    await client.sendMessage(jid, media, { caption: job.text || '' });
                } else {
                    await client.sendMessage(jid, job.text);
                }
                console.log(`✅ ${i + 1}/${TARGETS.length}`);

            } catch (err) {
                const msg = err.message || '';
                if (
                    msg.includes('detached Frame') ||
                    msg.includes('Target closed') ||
                    msg.includes('Session closed') ||
                    msg.includes('Protocol error')
                ) {
                    console.log(`⚠️ Puppeteer crash on ${i + 1}/${TARGETS.length} — re-queuing & reconnecting...`);
                    isReady = false;
                    scheduleReconnect();
                    queue.unshift(job);
                    batchAborted = true;
                    break;
                }
                console.error(`❌ Send error [${i + 1}/${TARGETS.length}]: ${msg}`);
            }

            // ⏱ Delay between messages
            if (i < TARGETS.length - 1 && !batchAborted) {
                const delay = smartDelay();
                await sleep(delay);
            }
        }

        if (batchAborted) {
            console.log('⏳ Waiting 20s before retry...');
            await sleep(20000);
            continue;
        }

        console.log('✅ Batch done');

        // 🧍 Big break AFTER batch
        if (shouldTakeBigBreak()) {
            const breakTime = getBigBreak();
            console.log(`🧍 Big break ${(breakTime / 60000).toFixed(1)} min`);
            await sleep(breakTime);
        }

        if (queue.length > 0) {
            await sleep(smartDelay());
        }
    }

    processing = false;
}

// ── API ──
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        whatsapp: isReady,
        queue: queue.length,
        sleeping: isSleepTime()
    });
});

app.post('/send', upload.single('image'), (req, res) => {
    const secret = req.body?.secret || req.query?.secret;

    if (secret !== SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp not ready' });
    }

    queue.push({
        text: req.body?.text || '',
        imageBuffer: req.file?.buffer || null
    });

    processQueue();

    res.json({ success: true, queue: queue.length });
});

app.listen(PORT, () => {
    console.log(`🚀 Running on ${PORT}`);
});

// ── START ──
generateDailyBreaks();
client = createClient();
setupClientEvents();
client.initialize();