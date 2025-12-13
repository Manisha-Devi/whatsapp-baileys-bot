// server.js
// =============================================
// WhatsApp Daily Bot Server (Production Ready)
// Secure QR Login (Short-Lived Signed URL)
// =============================================

import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import qrcode from "qrcode";
import pino from "pino";
import crypto from "crypto";

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

import { handleIncomingMessageFromDaily } from "../features/daily/daily.js";
import { handleIncomingMessageFromBooking } from "../features/bookings/booking.js";
import { handleMenuNavigation } from "../utils/menu-handler.js";
import { getMenuState } from "../utils/menu-state.js";

// 🧭 Load environment variables
dotenv.config();

// ✅ Initialize Express App
const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

// ✅ Global State
let sock;
let qrCodeData = "";
let pairingCode = "";
let isRestarting = false;
let isLoggedIn = false;
let pairingRequested = false;

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
// ✅ Short-lived Signed Token System
// --------------------------------------------------
const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || "SET_A_STRONG_SECRET";
const QR_TOKEN_TTL = Number(process.env.QR_TOKEN_TTL_SECONDS || 300); // 5 minutes


function signToken(payload) {
  const data = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha256", QR_TOKEN_SECRET)
    .update(data)
    .digest("base64url");

  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

function verifyToken(token) {
  try {
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return false;

    const data = Buffer.from(dataB64, "base64url").toString();
    const expectedSig = crypto
      .createHmac("sha256", QR_TOKEN_SECRET)
      .update(data)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig)))
      return false;

    const payload = JSON.parse(data);

    const now = Math.floor(Date.now() / 1000);
    if (now - payload.ts > QR_TOKEN_TTL) return false; // expired

    return payload;
  } catch {
    return false;
  }
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
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
      shouldIgnoreJid: (jid) => jid.endsWith("@broadcast"),
      syncFullHistory: false,
      getMessage: async () => null,
    });

    // QR + Connection Updates
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // Generate QR Code for login
      if (qr) {
        qrCodeData = await qrcode.toDataURL(qr);
        console.log("📱 QR Code ready. Use /login-qr or /pairing-code API");
      }

      if (connection === "open") {
        console.log("✅ WhatsApp Connected Successfully!");
        qrCodeData = "";
        pairingCode = "";
        pairingRequested = false;
        isLoggedIn = true;
      } else if (connection === "close") {
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Connection closed. Reason: ${reason}`);
        isLoggedIn = false;

        if (reason === DisconnectReason.loggedOut) {
          console.log("🚪 Logged out. Clearing old session...");
          fs.rmSync("auth_info", { recursive: true, force: true });
          pairingRequested = false;

          if (!isRestarting) {
            isRestarting = true;
            console.log("♻️ Restarting for re-login in 5 seconds...");
            setTimeout(() => {
              isRestarting = false;
              connectToWhatsApp();
            }, 5000);
          }
        } else if (reason === 408) {
          // Timeout - wait longer before retry
          console.log("⏳ Connection timeout. Retrying in 10 seconds...");
          pairingRequested = false;
          setTimeout(() => {
            connectToWhatsApp();
          }, 10000);
        } else {
          console.log("🔁 Attempting reconnect in 3 seconds...");
          pairingRequested = false;
          setTimeout(() => {
            connectToWhatsApp();
          }, 3000);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg || !msg.key) return;
        
        const messageContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        if (!messageContent) return;
        if (msg.key.fromMe) return;
        
        const sender = msg.key.remoteJid;
        if (sender && sender.endsWith("@g.us")) return;

        const text = String(messageContent).trim();
        const lowerText = text.toLowerCase();
        
        const menuHandled = await handleMenuNavigation(sock, sender, text);
        if (menuHandled) return;

        const menuState = getMenuState(sender);
        
        if (menuState.awaitingBusSelection) {
          return;
        }
        
        if (!menuState.isAuthenticated || !menuState.selectedBus) {
          await sock.sendMessage(sender, {
            text: "⚠️ Please type *Entry* first to get started."
          });
          return;
        }
        
        if (menuState.mode === 'daily') {
          await handleIncomingMessageFromDaily(sock, msg, true);
        } else if (menuState.mode === 'booking') {
          await handleIncomingMessageFromBooking(sock, msg, true);
        } else {
          if (sender && !sender.endsWith("@g.us")) {
            await sock.sendMessage(sender, {
              text: "❌ Invalid command.\n\n🏠 Send *Entry* to open the menu to get started!\n\nThe menu will guide you through all available options."
            });
          }
        }
      } catch (err) {
        console.error("❌ Error handling message:", err);
      }
    });
  } catch (err) {
    console.error("❌ WhatsApp connection error:", err);
    setTimeout(connectToWhatsApp, 5000);
  }
}

// --------------------------------------------------
// 🌐 ROUTES
// --------------------------------------------------

// ✅ DEFAULT: Redirect to home
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Bot Server Running");
});

// ✅ Protected: Get signed token for QR page
app.get("/token-for-qr", verifyApiKey, (req, res) => {
  const payload = { ts: Math.floor(Date.now() / 1000) };
  const token = signToken(payload);

  res.json({
    token,
    url: `/login-qr?token=${token}`,
    expiresIn: QR_TOKEN_TTL,
  });
});

// ✅ Secure: QR Login Page (token required)
app.get("/login-qr", (req, res) => {
  const token = req.query.token;

  if (!token || !verifyToken(token)) {
    return res.status(401).send("<h2>Unauthorized / Token Expired</h2>");
  }

  res.send(htmlTemplate(qrCodeData));
});

// ✅ Secure: QR Status
app.get("/login-qr/status", (req, res) => {
  const token = req.query.token;
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: "Unauthorized or expired token" });
  }

  res.json({
    loggedIn: isLoggedIn,
    qrAvailable: !!qrCodeData,
  });
});

// ✅ Pairing Code - Auto generate if not logged in
app.get("/pairing-code", verifyApiKey, async (req, res) => {
  try {
    // If already logged in, show status
    if (isLoggedIn) {
      return res.json({ 
        loggedIn: true,
        message: "Already connected to WhatsApp" 
      });
    }

    // Get phone number from secret
    const phoneNumber = process.env.PHONE_NUMBER;
    
    if (!phoneNumber) {
      return res.status(400).json({ 
        loggedIn: false,
        message: "PHONE_NUMBER secret not set" 
      });
    }

    // Clean phone number (remove +, spaces)
    const cleanPhone = phoneNumber.replace(/[\s+\-]/g, '');

    if (!sock) {
      return res.status(500).json({ 
        loggedIn: false,
        message: "WhatsApp socket not ready. Wait and try again." 
      });
    }

    // Request pairing code
    const code = await sock.requestPairingCode(cleanPhone);
    pairingCode = code;
    
    console.log(`🔐 Pairing Code: ${code}`);
    console.log(`📱 Phone: ${cleanPhone}`);

    res.json({
      loggedIn: false,
      pairingCode: code,
      phoneNumber: cleanPhone,
      message: `Enter code ${code} in WhatsApp > Linked Devices > Link with phone number`
    });
  } catch (err) {
    console.error("❌ Pairing code error:", err.message);
    res.status(500).json({ 
      loggedIn: false,
      message: err.message 
    });
  }
});



// ✅ Logout (Protected)
app.get("/logout", verifyApiKey, async (req, res) => {
  try {
    if (sock) {
      await sock.logout();
      fs.rmSync("auth_info", { recursive: true, force: true });
      qrCodeData = "";
      isLoggedIn = false;
      res.json({ message: "✅ Logged out successfully." });
      connectToWhatsApp();
    } else {
      res.status(400).json({ error: "Not connected." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ daily_data.json (Protected)
app.get("/daily_data.json",verifyApiKey, (req, res) => {
  try {
    const data = fs.readFileSync("./storage/daily_data.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read daily_data.json" });
  }
});

// ✅ Update daily data (Protected)
app.post("/update-daily-data", verifyApiKey, (req, res) => {
  try {
    const incoming = req.body;

    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("./storage/daily_data.json", "utf8"));
    } catch {}

    let updatedCount = 0;
    // 🩹 Normalizes malformed 7-digit date keys like "1112025" → "01112025"
    function normalizeKey(key) {
      if (/^\d{7}$/.test(key)) {
        return key.padStart(8, "0"); // adds a leading zero
      }
      return key;
    }

    for (const [rawKey, record] of Object.entries(incoming)) {
      // 🩹 Skip empty keys
      if (!rawKey || rawKey.trim() === '') continue;
      
      const key = normalizeKey(rawKey);   // 🧠 fix the key before using it

      // 🩹 Filter empty keys from record
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([k]) => k && k.trim() !== '')
      );

      if (!existing[key] || existing[key].submittedAt < cleanRecord.submittedAt) {
        existing[key] = cleanRecord;
        updatedCount++;
      }
    }


    fs.writeFileSync("./storage/daily_data.json", JSON.stringify(existing, null, 2));
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
// Get daily_status.json
app.get("/daily_status.json", verifyApiKey, (req, res) => {
  try {
    const data = fs.readFileSync("./storage/daily_status.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read daily_status.json" });
  }
});
// ✅ Update daily_status.json (Protected)
app.post("/update-daily-status", verifyApiKey, (req, res) => {
  try {
    const incoming = req.body; // new data from sheet or external app

    const filePath = "./storage/daily_status.json";

    // If file does not exist, create empty array
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }

    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    let updatedCount = 0;

    // 🧠 Normalize 7-digit date keys inside updatedKeys array
    function normalizeKey(key) {
      if (/^\d{7}$/.test(key)) {
        return key.padStart(8, "0"); // Example: 5112025 → 05112025
      }
      return key;
    }

    // incoming must be an array of objects
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Incoming payload must be an array" });
    }

    for (const record of incoming) {
      if (!record.updatedKeys || !record.updatedOn) continue;

      // Normalize all keys
      const normalizedKeys =
        record.updatedKeys.map((key) => normalizeKey(key));

      const newLog = {
        updatedOn: record.updatedOn,
        updatedKeys: normalizedKeys,
        remarks: record.remarks || null,
      };

      // Avoid duplicates: only keep logs that have different updatedOn
      const exists = existing.find((e) => e.updatedOn === newLog.updatedOn);

      if (!exists) {
        existing.push(newLog);
        updatedCount++;
      }
    }

    // Save updated status log
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    console.error("❌ Error updating daily_status.json:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// --------------------------------------------------
// 🚀 Start Server
// --------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  connectToWhatsApp();
});
