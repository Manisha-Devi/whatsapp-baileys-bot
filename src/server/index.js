/**
 * ============================================================
 * 🤖 WhatsApp Daily Bot Server
 * ============================================================
 * 
 * YEH SERVER KYA KARTA HAI:
 * - WhatsApp se connect hota hai (Baileys library use karke)
 * - Users ke messages receive karta hai
 * - Daily reports, bookings handle karta hai
 * - Google Sheet ke saath data sync karta hai
 * 
 * MAIN FEATURES:
 * 1. QR Code Login - Browser mein QR scan karke login
 * 2. Pairing Code Login - Phone number se code leke login
 * 3. Daily Data API - Data read/write karne ke endpoints
 * 4. Message Handling - WhatsApp messages process karna
 * 
 * SECURITY:
 * - Saare sensitive endpoints API Key protected hai
 * - QR Login page ke liye short-lived tokens use hote hai
 * 
 * Author: WhatsApp Bot Team
 * ============================================================
 */

// ========================================
// 📦 IMPORTS - Libraries jo use ho rahi hai
// ========================================

import express from "express";           // Web server framework
import dotenv from "dotenv";              // Environment variables (.env file) padhne ke liye
import fs from "fs";                      // File system - files read/write karne ke liye
import qrcode from "qrcode";              // QR code image generate karne ke liye
import pino from "pino";                  // Logging library (Baileys use karta hai)
import crypto from "crypto";              // Encryption/tokens ke liye

// Baileys - WhatsApp Web library (unofficial)
import makeWASocket, {
  useMultiFileAuthState,           // Login session files mein save karne ke liye
  DisconnectReason,                // Connection close hone ki wajah jaanne ke liye
  fetchLatestBaileysVersion,       // Latest WhatsApp Web version lene ke liye
  makeCacheableSignalKeyStore,     // Encryption keys cache karne ke liye
} from "@whiskeysockets/baileys";

// Hamari custom features
import { handleIncomingMessageFromDaily } from "../features/daily/daily.js";      // Daily report handling
import { handleIncomingMessageFromBooking } from "../features/bookings/booking.js"; // Booking handling
import { handleMenuNavigation } from "../utils/menu-handler.js";                    // Menu navigation
import { getMenuState } from "../utils/menu-state.js";                              // User ka current menu state

// ========================================
// ⚙️ CONFIGURATION - Settings load karo
// ========================================

// .env file se environment variables load karo
// Example: API_KEY, PHONE_NUMBER, etc.
dotenv.config();

// Express app initialize karo
const app = express();

// JSON body parser - incoming JSON data 10MB tak allow karo
app.use(express.json({ limit: "10mb" }));

// Port number - default 3000
const PORT = process.env.PORT || 3000;

// ========================================
// 🔧 GLOBAL STATE - Server ki current state
// ========================================

let sock;                    // WhatsApp socket connection
let qrCodeData = "";         // QR code image (Base64 data URL)
let pairingCode = "";        // Pairing code (phone number login ke liye)
let isRestarting = false;    // Reconnection in progress flag
let isLoggedIn = false;      // WhatsApp connected hai ya nahi
let pairingRequested = false; // Pairing already request kiya hai?

// ========================================
// 🔐 MIDDLEWARE: API Key Authentication
// ========================================

/**
 * API Key verify karne ka function
 * 
 * KYA KARTA HAI:
 * - Har protected request pe check karta hai ki API Key sahi hai ya nahi
 * - Header mein "Authorization: Bearer YOUR_API_KEY" hona chahiye
 * 
 * AGAR KEY GALAT HAI:
 * - 403 Forbidden error return karta hai
 * 
 * AGAR KEY SAHI HAI:
 * - Request aage process hoti hai
 * 
 * @param {Request} req - Incoming request
 * @param {Response} res - Response object
 * @param {Function} next - Next middleware call karne ke liye
 */
function verifyApiKey(req, res, next) {
  // Authorization header lo
  const authHeader = req.headers.authorization;

  // Check karo: Header hai? Aur value match karti hai?
  // Expected format: "Bearer MySuperSecretKey12345"
  if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
    console.warn("🚫 Unauthorized access attempt detected.");
    return res.status(403).json({ error: "Unauthorized: Invalid API Key" });
  }

  // Sab sahi hai, aage chalo
  next();
}

// ========================================
// 🎫 SHORT-LIVED TOKEN SYSTEM (QR Login ke liye)
// ========================================

/**
 * QR Login page ke liye secure token system
 * 
 * PROBLEM: QR page ka URL koi bhi access kar le toh security risk hai
 * SOLUTION: Short-lived signed tokens - 5 minute mein expire ho jaate hai
 * 
 * FLOW:
 * 1. Admin /token-for-qr call karta hai (API Key ke saath)
 * 2. Server ek signed token return karta hai
 * 3. Admin us token ke saath /login-qr page open karta hai
 * 4. Token 5 minute baad expire ho jaata hai
 */

// Token signing ke liye secret key (strong key use karo production mein)
const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || "SET_A_STRONG_SECRET";

// Token kitni der valid rahega (seconds mein) - default 5 minutes
const QR_TOKEN_TTL = Number(process.env.QR_TOKEN_TTL_SECONDS || 300);

/**
 * Token create karta hai
 * 
 * STRUCTURE: base64(data).signature
 * - Data: JSON {ts: timestamp}
 * - Signature: HMAC-SHA256 hash
 * 
 * @param {Object} payload - Token mein store karne ka data
 * @returns {string} - Signed token string
 */
function signToken(payload) {
  // Payload ko JSON string banao
  const data = JSON.stringify(payload);
  
  // HMAC-SHA256 signature generate karo
  const sig = crypto
    .createHmac("sha256", QR_TOKEN_SECRET)  // Secret key se HMAC banao
    .update(data)                            // Data hash karo
    .digest("base64url");                    // Base64 URL-safe format

  // Format: base64(data).signature
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

/**
 * Token verify karta hai
 * 
 * CHECK KARTA HAI:
 * 1. Token format sahi hai?
 * 2. Signature match karta hai? (tampering check)
 * 3. Token expire toh nahi hua?
 * 
 * @param {string} token - Token string jo verify karna hai
 * @returns {Object|false} - Payload agar valid, false agar invalid
 */
function verifyToken(token) {
  try {
    // Token ko split karo: data.signature
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return false;

    // Base64 decode karke original data lo
    const data = Buffer.from(dataB64, "base64url").toString();
    
    // Expected signature calculate karo
    const expectedSig = crypto
      .createHmac("sha256", QR_TOKEN_SECRET)
      .update(data)
      .digest("base64url");

    // Signature match check karo (timing-safe comparison for security)
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig)))
      return false;

    // JSON parse karo
    const payload = JSON.parse(data);

    // Expiry check karo
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    if (now - payload.ts > QR_TOKEN_TTL) return false; // Expired!

    return payload; // Valid token!
  } catch {
    return false; // Koi bhi error = invalid token
  }
}

// ========================================
// 🖼️ QR LOGIN PAGE HTML TEMPLATE
// ========================================

/**
 * QR Code dikhane wala HTML page generate karta hai
 * 
 * FEATURES:
 * - Clean WhatsApp-like design
 * - QR code image dikhata hai (agar available hai)
 * - "No QR Available" message agar QR nahi hai
 * 
 * @param {string} qr - QR code image (Base64 data URL) ya empty string
 * @returns {string} - Complete HTML page
 */
const htmlTemplate = (qr) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>WhatsApp Login</title>
  <style>
    /* Full page center alignment */
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      background: #f2f2f2;
    }
    /* WhatsApp green heading */
    h1 { color: #075E54; }
    /* QR code with WhatsApp style border */
    img {
      border: 10px solid #25D366;
      border-radius: 10px;
      background: white;
    }
    /* Instructions text */
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

// ========================================
// 📱 WHATSAPP CONNECTION FUNCTION
// ========================================

/**
 * WhatsApp se connect karta hai
 * 
 * YEH FUNCTION:
 * 1. Auth files load karta hai (pehle se logged in ho toh auto-connect)
 * 2. WhatsApp socket create karta hai
 * 3. QR code generate karta hai (new login ke liye)
 * 4. Messages receive karta hai aur handlers ko bhejta hai
 * 5. Reconnection handle karta hai (connection break hone pe)
 * 
 * AUTH FILES:
 * - auth_info/ folder mein stored hai
 * - Delete karne se logout ho jaoge
 */
async function connectToWhatsApp() {
  try {
    // ----------------------------------------
    // 📂 Auth State Load Karo
    // ----------------------------------------
    
    // Pehle se saved credentials load karo (auth_info folder se)
    // Agar folder nahi hai toh new session start hoga
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    
    // WhatsApp Web ka latest version lo
    const { version } = await fetchLatestBaileysVersion();

    // ----------------------------------------
    // 🔌 WhatsApp Socket Create Karo
    // ----------------------------------------
    
    sock = makeWASocket({
      version,                                    // WhatsApp Web version
      auth: {
        creds: state.creds,                       // Login credentials
        keys: makeCacheableSignalKeyStore(        // Encryption keys (cached for speed)
          state.keys, 
          pino({ level: "silent" })               // Silent logging
        ),
      },
      logger: pino({ level: "silent" }),          // Console spam band karo
      shouldIgnoreJid: (jid) => jid.endsWith("@broadcast"), // Broadcast messages ignore karo
      syncFullHistory: false,                     // Purana chat history download mat karo
      getMessage: async () => null,               // Message fetch callback (not needed)
    });

    // ----------------------------------------
    // 📡 CONNECTION EVENTS Handle Karo
    // ----------------------------------------
    
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 📷 QR Code generate hua
      if (qr) {
        // QR string ko image (data URL) mein convert karo
        qrCodeData = await qrcode.toDataURL(qr);
        console.log("📱 QR Code ready. Use /login-qr or /pairing-code API");
      }

      // ✅ Connection OPEN - Successfully connected!
      if (connection === "open") {
        console.log("✅ WhatsApp Connected Successfully!");
        qrCodeData = "";           // QR code clear karo (ab zaroorat nahi)
        pairingCode = "";          // Pairing code bhi clear
        pairingRequested = false;
        isLoggedIn = true;         // Logged in flag set karo
      } 
      // ❌ Connection CLOSE - Disconnect ho gaya
      else if (connection === "close") {
        // Disconnect ki wajah pata karo
        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`❌ Connection closed. Reason: ${reason}`);
        isLoggedIn = false;

        // CASE 1: Logged out (user ne manually logout kiya ya session invalid)
        if (reason === DisconnectReason.loggedOut) {
          console.log("🚪 Logged out. Clearing old session...");
          
          // Auth files delete karo (fresh login ke liye)
          fs.rmSync("auth_info", { recursive: true, force: true });
          pairingRequested = false;

          // Reconnect karo (5 second baad)
          if (!isRestarting) {
            isRestarting = true;
            console.log("♻️ Restarting for re-login in 5 seconds...");
            setTimeout(() => {
              isRestarting = false;
              connectToWhatsApp();
            }, 5000);
          }
        } 
        // CASE 2: Timeout (408 error)
        else if (reason === 408) {
          console.log("⏳ Connection timeout. Retrying in 10 seconds...");
          pairingRequested = false;
          setTimeout(() => {
            connectToWhatsApp();
          }, 10000); // 10 second wait karo
        } 
        // CASE 3: Other reasons (network issue, etc.)
        else {
          console.log("🔁 Attempting reconnect in 3 seconds...");
          pairingRequested = false;
          setTimeout(() => {
            connectToWhatsApp();
          }, 3000); // 3 second baad retry
        }
      }
    });

    // ----------------------------------------
    // 💾 CREDENTIALS SAVE Event
    // ----------------------------------------
    
    // Jab bhi credentials update ho, file mein save karo
    sock.ev.on("creds.update", saveCreds);

    // ----------------------------------------
    // 📨 INCOMING MESSAGES Handle Karo
    // ----------------------------------------
    
    sock.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg || !msg.key) return; // Invalid message
        
        // Message text extract karo
        // (normal message ya extended text message)
        const messageContent = msg.message?.conversation || 
                               msg.message?.extendedTextMessage?.text;
        
        if (!messageContent) return;  // No text = ignore
        if (msg.key.fromMe) return;   // Khud ka message = ignore
        
        // Sender ka WhatsApp ID
        const sender = msg.key.remoteJid;
        
        // Group messages ignore karo (sirf personal chats handle karo)
        if (sender && sender.endsWith("@g.us")) return;

        // Message text clean karo
        const text = String(messageContent).trim();
        const lowerText = text.toLowerCase();
        
        // ----------------------------------------
        // 🧭 MENU NAVIGATION - Pehle check karo
        // ----------------------------------------
        
        // Entry, cancel, etc. commands handle karo
        const menuHandled = await handleMenuNavigation(sock, sender, text);
        if (menuHandled) return; // Menu ne handle kar liya

        // User ka current menu state lo
        const menuState = getMenuState(sender);
        
        // Agar bus selection wait ho rahi hai
        if (menuState.awaitingBusSelection) {
          return; // Menu handler handle karega
        }
        
        // ----------------------------------------
        // 🔒 AUTHENTICATION CHECK
        // ----------------------------------------
        
        // Agar user authenticated nahi hai ya bus select nahi ki
        if (!menuState.isAuthenticated || !menuState.selectedBus) {
          await sock.sendMessage(sender, {
            text: "⚠️ Please type *Entry* first to get started."
          });
          return;
        }
        
        // ----------------------------------------
        // 📊 MODE-BASED MESSAGE ROUTING
        // ----------------------------------------
        
        // Daily mode - Daily report handler ko bhejo
        if (menuState.mode === 'daily') {
          await handleIncomingMessageFromDaily(sock, msg, true);
        } 
        // Booking mode - Booking handler ko bhejo
        else if (menuState.mode === 'booking') {
          await handleIncomingMessageFromBooking(sock, msg, true);
        } 
        // No mode selected - Error message
        else {
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
    // Connection error - retry after 5 seconds
    console.error("❌ WhatsApp connection error:", err);
    setTimeout(connectToWhatsApp, 5000);
  }
}

// ========================================
// 🌐 API ROUTES - HTTP Endpoints
// ========================================

// ----------------------------------------
// 🏠 HOME Route
// ----------------------------------------

/**
 * GET /
 * 
 * Simple health check endpoint
 * Bas confirm karta hai ki server chal raha hai
 */
app.get("/", (req, res) => {
  res.send("✅ WhatsApp Bot Server Running");
});

// ----------------------------------------
// 🎫 QR LOGIN TOKEN Route (Protected)
// ----------------------------------------

/**
 * GET /token-for-qr
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - Ek short-lived signed token generate karta hai
 * - Is token se /login-qr page access ho sakta hai
 * - Token 5 minute mein expire ho jaata hai
 * 
 * RESPONSE:
 * {
 *   token: "abc123...",
 *   url: "/login-qr?token=abc123...",
 *   expiresIn: 300
 * }
 * 
 * USE CASE:
 * Admin yeh token leke browser mein QR page kholta hai
 */
app.get("/token-for-qr", verifyApiKey, (req, res) => {
  // Current timestamp ke saath payload banao
  const payload = { ts: Math.floor(Date.now() / 1000) };
  
  // Token sign karo
  const token = signToken(payload);

  res.json({
    token,
    url: `/login-qr?token=${token}`,
    expiresIn: QR_TOKEN_TTL,
  });
});

// ----------------------------------------
// 🖼️ QR LOGIN PAGE Route (Token Protected)
// ----------------------------------------

/**
 * GET /login-qr?token=XXX
 * 
 * PROTECTED: Valid token required (query parameter mein)
 * 
 * KYA KARTA HAI:
 * - QR code wala HTML page dikhata hai
 * - User is page pe QR scan karke login karta hai
 * 
 * TOKEN EXPIRE HONE PE:
 * - "Unauthorized / Token Expired" message dikha deta hai
 */
app.get("/login-qr", (req, res) => {
  const token = req.query.token;

  // Token verify karo
  if (!token || !verifyToken(token)) {
    return res.status(401).send("<h2>Unauthorized / Token Expired</h2>");
  }

  // QR page HTML return karo
  res.send(htmlTemplate(qrCodeData));
});

// ----------------------------------------
// 📊 QR STATUS Route (Token Protected)
// ----------------------------------------

/**
 * GET /login-qr/status?token=XXX
 * 
 * KYA KARTA HAI:
 * - Current login status check karta hai
 * - QR code available hai ya nahi batata hai
 * 
 * RESPONSE:
 * {
 *   loggedIn: true/false,
 *   qrAvailable: true/false
 * }
 */
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

// ----------------------------------------
// 🔐 PAIRING CODE Route (Protected)
// ----------------------------------------

/**
 * GET /pairing-code
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - Phone number se pairing code generate karta hai
 * - Yeh code WhatsApp app mein enter karke login hota hai
 * 
 * REQUIREMENT:
 * - PHONE_NUMBER secret set hona chahiye (format: 918493090932)
 * 
 * AGAR ALREADY LOGGED IN:
 * - "Already connected" message return karta hai
 * 
 * RESPONSE (not logged in):
 * {
 *   loggedIn: false,
 *   pairingCode: "ABCD-1234",
 *   phoneNumber: "918493090932",
 *   message: "Enter code in WhatsApp..."
 * }
 */
app.get("/pairing-code", verifyApiKey, async (req, res) => {
  try {
    // Agar already logged in hai
    if (isLoggedIn) {
      return res.json({ 
        loggedIn: true,
        message: "Already connected to WhatsApp" 
      });
    }

    // Phone number secret se lo
    const phoneNumber = process.env.PHONE_NUMBER;
    
    // Agar phone number set nahi hai
    if (!phoneNumber) {
      return res.status(400).json({ 
        loggedIn: false,
        message: "PHONE_NUMBER secret not set" 
      });
    }

    // Phone number clean karo (+, spaces, dashes hatao)
    const cleanPhone = phoneNumber.replace(/[\s+\-]/g, '');

    // Socket ready hai?
    if (!sock) {
      return res.status(500).json({ 
        loggedIn: false,
        message: "WhatsApp socket not ready. Wait and try again." 
      });
    }

    // Pairing code request karo
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

// ----------------------------------------
// 🚪 LOGOUT Route (Protected)
// ----------------------------------------

/**
 * GET /logout
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - WhatsApp se logout kar deta hai
 * - Auth files delete kar deta hai
 * - Fresh login ke liye ready ho jaata hai
 */
app.get("/logout", verifyApiKey, async (req, res) => {
  try {
    if (sock) {
      // WhatsApp logout karo
      await sock.logout();
      
      // Auth files delete karo
      fs.rmSync("auth_info", { recursive: true, force: true });
      
      // State reset karo
      qrCodeData = "";
      isLoggedIn = false;
      
      res.json({ message: "✅ Logged out successfully." });
      
      // Reconnect karo (new QR ke liye)
      connectToWhatsApp();
    } else {
      res.status(400).json({ error: "Not connected." });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------
// 📊 GET DAILY DATA Route (Protected)
// ----------------------------------------

/**
 * GET /daily_data.json
 * 
 * PROTECTED: API Key required (Header: Authorization: Bearer YOUR_KEY)
 * 
 * KYA KARTA HAI:
 * - daily_data.json file ka content return karta hai
 * - Google Sheet sync isse data leti hai
 * 
 * RESPONSE:
 * {
 *   "01122025UP35AT1234": { Diesel: 500, Adda: 100, ... },
 *   "02122025UP35AT1234": { ... }
 * }
 */
app.get("/daily_data.json", verifyApiKey, (req, res) => {
  try {
    // File read karo
    const data = fs.readFileSync("./storage/daily_data.json", "utf8");
    
    // JSON content type set karo
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read daily_data.json" });
  }
});

// ----------------------------------------
// 📤 UPDATE DAILY DATA Route (Protected)
// ----------------------------------------

/**
 * POST /update-daily-data
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - Google Sheet se aaya data server pe save karta hai
 * - Existing data ke saath merge karta hai (submittedAt compare karke)
 * - Naye/updated records hi save hote hai
 * 
 * REQUEST BODY:
 * {
 *   "01122025UP35AT1234": { Diesel: 500, Adda: 100, submittedAt: "..." },
 *   ...
 * }
 * 
 * RESPONSE:
 * { success: true, updated: 5 }
 * 
 * SPECIAL HANDLING:
 * - 7-digit keys 8-digit mein convert hoti hai (01122025)
 * - Empty keys filter ho jaati hai ("": "" bug fix)
 */
app.post("/update-daily-data", verifyApiKey, (req, res) => {
  try {
    // Incoming data lo
    const incoming = req.body;

    // Existing data load karo (agar file hai)
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("./storage/daily_data.json", "utf8"));
    } catch {}

    let updatedCount = 0;
    
    /**
     * 7-digit PrimaryKey ko 8-digit mein convert karta hai
     * Example: "1112025" → "01112025"
     * 
     * Kyun: Dates kabhi kabhi leading zero miss ho jaati hai
     */
    function normalizeKey(key) {
      if (/^\d{7}$/.test(key)) {
        return key.padStart(8, "0");
      }
      return key;
    }

    // Har incoming record process karo
    for (const [rawKey, record] of Object.entries(incoming)) {
      // 🩹 Empty keys skip karo (yeh "":"" bug fix karta hai)
      // Agar key khali hai ya sirf spaces hai, toh skip
      if (!rawKey || rawKey.trim() === '') continue;
      
      // Key normalize karo (7-digit → 8-digit)
      const key = normalizeKey(rawKey);

      // 🩹 Record se bhi empty keys filter karo
      // Object.entries se [key, value] pairs lo
      // Filter karke sirf non-empty keys rakho
      // Object.fromEntries se wapas object banao
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([k]) => k && k.trim() !== '')
      );

      // Compare: Naya record hai ya existing se naya hai?
      // submittedAt timestamp se decide hota hai
      if (!existing[key] || existing[key].submittedAt < cleanRecord.submittedAt) {
        existing[key] = cleanRecord;  // Update/add karo
        updatedCount++;
      }
    }

    // File mein save karo (pretty print ke saath)
    fs.writeFileSync("./storage/daily_data.json", JSON.stringify(existing, null, 2));
    
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------------------------
// 📋 GET DAILY STATUS Route (Protected)
// ----------------------------------------

/**
 * GET /daily_status.json
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - Daily status log file return karta hai
 * - Track karta hai kab kaunse records update hue
 */
app.get("/daily_status.json", verifyApiKey, (req, res) => {
  try {
    const data = fs.readFileSync("./storage/daily_status.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read daily_status.json" });
  }
});

// ----------------------------------------
// 📤 UPDATE DAILY STATUS Route (Protected)
// ----------------------------------------

/**
 * POST /update-daily-status
 * 
 * PROTECTED: API Key required
 * 
 * KYA KARTA HAI:
 * - Status log update karta hai
 * - Track karta hai kaunse records kab update hue
 * 
 * REQUEST BODY (Array):
 * [
 *   {
 *     updatedOn: "2025-12-13T10:00:00Z",
 *     updatedKeys: ["01122025UP35AT1234", "02122025UP35AT1234"],
 *     remarks: "Approved by admin"
 *   }
 * ]
 * 
 * RESPONSE:
 * { success: true, updated: 1 }
 */
app.post("/update-daily-status", verifyApiKey, (req, res) => {
  try {
    // Incoming data (array of log entries)
    const incoming = req.body;

    const filePath = "./storage/daily_status.json";

    // Agar file nahi hai toh empty array create karo
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }

    // Existing logs load karo
    let existing = [];
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    let updatedCount = 0;

    /**
     * 7-digit keys 8-digit mein convert karta hai
     */
    function normalizeKey(key) {
      if (/^\d{7}$/.test(key)) {
        return key.padStart(8, "0");
      }
      return key;
    }

    // Incoming array check karo
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: "Incoming payload must be an array" });
    }

    // Har log entry process karo
    for (const record of incoming) {
      // Required fields check karo
      if (!record.updatedKeys || !record.updatedOn) continue;

      // Keys normalize karo
      const normalizedKeys = record.updatedKeys.map((key) => normalizeKey(key));

      // New log entry banao
      const newLog = {
        updatedOn: record.updatedOn,
        updatedKeys: normalizedKeys,
        remarks: record.remarks || null,
      };

      // Duplicate check (same updatedOn already exists?)
      const exists = existing.find((e) => e.updatedOn === newLog.updatedOn);

      // Agar nahi hai toh add karo
      if (!exists) {
        existing.push(newLog);
        updatedCount++;
      }
    }

    // Save updated log
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    console.error("❌ Error updating daily_status.json:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ========================================
// 🚀 START SERVER
// ========================================

/**
 * Server start karo aur WhatsApp connect karo
 * 
 * PORT: 3000 (ya process.env.PORT)
 */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // WhatsApp connection start karo
  connectToWhatsApp();
});
