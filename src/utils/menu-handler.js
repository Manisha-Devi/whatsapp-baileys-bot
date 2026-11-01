import { generateWAMessageFromContent } from '@whiskeysockets/baileys';

import { handleIncomingMessageFromReports } from '../features/reports/reports.js';
import { 
  getMenuState, 
  setMenuMode, 
  setMenuSubmode, 
  exitToHome, 
  exitToPreviousLevel,
  setSelectedBus,
  setUserAuthenticated,
  setAwaitingBusSelection,
  getSelectedBus,
  switchBus,
  fullLogout
} from './menu-state.js';

import {
  getUserByPhone,
  getBusesForUser,
  formatBusSelectionMenu,
  getBusBySelection
} from './bus-selection.js';

/**
 * Display the main menu to a user
 * Shows options for Daily, Booking, Switch bus, and Exit
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
/**
 * Interactive Messaging Lab session tracking.
 * Location messages are only interpreted as lab test replies while the user is in the lab.
 */
const interactiveLabSessions = new Set();

export function isInteractiveLabActive(sender) {
  return interactiveLabSessions.has(sender);
}

async function sendLabInteractive(sock, sender, text, interactiveButtons, title = "Interactive Messaging Lab") {
  const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
  if (!userJid) throw new Error("WhatsApp socket user is not ready for interactive messaging.");

  const content = {
    interactiveMessage: {
      header: { title, hasMediaAttachment: false },
      body: { text },
      footer: { text: "Sukoon Bot • Interactive Messaging Lab" },
      nativeFlowMessage: {
        buttons: interactiveButtons,
        messageParamsJson: ""
      }
    }
  };

  const message = generateWAMessageFromContent(sender, content, {
    userJid,
    logger: sock.logger
  });

  const firstButtonName = interactiveButtons[0]?.name;
  const specialNativeFlows = [
    "mpm",
    "cta_catalog",
    "send_location",
    "call_permission_request",
    "wa_payment_transaction_details",
    "automated_greeting_message_view_catalog"
  ];

  let bizNode;
  if (firstButtonName === "review_and_pay" || firstButtonName === "payment_info") {
    bizNode = {
      tag: "biz",
      attrs: {
        native_flow_name: firstButtonName === "review_and_pay" ? "order_details" : firstButtonName
      }
    };
  } else if (specialNativeFlows.includes(firstButtonName)) {
    bizNode = {
      tag: "biz",
      attrs: {},
      content: [{
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{
          tag: "native_flow",
          attrs: { v: "2", name: firstButtonName }
        }]
      }]
    };
  } else {
    bizNode = {
      tag: "biz",
      attrs: {},
      content: [{
        tag: "interactive",
        attrs: { type: "native_flow", v: "1" },
        content: [{
          tag: "native_flow",
          attrs: { v: "9", name: "mixed" }
        }]
      }]
    };
  }

  const additionalNodes = [bizNode];
  if (!sender.endsWith("@g.us")) {
    additionalNodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  }

  // Match the document-with-caption compatibility wrapper used by the
  // Baileys native-flow relay helper for linked-device chats.
  message.message = {
    documentWithCaptionMessage: {
      message: { ...message.message }
    }
  };

  await sock.relayMessage(sender, message.message, {
    messageId: message.key.id,
    additionalNodes
  });

  return message;
}

/**
 * Send the complete interactive lab menu using the Baileys native-flow relay helper.
 */
async function showInteractiveTestMenu(sock, sender) {
  return sock.sendMessage(sender, { text: [
    "🧪 *INTERACTIVE MESSAGING LAB*", "",
    "1️⃣ Location", "2️⃣ Live Location", "3️⃣ Quick Reply",
    "4️⃣ Single Select List", "5️⃣ CTA Buttons", "6️⃣ E - Back to Main Menu", "",
    "Reply with a number (1–6)."
  ].join("\n") });
}

async function showInteractiveLocationRequest(sock, sender) {
  return sendLabInteractive(
    sock,
    sender,
    "📍 Location Request Test. Tap Share Location if your WhatsApp client supports this experimental native-flow control. You can also share your location manually using the attachment menu.",
    [
      { name: "send_location", buttonParamsJson: JSON.stringify({ display_text: "Share Location" }) },
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Back to Lab", id: "test_quick_demo" }) }
    ],
    "Location Request Test"
  );
}

async function showInteractiveCtaTest(sock, sender, type) {
  const tests = {
    test_cta_url: {
      title: "CTA URL • Route Map",
      body: "Sukoon use case: let a passenger open a pickup/boarding location in Google Maps. This demo opens a Bhaderwah map search. Replace the URL with the real trip or pickup map link in production.",
      button: { name: "cta_url", params: { display_text: "Open Route Map", url: "https://maps.google.com/?q=Bhaderwah", merchant_url: "https://maps.google.com/?q=Bhaderwah" } }
    },
    test_cta_copy: {
      title: "CTA Copy • Booking Reference",
      body: "Sukoon use case: let a customer copy a booking reference and paste it into a WhatsApp enquiry. This is a demo reference, not a real booking.",
      button: { name: "cta_copy", params: { display_text: "Copy Booking ID", copy_code: "SUKOON-BK-2026-001" } }
    },
    test_cta_call: {
      title: "CTA Call • Booking Desk",
      body: "Sukoon use case: a customer can tap to call the booking desk. This is a placeholder demo number; replace it with your actual business number before production use.",
      button: { name: "cta_call", params: { display_text: "Call Demo Number", phone_number: "+911234567890" } }
    }
  };

  const test = tests[type];
  if (!test) return showInteractiveTestMenu(sock, sender);

  return sendLabInteractive(
    sock,
    sender,
    test.body,
    [
      { name: test.button.name, buttonParamsJson: JSON.stringify(test.button.params) },
      { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Back to Lab", id: "test_quick_demo" }) }
    ],
    test.title
  );
}

const locationTestSessions = new Map();

async function requestUserLocation(sock, sender, live = false) {
  locationTestSessions.set(sender, live ? "live" : "normal");
  await sock.sendMessage(sender, { text: live
    ? "📍 *Live Location Test*\n\nWhatsApp mein 📎 > Location > Share Live Location select karke apni location share karein. Har naya update milne par main Latitude aur Longitude reply karunga.\n\nBand karne ke liye *Stop Live Location* bhejein."
    : "📍 *Location Test*\n\nWhatsApp mein 📎 > Location > Send Your Current Location select karke apni location bhejein. Main received Latitude aur Longitude aapko wapas message karunga."
  });
}

export async function handleInteractiveLabLocation(sock, sender, payload, live = false) {
  const mode = locationTestSessions.get(sender);
  if (!mode || !payload) return false;
  if (mode === "normal" && live) return false;
  const latitude = payload.degreesLatitude;
  const longitude = payload.degreesLongitude;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  await sock.sendMessage(sender, { text: [
    live ? "📍 *Live Location Update Received*" : "📍 *Your Location Received*", "",
    "Latitude: " + latitude, "Longitude: " + longitude,
    "Google Maps: https://maps.google.com/?q=" + latitude + "," + longitude, "",
    live ? "Send *Stop Live Location* to end this test." : "✅ Location test completed."
  ].join("\n") });
  if (!live) locationTestSessions.delete(sender);
  return true;
}

async function sendInteractiveLabFallback(sock, sender, error) {
  console.error("Interactive Messaging Lab native-flow send failed:", error?.stack || error);
  await sock.sendMessage(sender, {
    text: [
      "🧪 *Interactive Messaging Lab*",
      "",
      "Use these options:",
      "1 - Location",
      "2 - Live Location",
      "3 - Quick Reply (Booking confirmation)",
      "4 - Single Select List (Booking status)",
      "5 - CTA Buttons (Map / Copy Booking ID / Call)",
      "E - Back to Main Menu"
    ].join("\n")
  });
}

export function showMainMenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `🏠 *Main Menu* (*${regNumber}*)

Please select an option:

📊 Reply *Daily* or *D* - for Daily Reports
🚌 Reply *Booking* or *B* - for Booking Management
💵 Reply *Cash* or *C* - for Cash Management
📈 Reply *Report* or *R* - for Reports
🧪 Reply *Test* or *T* - for Test
🔄 Reply *Switch* or *S* - to change bus
🚪 Reply *Exit* or *E* - to close menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display the bus selection menu
 * Shows numbered list of available buses for selection
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showBusSelectionMenu(sock, sender) {
  const state = getMenuState(sender);
  const buses = state.availableBuses;
  const user = state.user;
  
  // Handle case where no buses are available
  if (!buses || buses.length === 0) {
    return sock.sendMessage(sender, {
      text: "⚠️ No buses available. Please contact admin."
    });
  }
  
  // Format and send the bus selection menu
  const menuText = formatBusSelectionMenu(buses, user?.role === 'Admin');
  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display the Daily submenu
 * Shows options within the Daily section
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showDailySubmenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `📊 *Daily Menu* (*${regNumber}*)

Enter Command or Select Option:

❓ Reply *Help* or *H* - for Help with Commands
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display the Booking submenu
 * Shows options within the Booking section
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showBookingSubmenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `🚌 *Booking Menu* (*${regNumber}*)

Enter Command or Select Option:

❓ Reply *Help* or *H* - for Help with Commands
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display the Cash submenu
 * Shows options within the Cash section
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showCashSubmenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `💵 *Cash Menu* (*${regNumber}*)

Enter Command or Select Option:

📅 *Date today* - Cash available till today
📅 *Date DD/MM/YYYY* - Cash available till specific date
❓ Reply *Help* or *H* - for Help with Commands
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display comprehensive help for Daily data entry
 * Shows all available commands for entering daily report data
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showDailyDataHelp(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const helpText = `📊 *Daily Help* (*${regNumber}*)

*Commands For Data Entry:*
• Date [Date]
• Diesel [Amount] [Mode]
  Mode: Online or Cash (Default: Cash)
• Adda [Amount] [Mode]
  Mode: Online or Cash (Default: Cash)
• Union [Amount] [Mode]
  Mode: Online or Cash (Default: Cash)
• Cash [Amount]
  Amount: Total Cash Collected
• Online [Amount]
  Amount: Total Online Collected
• Remarks [Text]
• Submit

*Commands for Status Management:*

View Status:
• Initiated or I
• Collected or C
• Deposited or D

Update:
• Update [Date] [Type] Remarks [Text]
  Type: Initiated / Collected / Deposited
• Update [Date] to [Date] [Type] Remarks [Text]

*Commands for Reports:*
• Today
• Yesterday
• Last [Number] Days
• [Date]
• [Date] to [Date]
• This [X]
  X: Week / Month / Year
• Average Today
• Average [X]
  X: Week / Month / Year / MonthName / MonthName Year

*Other:*
• Clear - Clear session
• Exit - Back to Main Menu`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Display help for Daily status management
 * Shows how to view and update daily report statuses
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showDailyStatusHelp(sock, sender) {
  const helpText = `📋 *Daily Status Management*

You can now use status commands without typing "daily":

*View Status:*
• *Initiated* or *I*
• *Collected* or *C*
• *Deposited* or *D*

*Update Status:*
• *Update* 15/11/2025 *Collected*
• *Update* 10/11/2025 to 15/11/2025 *Deposited*
• *Update* 15/11/2025 *Collected Remark* All Done

*Other Commands:*
• *Help* - Show this help
• *Exit* - Back to Daily Menu

Enter your command now!`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Display help for Booking data entry
 * Shows the format for entering new bookings
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showBookingDataHelp(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const helpText = `🚌 *Booking Help* (*${regNumber}*)

*Commands For Data Entry:*
• Name [Customer Name]
• Mobile [10-digit Phone]
• Pickup [Location]
• Drop [Location]
• Date [DD/MM/YYYY]
• Date [DD/MM/YYYY] to [DD/MM/YYYY]
  For multi-day bookings
• Bus [BusCode]
  Auto-fills bus details
• Fare [Amount]
  Total Fare amount
• Advance [Amount]
  Advance payment (0 allowed)
• Remarks [Text]
• Yes/Y or No/N to Submit

*Commands for Status Management:*

View Status:
• Status Pending
• Status Confirmed
• Status Completed

Update:
• Update Status [BookingID] [Type]
  Type: Pending / Confirmed / Completed

*Commands for Reports:*
• Today
• Yesterday
• [Date]

*Other:*
• Clear - Clear session
• Exit - Back to Main Menu`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Display help for Booking status management
 * Shows how to view and update booking statuses
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showBookingStatusHelp(sock, sender) {
  const helpText = `📋 *Booking Status Management*

You can now use status commands without typing "booking":

*View Status:*
• status pending
• status confirmed
• status completed

*Update Status:*
• update status BK001 confirmed
• update status BK002 completed

*Other Commands:*
• *Help* - Show this help
• *Exit* - Back to Booking Menu

Enter your command now!`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Display help for Daily reports
 * Shows various date formats for viewing reports
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showDailyReportsHelp(sock, sender) {
  const helpText = `📊 *Daily Reports*

View your daily reports using various formats:

*Examples:*
• *Today* - View today's report
• *Last 5 Days* - View last 5 days reports
• *11/10/2025* - View specific date
• *11/10/2025 to 15/10/2025* - Date range
• *This Month* - Current month reports
• *This Week* - Current week reports
• *6 Days Ago* - View report from 6 days ago

*Other Commands:*
• *Help* - Show this help
• *Exit* - Back to Daily Menu

Enter your report query now!`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Display help for Booking reports
 * Shows various date formats for viewing booking reports
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showBookingReportsHelp(sock, sender) {
  const helpText = `📊 *Booking Reports*

View your booking reports using various formats:

*Examples:*
• *Today* - View today's bookings
• *Last 5 Days* - View last 5 days bookings
• *11/10/2025* - View specific date
• *11/10/2025 to 15/10/2025* - Date range
• *This Month* - Current month bookings
• *This Week* - Current week bookings

*Other Commands:*
• *Help* - Show this help
• *Exit* - Back to Booking Menu

Enter your report query now!`;

  return sock.sendMessage(sender, { text: helpText });
}

/**
 * Get a human-readable path showing current menu location
 * Used for debugging and understanding navigation state
 * 
 * @param {Object} state - The user's menu state object
 * @returns {string} A breadcrumb-style path like "Main Menu -> Daily Menu -> Data Entry"
 */
function getCurrentMenuPath(state) {
  let path = "🏠 Main Menu";
  
  if (state.mode === 'daily') {
    path += " -> 📊 Daily Menu";
    if (state.submode === 'data') {
      path += " -> 📝 Data Entry";
    } else if (state.submode === 'status') {
      path += " -> 📋 Status Management";
    } else if (state.submode === 'reports') {
      path += " -> 📊 Reports";
    }
  } else if (state.mode === 'booking') {
    path += " -> 🚌 Booking Menu";
    if (state.submode === 'data') {
      path += " -> 📝 Booking Entry";
    } else if (state.submode === 'status') {
      path += " -> 📋 Status Management";
    } else if (state.submode === 'reports') {
      path += " -> 📊 Reports";
    }
  } else if (state.mode === 'report') {
    // Basic navigation in reports mode
    if (resolvedCommand === 'exit' || resolvedCommand === 'home') {
      exitToHome(sender);
      showMainMenu(sock, sender);
      return true;
    }
    return false;
  }
  
  return path;
}

/**
 * Command aliases mapping
 * Allows users to type shortcuts instead of full command names
 */
const commandAliases = {
  'entry': ['entry'],
  'exit': ['exit', 'e'],
  'home': ['home'],
  'menu': ['menu'],
  'daily': ['daily'],
  'booking': ['booking'],
  'cash': ['cash'],
  'data': ['data', 'd'],
  'status': ['status', 's'],
  'reports': ['reports', 'r'],
  'help': ['help', 'h'],
  'yes': ['yes', 'y'],
  'no': ['no', 'n'],
  'switch': ['switch', 'sw'],
  'test': ['test', 't']
};

/**
 * Resolve a user's input to a standard command name
 * Handles context-sensitive aliases (e.g., 'd' means 'daily' in main menu, 'data' in submenu)
 * 
 * @param {string} input - The user's raw input text
 * @param {Object|null} menuState - The user's current menu state (for context)
 * @returns {string} The resolved command name
 */
export function resolveCommand(input, menuState = null) {
  const lower = input.toLowerCase().trim();
  
  // Determine context for proper alias resolution
  const isMainMenu = menuState && menuState.mode === null && menuState.selectedBus;
  const isInSubmenu = menuState && menuState.mode !== null && menuState.submode === null;
  
  // In main menu, single-letter shortcuts have specific meanings
  if (isMainMenu) {
    const mainMenuAliases = {
      'd': 'daily',
      'b': 'booking',
      'c': 'cash',
      't': 'test',
      's': 'switch'
    };
    if (mainMenuAliases[lower]) {
      return mainMenuAliases[lower];
    }
  }
  
  // In submenus, single-letter shortcuts have different meanings
  if (isInSubmenu) {
    const submenuAliases = {
      'd': 'data',
      's': 'status',
      'r': 'reports',
      'h': 'help'
    };
    if (submenuAliases[lower]) {
      return submenuAliases[lower];
    }
  }
  
  // Check general command aliases
  for (const [command, aliases] of Object.entries(commandAliases)) {
    if (aliases.includes(lower)) {
      return command;
    }
  }
  
  // Return original input if no alias match
  return lower;
}

/**
 * Extract phone number from WhatsApp sender ID
 * Sender ID format: "919876543210@s.whatsapp.net"
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @returns {string|null} The phone number portion or null
 */
function extractPhoneFromSender(sender) {
  const match = sender.match(/^(\d+)@/);
  return match ? match[1] : null;
}

/**
 * Main menu navigation handler
 * Processes all menu-related commands and manages navigation flow
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} text - The user's message text
 * @returns {Promise<boolean>} True if the message was handled by menu system, false otherwise
 */
export async function handleMenuNavigation(sock, sender, text) {
  // Ignore group messages and broadcast lists
  if (!sender || sender.endsWith("@g.us") || sender.endsWith("@broadcast")) {
    return false;
  }

  const state = getMenuState(sender);
  const lowerText = text.toLowerCase().trim();

  if (interactiveLabSessions.has(sender) && /^(stop live location|stop live|stop)$/i.test(lowerText)) {
    locationTestSessions.delete(sender);
    await sock.sendMessage(sender, { text: "🛑 Live Location test stopped." });
    await showInteractiveTestMenu(sock, sender);
    return true;
  }
  const resolvedCommand = resolveCommand(text, state);

  // Handle 'entry' command - initial authentication
  if (resolvedCommand === 'entry') {
    const phoneNumber = extractPhoneFromSender(sender);
    const user = getUserByPhone(phoneNumber);
    
    // Check if user is registered
    if (!user) {
      await sock.sendMessage(sender, {
        text: "❌ *Access Denied*\n\nYour number is not registered in the system.\nPlease contact admin for access."
      });
      return true;
    }
    
    // Get available buses for this user
    const buses = getBusesForUser(user);
    
    if (buses.length === 0) {
      await sock.sendMessage(sender, {
        text: "⚠️ No buses assigned to you. Please contact admin."
      });
      return true;
    }
    
    // Mark user as authenticated
    setUserAuthenticated(sender, user, buses);
    
    // If only one bus, auto-select it
    if (buses.length === 1) {
      setSelectedBus(sender, buses[0].busCode, buses[0]);
      await sock.sendMessage(sender, {
        text: `✅ Auto-selected bus: *${buses[0].busCode}* (${buses[0].registrationNumber})`
      });
      await showMainMenu(sock, sender);
    } else {
      // Multiple buses - show selection menu
      setAwaitingBusSelection(sender, true);
      await showBusSelectionMenu(sock, sender);
    }
    return true;
  }

  // Handle bus selection when awaiting
  if (state.awaitingBusSelection) {
    const buses = state.availableBuses;
    const selectedBus = getBusBySelection(buses, text);
    
    if (selectedBus) {
      setSelectedBus(sender, selectedBus.busCode, selectedBus);
      await sock.sendMessage(sender, {
        text: `✅ Selected bus: *${selectedBus.busCode}* (${selectedBus.registrationNumber})`
      });
      await showMainMenu(sock, sender);
      return true;
    } else {
      // Invalid selection
      await sock.sendMessage(sender, {
        text: `❌ Invalid selection. Please enter a number between 1 and ${buses.length}.`
      });
      return true;
    }
  }

  // Require authentication before proceeding
  if (!state.isAuthenticated || !state.selectedBus) {
    if (!state.awaitingBusSelection) {
      await sock.sendMessage(sender, {
        text: "⚠️ Please type *Entry* first to get started."
      });
      return true;
    }
    return false;
  }

  // Handle 'switch' command - change to a different bus
  if (resolvedCommand === 'switch') {
    switchBus(sender);
    setAwaitingBusSelection(sender, true);
    await showBusSelectionMenu(sock, sender);
    return true;
  }

  // Handle 'menu' command - show current menu screen
  if (resolvedCommand === 'menu') {
    if (!state.mode) {
      await showMainMenu(sock, sender);
    } else if (state.mode === 'daily' && !state.submode) {
      await showDailySubmenu(sock, sender);
    } else if (state.mode === 'booking' && !state.submode) {
      await showBookingSubmenu(sock, sender);
    } else if (state.mode === 'daily' && state.submode === 'data') {
      await showDailyDataHelp(sock, sender);
    } else if (state.mode === 'daily' && state.submode === 'status') {
      await showDailyStatusHelp(sock, sender);
    } else if (state.mode === 'daily' && state.submode === 'reports') {
      await showDailyReportsHelp(sock, sender);
    } else if (state.mode === 'booking' && state.submode === 'data') {
      await showBookingDataHelp(sock, sender);
    } else if (state.mode === 'booking' && state.submode === 'status') {
      await showBookingStatusHelp(sock, sender);
    } else if (state.mode === 'booking' && state.submode === 'reports') {
      await showBookingReportsHelp(sock, sender);
    }
    return true;
  }

  // Handle direct help commands with feature prefix
  if (lowerText === 'daily help') {
    await showDailyDataHelp(sock, sender);
    return true;
  }

  if (lowerText === 'booking help') {
    await showBookingDataHelp(sock, sender);
    return true;
  }

  // Interactive Lab uses E (or 6) to return to the main menu, not log out.
  if (interactiveLabSessions.has(sender) && (lowerText === "e" || lowerText === "6" || lowerText === "test_back")) {
    interactiveLabSessions.delete(sender);
    locationTestSessions.delete(sender);
    await showMainMenu(sock, sender);
    return true;
  }

  // Handle 'exit' and 'home' commands - navigate back
  if (resolvedCommand === 'exit' || resolvedCommand === 'home') {
    const currentMode = state.mode;
    const currentSubmode = state.submode;

    if (currentSubmode) {
      // In submode - go back to mode menu
      exitToPreviousLevel(sender);
      if (currentMode === 'daily') {
        await showDailySubmenu(sock, sender);
      } else if (currentMode === 'booking') {
        await showBookingSubmenu(sock, sender);
      }
      return true;
    } else if (currentMode) {
      // In mode - go back to main menu
      exitToHome(sender);
      await showMainMenu(sock, sender);
      return true;
    } else {
      // At main menu - full logout
      fullLogout(sender);
      await sock.sendMessage(sender, { 
        text: "👋 Menu closed. Send *Entry* anytime to open the menu again." 
      });
      return true;
    }
  }

  // Handle mode selection from main menu
  if (!state.mode) {
    if (resolvedCommand === 'daily') {
      setMenuMode(sender, 'daily');
      await showDailySubmenu(sock, sender);
      return true;
    }
    if (resolvedCommand === 'booking') {
      setMenuMode(sender, 'booking');
      await showBookingSubmenu(sock, sender);
      return true;
    }
    if (resolvedCommand === 'cash') {
      setMenuMode(sender, 'cash');
      await showCashSubmenu(sock, sender);
      return true;
    }
    if (resolvedCommand === 'test') {
      interactiveLabSessions.add(sender);
      await sock.sendMessage(sender, {
        text: "🧪 *Interactive Messaging Lab opened successfully.*\n\nI am loading the interactive test menu now. You can test Quick Replies, Single Select Lists, CTA buttons, Normal Location and Live Location."
      });
      try {
        await showInteractiveTestMenu(sock, sender);
      } catch (error) {
        await sendInteractiveLabFallback(sock, sender, error);
      }
      return true;
    }

    if (interactiveLabSessions.has(sender) && ["1","2","3","4","5","6"].includes(lowerText)) {
      if (lowerText === "1") { await requestUserLocation(sock, sender, false); return true; }
      if (lowerText === "2") { await requestUserLocation(sock, sender, true); return true; }
      if (lowerText === "3") {
        await sendLabInteractive(sock, sender,
          "🚌 *Booking Confirmation Example*\\n\\nA customer has requested a Sukoon bus booking. Quick replies let the customer answer in one tap. Select a response below:",
          [
            { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Confirm Booking", id: "demo_booking_confirm" }) },
            { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Need Changes", id: "demo_booking_changes" }) },
            { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Cancel Request", id: "demo_booking_cancel" }) }
          ], "Quick Reply • Booking");
        return true;
      }
      if (lowerText === "4") {
        await sendLabInteractive(sock, sender,
          "📋 *Booking Status Example*\\n\\nSelect the current status of a customer's booking. Your bot receives the selected row ID and can update the booking record accordingly.",
          [
            { name: "single_select", buttonParamsJson: JSON.stringify({ title: "Update Booking Status", sections: [
              { title: "Booking Status", rows: [
                { title: "Pending", description: "Request received, not confirmed", id: "demo_status_pending" },
                { title: "Confirmed", description: "Seat/bus booking confirmed", id: "demo_status_confirmed" },
                { title: "Completed", description: "Journey or booking completed", id: "demo_status_completed" },
                { title: "Cancelled", description: "Booking cancelled", id: "demo_status_cancelled" }
              ]}
            ]}) }
          ], "Single Select • Booking Status");
        return true;
      }
      if (lowerText === "5") {
        await sendLabInteractive(sock, sender,
          "🔗 *CTA Buttons • Sukoon Examples*\\n\\nChoose an action button example. CTA buttons perform an action such as opening a map, copying a booking reference, or starting a phone call. They do not send a reply selection back to the bot.",
          [
            { name: "single_select", buttonParamsJson: JSON.stringify({ title: "Choose CTA Example", sections: [
              { title: "Customer Actions", rows: [
                { title: "Open Route Map", description: "Open a Google Maps search", id: "test_cta_url" },
                { title: "Copy Booking Reference", description: "Copy a sample booking ID", id: "test_cta_copy" },
                { title: "Call Booking Desk", description: "Demo phone number only", id: "test_cta_call" }
              ]}
            ]}) }
          ], "CTA Buttons • Sukoon");
        return true;
      }
    }

    if (lowerText.startsWith('test_location_received|') && interactiveLabSessions.has(sender)) {
      const [, locationType, latitude, longitude] = text.split('|');
      return handleInteractiveLabLocation(sock, sender, {
        degreesLatitude: Number(latitude), degreesLongitude: Number(longitude)
      }, locationType === "live");
    }

    if (lowerText.startsWith('test_')) {
      const testReplies = {
        test_quick_a: "✅ Quick Reply A received. Native-flow response parsing is working.",
        test_quick_b: "✅ Quick Reply B received. Native-flow response parsing is working.",
        test_list_demo: "✅ Single Select List selection received successfully.",
        test_quick_demo: "✅ Quick Reply navigation received successfully.",
        test_list_1: "✅ List row 1 received successfully.",
        test_list_2: "✅ List row 2 received successfully.",
        demo_booking_confirm: "✅ *Booking reply: Confirm Booking*\\n\\nIn your Booking module, map this response ID to booking status *Confirmed* after validating the booking record.",
        demo_booking_changes: "📝 *Booking reply: Need Changes*\\n\\nYour bot can ask the customer which date, pickup point, or passenger detail needs correction.",
        demo_booking_cancel: "❌ *Booking reply: Cancel Request*\\n\\nYour bot can start a cancellation confirmation flow before changing the booking status.",
        demo_status_pending: "📋 Selected *Pending*. Your booking handler can save this status against the selected Booking ID.",
        demo_status_confirmed: "✅ Selected *Confirmed*. Your booking handler can save this status against the selected Booking ID.",
        demo_status_completed: "🏁 Selected *Completed*. Your booking handler can save this status against the selected Booking ID.",
        demo_status_cancelled: "❌ Selected *Cancelled*. Your booking handler can save this status against the selected Booking ID."
      };

      if (lowerText === 'test_back') {
        interactiveLabSessions.delete(sender);
        await showMainMenu(sock, sender);
        return true;
      }

      if (lowerText === 'test_location_request') {
        try {
          await showInteractiveLocationRequest(sock, sender);
        } catch (error) {
          await sock.sendMessage(sender, { text: "⚠️ Location request button is experimental or unsupported in this client. Share your location manually using 📎 > Location.\n\nError: " + (error?.message || "Unknown error") });
        }
        return true;
      }

      if (['test_cta_url', 'test_cta_copy', 'test_cta_call'].includes(lowerText)) {
        try {
          await showInteractiveCtaTest(sock, sender, lowerText);
        } catch (error) {
          await sock.sendMessage(sender, { text: "⚠️ CTA interactive test could not be delivered.\n\n" + (error?.message || "Unknown error") + "\n\nReply *test_quick_demo* to return to the lab." });
        }
        return true;
      }

      if (testReplies[lowerText]) {
        await sock.sendMessage(sender, { text: testReplies[lowerText] });
        try {
          await showInteractiveTestMenu(sock, sender);
        } catch (error) {
          await sendInteractiveLabFallback(sock, sender, error);
        }
        return true;
      }

      await sock.sendMessage(sender, { text: "⚠️ Unknown test selection. Reply *test_quick_demo* to reopen the lab menu." });
      return true;
    }

    if (resolvedCommand === 'reports') {
      const { setMenuMode } = await import('./menu-state.js');
      setMenuMode(sender, 'report');
      const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
      const menuText = `📈 *Reports* (*${regNumber}*)

Enter Average Command (e.g., Average Today, Average Nov, Average From 15/09/2026 to 20/09/2026):

🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;
      await sock.sendMessage(sender, { text: menuText });
      return true;
    }
  } else if (state.mode && !state.submode) {
    // Handle navigation within mode menus (submenu selection)
    if (resolvedCommand === 'help') {
      if (state.mode === 'daily') {
        await showDailyDataHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingDataHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'data') {
      if (state.mode === 'booking') {
        setMenuSubmode(sender, 'data');
        await showBookingDataHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'status') {
      if (state.mode === 'booking') {
        setMenuSubmode(sender, 'status');
        await showBookingStatusHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'reports') {
      if (state.mode === 'booking') {
        setMenuSubmode(sender, 'reports');
        await showBookingReportsHelp(sock, sender);
      }
      return true;
    }
  } else if (state.submode) {
    // Handle help command within submodes
    if (resolvedCommand === 'help') {
      if (state.mode === 'booking' && state.submode === 'data') {
        await showBookingDataHelp(sock, sender);
      } else if (state.mode === 'booking' && state.submode === 'status') {
        await showBookingStatusHelp(sock, sender);
      } else if (state.mode === 'booking' && state.submode === 'reports') {
        await showBookingReportsHelp(sock, sender);
      }
      return true;
    }
  }

  // Message was not handled by menu system - let feature handlers process it
  return false;
}
