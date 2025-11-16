// helpers.js
export async function safeSendMessage(sock, jid, content) {
  try {
    await sock.sendMessage(jid, content);
  } catch (err) {
    console.error("⚠️ Error sending message:", err);
  }
}
