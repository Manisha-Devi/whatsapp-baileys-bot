/**
 * Shared Baileys message normalization for text, native Quick Replies and lists.
 * Keeps the selected button/list ID as the command consumed by existing handlers.
 */
export function unwrapIncomingMessage(message) {
  let current = message;
  while (current) {
    const wrapped =
      current.ephemeralMessage?.message ||
      current.viewOnceMessage?.message ||
      current.viewOnceMessageV2?.message ||
      current.viewOnceMessageV2Extension?.message ||
      current.documentWithCaptionMessage?.message ||
      current.deviceSentMessage?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current || {};
}

function readNativeFlowParams(interactiveResponse) {
  const nativeResponse = interactiveResponse?.nativeFlowResponseMessage;
  const rawParams = nativeResponse?.paramsJson ?? nativeResponse?.params_json;
  if (!rawParams) return {};
  if (typeof rawParams === "object") return rawParams;
  try {
    return JSON.parse(rawParams);
  } catch {
    // Some clients wrap the params JSON as a JSON-encoded string.
    try {
      return JSON.parse(JSON.parse(rawParams));
    } catch {
      return {};
    }
  }
}

export function extractIncomingMessageText(msg) {
  const message = unwrapIncomingMessage(msg?.message);
  let text =
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption;

  const interactiveResponse = message.interactiveResponseMessage;
  if (interactiveResponse) {
    const params = readNativeFlowParams(interactiveResponse);
    text =
      params.id ||
      params.selected_id ||
      params.row_id ||
      params.display_text ||
      interactiveResponse.body?.text ||
      text;
  }

  const buttonResponse = message.buttonsResponseMessage;
  if (buttonResponse) {
    text =
      buttonResponse.selectedButtonId ||
      buttonResponse.selectedDisplayText ||
      text;
  }

  const templateButtonResponse = message.templateButtonReplyMessage;
  if (templateButtonResponse) {
    text =
      templateButtonResponse.selectedId ||
      templateButtonResponse.selectedDisplayText ||
      text;
  }

  const listResponse = message.listResponseMessage;
  if (listResponse) {
    text =
      listResponse.singleSelectReply?.selectedRowId ||
      listResponse.title ||
      text;
  }

  return text === undefined || text === null || text === ""
    ? null
    : String(text).trim();
}

/**
 * Feature handlers historically read msg.message.conversation. Normalize
 * interactive replies into that same shape so buttons and typed replies follow
 * precisely the same command/confirmation paths.
 */
export function normalizeIncomingMessage(msg) {
  const text = extractIncomingMessageText(msg);
  if (text === null) return null;
  return {
    ...msg,
    message: { conversation: text }
  };
}
