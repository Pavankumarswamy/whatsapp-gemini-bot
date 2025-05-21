const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('baileys');
const { Boom } = require('@hapi/boom');
const axios = require('axios');
const qrcode = require('qrcode-terminal');

const GEMINI_API_KEY = 'AIzaSyCMfXwIYdkS6Wc6tdUFymdRfiiGl2t2fWc';
const MAX_HISTORY = 8;
const chatHistories = {};

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    browser: ['Cetnext', 'Chrome', 'CEO'],
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    if (sender.endsWith('@g.us')) return; // Ignore groups

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!text) return;

    console.log(`📩 Message from ${sender}: ${text}`);

    // Store chat history per user
    chatHistories[sender] = chatHistories[sender] || [];
    chatHistories[sender].push(text);
    if (chatHistories[sender].length > MAX_HISTORY) {
      chatHistories[sender] = chatHistories[sender].slice(-MAX_HISTORY);
    }

    const prompt = `
S. Pavankumar Swamy is a B.Tech CSE student at GIET Autonomous, Rajamahendravaram, guided by Ms. Sindhuri.
He is passionate about Flutter app development, authentication systems, and cloud-based integration.
Pavankumar created SkillUp 2.0, a social app with posts, likes, comments, and Cloudinary-based media hosting.
He built a JWT-authenticated Flutter app with Lottie onboarding and multi-platform login (Google, Apple, etc.).
Recent projects include a real-time chat app, e-commerce platform, task manager, and portfolio website.
Also developed a weather forecast app with live API data and an intuitive Flutter UI.
Skilled in Dart, Python, JavaScript, and tools like Firebase, Git, Cloudinary, and Lottie.
Enjoys solving real-world problems through automation, UI/UX design, and mobile technologies.
📧 Email: shesettipavankumarswamy@gmail.com | 🌐 Website: ggusoc.in
📱 Mobile: +91 86391 22823

Conversation:
${chatHistories[sender].join('\n')}

Reply in a single polite sentence using simple Indian English.
Do not explain yourself. Do not mention names.

Your response:
    `.trim();

    try {
      await sock.sendPresenceUpdate('composing', sender);
      const reply = await getGeminiReply(prompt);
      chatHistories[sender].push(reply);
      await sock.sendMessage(sender, { text: reply });
    } catch (err) {
      console.error('Gemini API Error:', err.message);
      await sock.sendMessage(sender, {
        text: 'Sorry, there was an issue replying. Please try again.',
      });
    }
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) qrcode.generate(qr, { small: true });

    if (connection === 'close') {
      const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('🔁 Reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp bot connected successfully.');
    }
  });
}

async function getGeminiReply(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  try {
    const response = await axios.post(
      endpoint,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 7000,
      }
    );

    return (
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'No response generated.'
    );
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return 'There was a problem getting a response.';
  }
}

startBot();
