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

// ── DELAYS ──
let longPauseCount = 0;
let maxLongPauses = Math.floor(Math.random() * 6) + 10;
let lastResetDate = null;

// 🌙 Sleep system
let todayStartTime = null;

function getTodayStartTime() {
    if (todayStartTime) return todayStartTime;

    // Random start between 8:00 AM (480 min) and 9:00 AM (540 min)
    todayStartTime = 480 + Math.floor(Math.random() * 60);

    console.log(`🌅 WA Start time today: ${Math.floor(todayStartTime/60)}:${String(todayStartTime%60).padStart(2,'0')}`);
    return todayStartTime;
}

function isSleepTime() {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const startTime = getTodayStartTime();

    // Quiet zone is ONLY between 00:30 and startTime (e.g. 8:01 AM)
    // Outside that window (evening/day), never sleep
    if (current >= startTime) return false;   // after start → awake
    if (current < 30) return false;            // before 00:30 (e.g. 23:xx, 0:00–0:29) → awake
    return true;                               // 00:30 to startTime → sleep
}

// 🔄 Reset daily counters
function resetDaily() {
    const today = new Date().toDateString();

    if (lastResetDate !== today) {
        longPauseCount = 0;
        maxLongPauses = Math.floor(Math.random() * 6) + 10;
        lastResetDate = today;
        todayStartTime = null; // ← ADD THIS LINE to reset start time each day
        generateDailyBreaks();
        console.log(`🔄 Reset day | Long pauses: ${maxLongPauses}`);
    }
}

// ⏱ Smart delay (MAIN LOGIC)
let lastPauseHour = null;

function smartDelay() {
    const now = new Date();
    const currentHour = now.getHours();

    // 🔹 Normal delay (4–10 sec)
    let delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;

    // 🔹 Allow ONLY 1 long pause per hour
    if (lastPauseHour !== currentHour && Math.random() < 0.4) {
        lastPauseHour = currentHour;

        const longPause = (2 + Math.random()) * 60 * 1000; // 2–3 min

        console.log(`⏸ Hourly pause ${(longPause / 60000).toFixed(1)} min (hour ${currentHour})`);

        return longPause;
    }

    return delay;
}

// 🧍 BIG BREAK SYSTEM (only between batches)
let breaks = [];

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

function shouldTakeBigBreak() {
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();

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

// ── WhatsApp Client ──
const client = new Client({
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

client.on('ready', () => {
    console.log('✅ WhatsApp connected!');
});

// ── Helpers ──
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ── Queue ──
let isReady = false;
const queue = [];
let processing = false;

client.on('ready', () => isReady = true);
client.on('disconnected', () => {
    isReady = false;
    client.initialize();
});

async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {

        if (!isReady) {
            await sleep(5000);
            continue;
        }

        const job = queue.shift();

        for (let i = 0; i < TARGETS.length; i++) {

            // 🌙 Sleep check
            while (isSleepTime()) {
                console.log("🌙 Sleeping...");
                await sleep(60000);
            }

            const jid = TARGETS[i];

            try {
                if (job.imageBuffer) {
                    const media = new MessageMedia(
                        'image/jpeg',
                        job.imageBuffer.toString('base64'),
                        'deal.jpg'
                    );
                    await client.sendMessage(jid, media, {
                        caption: job.text || ''
                    });
                } else {
                    await client.sendMessage(jid, job.text);
                }

                console.log(`✅ ${i + 1}/${TARGETS.length}`);

            } catch (err) {
                console.error(err.message);
            }

            // ⏱ Delay (smart)
            if (i < TARGETS.length - 1) {
                const delay = smartDelay();
                await sleep(delay);
            }
        }

        console.log("✅ Batch done");

        // 🧍 Big break AFTER batch
        if (shouldTakeBigBreak()) {
            const breakTime = getBigBreak();
            console.log(`🧍 Big break ${(breakTime/60000).toFixed(1)} min`);
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
    res.json({ status: 'running', whatsapp: isReady });
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

    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`🚀 Running on ${PORT}`);
});

client.initialize();