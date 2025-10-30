// button.js
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";

async function startButtonBot() {
  try {
    console.log("🚀 Starting Button Bot (ExtendedTextMessage + try/catch)");

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", ({ connection }) => {
      if (connection === "open") console.log("✅ Connected to WhatsApp");
      else if (connection === "close") console.log("❌ Disconnected!");
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg?.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";

        // Detect commands
        if (text.toLowerCase().startsWith("button ")) {
          const [, command] = text.toLowerCase().split(" ");
          switch (command) {
            case "quick":
              await sendQuickButtons(sock, sender);
              break;
            case "url":
              await sendUrlButtons(sock, sender);
              break;
            case "call":
              await sendCallButtons(sock, sender);
              break;
            default:
              await sock.sendMessage(sender, {
                text: "❓ Unknown type.\nTry:\nbutton quick | url | call",
              });
          }
        }

        // Handle button responses
        if (msg.message.buttonsResponseMessage) {
          const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
          console.log(`🖱️ Button clicked: ${buttonId}`);
          await sock.sendMessage(sender, {
            text: `You clicked: *${buttonId.toUpperCase()}* ✅`,
          });
        }
      } catch (err) {
        console.error("⚠️ Error while handling message:", err);
      }
    });
  } catch (err) {
    console.error("🚨 Fatal bot startup error:", err);
  }
}

/* ==========================
   1️⃣ QUICK REPLY BUTTONS
========================== */
async function sendQuickButtons(sock, jid) {
  try {
    const msg = {
      buttonsMessage: {
        contentText: "✅ *Quick Reply Test*\nChoose one below 👇",
        footerText: "Button type: quick_reply",
        buttons: [
          { buttonId: "yes", buttonText: { displayText: "✅ Yes" }, type: 1 },
          { buttonId: "no", buttonText: { displayText: "❌ No" }, type: 1 },
        ],
        headerType: 1,
      },
    };
    await sock.sendMessage(jid, msg);
    console.log("✅ Sent quick reply buttons.");
  } catch (err) {
    console.error("⚠️ Failed to send quick buttons:", err);
    await sock.sendMessage(jid, { text: "❌ Failed to send quick reply buttons." });
  }
}

/* ==========================
   2️⃣ URL BUTTONS
========================== */
async function sendUrlButtons(sock, jid) {
  try {
    const msg = {
      buttonsMessage: {
        contentText: "🌐 *URL Button*\nTap below to open Google",
        footerText: "Button type: URL",
        buttons: [
          {
            buttonId: "visit_site",
            buttonText: { displayText: "🌍 Open Google" },
            type: 1,
            url: "https://www.google.com",
          },
        ],
        headerType: 1,
      },
    };
    await sock.sendMessage(jid, msg);
    console.log("✅ Sent URL button.");
  } catch (err) {
    console.error("⚠️ Failed to send URL button:", err);
    await sock.sendMessage(jid, { text: "❌ Failed to send URL button." });
  }
}

/* ==========================
   3️⃣ CALL BUTTON
========================== */
async function sendCallButtons(sock, jid) {
  try {
    const msg = {
      buttonsMessage: {
        contentText: "📞 *Need Help?*\nTap below to call support.",
        footerText: "Button type: CALL",
        buttons: [
          {
            buttonId: "call_us",
            buttonText: { displayText: "📞 Call Support" },
            type: 1,
            phoneNumber: "+911234567890",
          },
        ],
        headerType: 1,
      },
    };
    await sock.sendMessage(jid, msg);
    console.log("✅ Sent call button.");
  } catch (err) {
    console.error("⚠️ Failed to send call button:", err);
    await sock.sendMessage(jid, { text: "❌ Failed to send call button." });
  }
}

startButtonBot();
