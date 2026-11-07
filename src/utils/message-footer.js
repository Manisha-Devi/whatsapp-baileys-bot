import { getMenuState } from "./menu-state.js";

const TIME_ZONE = "Asia/Kolkata";
const FOOTER_MARKER = "XploreJK";

/**
 * Builds the common WhatsApp footer for every outgoing bot message.
 * The date and time are always shown in Indian Standard Time.
 */
export function buildMessageFooter(_sender, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short"
  }).format(now);

  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }).format(now).toUpperCase();

  const leftLabel = "XploreJK";
  const rightLabel = `${date}, ${time}`;
  const spacing = " ".repeat(Math.max(2, 48 - leftLabel.length - rightLabel.length));
  return `${leftLabel}${spacing}${rightLabel}`;
}

function addTextFooter(content, sender) {
  if (!content || typeof content !== "object") return content;

  const next = { ...content };
  const header = buildMessageHeader(sender);
  const footer = buildMessageFooter(sender);

  for (const key of ["text", "caption"]) {
    if (typeof next[key] !== "string") continue;

    let messageText = next[key].trimEnd();
    const lines = messageText.split("\n");
    const firstLine = lines[0] || "";
    const lastLine = lines[lines.length - 1] || "";

    // Add the same branded header to ordinary text/caption replies as well
    // as native-flow cards. Preserve existing content and avoid duplicates.
    if (firstLine !== header) {
      messageText = `${header}\n\n${messageText}`;
    }

    if (!lastLine.startsWith(FOOTER_MARKER)) {
      messageText = `${messageText}\n\n${footer}`;
    }

    next[key] = messageText;
  }

  return next;
}

function buildMessageHeader(sender) {
  const state = getMenuState(sender);
  const registrationNumber =
    state.selectedBusInfo?.registrationNumber ||
    state.selectedBusInfo?.registration_number ||
    state.selectedBus ||
    null;

  const brand = "✨ SUKOON";
  // WhatsApp native-flow headers expose one title field. Use spacing to keep
  // the bus registration on the right; do not add divider lines below it.
  if (!registrationNumber) return brand;

  const gap = Math.max(2, 34 - brand.length - String(registrationNumber).length);
  return `${brand}${" ".repeat(gap)}${registrationNumber}`;
}

function addInteractiveBranding(message, sender) {
  if (!message || typeof message !== "object") return;
  if (Array.isArray(message)) {
    for (const item of message) addInteractiveBranding(item, sender);
    return;
  }

  if (message.interactiveMessage && typeof message.interactiveMessage === "object") {
    const interactive = message.interactiveMessage;
    const previousTitle = interactive.header?.title?.trim();

    interactive.header = {
      ...(interactive.header || {}),
      title: buildMessageHeader(sender),
      hasMediaAttachment: interactive.header?.hasMediaAttachment ?? false
    };

    interactive.footer = {
      ...(interactive.footer || {}),
      text: buildMessageFooter(sender)
    };
  }

  for (const [key, value] of Object.entries(message)) {
    if (value && typeof value === "object") addInteractiveBranding(value, sender);
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
    addInteractiveBranding(outgoing, jid);

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
