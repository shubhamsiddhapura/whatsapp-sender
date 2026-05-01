const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './wa-session' }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('ready', async () => {
    console.log('✅ Connected!\n');
    const chats = await client.getChats();
    const groups = chats.filter(c => c.isGroup);
    
    console.log(`Total groups: ${groups.length}\n`);
    console.log('─'.repeat(60));
    groups.forEach(g => {
        const name = (g.name || 'Unknown').padEnd(40);
        console.log(`${name} → ${g.id._serialized}`);
    });
    console.log('─'.repeat(60));
    process.exit(0);
});

client.initialize();