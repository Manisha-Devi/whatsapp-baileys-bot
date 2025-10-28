// message.js
export async function handleIncomingMessage(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return; // skip self-messages

    const sender = msg.key.remoteJid;
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    if (!text.trim()) return;

    console.log("💬", sender, "=>", text);

    // Example: handle short/incomplete messages
    if (text.length < 5) {
      await sock.sendMessage(sender, { text: "🤖 Please type a full message." });
      return;
    }

    // Example command
    if (text.toLowerCase() === "hi" || text.toLowerCase() === "hello") {
      await sock.sendMessage(sender, {
        text: "👋 Hello! How can I assist you today?",
      });
      return;
    }

    // Default echo
    await sock.sendMessage(sender, { text: `✅ You said: "${text}"` });
  } catch (err) {
    console.error("❌ Error handling message:", err.message);
  }
}
