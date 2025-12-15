/**
 * menu-state.js - User Menu State Management
 * 
 * This module manages the navigation state for each user in the WhatsApp bot.
 * It tracks:
 * - Current menu mode (daily/booking)
 * - Current submenu (data/status/reports)
 * - Selected bus information
 * - Authentication status
 * - Available buses for the user
 * 
 * State is stored in global.menuState object, keyed by sender ID.
 */

// Initialize global menu state object if it doesn't exist
if (!global.menuState) global.menuState = {};

/**
 * Get the menu state for a specific user
 * Creates a new default state if the user doesn't have one
 * 
 * @param {string} sender - The WhatsApp sender ID (phone@s.whatsapp.net)
 * @returns {Object} The user's menu state object
 */
export function getMenuState(sender) {
  if (!global.menuState[sender]) {
    global.menuState[sender] = {
      mode: null,              // Current menu mode: 'daily', 'booking', or null (main menu)
      submode: null,           // Current submenu: 'data', 'status', 'reports', or null
      selectedBus: null,       // Bus code of the currently selected bus
      isAuthenticated: false,  // Whether the user has logged in with 'entry'
      user: null,              // User object from users.json
      availableBuses: [],      // Array of buses the user has access to
      awaitingBusSelection: false  // True when waiting for user to select a bus
    };
  }
  return global.menuState[sender];
}

/**
 * Set the main menu mode for a user
 * Resets submode when changing modes
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} mode - The mode to set ('daily', 'booking', or null)
 */
export function setMenuMode(sender, mode) {
  const state = getMenuState(sender);
  state.mode = mode;
  state.submode = null;  // Reset submode when changing main mode
}

/**
 * Set the submenu mode for a user
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} submode - The submode to set ('data', 'status', 'reports', or null)
 */
export function setMenuSubmode(sender, submode) {
  const state = getMenuState(sender);
  state.submode = submode;
}

/**
 * Set the selected bus for a user
 * Also clears the awaiting bus selection flag
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @param {string} busCode - The bus code (e.g., 'BUS001')
 * @param {Object|null} busInfo - Optional full bus object with registration number etc.
 */
export function setSelectedBus(sender, busCode, busInfo = null) {
  const state = getMenuState(sender);
  state.selectedBus = busCode;
  state.awaitingBusSelection = false;
  if (busInfo) {
    state.selectedBusInfo = busInfo;
  }
}

/**
 * Mark a user as authenticated and store their user info and available buses
 * Called after successful 'entry' command
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @param {Object} user - The user object from users.json
 * @param {Array} buses - Array of bus objects the user has access to
 */
export function setUserAuthenticated(sender, user, buses) {
  const state = getMenuState(sender);
  state.isAuthenticated = true;
  state.user = user;
  state.availableBuses = buses;
}

/**
 * Set whether the user is currently selecting a bus
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @param {boolean} awaiting - True if waiting for bus selection
 */
export function setAwaitingBusSelection(sender, awaiting) {
  const state = getMenuState(sender);
  state.awaitingBusSelection = awaiting;
}

/**
 * Get the currently selected bus code for a user
 * 
 * @param {string} sender - The WhatsApp sender ID
 * @returns {string|null} The selected bus code or null
 */
export function getSelectedBus(sender) {
  const state = getMenuState(sender);
  return state.selectedBus;
}

/**
 * Completely clear a user's menu state (full logout)
 * Resets all values to their defaults
 * 
 * @param {string} sender - The WhatsApp sender ID
 */
export function clearMenuState(sender) {
  global.menuState[sender] = {
    mode: null,
    submode: null,
    selectedBus: null,
    isAuthenticated: false,
    user: null,
    availableBuses: [],
    awaitingBusSelection: false
  };
}

/**
 * Exit to the home/main menu
 * Clears mode and submode but keeps authentication and bus selection
 * 
 * @param {string} sender - The WhatsApp sender ID
 */
export function exitToHome(sender) {
  const state = getMenuState(sender);
  state.mode = null;
  state.submode = null;
}

/**
 * Navigate back one level in the menu hierarchy
 * If in submode, clears submode. If in mode, clears mode.
 * 
 * @param {string} sender - The WhatsApp sender ID
 */
export function exitToPreviousLevel(sender) {
  const state = getMenuState(sender);
  if (state.submode) {
    state.submode = null;  // Go from submode back to mode menu
  } else if (state.mode) {
    state.mode = null;     // Go from mode back to main menu
  }
}

/**
 * Switch to a different bus
 * Clears bus selection and any active data sessions, then prompts for new bus
 * 
 * @param {string} sender - The WhatsApp sender ID
 */
export function switchBus(sender) {
  const state = getMenuState(sender);
  state.selectedBus = null;
  state.selectedBusInfo = null;
  state.mode = null;
  state.submode = null;
  state.awaitingBusSelection = true;
  
  // Clear any active data entry sessions for this user
  if (global.userData && global.userData[sender]) {
    delete global.userData[sender];
  }
  if (global.bookingData && global.bookingData[sender]) {
    delete global.bookingData[sender];
  }
}

/**
 * Perform a full logout for a user
 * Clears all state including authentication
 * 
 * @param {string} sender - The WhatsApp sender ID
 */
export function fullLogout(sender) {
  clearMenuState(sender);
}
