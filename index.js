const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const multer = require('multer');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SECRET = process.env.SECRET || 'mysecret123';

// ── PASTE YOUR GROUP IDs HERE ──────────────────────────────────
const TARGETS = [
    // Groups
    "917595918075-1496324435@g.us",   // Group 1 name
    "917016873944-1593607947@g.us",   // Group 2 name
    // ... baaki sab groups
    // Channel
    "120363049791618063@g.us",  // Tumhara channel
];
// ──────────────────────────────────────────────────────────────

const DELAY_MIN = 5000;   // 8 seconds
const DELAY_MAX = 12000;  // 18 seconds

let isReady = false;
const queue = [];
let processing = false;

// ── WhatsApp Client ──
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa-session' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

client.on('qr', () => {
    console.log('❌ QR scan needed! Run scan-qr.js first on your PC.');
});

client.on('ready', () => {
    isReady = true;
    console.log('✅ WhatsApp connected!');
    console.log(`👥 Targets: ${TARGETS.length} groups/channels`);
});

client.on('disconnected', (reason) => {
    isReady = false;
    console.log(`⚠️ Disconnected: ${reason}. Reconnecting...`);
    client.initialize();
});

// ── Helper functions ──
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function randomDelay() {
    return Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
}

// ── Queue processor ──
async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
        if (!isReady) {
            console.log('⏸ Not connected, waiting...');
            await sleep(5000);
            continue;
        }

        const job = queue.shift();
        console.log(`\n📤 Sending to ${TARGETS.length} targets...`);

        for (let i = 0; i < TARGETS.length; i++) {
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
                console.log(`  ✅ [${i + 1}/${TARGETS.length}] Sent`);
            } catch (err) {
                console.error(`  ❌ Failed [${jid}]: ${err.message}`);
            }

            // Delay between groups
            if (i < TARGETS.length - 1) {
                const delay = randomDelay();
                console.log(`  ⏳ Waiting ${(delay/1000).toFixed(1)}s...`);
                await sleep(delay);
            }
        }

        console.log(`✅ Deal sent to all targets!\n`);

        // Extra delay between multiple deals
        if (queue.length > 0) {
            const pause = randomDelay() * 2;
            console.log(`🔄 Next deal in ${(pause/1000).toFixed(1)}s...`);
            await sleep(pause);
        }
    }

    processing = false;
}

// ── API Routes ──

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        whatsapp: isReady ? 'connected' : 'disconnected',
        queue: queue.length,
        targets: TARGETS.length
    });
});

// Send message
app.post('/send', upload.single('image'), (req, res) => {
    const secret = req.body?.secret || req.query?.secret;
    if (secret !== SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isReady) {
        return res.status(503).json({ error: 'WhatsApp not connected' });
    }

    if (TARGETS.length === 0) {
        return res.status(400).json({ error: 'No targets configured' });
    }

    const text = req.body?.text || '';
    const imageBuffer = req.file?.buffer || null;

    if (!text && !imageBuffer) {
        return res.status(400).json({ error: 'No text or image' });
    }

    queue.push({ text, imageBuffer });
    console.log(`📥 Queued! Queue size: ${queue.length}`);
    processQueue();

    res.json({ success: true, queued: queue.length });
});

// ── Start ──
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 Secret: ${SECRET}`);
});

client.initialize();