// server.js
import express from "express";

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import qrcode from "qrcode";
import { handleIncomingMessageFromDaily } from "./daily.js";

app.use(express.json({ limit: "10mb" }));
const app = express();
const PORT = process.env.PORT || 3000;

let sock;
let qrCodeData = "";
let isRestarting = false;
let isLoggedIn = false;

// ✅ HTML for QR Page
const htmlTemplate = (qr) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WhatsApp Login</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #f2f2f2;
    }
    h1 { color: #075E54; }
    img {
      border: 10px solid #25D366;
      border-radius: 10px;
      background: white;
    }
    p {
      font-size: 14px;
      color: #333;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <h1>${qr ? "Scan QR to Login" : "No QR Available"}</h1>
  ${qr ? `<img src="${qr}" alt="QR Code" />` : "<p>Wait or refresh...</p>"}
  <p>Keep this page open while connecting.</p>
</body>
</html>
`;

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    shouldIgnoreJid: (jid) => jid.endsWith("@broadcast"),
    syncFullHistory: false, // Lightweight mode
    getMessage: async () => null,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
      console.log("📱 Scan QR to login");
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected Successfully!");
      qrCodeData = "";
      isLoggedIn = true;
    } else if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`❌ Connection closed. Reason: ${reason}`);
      isLoggedIn = false;

      if (reason === DisconnectReason.loggedOut) {
        console.log("🚪 Logged out. Clearing old session...");
        fs.rmSync("auth_info", { recursive: true, force: true });
        if (!isRestarting) {
          isRestarting = true;
          console.log("♻️ Restarting for re-login...");
          setTimeout(() => {
            isRestarting = false;
            connectToWhatsApp();
          }, 3000);
        }
      } else {
        console.log("🔁 Attempting reconnect...");
        connectToWhatsApp();
      }
    }
  });
  
  sock.ev.on("creds.update", saveCreds);

  // Import external message handler
  sock.ev.on("messages.upsert", async (m) => {
    await handleIncomingMessageFromDaily(sock, m.messages[0]);
  });
}

// --- ROUTES ---

// QR Login Page
app.get("/login-qr", async (req, res) => {
  res.send(htmlTemplate(qrCodeData));
});

// QR Status
app.get("/login-qr/status", (req, res) => {
  res.json({
    loggedIn: isLoggedIn,
    qrAvailable: !!qrCodeData,
  });
});

// Pairing Code (for API access)
app.get("/login-pair", async (req, res) => {
  try {
    if (sock?.ws?.readyState === 1) {
      const code = await sock.requestPairingCode();
      res.json({ pairingCode: code });
    } else {
      res.status(400).json({ error: "Socket not ready or already logged in." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.get("/logout", async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      fs.rmSync("auth_info", { recursive: true, force: true });
      qrCodeData = "";
      isLoggedIn = false;
      res.json({ message: "✅ Logged out successfully." });
      console.log("🗑️ Session cleared. Ready for re-login.");
      connectToWhatsApp();
    } else {
      res.status(400).json({ error: "Not connected." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Default route
app.get("/", (req, res) => {
  res.redirect("/login-qr");
});

// ✅ Fetch existing data (for Google to pull)
app.get("/daily_data.json", (req, res) => {
  try {
    const data = fs.readFileSync("daily_data.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (err) {
    res.status(500).json({ error: "❌ Cannot read daily_data.json" });
  }
});

// ✅ Receive updated data (for Google to push)
app.post("/update-daily-data", (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("daily_data.json", "utf8"));
    } catch {}

    // 🔁 Merge logic: Update only changed or new entries
    let updatedCount = 0;
    for (const [key, record] of Object.entries(incoming)) {
      if (!existing[key] || existing[key].submittedAt < record.submittedAt) {
        existing[key] = record;
        updatedCount++;
      }
    }

    fs.writeFileSync("daily_data.json", JSON.stringify(existing, null, 2));
    console.log(`✅ Synced ${updatedCount} new/updated records from Google Sheet`);
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    console.error("❌ Error saving data:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  connectToWhatsApp();
});
