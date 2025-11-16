// daily_status_update.js
import db from "./daily_db.js";
import { safeSendMessage } from "../helpers.js";
import fs from "fs";

// ✅ New log file for daily status meta info
const logFile = "./daily/data/daily_status.json";

// ✅ Ensure log file exists before reading/writing
if (!fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, JSON.stringify([], null, 2));
}

// 🧠 Convert "05/11/2025" → Date
function parseDate(str) {
  const [d, m, y] = str.split("/");
  return new Date(`${y}-${m}-${d}`);
}

// 📊 Handle "Update Status" command
export async function handleStatusUpdate(sock, sender, normalizedText) {
  try {
    const match = normalizedText.match(
      /^update\s+status\s+([\d/,\s]+?)(?:\s+to\s+([\d/]+))?\s+(deposited|collected)(?:\s+remarks\s+(.+))?$/i
    );
    if (!match) return false;

    const startInput = match[1].trim();
    const endInput = match[2]?.trim();
    const newStatus =
      match[3].charAt(0).toUpperCase() + match[3].slice(1).toLowerCase();
    const remarks = match[4]?.trim() || null;

    // ✅ Read main DB
    await db.read();
    const data = db.data || {};

    let datesToUpdate = [];

    // 1️⃣ Handle range (e.g. 05/11/2025 to 07/11/2025)
    if (endInput) {
      const start = parseDate(startInput);
      const end = parseDate(endInput);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dd = d.toLocaleDateString("en-GB").replace(/\//g, "/");
        datesToUpdate.push(dd);
      }
    }
    // 2️⃣ Handle comma-separated (e.g. 05/11/2025,06/11/2025)
    else if (startInput.includes(",")) {
      datesToUpdate = startInput
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    }
    // 3️⃣ Single date
    else {
      datesToUpdate = [startInput];
    }

    // ✅ Convert to key format (ddmmyyyy)
    const normalizedKeys = datesToUpdate.map((x) => x.replace(/\//g, ""));

    let updatedKeys = [];
    let skippedKeys = [];
    let updatedCount = 0;

    // 🔁 Update daily_data.json records
    for (const [key, entry] of Object.entries(data)) {
      if (!entry?.Status) continue;

      if (normalizedKeys.includes(key)) {
        if (entry.Status !== newStatus) {
          entry.Status = newStatus;
          updatedKeys.push(key);
          updatedCount++;
        } else {
          skippedKeys.push(key); // Already same status
        }
      }
    }

    // ✅ Save updated daily_data.json
    await db.write();

    // ✅ Read or initialize daily_status.json
    let logData = [];
    try {
      logData = JSON.parse(fs.readFileSync(logFile, "utf-8"));
    } catch {
      logData = [];
    }

    // ✅ Push new log entry (no statusChangedTo)
    logData.push({
      updatedOn: new Date().toISOString(),
      updatedKeys,
      remarks,
    });

    // ✅ Write back safely
    fs.writeFileSync(logFile, JSON.stringify(logData, null, 2));

    // 💬 WhatsApp reply message
    let reply = "";
    if (updatedCount > 0) {
      reply += `✅ Updated *${updatedCount}* record${
        updatedCount > 1 ? "s" : ""
      } to *${newStatus}*.\n🗂️ Keys: ${updatedKeys.join(", ")}`;
    }
    if (skippedKeys.length > 0) {
      reply += `\n⚠️ Skipped (already ${newStatus}): ${skippedKeys.join(", ")}`;
    }
    if (remarks) reply += `\n📝 Remarks: ${remarks}`;
    if (!reply)
      reply = `⚠️ No matching entries found for: ${datesToUpdate.join(", ")}`;

    await safeSendMessage(sock, sender, { text: reply });
    return true;
  } catch (err) {
    console.error("❌ Error in handleStatusUpdate:", err);
    await safeSendMessage(sock, sender, {
      text: "⚠️ Error updating status. Please check your command format.",
    });
    return true;
  }
}
