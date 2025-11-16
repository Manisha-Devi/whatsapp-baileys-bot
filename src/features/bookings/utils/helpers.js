export async function safeSendMessage(sock, recipient, message) {
  try {
    if (!sock || !recipient) {
      console.warn("⚠️ safeSendMessage: Missing sock or recipient");
      return false;
    }
    await sock.sendMessage(recipient, message);
    return true;
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    return false;
  }
}

export async function safeDbRead(db) {
  try {
    await db.read();
    return db.data || {};
  } catch (err) {
    console.error("❌ Failed to read database:", err);
    return {};
  }
}

export async function safeDbWrite(db) {
  try {
    await db.write();
    return true;
  } catch (err) {
    console.error("❌ Failed to write database:", err);
    return false;
  }
}
