const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode   = require('qrcode-terminal');
const pino     = require('pino');

const AUTH_FOLDER = './wa-session';
const logger = pino({ level: 'silent' });

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    const { version }          = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger,
        auth: state,
        getMessage: async () => undefined,
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
            console.log('\n📱 Scan this QR with WhatsApp → Linked Devices:\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'open') {
            console.log('\n✅ WhatsApp connected successfully!');
            console.log('📁 Session saved in ./wa-session folder');
            console.log('\n👥 Fetching your groups...\n');

            // Give Baileys a moment to sync group metadata
            await new Promise(r => setTimeout(r, 5000));

            try {
                const groups = await sock.groupFetchAllParticipating();
                const entries = Object.entries(groups);

                console.log('─'.repeat(70));
                console.log('GROUPS:');
                entries.forEach(([id, meta]) => {
                    const name = (meta.subject || 'Unknown').padEnd(40);
                    console.log(`  ${name} → ${id}`);
                });
                console.log('─'.repeat(70));
                console.log(`\nTotal Groups: ${entries.length}`);
            } catch (err) {
                console.error('⚠️  Could not fetch groups:', err.message);
            }

            console.log('\n⏳ Saving session... wait 15 seconds...');
            setTimeout(() => {
                console.log('✅ Done! Session saved. You can close this now.');
                process.exit(0);
            }, 15000);
        }

        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('❌ Auth failed! Delete wa-session folder and try again.');
                process.exit(1);
            }
            // Any other close during QR scan — just exit so user can retry
            console.log('⚠️  Connection closed. Please run this script again.');
            process.exit(1);
        }
    });
}

start().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});