import { getMenuState } from "./menu-state.js";

const TIME_ZONE = "Asia/Kolkata";
const FOOTER_MARKER = "Sukoon";

/**
 * Builds the common WhatsApp footer for every outgoing bot message.
 * The selected bus is read at send-time, so switching buses updates it immediately.
 */
export function buildMessageFooter(sender, now = new Date()) {
  const state = getMenuState(sender);
  const registrationNumber =
    state.selectedBusInfo?.registrationNumber ||
    state.selectedBusInfo?.registration_number ||
    state.selectedBus ||
    null;

  const leftLabel = registrationNumber
    ? `Sukoon ${registrationNumber}`
    : "Sukoon";

  // Keep only the Sukoon label here. WhatsApp adds its own message timestamp
  // below the bubble, so a second custom date/time would appear duplicated.
  return leftLabel;
}

function addTextFooter(content, sender) {
  if (!content || typeof content !== "object") return content;

  const next = { ...content };
  const footer = buildMessageFooter(sender);

  for (const key of ["text", "caption"]) {
    if (typeof next[key] === "string") {
      const lines = next[key].trimEnd().split("\n");
      const lastLine = lines[lines.length - 1] || "";
      if (!lastLine.startsWith(FOOTER_MARKER)) {
        next[key] = `${next[key].trimEnd()}\n\n${footer}`;
      }
    }
  }

  return next;
}

function addInteractiveFooter(message, sender) {
  if (!message || typeof message !== "object") return;
  if (Array.isArray(message)) {
    for (const item of message) addInteractiveFooter(item, sender);
    return;
  }

  if (message.interactiveMessage && typeof message.interactiveMessage === "object") {
    message.interactiveMessage.footer = {
      ...(message.interactiveMessage.footer || {}),
      text: buildMessageFooter(sender)
    };
  }

  for (const [key, value] of Object.entries(message)) {
    if (value && typeof value === "object") addInteractiveFooter(value, sender);
  }
}

/**
 * Installs once per Baileys socket. Covers regular sendMessage calls and
 * native-flow messages sent directly through relayMessage.
 */
export function installMessageFooter(sock) {
  if (!sock || sock.__sukoonMessageFooterInstalled) return sock;

  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = (jid, content, options) =>
    originalSendMessage(jid, addTextFooter(content, jid), options);

  const originalRelayMessage = sock.relayMessage.bind(sock);
  sock.relayMessage = (jid, message, options) => {
    const outgoing = structuredClone(message);
    addInteractiveFooter(outgoing, jid);

    // The WhatsApp "AI" attribution label is associated with the bot biz node.
    // Keep native-flow metadata intact while omitting that extra attribution node.
    const relayOptions = options?.additionalNodes
      ? {
          ...options,
          additionalNodes: options.additionalNodes.filter(node => node?.tag !== "bot")
        }
      : options;

    return originalRelayMessage(jid, outgoing, relayOptions);
  };

  Object.defineProperty(sock, "__sukoonMessageFooterInstalled", {
    value: true,
    configurable: false,
    enumerable: false
  });

  return sock;
}
