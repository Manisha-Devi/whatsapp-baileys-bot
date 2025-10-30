// server.js
// =============================================
// WhatsApp Daily Bot Server (Production Ready)
// ---------------------------------------------
// Includes:
//  ✅ Express API Server
//  ✅ Baileys WhatsApp Connection
//  ✅ QR Login Page
//  ✅ Secure API Key Authentication (Bearer token)
//  ✅ Error handling & safe restarts
// =============================================

import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import qrcode from "qrcode";
import pino from "pino";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

import { handleIncomingMessageFromDaily } from "./daily.js";

// 🧭 Load environment variables
dotenv.config();

// ✅ Initialize Express App
const app = express();
app.use(express.json({ limit: "10mb" }));

// ✅ Port from .env (fallback: 3000)
const PORT = process.env.PORT || 3000;

// ✅ Global State Variables
let sock;
let qrCodeData = "";
let isRestarting = false;
let isLoggedIn = false;

// --------------------------------------------------
// 🔐 Middleware: API Key Authentication
// --------------------------------------------------
function verifyApiKey(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
    console.warn("🚫 Unauthorized access attempt detected.");
    return res.status(403).json({ error: "Unauthorized: Invalid API Key" });
  }

  next();
}

// --------------------------------------------------
// 🖼️ HTML Template for QR Page
// --------------------------------------------------
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

// --------------------------------------------------
// 🔌 WhatsApp Connection Function
// --------------------------------------------------
async function connectToWhatsApp() {
  try {
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
      syncFullHistory: false,
      getMessage: async () => null,
    });

    // 🧩 Connection Updates (QR, open, close)
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

    // 🔄 Update credentials
    sock.ev.on("creds.update", saveCreds);

    // 💬 Incoming message handler
    sock.ev.on("messages.upsert", async (m) => {
      try {
        await handleIncomingMessageFromDaily(sock, m.messages[0]);
      } catch (err) {
        console.error("❌ Error handling message:", err);
      }
    });
  } catch (err) {
    console.error("❌ WhatsApp connection error:", err);
    setTimeout(connectToWhatsApp, 5000); // Auto-retry after 5s
  }
}

// --------------------------------------------------
// 🌐 ROUTES
// --------------------------------------------------

// 🖼️ QR Login Page
app.get("/login-qr", async (req, res) => {
  res.send(htmlTemplate(qrCodeData));
});

// 🧾 QR Status JSON
app.get("/login-qr/status", (req, res) => {
  res.json({
    loggedIn: isLoggedIn,
    qrAvailable: !!qrCodeData,
  });
});

// 🔑 Pairing Code (Protected)
app.get("/login-pair", verifyApiKey, async (req, res) => {
  try {
    if (sock?.ws?.readyState === 1) {
      const code = await sock.requestPairingCode();
      res.json({ pairingCode: code });
    } else {
      res.status(400).json({ error: "Socket not ready or already logged in." });
    }
  } catch (err) {
    console.error("❌ Pairing code error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 🚪 Logout (Protected)
app.get("/logout", verifyApiKey, async (req, res) => {
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
    console.error("❌ Logout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 📄 Default redirect to QR login
app.get("/", (req, res) => {
  res.redirect("/login-qr");
});

// 📦 Fetch existing daily data (Public)
app.get("/daily_data.json", (req, res) => {
  try {
    const data = fs.readFileSync("daily_data.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch (err) {
    console.error("❌ Cannot read daily_data.json:", err);
    res.status(500).json({ error: "Cannot read daily_data.json" });
  }
});

// 📝 Update daily data (Protected)
app.post("/update-daily-data", verifyApiKey, (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "Invalid JSON" });
    }

    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("daily_data.json", "utf8"));
    } catch {}

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
    console.error("❌ Error saving daily data:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------------------------------------
// 🚀 Start Express Server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  connectToWhatsApp();
});
