const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const AUTH_FOLDER = './wa-session';

async function start() {
    const { state, saveCreds } =
        await useMultiFileAuthState(AUTH_FOLDER);

    const { version } =
        await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update',
        async ({ connection, lastDisconnect, qr }) => {

            if (qr) {
                console.log("Scan QR:");
                qrcode.generate(qr, { small: true });
            }

            if (connection === 'open') {
                console.log("✅ Connected!");

                try {
                    await new Promise(r =>
                        setTimeout(r, 5000));

                    const groups =
                        await sock.groupFetchAllParticipating();

                    Object.entries(groups).forEach(
                        ([id, meta]) => {
                            console.log(
                                `${meta.subject} -> ${id}`
                            );
                        }
                    );

                } catch (e) {
                    console.log(e.message);
                }
            }

            if (connection === 'close') {

                const reason =
                    new Boom(
                        lastDisconnect?.error
                    ).output?.statusCode;

                console.log(
                    "Closed:",
                    reason
                );

                if (
                    reason === DisconnectReason.loggedOut
                ) {
                    console.log(
                        "Delete wa-session & rescan"
                    );
                } else {
                    console.log(
                        "Reconnecting..."
                    );

                    start(); // reconnect
                }
            }
        });
}

start();