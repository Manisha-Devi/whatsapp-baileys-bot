/**
 * ============================================================
 * WhatsApp Daily Bot Server
 * ============================================================
 * 
 * WHAT THIS SERVER DOES:
 * - Connects to WhatsApp (using Baileys library)
 * - Receives messages from users
 * - Handles daily reports, bookings
 * - Syncs data with Google Sheet
 * 
 * MAIN FEATURES:
 * 1. QR Code Login - Scan QR in browser to login
 * 2. Pairing Code Login - Enter code in WhatsApp to login
 * 3. Daily Data API - Endpoints to read/write data
 * 4. Message Handling - Process incoming WhatsApp messages
 * 
 * SECURITY:
 * - All sensitive endpoints are API Key protected
 * - QR Login page uses short-lived tokens
 * 
 * Author: WhatsApp Bot Team
 * ============================================================
 */

// ========================================
// IMPORTS - Libraries being used
// ========================================

import express from "express";           // Web server framework
import dotenv from "dotenv";              // Read environment variables (.env file)
import fs from "fs";                      // File system - for reading/writing files
import qrcode from "qrcode";              // Generate QR code images
import pino from "pino";                  // Logging library (used by Baileys)
import crypto from "crypto";              // For encryption/tokens

// Baileys - Unofficial WhatsApp Web library
import makeWASocket, {
  useMultiFileAuthState,           // Save login session to files
  DisconnectReason,                // Know why connection closed
  fetchLatestBaileysVersion,       // Get latest WhatsApp Web version
  makeCacheableSignalKeyStore,     // Cache encryption keys for speed
} from "@whiskeysockets/baileys";

// Our custom features
import { handleIncomingMessageFromDaily } from "../features/daily/daily.js";      // Daily report handling
import { handleIncomingMessageFromBooking } from "../features/bookings/booking.js"; // Booking handling
import { handleIncomingMessageFromCash } from "../features/cash/cash.js";          // Cash management handling
import { handleIncomingMessageFromReports } from "../features/reports/reports.js";    // Reports feature
import { handleMenuNavigation, isInteractiveLabActive, handleInteractiveLabLocation } from "../utils/menu-handler.js"; // Menu navigation and lab location tests
import { getMenuState } from "../utils/menu-state.js";
import { unwrapIncomingMessage, normalizeIncomingMessage } from "../utils/incoming-message.js";                              // User's current menu state

// ========================================
// CONFIGURATION - Load settings
// ========================================

// Load environment variables from .env file
// Example: API_KEY, PHONE_NUMBER, etc.
dotenv.config();

// Initialize Express app
const app = express();

// JSON body parser - allow incoming JSON data up to 10MB
app.use(express.json({ limit: "10mb" }));

// Port number - default 3000
const PORT = process.env.PORT || 3000;

// ========================================
// GLOBAL STATE - Server's current state
// ========================================

let sock;                       // Current WhatsApp socket connection
let qrCodeData = "";            // QR code image (Base64 data URL)
let pairingCode = "";           // Pairing code (for phone number login)
let isLoggedIn = false;         // WhatsApp connected or not
let pairingRequested = false;   // Prevent duplicate pairing-code requests
let reconnectTimer = null;      // Only one reconnect timer may exist
let connectionAttemptInProgress = false;
let reconnectAttempts = 0;
let suppressReconnect = false;  // Used during an intentional logout

// ========================================
// MIDDLEWARE: API Key Authentication
// ========================================

/**
 * Verifies API Key for protected endpoints
 * 
 * WHAT IT DOES:
 * - Checks every protected request for valid API Key
 * - Header must contain "Authorization: Bearer YOUR_API_KEY"
 * 
 * IF KEY IS WRONG:
 * - Returns 403 Forbidden error
 * 
 * IF KEY IS CORRECT:
 * - Request continues processing
 * 
 * @param {Request} req - Incoming request
 * @param {Response} res - Response object
 * @param {Function} next - Call next middleware
 */
function verifyApiKey(req, res, next) {
  // Get Authorization header
  const authHeader = req.headers.authorization;

  // Check: Does header exist? Does value match?
  // Expected format: "Bearer MySuperSecretKey12345"
  if (!authHeader || authHeader !== `Bearer ${process.env.API_KEY}`) {
    console.warn("Unauthorized access attempt detected.");
    return res.status(403).json({ error: "Unauthorized: Invalid API Key" });
  }

  // All good, continue
  next();
}

// ========================================
// SHORT-LIVED TOKEN SYSTEM (For QR Login)
// ========================================

/**
 * Secure token system for QR Login page
 * 
 * PROBLEM: If anyone can access QR page URL, it's a security risk
 * SOLUTION: Short-lived signed tokens - expire in 5 minutes
 * 
 * FLOW:
 * 1. Admin calls /token-for-qr (with API Key)
 * 2. Server returns a signed token
 * 3. Admin opens /login-qr page with that token
 * 4. Token expires after 5 minutes
 */

// Secret key for signing tokens (use strong key in production)
const QR_TOKEN_SECRET = process.env.QR_TOKEN_SECRET || "SET_A_STRONG_SECRET";

// How long token is valid (in seconds) - default 5 minutes
const QR_TOKEN_TTL = Number(process.env.QR_TOKEN_TTL_SECONDS || 300);

/**
 * Creates a signed token
 * 
 * STRUCTURE: base64(data).signature
 * - Data: JSON {ts: timestamp}
 * - Signature: HMAC-SHA256 hash
 * 
 * @param {Object} payload - Data to store in token
 * @returns {string} - Signed token string
 */
function signToken(payload) {
  // Convert payload to JSON string
  const data = JSON.stringify(payload);
  
  // Generate HMAC-SHA256 signature
  const sig = crypto
    .createHmac("sha256", QR_TOKEN_SECRET)  // Create HMAC with secret key
    .update(data)                            // Hash the data
    .digest("base64url");                    // Base64 URL-safe format

  // Format: base64(data).signature
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

/**
 * Verifies a token
 * 
 * CHECKS:
 * 1. Is token format correct?
 * 2. Does signature match? (tampering check)
 * 3. Has token expired?
 * 
 * @param {string} token - Token string to verify
 * @returns {Object|false} - Payload if valid, false if invalid
 */
function verifyToken(token) {
  try {
    // Split token: data.signature
    const [dataB64, sig] = token.split(".");
    if (!dataB64 || !sig) return false;

    // Decode Base64 to get original data
    const data = Buffer.from(dataB64, "base64url").toString();
    
    // Calculate expected signature
    const expectedSig = crypto
      .createHmac("sha256", QR_TOKEN_SECRET)
      .update(data)
      .digest("base64url");

    // Check if signatures match (timing-safe comparison for security)
    if (!crypto.timingSafeEqual(Buffer.from(expectedSig), Buffer.from(sig)))
      return false;

    // Parse JSON
    const payload = JSON.parse(data);

    // Check expiry
    const now = Math.floor(Date.now() / 1000); // Current time in seconds
    if (now - payload.ts > QR_TOKEN_TTL) return false; // Expired!

    return payload; // Valid token!
  } catch {
    return false; // Any error = invalid token
  }
}

// ========================================
// QR LOGIN PAGE HTML TEMPLATE
// ========================================

/**
 * Generates HTML page showing QR Code
 * 
 * FEATURES:
 * - Clean WhatsApp-like design
 * - Shows QR code image (if available)
 * - Shows "No QR Available" message if QR not ready
 * 
 * @param {string} qr - QR code image (Base64 data URL) or empty string
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
// WHATSAPP CONNECTION FUNCTION
// ========================================

/**
 * Connects to WhatsApp
 * 
 * THIS FUNCTION:
 * 1. Loads auth files (auto-connect if already logged in)
 * 2. Creates WhatsApp socket
 * 3. Generates QR code (for new login)
 * 4. Receives messages and sends to handlers
 * 5. Handles reconnection (when connection breaks)
 * 
 * AUTH FILES:
 * - Stored in auth_info/ folder
 * - Deleting this folder logs you out
 */
function scheduleReconnect(reason, requestedDelay = null) {
  if (suppressReconnect || reconnectTimer) return;

  const delay = requestedDelay ?? Math.min(3000 * (2 ** reconnectAttempts), 30000);
  reconnectAttempts += 1;
  console.log(`WhatsApp reconnect scheduled in ${Math.round(delay / 1000)}s. Reason: ${reason}`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp();
  }, delay);
}

async function connectToWhatsApp() {
  if (connectionAttemptInProgress) {
    console.log("WhatsApp connection attempt already in progress; skipping duplicate start.");
    return;
  }
  connectionAttemptInProgress = true;

  try {
    // ----------------------------------------
    // Load Auth State
    // ----------------------------------------
    
    // Load previously saved credentials (from auth_info folder)
    // If folder doesn't exist, new session will start
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    
    // Get latest WhatsApp Web version
    const { version } = await fetchLatestBaileysVersion();

    // ----------------------------------------
    // Create WhatsApp Socket
    // ----------------------------------------
    
    const currentSocket = makeWASocket({
      version,                                   // WhatsApp Web version
      auth: {
        creds: state.creds,                       // Login credentials
        keys: makeCacheableSignalKeyStore(        // Encryption keys (cached for speed)
          state.keys, 
          pino({ level: "silent" })               // Silent logging
        ),
      },
      logger: pino({ level: "silent" }),          // Disable console spam
      shouldIgnoreJid: (jid) => jid.endsWith("@broadcast"), // Ignore broadcast messages
      syncFullHistory: false,                     // Don't download old chat history
      getMessage: async () => null,               // Message fetch callback (not needed)
    });

    // ----------------------------------------
    // Handle CONNECTION EVENTS
    // ----------------------------------------
    
    sock = currentSocket;
    currentSocket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code generated
      if (qr) {
        // Convert QR string to image (data URL)
        qrCodeData = await qrcode.toDataURL(qr);
        console.log("QR Code ready. Use /login-qr or /pairing-code API");
      }

      // Connection OPEN - Successfully connected!
      if (connection === "open") {
        console.log("WhatsApp Connected Successfully!");
        qrCodeData = "";           // Clear QR code (not needed anymore)
        pairingCode = "";          // Clear pairing code too
        pairingRequested = false;
        isLoggedIn = true;         // Set logged in flag
        reconnectAttempts = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      } 
      // Connection CLOSE - Disconnected
      else if (connection === "close") {
        // Ignore events from an old socket after a newer socket has started.
        if (sock !== currentSocket) return;

        const reason = lastDisconnect?.error?.output?.statusCode;
        console.log(`Connection closed. Reason: ${reason}`);
        isLoggedIn = false;
        pairingRequested = false;
        pairingCode = "";
        sock = undefined;

        // Intentional logout is handled by the logout API route.
        if (suppressReconnect) return;

        if (reason === DisconnectReason.loggedOut) {
          console.log("WhatsApp session logged out. Clearing saved credentials.");
          fs.rmSync("auth_info", { recursive: true, force: true });
          qrCodeData = "";
          scheduleReconnect("WhatsApp logged out; fresh login required", 5000);
        } else if (reason === 408) {
          scheduleReconnect("WhatsApp connection timeout", 10000);
        } else {
          scheduleReconnect(`WhatsApp disconnected (reason: ${reason})`);
        }
      }
    });

    // ----------------------------------------
    // CREDENTIALS SAVE Event
    // ----------------------------------------
    
    // Whenever credentials update, save to file
    currentSocket.ev.on("creds.update", saveCreds);

    // ----------------------------------------
    // Handle INCOMING MESSAGES
    // ----------------------------------------
    
    currentSocket.ev.on("messages.upsert", async (m) => {
      try {
        const msg = m.messages[0];
        if (!msg || !msg.key) return; // Invalid message
        
        if (msg.key.fromMe) return;   // Own message = ignore

        // Unwrap the message for location handling, then normalize all text,
        // Quick Reply, legacy button, template button and list responses.
        const incomingMessage = unwrapIncomingMessage(msg.message);
        const sender = msg.key.remoteJid;
        const senderMetadata = {
          alternateSender: msg.key.remoteJidAlt || msg.key.participantAlt || null,
          remoteJid: msg.key.remoteJid || null,
          remoteJidAlt: msg.key.remoteJidAlt || null,
          participant: msg.key.participant || null,
          participantAlt: msg.key.participantAlt || null,
          addressingMode: msg.key.addressingMode || msg.addressingMode || null,
          pushName: msg.pushName || null,
          verifiedBizName: msg.verifiedBizName || null,
          messageId: msg.key.id || null,
          messageTimestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) : null,
          messageTypes: Object.keys(incomingMessage || {}),
          messageText:
            incomingMessage?.conversation ||
            incomingMessage?.extendedTextMessage?.text ||
            incomingMessage?.imageMessage?.caption ||
            incomingMessage?.videoMessage?.caption ||
            incomingMessage?.documentMessage?.caption ||
            null,
          rawMessageKey: msg.key
        };

        // Route actual location payloads directly, before text validation.
        const liveLocationPayload = incomingMessage?.liveLocationMessage;
        const staticLocationPayload = incomingMessage?.locationMessage;
        const locationPayload = liveLocationPayload || staticLocationPayload;
        if (locationPayload && isInteractiveLabActive(sender)) {
          const isLiveLocation = Boolean(liveLocationPayload || locationPayload.isLive);
          const handledLocation = await handleInteractiveLabLocation(
            sock, sender, locationPayload, isLiveLocation
          );
          if (handledLocation) return;
        }

        const normalizedMsg = normalizeIncomingMessage(msg);
        if (!normalizedMsg) {
          // Still audit unknown senders even when they send media or unsupported message types.
          await handleMenuNavigation(sock, sender, "", senderMetadata);
          return;
        }
        const messageContent = normalizedMsg.message.conversation;
        if (!messageContent) {
          await handleMenuNavigation(sock, sender, "", senderMetadata);
          return;
        }
        
        // Ignore group messages (only handle personal chats)
        if (sender && sender.endsWith("@g.us")) return;

        // Clean message text
        const text = String(messageContent).trim();
        const lowerText = text.toLowerCase();
        
        // ----------------------------------------
        // MENU NAVIGATION - Check first
        // ----------------------------------------
        
        // Handle Entry, cancel, etc. commands
        const menuHandled = await handleMenuNavigation(sock, sender, text, senderMetadata);
        if (menuHandled) return; // Menu handled it

        // Get user's current menu state
        const menuState = getMenuState(sender);
        
        // If waiting for bus selection
        if (menuState.awaitingBusSelection) {
          return; // Menu handler will take care of it
        }
        
        // ----------------------------------------
        // AUTHENTICATION CHECK
        // ----------------------------------------
        
        // If user not authenticated or bus not selected
        if (!menuState.isAuthenticated || !menuState.selectedBus) {
          await sock.sendMessage(sender, {
            text: "Please type *Entry* first to get started."
          });
          return;
        }
        
        // ----------------------------------------
        // MODE-BASED MESSAGE ROUTING
        // ----------------------------------------
        
        // Daily mode - Send to daily report handler
        if (menuState.mode === 'daily') {
          await handleIncomingMessageFromDaily(sock, normalizedMsg, true);
        } 
        // Booking mode - Send to booking handler
        else if (menuState.mode === 'booking') {
          await handleIncomingMessageFromBooking(sock, normalizedMsg, true);
        }
        // Cash mode - Send to cash management handler
        else if (menuState.mode === 'cash') {
          const handled = await handleIncomingMessageFromCash(sock, normalizedMsg);
          if (handled === false) {
            const { exitToHome } = await import("../utils/menu-state.js");
            const { showMainMenu } = await import("../utils/menu-handler.js");
            exitToHome(sender);
            await showMainMenu(sock, sender);
          }
        }
        // Reports mode - Send to reports feature handler
        else if (menuState.mode === 'report') {
          await handleIncomingMessageFromReports(sock, normalizedMsg);
        }
        // No mode selected - Error message
        else {
          if (sender && !sender.endsWith("@g.us")) {
            await sock.sendMessage(sender, {
              text: "Invalid command.\n\nSend *Entry* to open the menu to get started!\n\nThe menu will guide you through all available options."
            });
          }
        }
      } catch (err) {
        console.error("Error handling message:", err);
      }
    });
  } catch (err) {
    console.error("WhatsApp connection error:", err);
    scheduleReconnect("connection setup error", 5000);
  } finally {
    connectionAttemptInProgress = false;
  }
}

// ========================================
// API ROUTES - HTTP Endpoints
// ========================================

// ----------------------------------------
// HOME Route
// ----------------------------------------

/**
 * GET /
 * 
 * Simple health check endpoint
 * Confirms server is running
 */
app.get("/", (req, res) => {
  res.send("WhatsApp Bot Server Running");
});

// ----------------------------------------
// QR LOGIN TOKEN Route (Protected)
// ----------------------------------------

/**
 * GET /token-for-qr
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Generates a short-lived signed token
 * - This token allows access to /login-qr page
 * - Token expires in 5 minutes
 * 
 * RESPONSE:
 * {
 *   token: "abc123...",
 *   url: "/login-qr?token=abc123...",
 *   expiresIn: 300
 * }
 * 
 * USE CASE:
 * Admin gets this token and opens QR page in browser
 */
app.get("/token-for-qr", verifyApiKey, (req, res) => {
  // Create payload with current timestamp
  const payload = { ts: Math.floor(Date.now() / 1000) };
  
  // Sign the token
  const token = signToken(payload);

  res.json({
    token,
    url: `/login-qr?token=${token}`,
    expiresIn: QR_TOKEN_TTL,
  });
});

// ----------------------------------------
// QR LOGIN PAGE Route (Token Protected)
// ----------------------------------------

/**
 * GET /login-qr?token=XXX
 * 
 * PROTECTED: Valid token required (in query parameter)
 * 
 * WHAT IT DOES:
 * - Shows HTML page with QR code
 * - User scans QR to login
 * 
 * IF TOKEN EXPIRED:
 * - Shows "Unauthorized / Token Expired" message
 */
app.get("/login-qr", (req, res) => {
  const token = req.query.token;

  // Verify token
  if (!token || !verifyToken(token)) {
    return res.status(401).send("<h2>Unauthorized / Token Expired</h2>");
  }

  // Return QR page HTML
  res.send(htmlTemplate(qrCodeData));
});

// ----------------------------------------
// QR STATUS Route (Token Protected)
// ----------------------------------------

/**
 * GET /login-qr/status?token=XXX
 * 
 * WHAT IT DOES:
 * - Checks current login status
 * - Reports if QR code is available
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
// PAIRING CODE Route (Protected)
// ----------------------------------------

/**
 * GET /pairing-code
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Generates pairing code for phone number login
 * - User enters this code in WhatsApp app to login
 * 
 * REQUIREMENT:
 * - PHONE_NUMBER secret must be set (format: 918493090932)
 * 
 * IF ALREADY LOGGED IN:
 * - Returns "Already connected" message
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
    // If already logged in
    if (isLoggedIn) {
      return res.json({ 
        loggedIn: true,
        message: "Already connected to WhatsApp" 
      });
    }

    if (pairingRequested && pairingCode) {
      return res.json({ loggedIn: false, pairingCode, message: "A pairing code has already been generated. Use the existing code." });
    }
    if (pairingRequested) {
      return res.status(409).json({ loggedIn: false, message: "Pairing code request is already in progress. Please wait." });
    }

    // Get phone number from secret
    const phoneNumber = process.env.PHONE_NUMBER;
    
    // If phone number not set
    if (!phoneNumber) {
      return res.status(400).json({ 
        loggedIn: false,
        message: "PHONE_NUMBER secret not set" 
      });
    }

    // Clean phone number (remove +, spaces, dashes)
    const cleanPhone = phoneNumber.replace(/[\s+\-]/g, '');

    // Is socket ready?
    if (!sock) {
      return res.status(500).json({ 
        loggedIn: false,
        message: "WhatsApp socket not ready. Wait and try again." 
      });
    }

    // Request one pairing code for this connection attempt.
    pairingRequested = true;
    const code = await sock.requestPairingCode(cleanPhone);
    pairingCode = code;
    
    console.log(`Pairing Code: ${code}`);
    console.log(`Phone: ${cleanPhone}`);

    res.json({
      loggedIn: false,
      pairingCode: code,
      phoneNumber: cleanPhone,
      message: `Enter code ${code} in WhatsApp > Linked Devices > Link with phone number`
    });
  } catch (err) {
    pairingRequested = false;
    pairingCode = "";
    console.error("Pairing code error:", err.message);
    res.status(500).json({ 
      loggedIn: false,
      message: err.message 
    });
  }
});

// ----------------------------------------
// LOGOUT Route (Protected)
// ----------------------------------------

/**
 * GET /logout
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Logs out from WhatsApp
 * - Deletes auth files
 * - Ready for fresh login
 */
app.get("/logout", verifyApiKey, async (req, res) => {
  const socketToLogout = sock;
  if (!socketToLogout) return res.status(400).json({ error: "Not connected." });

  try {
    suppressReconnect = true;
    await socketToLogout.logout();

    if (sock === socketToLogout) sock = undefined;
    fs.rmSync("auth_info", { recursive: true, force: true });
    qrCodeData = "";
    pairingCode = "";
    pairingRequested = false;
    isLoggedIn = false;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    suppressReconnect = false;
    scheduleReconnect("admin requested logout; fresh login required", 1000);
    return res.json({ message: "Logged out. A fresh WhatsApp login is now available." });
  } catch (err) {
    suppressReconnect = false;
    console.error("WhatsApp logout error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------
// GET DAILY DATA Route (Protected)
// ----------------------------------------

/**
 * GET /daily_data.json
 * 
 * PROTECTED: API Key required (Header: Authorization: Bearer YOUR_KEY)
 * 
 * WHAT IT DOES:
 * - Returns content of daily_data.json file
 * - Google Sheet sync fetches data from here
 * 
 * RESPONSE:
 * {
 *   "01122025UP35AT1234": { Diesel: 500, Adda: 100, ... },
 *   "02122025UP35AT1234": { ... }
 * }
 */
app.get("/daily_data.json", verifyApiKey, (req, res) => {
  try {
    // Read file
    const data = fs.readFileSync("./storage/daily_data.json", "utf8");
    
    // Set JSON content type
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read daily_data.json" });
  }
});

// ----------------------------------------
// UPDATE DAILY DATA Route (Protected)
// ----------------------------------------

/**
 * POST /update-daily-data
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Saves data received from Google Sheet to server
 * - Merges with existing data (compares submittedAt)
 * - Only saves new/updated records
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
 * - 7-digit keys converted to 8-digit (01122025)
 * - Empty keys are filtered out ("": "" bug fix)
 */
app.post("/update-daily-data", verifyApiKey, (req, res) => {
  try {
    // Get incoming data
    const incoming = req.body;

    // Load existing data (if file exists)
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("./storage/daily_data.json", "utf8"));
    } catch {}

    let updatedCount = 0;
    
    /**
     * Converts 7-digit PrimaryKey to 8-digit
     * Example: "1112025" becomes "01112025"
     * 
     * Why: Dates sometimes miss leading zero
     */
    function normalizeKey(key) {
      if (/^\d{7}$/.test(key)) {
        return key.padStart(8, "0");
      }
      return key;
    }

    // Process each incoming record
    for (const [rawKey, record] of Object.entries(incoming)) {
      // Skip empty keys (this fixes the "":"" bug)
      // If key is empty or only whitespace, skip it
      if (!rawKey || rawKey.trim() === '') continue;
      
      // Normalize key (7-digit to 8-digit)
      const key = normalizeKey(rawKey);

      // Filter empty keys from record as well
      // Get [key, value] pairs using Object.entries
      // Filter to keep only non-empty keys
      // Convert back to object using Object.fromEntries
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([k]) => k && k.trim() !== '')
      );

      // Compare: Is this a new record or newer than existing?
      // submittedAt timestamp determines which is newer
      if (!existing[key] || existing[key].submittedAt < cleanRecord.submittedAt) {
        existing[key] = cleanRecord;  // Update/add record
        updatedCount++;
      }
    }

    // Save to file (with pretty print)
    fs.writeFileSync("./storage/daily_data.json", JSON.stringify(existing, null, 2));
    
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------------------------
// GET BOOKINGS DATA Route (Protected)
// ----------------------------------------

/**
 * GET /bookings_data.json
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Returns all booking records
 * - Google Sheet sync fetches data from here
 */
app.get("/bookings_data.json", verifyApiKey, (req, res) => {
  try {
    const data = fs.readFileSync("./storage/bookings_data.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read bookings_data.json" });
  }
});

// ----------------------------------------
// UPDATE BOOKINGS DATA Route (Protected)
// ----------------------------------------

/**
 * POST /update-bookings-data
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Saves booking data received from Google Sheet
 * - Merges with existing data (compares submittedAt)
 */
app.post("/update-bookings-data", verifyApiKey, (req, res) => {
  try {
    const incoming = req.body;
    
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("./storage/bookings_data.json", "utf8"));
    } catch {}

    let updatedCount = 0;

    for (const [key, record] of Object.entries(incoming)) {
      if (!key || key.trim() === '') continue;
      
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([k]) => k && k.trim() !== '')
      );

      if (!existing[key] || existing[key].submittedAt < cleanRecord.submittedAt) {
        existing[key] = cleanRecord;
        updatedCount++;
      }
    }

    fs.writeFileSync("./storage/bookings_data.json", JSON.stringify(existing, null, 2));
    
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------------------------
// GET CASH DATA Route (Protected)
// ----------------------------------------

/**
 * GET /cash_data.json
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Returns all cash deposit records
 * - Google Sheet sync fetches data from here
 */
app.get("/cash_data.json", verifyApiKey, (req, res) => {
  try {
    const data = fs.readFileSync("./storage/cash_data.json", "utf8");
    res.setHeader("Content-Type", "application/json");
    res.send(data);
  } catch {
    res.status(500).json({ error: "Cannot read cash_data.json" });
  }
});

// ----------------------------------------
// UPDATE CASH DATA Route (Protected)
// ----------------------------------------

/**
 * POST /update-cash-data
 * 
 * PROTECTED: API Key required
 * 
 * WHAT IT DOES:
 * - Saves cash deposit data received from Google Sheet
 * - Merges with existing data (compares depositedAt)
 */
app.post("/update-cash-data", verifyApiKey, (req, res) => {
  try {
    const incoming = req.body;
    
    let existing = {};
    try {
      existing = JSON.parse(fs.readFileSync("./storage/cash_data.json", "utf8"));
    } catch {}

    let updatedCount = 0;

    for (const [key, record] of Object.entries(incoming)) {
      if (!key || key.trim() === '') continue;
      
      const cleanRecord = Object.fromEntries(
        Object.entries(record).filter(([k]) => k && k.trim() !== '')
      );

      if (!existing[key] || existing[key].depositedAt < cleanRecord.depositedAt) {
        existing[key] = cleanRecord;
        updatedCount++;
      }
    }

    fs.writeFileSync("./storage/cash_data.json", JSON.stringify(existing, null, 2));
    
    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ========================================
// START SERVER
// ========================================

/**
 * Start server and connect to WhatsApp
 * 
 * PORT: 3000 (or process.env.PORT)
 */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start WhatsApp connection
  connectToWhatsApp();
});
