// ============================================================
// server.js — Production-Ready WhatsApp Automation Server
// ------------------------------------------------------------
// Features:
//  - Express server for managing QR login, pairing, and syncing
//  - Safe Baileys socket lifecycle with automatic reconnect
//  - External daily.js handler for message automation
//  - Full error handling, logging, and graceful recovery
// ============================================================

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

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;

// Global state
let sock;               // Baileys socket
let qrCodeData = "";    // Data URL for QR display
let isRestarting = false;
let isLoggedIn = false;

/* ============================================================
   HTML Template for QR Display
   ============================================================ */
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

/* ============================================================
   Function: connectToWhatsApp()
   - Creates and manages Baileys socket connection
   - Handles QR, reconnect, logout, and message routing
   ============================================================ */
async function connectToWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    // Create WhatsApp socket
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

    /* ---------------------------------
       Event: Connection state updates
       --------------------------------- */
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      try {
        // Generate QR for new login
        if (qr) {
          qrCodeData = await qrcode.toDataURL(qr);
          console.log("📱 Scan the QR displayed in terminal or /login-qr page.");
        }

        // Connected successfully
        if (connection === "open") {
          console.log("✅ WhatsApp connected successfully!");
          qrCodeData = "";
          isLoggedIn = true;
        }

        // Connection closed
        else if (connection === "close") {
          const reason = lastDisconnect?.error?.output?.statusCode;
          console.log(`❌ Connection closed. Reason code: ${reason || "unknown"}`);
          isLoggedIn = false;

          // Logged out: remove old session folder
          if (reason === DisconnectReason.loggedOut) {
            console.log("🚪 Logged out. Clearing session folder...");
            fs.rmSync("auth_info", { recursive: true, force: true });
            if (!isRestarting) {
              isRestarting = true;
              console.log("♻️ Restarting for re-login in 3s...");
              setTimeout(() => {
                isRestarting = false;
                connectToWhatsApp();
              }, 3000);
            }
          } else {
            // Other disconnect → auto reconnect
            console.log("🔁 Attempting automatic reconnect...");
            connectToWhatsApp();
          }
        }
      } catch (err) {
        console.error("❌ Error inside connection.update handler:", err);
      }
    });

    /* ---------------------------------
       Event: Credentials update
       --------------------------------- */
    sock.ev.on("creds.update", async () => {
      try {
        await saveCreds();
      } catch (err) {
        console.error("❌ Error saving credentials:", err);
      }
    });

    /* ---------------------------------
       Event: Incoming message handler
       --------------------------------- */
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages?.[0];
        if (msg) await handleIncomingMessageFromDaily(sock, msg);
      } catch (err) {
        console.error("❌ Error processing incoming message:", err);
      }
    });

  } catch (err) {
    console.error("❌ Fatal error in connectToWhatsApp():", err);
    console.log("Retrying connection in 5 seconds...");
    setTimeout(connectToWhatsApp, 5000);
  }
}

/* ============================================================
   ROUTES
   ============================================================ */

// 1️⃣ QR Login Page
app.get("/login-qr", (req, res) => {
  try {
    res.send(htmlTemplate(qrCodeData));
  } catch (err) {
    console.error("❌ Error serving QR page:", err);
    res.status(500).send("Server error");
  }
});

// 2️⃣ QR Status API
app.get("/login-qr/status", (req, res) => {
  res.json({
    loggedIn: isLoggedIn,
    qrAvailable: !!qrCodeData,
  });
});

// 3️⃣ Pairing Code API
app.get("/login-pair", async (req, res) => {
  try {
    if (sock?.ws?.readyState === 1) {
      const code = await sock.requestPairingCode();
      res.json({ pairingCode: code });
    } else {
      res.status(400).json({ error: "Socket not ready or already logged in." });
    }
  } catch (err) {
    console.error("❌ Error generating pairing code:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4️⃣ Logout Endpoint
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
    console.error("❌ Logout error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5️⃣ Root Redirect
app.get("/", (req, res) => res.redirect("/login-qr"));

// 6️⃣ Fetch daily_data.json (GET)
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

// 7️⃣ Update daily_data.json (POST)
app.post("/update-daily-data", (req, res) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== "object") {
      return res.status(400).json({ error: "Invalid JSON body." });
    }

    // Read existing data
    let existing = {};
    try {
      if (fs.existsSync("daily_data.json")) {
        existing = JSON.parse(fs.readFileSync("daily_data.json", "utf8"));
      }
    } catch (readErr) {
      console.warn("⚠️ Could not parse existing daily_data.json:", readErr);
    }

    // Merge updates
    let updatedCount = 0;
    for (const [key, record] of Object.entries(incoming)) {
      if (!existing[key] || existing[key].submittedAt < record.submittedAt) {
        existing[key] = record;
        updatedCount++;
      }
    }

    fs.writeFileSync("daily_data.json", JSON.stringify(existing, null, 2));
    console.log(`✅ Synced ${updatedCount} record(s) from Google Sheet`);
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    console.error("❌ Error updating daily_data.json:", err);
    res.status(500).json({ error: "Server error while updating data" });
  }
});

/* ============================================================
   START SERVER + INIT SOCKET
   ============================================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  connectToWhatsApp(); // Start WhatsApp session when server starts
});
