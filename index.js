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
const DELAY_MIN = 5000;
const DELAY_MAX = 12000;

let isReady = false;
const queue = [];
let processing = false;

// 🌙 Sleep system
let todayStartTime = null;

function getTodayStartTime() {
    if (todayStartTime) return todayStartTime;

    const base = 8 * 60;
    const randomOffset = Math.floor(Math.random() * 60); // 8–9 AM
    todayStartTime = base + randomOffset;

    console.log(`🌅 Today start time: ${(todayStartTime / 60).toFixed(2)} hrs`);
    return todayStartTime;
}

function isSleepTime() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const sleepStart = 30; // 12:30 AM
    const sleepEnd = getTodayStartTime();

    return currentTime >= sleepStart && currentTime < sleepEnd;
}

// 🧍 Break system
function shouldTakeBreak() {
    return Math.random() < 0.15;
}

function getBreakTime() {
    return (15 + Math.random() * 10) * 60 * 1000;
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

client.on('qr', () => {
    console.log('❌ QR scan needed!');
});

client.on('ready', () => {
    isReady = true;
    console.log('✅ WhatsApp connected!');
});

client.on('disconnected', () => {
    isReady = false;
    client.initialize();
});

// ── Helpers ──
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
    return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
}

// ── Queue ──
async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
        if (!isReady) {
            console.log('⏸ Waiting for WhatsApp...');
            await sleep(5000);
            continue;
        }

        const job = queue.shift();
        console.log(`📤 Sending to ${TARGETS.length} groups`);

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

                console.log(`✅ [${i + 1}/${TARGETS.length}] Sent`);

            } catch (err) {
                console.error(`❌ Failed: ${err.message}`);
            }

            // ⏱ Normal delay
            if (i < TARGETS.length - 1) {
                const delay = randomDelay();
                console.log(`⏳ ${delay / 1000}s`);
                await sleep(delay);
            }

            // 🧍 Random break
            if (shouldTakeBreak()) {
                const breakTime = getBreakTime();
                console.log(`🧍 Break ${(breakTime / 60000).toFixed(1)} min`);
                await sleep(breakTime);
            }
        }

        console.log(`✅ Completed batch`);

        if (queue.length > 0) {
            await sleep(randomDelay() * 2);
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

    const text = req.body?.text || '';
    const imageBuffer = req.file?.buffer || null;

    queue.push({ text, imageBuffer });
    processQueue();

    res.json({ success: true });
});

// ── Start ──
app.listen(PORT, () => {
    console.log(`🚀 Server running on ${PORT}`);
});

client.initialize();