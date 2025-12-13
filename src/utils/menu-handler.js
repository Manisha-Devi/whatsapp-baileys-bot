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

export function showMainMenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `🏠 *Main Menu* (*${regNumber}*)

Please select an option:

📊 Reply *Daily* or *D* - for Daily Reports
🚌 Reply *Booking* or *B* - for Booking Management
🔄 Reply *Switch* or *S* - to change bus
🚪 Reply *Exit* or *E* - to close menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

export function showBusSelectionMenu(sock, sender) {
  const state = getMenuState(sender);
  const buses = state.availableBuses;
  const user = state.user;
  
  if (!buses || buses.length === 0) {
    return sock.sendMessage(sender, {
      text: "⚠️ No buses available. Please contact admin."
    });
  }
  
  const menuText = formatBusSelectionMenu(buses, user?.role === 'Admin');
  return sock.sendMessage(sender, { text: menuText });
}

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

export function showBookingSubmenu(sock, sender) {
  const state = getMenuState(sender);
  const busCode = state.selectedBus || 'N/A';
  
  const menuText = `🚌 *Booking Menu*
🚌 Bus: *${busCode}*

Please select an option:

📝 Reply *Data* or *D* - for Booking Entry
📋 Reply *Status* or *S* - for Status Management
❓ Reply *Help* or *H* - for Help with Commands
📊 Reply *Reports* or *R* - to View Booking Reports
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

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

export function showBookingDataHelp(sock, sender) {
  const helpText = `🚌 *Booking Data Entry*

You can now enter fields directly without typing "booking":

*Example:*
Customer Name Rahul Sharma
Customer Phone 9876543210
Pickup Location Delhi
Drop Location Agra
Travel Date 20/11/2025
Vehicle Type Tempo Traveller
Number of Passengers 12
Total Fare 8000
Advance Paid 3000
Submit

*Commands:*
• *Help* - Show this help
• *Exit* - Back to Booking Menu
• *Clear* - Clear current session

Start entering your data now!`;

  return sock.sendMessage(sender, { text: helpText });
}

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

*📈 Average Profit Reports:*
• *Average Today* - Today's profit
• *Average This Week* - Weekly average profit
• *Average This Month* - Monthly average profit
• *Average This Year* - Yearly average profit

*Other Commands:*
• *Help* - Show this help
• *Exit* - Back to Daily Menu

Enter your report query now!`;

  return sock.sendMessage(sender, { text: helpText });
}

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
  }
  
  return path;
}

const commandAliases = {
  'entry': ['entry'],
  'exit': ['exit', 'e'],
  'home': ['home'],
  'menu': ['menu'],
  'daily': ['daily'],
  'booking': ['booking'],
  'data': ['data', 'd'],
  'status': ['status', 's'],
  'reports': ['reports', 'r'],
  'help': ['help', 'h'],
  'yes': ['yes', 'y'],
  'no': ['no', 'n'],
  'switch': ['switch', 'sw']
};

export function resolveCommand(input, menuState = null) {
  const lower = input.toLowerCase().trim();
  
  const isMainMenu = menuState && menuState.mode === null && menuState.selectedBus;
  const isInSubmenu = menuState && menuState.mode !== null && menuState.submode === null;
  
  if (isMainMenu) {
    const mainMenuAliases = {
      'd': 'daily',
      'b': 'booking',
      's': 'switch'
    };
    if (mainMenuAliases[lower]) {
      return mainMenuAliases[lower];
    }
  }
  
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
  
  for (const [command, aliases] of Object.entries(commandAliases)) {
    if (aliases.includes(lower)) {
      return command;
    }
  }
  return lower;
}

function extractPhoneFromSender(sender) {
  const match = sender.match(/^(\d+)@/);
  return match ? match[1] : null;
}

export async function handleMenuNavigation(sock, sender, text) {
  if (!sender || sender.endsWith("@g.us") || sender.endsWith("@broadcast")) {
    return false;
  }

  const state = getMenuState(sender);
  const lowerText = text.toLowerCase().trim();
  const resolvedCommand = resolveCommand(text, state);

  if (resolvedCommand === 'entry') {
    const phoneNumber = extractPhoneFromSender(sender);
    const user = getUserByPhone(phoneNumber);
    
    if (!user) {
      await sock.sendMessage(sender, {
        text: "❌ *Access Denied*\n\nYour number is not registered in the system.\nPlease contact admin for access."
      });
      return true;
    }
    
    const buses = getBusesForUser(user);
    
    if (buses.length === 0) {
      await sock.sendMessage(sender, {
        text: "⚠️ No buses assigned to you. Please contact admin."
      });
      return true;
    }
    
    setUserAuthenticated(sender, user, buses);
    
    if (buses.length === 1) {
      setSelectedBus(sender, buses[0].busCode, buses[0]);
      await sock.sendMessage(sender, {
        text: `✅ Auto-selected bus: *${buses[0].busCode}* (${buses[0].registrationNumber})`
      });
      await showMainMenu(sock, sender);
    } else {
      setAwaitingBusSelection(sender, true);
      await showBusSelectionMenu(sock, sender);
    }
    return true;
  }

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
      await sock.sendMessage(sender, {
        text: `❌ Invalid selection. Please enter a number between 1 and ${buses.length}.`
      });
      return true;
    }
  }

  if (!state.isAuthenticated || !state.selectedBus) {
    if (!state.awaitingBusSelection) {
      await sock.sendMessage(sender, {
        text: "⚠️ Please type *Entry* first to get started."
      });
      return true;
    }
    return false;
  }

  if (resolvedCommand === 'switch') {
    switchBus(sender);
    setAwaitingBusSelection(sender, true);
    await showBusSelectionMenu(sock, sender);
    return true;
  }

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

  if (lowerText === 'daily help') {
    await showDailyDataHelp(sock, sender);
    return true;
  }

  if (lowerText === 'booking help') {
    await showBookingDataHelp(sock, sender);
    return true;
  }

  if (resolvedCommand === 'exit' || resolvedCommand === 'home') {
    const currentMode = state.mode;
    const currentSubmode = state.submode;

    if (currentSubmode) {
      exitToPreviousLevel(sender);
      if (currentMode === 'daily') {
        await showDailySubmenu(sock, sender);
      } else if (currentMode === 'booking') {
        await showBookingSubmenu(sock, sender);
      }
      return true;
    } else if (currentMode) {
      exitToHome(sender);
      await showMainMenu(sock, sender);
      return true;
    } else {
      fullLogout(sender);
      await sock.sendMessage(sender, { 
        text: "👋 Menu closed. Send *Entry* anytime to open the menu again." 
      });
      return true;
    }
  }

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
  } else if (state.mode && !state.submode) {
    if (resolvedCommand === 'help') {
      if (state.mode === 'daily') {
        await showDailyDataHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingSubmenu(sock, sender);
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

  return false;
}
