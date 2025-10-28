import { format } from "date-fns";

export async function handleIncomingMessage(sock, msg) {
  try {
    const sender = msg.key.remoteJid;
    const messageContent =
      msg.message.conversation || msg.message.extendedTextMessage?.text;
    if (!messageContent) return;

    // 🔒 Ignore self messages
    if (msg.key.fromMe) return;

    // ✅ Initialize memory per user
    if (!global.userData) global.userData = {};
    if (!global.userData[sender]) {
      global.userData[sender] = {
        Dated: null,
        Diesel: null,
        Adda: null,
        Union: null,
        TotalCollection: null,
        Online: null,
        CashHandover: null,
        waitingForUpdate: null,
        waitingForConfirm: false,
      };
    }

    const user = global.userData[sender];
    const text = messageContent.trim();

    // ✅ Handle interactive reply buttons
    if (msg.message?.buttonsResponseMessage) {
      const buttonText = msg.message.buttonsResponseMessage.selectedButtonId;
      if (buttonText === "confirm_yes") {
        await sendCard(sock, sender, "✅ Data Saved Successfully!", user);
        global.userData[sender] = null; // clear session
        return;
      } else if (buttonText === "confirm_no") {
        await sock.sendMessage(sender, {
          text: "❎ Cancelled. You can re-enter data anytime.",
        });
        global.userData[sender].waitingForConfirm = false;
        return;
      }
    }

    // ✅ Handle update confirmation (yes/no text)
    if (user.waitingForUpdate) {
      if (/^yes$/i.test(text)) {
        user[user.waitingForUpdate.field] = user.waitingForUpdate.value;
        user.waitingForUpdate = null;
        await sendCard(sock, sender, "✅ Field updated successfully!", user);
        return;
      } else if (/^no$/i.test(text)) {
        user.waitingForUpdate = null;
        await sendCard(sock, sender, "❎ Update cancelled.", user);
        return;
      }
    }

    // ✅ Detect fields from message
    const fieldPatterns = {
      Dated: /dated\s*[:\-]?\s*(.+)/i,
      Diesel: /diesel\s*[:\-]?\s*(\d+)/i,
      Adda: /adda\s*[:\-]?\s*(\d+)/i,
      Union: /union\s*[:\-]?\s*(\d+)/i,
      TotalCollection: /total\s*collection\s*[:\-]?\s*(\d+)/i,
      Online: /online\s*[:\-]?\s*(\d+)/i,
      CashHandover: /cash\s*hand\s*over\s*[:\-]?\s*(\d+)/i,
    };

    let foundField = false;
    for (const [key, regex] of Object.entries(fieldPatterns)) {
      const match = text.match(regex);
      if (match) {
        foundField = true;
        const value = match[1].trim();
        if (user[key] && user[key] !== value) {
          // ask for update confirmation
          user.waitingForUpdate = { field: key, value };
          await sock.sendMessage(sender, {
            text: `⚠️ ${key} already has value *${user[key]}*.\nDo you want to update it to *${value}*? (yes/no)`,
          });
          return;
        } else {
          user[key] = value;
        }
      }
    }

    if (!foundField) return;

    // ✅ Check if all fields are filled
    const allFields = [
      "Dated",
      "Diesel",
      "Adda",
      "Union",
      "TotalCollection",
      "Online",
      "CashHandover",
    ];

    const missing = allFields.filter((f) => !user[f]);

    if (missing.length === 0 && !user.waitingForConfirm) {
      // ask for confirmation before saving
      user.waitingForConfirm = true;

      const today = format(new Date(), "dd MMMM yyyy (EEEE)");
      const card = [
        `*⚠️ Please confirm your data:*`,
        ``,
        `Dated: ${user.Dated || today}`,
        `Diesel: ${user.Diesel}`,
        `Adda: ${user.Adda}`,
        `Union: ${user.Union}`,
        `Total Collection: ${user.TotalCollection}`,
        `Online: ${user.Online}`,
        `Cash hand over: ${user.CashHandover}`,
      ].join("\n");

      await sock.sendMessage(sender, {
        text: card,
        buttons: [
          { buttonId: "confirm_yes", buttonText: { displayText: "✅ Yes" }, type: 1 },
          { buttonId: "confirm_no", buttonText: { displayText: "❌ No" }, type: 1 },
        ],
        headerType: 1,
      });

      return;
    } else if (missing.length > 0) {
      await sendCard(sock, sender, "🟡 Data Entering! Please provide remaining data.", user);
    }
  } catch (err) {
    console.error("❌ Error in handleIncomingMessage:", err);
  }
}

async function sendCard(sock, jid, title, userData = {}) {
  const today = format(new Date(), "dd MMMM yyyy (EEEE)");
  const msg = [
    `*${title}*`,
    ``,
    `Dated: ${userData.Dated || today}`,
    `Diesel: ${userData.Diesel || "NA"}`,
    `Adda: ${userData.Adda || "NA"}`,
    `Union: ${userData.Union || "NA"}`,
    `Total Collection: ${userData.TotalCollection || "NA"}`,
    `Online: ${userData.Online || "NA"}`,
    `Cash hand over: ${userData.CashHandover || "NA"}`,
  ].join("\n");

  await sock.sendMessage(jid, { text: msg });
}
