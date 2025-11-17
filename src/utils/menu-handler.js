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

📊 Reply *Daily* - for Daily Reports
🚌 Reply *Booking* - for Booking Management
🚪 Reply *Exit* - to close menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

export function showDailySubmenu(sock, sender) {
  const menuText = `📊 *Daily Reports Menu*

Please select an option:

📝 Reply *Data* - for Data Entry
📋 Reply *Status* - for Status Management
🔙 Reply *Exit* - to go back to Main Menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

export function showBookingSubmenu(sock, sender) {
  const menuText = `🚌 *Booking Menu*

Please select an option:

📝 Reply *Data* - for Booking Entry
📋 Reply *Status* - for Status Management
🔙 Reply *Exit* - to go back to Main Menu

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
• status initiated
• status collected
• status deposited

*Update Status:*
• update status 15/11/2025 collected
• update status 10/11/2025 to 15/11/2025 deposited

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

export async function handleMenuNavigation(sock, sender, text) {
  if (!sender || sender.endsWith("@g.us") || sender.endsWith("@broadcast")) {
    return false;
  }

  const state = getMenuState(sender);
  const lowerText = text.toLowerCase().trim();

  if (lowerText === 'entry' || lowerText === 'menu') {
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

  if (lowerText === 'exit' || lowerText === 'home') {
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
    if (lowerText === 'daily') {
      setMenuMode(sender, 'daily');
      await showDailySubmenu(sock, sender);
      return true;
    }
    if (lowerText === 'booking') {
      setMenuMode(sender, 'booking');
      await showBookingSubmenu(sock, sender);
      return true;
    }
  } else if (state.mode && !state.submode) {
    if (lowerText === 'data') {
      setMenuSubmode(sender, 'data');
      if (state.mode === 'daily') {
        await showDailyDataHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingDataHelp(sock, sender);
      }
      return true;
    }
    if (lowerText === 'status') {
      setMenuSubmode(sender, 'status');
      if (state.mode === 'daily') {
        await showDailyStatusHelp(sock, sender);
      } else if (state.mode === 'booking') {
        await showBookingStatusHelp(sock, sender);
      }
      return true;
    }
  } else if (state.submode) {
    if (lowerText === 'help') {
      if (state.mode === 'daily' && state.submode === 'data') {
        await showDailyDataHelp(sock, sender);
      } else if (state.mode === 'daily' && state.submode === 'status') {
        await showDailyStatusHelp(sock, sender);
      } else if (state.mode === 'booking' && state.submode === 'data') {
        await showBookingDataHelp(sock, sender);
      } else if (state.mode === 'booking' && state.submode === 'status') {
        await showBookingStatusHelp(sock, sender);
      }
      return true;
    }
  }

  return false;
}
