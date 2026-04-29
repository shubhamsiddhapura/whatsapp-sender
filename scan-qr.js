const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa-session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', qr => {
    console.log('\n📱 Scan this QR with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('\n✅ WhatsApp connected successfully!');
    console.log('📁 Session saved in ./wa-session folder');
    console.log('\n👥 Fetching your groups...\n');

    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    const channels = chats.filter(c => c.isChannel);

    console.log('─'.repeat(70));
    console.log('GROUPS:');
    groups.forEach(g => {
        const name = (g.name || 'Unknown').padEnd(40);
        const id = g.id._serialized;
        console.log(`  ${name} → ${id}`);
    });

    console.log('\nCHANNELS:');
    channels.forEach(c => {
        const name = (c.name || 'Unknown').padEnd(40);
        const id = c.id._serialized;
        console.log(`  ${name} → ${id}`);
    });

    console.log('─'.repeat(70));
    console.log(`\nTotal Groups: ${groups.length}`);
    console.log(`Total Channels: ${channels.length}`);
    console.log('\n⏳ Saving session... wait 30 seconds...');

    setTimeout(() => {
        console.log('✅ Done! Session saved. You can close this now.');
        process.exit(0);
    }, 30000);
});

client.on('auth_failure', () => {
    console.log('❌ Auth failed! Delete wa-session folder and try again.');
    process.exit(1);
});

client.initialize();