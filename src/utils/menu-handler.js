import { handleIncomingMessageFromReports } from '../features/reports/reports.js';
import { sendEmployeeSalaryReport } from '../features/employees/employee.js';
import { getEmployees } from './employees.js';
import { format, subMonths } from 'date-fns';
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
 * Shows options for Daily, Booking, Employee, Switch bus, and Exit
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 */
export function showMainMenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
  
  const menuText = `🏠 *Main Menu* (*${regNumber}*)

Please select an option:

📊 Reply *Daily* or *D* - for Daily Reports
🚌 Reply *Booking* or *B* - for Booking Management
💵 Reply *Cash* or *C* - for Cash Management
📈 Reply *Report* or *R* - for Reports
👥 Reply *Employee* or *Emp* - for Employee Management
🔄 Reply *Switch* or *S* - to change bus
🚪 Reply *Exit* or *E* - to close menu

Type your choice:`;

  return sock.sendMessage(sender, { text: menuText });
}

/**
 * Display the Employee submenu.
 * Add, Update, and Delete are intentionally unavailable until CRUD support
 * is implemented. Salary is currently the only active option.
 */
export function showEmployeeSubmenu(sock, sender) {
  const state = getMenuState(sender);
  const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';

  const menuText = `👥 *Employee Menu* (*${regNumber}*)

Select an option:

1️⃣ *Add* - Coming soon
2️⃣ *Update* - Coming soon
3️⃣ *Delete* - Coming soon
4️⃣ *Salary* - View employee salary report

Reply *Salary* or *4* to select an employee and view salary.
Reply *Exit* or *E* to go back to Main Menu.`;

  return sock.sendMessage(sender, { text: menuText });
}

function getEmployeeDisplayName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || employee.role || employee.id;
}

function getSelectedEmployee(state) {
  return getEmployees().find(
    (employee) =>
      employee.id === state.selectedEmployeeId &&
      employee.busCode === state.selectedBus
  );
}

export function showEmployeeSalaryList(sock, sender) {
  const state = getMenuState(sender);
  const employees = getEmployees().filter(
    (employee) => employee.busCode === state.selectedBus
  );
  const activeEmployees = employees.filter((employee) => employee.status === "Active");
  const inactiveEmployees = employees.filter((employee) => employee.status !== "Active");
  const orderedEmployees = [...activeEmployees, ...inactiveEmployees];

  state.employeeView = "salary-list";
  state.employeeOptions = orderedEmployees.map((employee) => employee.id);

  const lines = [
    "💰 *Employee Salary Menu*",
    `🚌 Vehicle Number: *${state.selectedBusInfo?.registrationNumber || state.selectedBus}*`,
    `🔢 Bus No: *${String(state.selectedBus || "").replace(/^BUS/i, "")}*`,
    "",
  ];

  let serial = 1;
  if (activeEmployees.length > 0) {
    lines.push("*Active Employees:*");
    activeEmployees.forEach((employee) => {
      lines.push(`${serial++}️⃣ ${getEmployeeDisplayName(employee)} (${employee.role || "Employee"})`);
    });
    lines.push("");
  }

  if (inactiveEmployees.length > 0) {
    lines.push("*Inactive Employees:*");
    inactiveEmployees.forEach((employee) => {
      lines.push(`${serial++}️⃣ ${getEmployeeDisplayName(employee)} (${employee.role || "Employee"})`);
    });
    lines.push("");
  }

  if (orderedEmployees.length === 0) {
    lines.push("⚠️ No employees are linked to this bus.");
  } else {
    lines.push("Reply with the employee serial number to continue.");
  }
  lines.push("Reply *Exit* to return to Main Menu.");

  return sock.sendMessage(sender, { text: lines.join("\n") });
}

export function showSelectedEmployeeMenu(sock, sender) {
  const state = getMenuState(sender);
  const employee = getSelectedEmployee(state);
  if (!employee) {
    state.employeeView = "salary-list";
    return showEmployeeSalaryList(sock, sender);
  }

  const monthOptions = Array.from({ length: 13 }, (_, index) => {
    const month = subMonths(new Date(), index);
    const label = format(month, "MMMM yyyy");
    return { label, command: `salary ${label}` };
  });
  state.employeeMonthOptions = monthOptions;
  state.employeeView = "employee-months";

  const lines = [
    "👤 *Employee Selected*",
    `Name: *${getEmployeeDisplayName(employee)}*`,
    `Role: ${employee.role || "Employee"}`,
    `Status: ${employee.status || "Unknown"}`,
    "",
    "Select an option:",
    "1️⃣ Employee Details",
    ...monthOptions.map((option, index) => `${index + 2}️⃣ ${option.label}`),
    "",
    "Reply with a number.",
    "Reply *Exit* to return to Main Menu.",
  ];

  return sock.sendMessage(sender, { text: lines.join("\n") });
}

async function sendEmployeeDetails(sock, sender, employee) {
  const state = getMenuState(sender);
  const phone = employee.phone || "Not set";
  const vehicleNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus;
  const details = [
    "📄 *Employee Details*",
    `Employee Code: ${employee.id}`,
    `Name: ${getEmployeeDisplayName(employee)}`,
    `Role: ${employee.role || "Employee"}`,
    `Status: ${employee.status || "Unknown"}`,
    `Phone: ${phone}`,
    `Vehicle Number: ${vehicleNumber}`,
    `Bus No: ${String(state.selectedBus || "").replace(/^BUS/i, "")}`,
    `Joining Date: ${employee.joiningDate || "Not set"}`,
    `Resign Date: ${employee.resignDate || "Not set"}`,
    `Monthly Salary: ₹${(Number(employee.salary) || 0).toLocaleString("en-IN")}`,
    `Daily Salary: ₹${(Number(employee.daily) || 0).toLocaleString("en-IN")}`,
  ];
  await sock.sendMessage(sender, { text: details.join("\n") });
  await showSelectedEmployeeMenu(sock, sender);
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
• Entries - Last 5 saved entries
• Entries [Number] - Last N saved entries
• Last [Number] Entries
• This Month / Last Month
• Jan / January / July 2025
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
• *Last Month* - Previous month reports
• *Jul* or *July* - All entries for that month
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
• *Last Month* - Previous month bookings
• *Entries 5* or *Last 5 Entries* - Latest 5 bookings
• *Jul* or *July* - All bookings for that month
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
  'employee': ['employee', 'emp'],
  'salary': ['salary'],
  'add': ['add'],
  'update': ['update'],
  'delete': ['delete'],
  'help': ['help', 'h'],
  'yes': ['yes', 'y'],
  'no': ['no', 'n'],
  'switch': ['switch', 'sw']
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
    } else if (state.mode === 'employee' && !state.submode) {
      if (state.employeeView === "salary-list") {
        await showEmployeeSalaryList(sock, sender);
      } else if (state.employeeView === "employee-months") {
        await showSelectedEmployeeMenu(sock, sender);
      } else {
        await showEmployeeSubmenu(sock, sender);
      }
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
    if (resolvedCommand === 'employee') {
      setMenuMode(sender, 'employee');
      state.employeeView = null;
      state.selectedEmployeeId = null;
      state.employeeOptions = [];
      state.employeeMonthOptions = [];
      await showEmployeeSubmenu(sock, sender);
      return true;
    }
    if (resolvedCommand === 'cash') {
      setMenuMode(sender, 'cash');
      await showCashSubmenu(sock, sender);
      return true;
    }
    if (resolvedCommand === 'reports') {
      const { setMenuMode } = await import('./menu-state.js');
      setMenuMode(sender, 'report');
      const regNumber = state.selectedBusInfo?.registrationNumber || state.selectedBus || 'N/A';
      const menuText = `📈 *Reports* (*${regNumber}*)

Enter Average Command:

• Average Today
• Average This Month
• Average July 2025
• Average 1 Sept to 15 Sept
• Average 1 Sept 2025 to 15 Sept
• Average 1 Sept 2025 to 15 Sept 2025
• Type *Help* for all commands

🔙 Reply *Exit* or *E* - to go back to Main Menu

Type your choice:`;
      await sock.sendMessage(sender, { text: menuText });
      return true;
    }
  } else if (state.mode && !state.submode) {
    // Handle navigation within mode menus (submenu selection)
    if (state.mode === 'employee') {
      if (state.employeeView === "salary-list") {
        const selectedIndex = Number.parseInt(lowerText, 10) - 1;
        if (
          Number.isInteger(selectedIndex) &&
          selectedIndex >= 0 &&
          selectedIndex < state.employeeOptions.length
        ) {
          state.selectedEmployeeId = state.employeeOptions[selectedIndex];
          await showSelectedEmployeeMenu(sock, sender);
        } else {
          await sock.sendMessage(sender, {
            text: "⚠️ Invalid employee number. Please reply with one of the serial numbers shown.",
          });
        }
        return true;
      }

      if (state.employeeView === "employee-months") {
        if (lowerText === "1" || lowerText === "employee details") {
          const employee = getSelectedEmployee(state);
          if (employee) {
            await sendEmployeeDetails(sock, sender, employee);
          } else {
            await showEmployeeSalaryList(sock, sender);
          }
          return true;
        }

        const monthIndex = Number.parseInt(lowerText, 10) - 2;
        let monthCommand = null;
        if (
          Number.isInteger(monthIndex) &&
          monthIndex >= 0 &&
          monthIndex < state.employeeMonthOptions.length
        ) {
          monthCommand = state.employeeMonthOptions[monthIndex].command;
        } else {
          const monthOption = state.employeeMonthOptions.find(
            (option) => option.label.toLowerCase() === lowerText
          );
          if (monthOption) monthCommand = monthOption.command;
        }

        if (monthCommand) {
          await sendEmployeeSalaryReport(
            sock,
            sender,
            state,
            monthCommand,
            state.selectedEmployeeId
          );
          return true;
        }

        await sock.sendMessage(sender, {
          text: "⚠️ Invalid selection. Reply *1* for Employee Details or choose one of the displayed months.",
        });
        return true;
      }

      if (resolvedCommand === 'salary' || lowerText === '4') {
        await showEmployeeSalaryList(sock, sender);
        return true;
      }

      if (
        resolvedCommand === 'add' ||
        resolvedCommand === 'update' ||
        resolvedCommand === 'delete' ||
        ['1', '2', '3'].includes(lowerText)
      ) {
        await sock.sendMessage(sender, {
          text: "ℹ️ Employee Add, Update, and Delete are not available yet. They will be added later.\n\nReply *Salary* to select an employee or *Exit* to return to the Main Menu.",
        });
        return true;
      }

      if (resolvedCommand === 'help' || lowerText === 'menu') {
        await showEmployeeSubmenu(sock, sender);
        return true;
      }

      return false;
    }

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
