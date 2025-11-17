import { 
  getMenuState, 
  setMenuMode, 
  setMenuSubmode, 
  exitToHome, 
  exitToPreviousLevel 
} from './menu-state.js';

export function showMainMenu(sock, sender) {
  const menuText = `🏠 *Main Menu*

Please select an option:

📊 Reply *Daily* or *D* - for Daily Reports
🚌 Reply *Booking* or *B* - for Booking Management
🚪 Reply *Exit* or *E* - to close menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

export function showDailySubmenu(sock, sender) {
  const menuText = `📊 *Daily Reports Menu*

Please select an option:

📝 Reply *Data* or *D* - for Data Entry
📋 Reply *Status* or *S* - for Status Management
❓ Reply *Help* or *H* - for Help with Commands
📊 Reply *Reports* or *R* - to View Daily Reports
🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

export function showBookingSubmenu(sock, sender) {
  const menuText = `🚌 *Booking Menu*

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
  const helpText = `📊 *Daily Data Entry*

You can now enter fields directly without typing "daily":

*Example:*
Dated 15/11/2025
Diesel 5000
Adda 200
Union 150
Total Cash Collection 25000
Online 3000
Remarks All ok
Submit

*Commands:*
• *Help* - Show this help
• *Exit* - Back to Daily Menu
• *Clear* - Clear current session

Start entering your data now!`;

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
  'no': ['no', 'n']
};

export function resolveCommand(input, menuState = null) {
  const lower = input.toLowerCase().trim();
  
  const isMainMenu = menuState && menuState.mode === null;
  const isInSubmenu = menuState && menuState.mode !== null && menuState.submode === null;
  
  if (isMainMenu) {
    const mainMenuAliases = {
      'd': 'daily',
      'b': 'booking'
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

export async function handleMenuNavigation(sock, sender, text) {
  if (!sender || sender.endsWith("@g.us") || sender.endsWith("@broadcast")) {
    return false;
  }

  const state = getMenuState(sender);
  const lowerText = text.toLowerCase().trim();
  const resolvedCommand = resolveCommand(text, state);

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

  if (resolvedCommand === 'entry') {
    exitToHome(sender);
    await showMainMenu(sock, sender);
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
      exitToHome(sender);
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
    if (resolvedCommand === 'data') {
      setMenuSubmode(sender, 'data');
      if (state.mode === 'daily') {
        await showDailyDataHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingDataHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'status') {
      setMenuSubmode(sender, 'status');
      if (state.mode === 'daily') {
        await showDailyStatusHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingStatusHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'reports') {
      setMenuSubmode(sender, 'reports');
      if (state.mode === 'daily') {
        await showDailyReportsHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingReportsHelp(sock, sender);
      }
      return true;
    }
    if (resolvedCommand === 'help') {
      if (state.mode === 'daily') {
        await showDailySubmenu(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingSubmenu(sock, sender);
      }
      return true;
    }
  } else if (state.submode) {
    if (resolvedCommand === 'help') {
      if (state.mode === 'daily' && state.submode === 'data') {
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
  }

  return false;
}
