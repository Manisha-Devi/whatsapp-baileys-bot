import db from "../../../data/db.js";

export async function safeSendMessage(sock, jid, message) {
  try {
    await sock.sendMessage(jid, message);
  } catch (err) {
    console.error("❌ Failed to send message to", jid, ":", err);
  }
}

export async function safeDbRead() {
  try {
    if (typeof db.read === "function") {
      await db.read();
      db.data = db.data || {};
    } else {
      console.warn("⚠️ db.read() not available on db object");
      db.data = db.data || {};
    }
    return true;
  } catch (err) {
    console.error("❌ DB read error:", err);
    return false;
  }
}

export async function safeDbWrite() {
  try {
    if (typeof db.write === "function") {
      await db.write();
    } else {
      console.warn("⚠️ db.write() not available on db object");
    }
    return true;
  } catch (err) {
    console.error("❌ DB write error:", err);
    return false;
  }
}

export async function sendYesNoReply(sock, jid, text) {
  try {
    await safeSendMessage(sock, jid, { text });
  } catch (err) {
    console.error("❌ sendYesNoReply failed:", err);
  }
}
