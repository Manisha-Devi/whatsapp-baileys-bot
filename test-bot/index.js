import "dotenv/config";
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "node:fs";

const PHONE_NUMBER = (process.env.PHONE_NUMBER || "").replace(/\D/g, "");
const AUTH_DIR = process.env.AUTH_DIR || "test-auth";
const RECONNECT_DELAY_MS = 5000;

let reconnecting = false;
let socket;

function unwrapMessage(message) {
  let current = message;
  while (current) {
    const wrapped =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.documentWithCaptionMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current || {};
}

function readIncoming(message) {
  const content = unwrapMessage(message);
  const native = content.interactiveResponseMessage;
  if (native) {
    let params = {};
    try {
      params = JSON.parse(native.nativeFlowResponseMessage?.paramsJson || "{}");
    } catch (error) {
      console.warn("Could not parse native-flow response:", error.message);
    }
    return { kind: "interactive", id: params.id || "", label: params.display_text || native.body?.text || "" };
  }

  const button = content.buttonsResponseMessage;
  if (button) return { kind: "button", id: button.selectedButtonId || "", label: button.selectedDisplayText || "" };

  const list = content.listResponseMessage;
  if (list) return { kind: "list", id: list.singleSelectReply?.selectedRowId || "", label: list.title || "" };

  const text = content.conversation || content.extendedTextMessage?.text;
  return text ? { kind: "text", id: String(text).trim().toLowerCase(), label: String(text).trim() } : null;
}

async function sendHomeMenu(sock, jid) {
  const payload = {
    interactiveMessage: {
      header: { title: "Sukoon Test Bot", hasMediaAttachment: false },
      body: { text: "Login successful. Test native WhatsApp buttons and list selection below." },
      footer: { text: "Baileys interactive messaging test" },
      nativeFlowMessage: {
        buttons: [
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({ display_text: "Daily", id: "daily" }),
          },
          {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({ display_text: "Booking", id: "booking" }),
          },
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "More options",
              sections: [{
                title: "Test menu",
                rows: [
                  { title: "Cash", description: "Test a list selection", id: "cash" },
                  { title: "Reports", description: "Test another list selection", id: "reports" },
                  { title: "Help", description: "Show supported test commands", id: "help" },
                ],
              }],
            }),
          },
        ],
        messageParamsJson: "",
      },
    },
  };

  await sock.sendMessage(jid, payload);
}

async function handleChoice(sock, jid, choice) {
  if (!choice) return;
  const id = choice.id.toLowerCase();

  if (["menu", "home", "start"].includes(id)) {
    await sendHomeMenu(sock, jid);
    return;
  }

  const replies = {
    daily: "✅ Native quick-reply received: Daily",
    booking: "✅ Native quick-reply received: Booking",
    cash: "✅ Native list selection received: Cash",
    reports: "✅ Native list selection received: Reports",
    help: "Try the Daily and Booking quick-reply buttons, or open More options and select Cash, Reports, or Help. You can also type menu.",
  };

  await sock.sendMessage(jid, { text: replies[id] || `Received: ${choice.label || choice.id}\nType menu to display the interactive menu again.` });
  if (id !== "help") await sendHomeMenu(sock, jid);
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  socket = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: process.env.LOG_LEVEL || "warn" }),
    printQRInTerminal: false,
    syncFullHistory: false,
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ WhatsApp connected. Send 'menu' to the linked account.");
      reconnecting = false;
    }

    if (connection === "close") {
      const status = lastDisconnect?.error?.output?.statusCode;
      console.error("WhatsApp connection closed:", status || "unknown");
      if (status === DisconnectReason.loggedOut) {
        console.error("Session logged out. Delete the auth folder and pair again.");
        return;
      }
      if (!reconnecting) {
        reconnecting = true;
        setTimeout(() => {
          connect().catch((error) => console.error("Reconnect failed:", error));
        }, RECONNECT_DELAY_MS);
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages || []) {
      if (!msg?.message || msg.key?.fromMe) continue;
      const jid = msg.key.remoteJid;
      if (!jid || jid.endsWith("@g.us") || jid.endsWith("@broadcast")) continue;

      try {
        const choice = readIncoming(msg.message);
        if (!choice) continue;
        console.log("Incoming interaction:", choice.kind, choice.id || choice.label);
        await handleChoice(socket, jid, choice);
      } catch (error) {
        console.error("Message handling failed:", error);
        await socket.sendMessage(jid, { text: "Something went wrong while handling that selection. Type menu to try again." });
      }
    }
  });

  if (!state.creds.registered) {
    if (!PHONE_NUMBER) {
      console.error("Set PHONE_NUMBER in .env (country code + number, digits only).");
      return;
    }
    try {
      const code = await socket.requestPairingCode(PHONE_NUMBER);
      console.log("\n🔐 WhatsApp pairing code:", code);
      console.log("On your phone: WhatsApp → Linked devices → Link a device → Link with phone number.\n");
    } catch (error) {
      console.error("Could not request pairing code:", error);
    }
  }
}

if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
connect().catch((error) => {
  console.error("Bot startup failed:", error);
  process.exitCode = 1;
});
