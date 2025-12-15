/**
 * bus-selection.js - Bus Selection and User Authentication
 * 
 * This module handles:
 * - Loading user data from users.json
 * - Loading bus data from buses.json
 * - Authenticating users by phone number
 * - Determining which buses a user has access to
 * - Formatting the bus selection menu
 * - Processing bus selection responses
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory path (required for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to data files
const usersFilePath = path.join(__dirname, '../data/users.json');
const busesFilePath = path.join(__dirname, '../data/buses.json');

/**
 * Load all users from the users.json file
 * 
 * @returns {Array} Array of user objects, or empty array if file not found
 */
function loadUsers() {
  try {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data).users || [];
  } catch (err) {
    console.error('Error loading users:', err);
    return [];
  }
}

/**
 * Load all buses from the buses.json file
 * 
 * @returns {Array} Array of bus objects, or empty array if file not found
 */
function loadBuses() {
  try {
    const data = fs.readFileSync(busesFilePath, 'utf8');
    return JSON.parse(data).buses || [];
  } catch (err) {
    console.error('Error loading buses:', err);
    return [];
  }
}

/**
 * Find a user by their phone number
 * First tries to match by internalId, then falls back to phone number
 * Only returns active users
 * 
 * @param {string} phoneNumber - The phone number to search for
 * @returns {Object|undefined} The matching user object or undefined
 */
export function getUserByPhone(phoneNumber) {
  const users = loadUsers();
  // Remove all non-digit characters from the phone number
  const cleanId = phoneNumber.replace(/\D/g, '');
  
  console.log(`🔍 Looking for internalId: ${cleanId}`);
  
  // First try to match by internalId (preferred method)
  const user = users.find(user => {
    const userInternalId = (user.internalId || '').replace(/\D/g, '');
    const match = userInternalId === cleanId && user.status === 'Active';
    if (match) console.log(`✅ Matched user: ${user.firstName} ${user.lastName}`);
    return match;
  });
  
  // If no match by internalId, try matching by phone number (last 10 digits)
  if (!user) {
    const cleanPhone = cleanId.slice(-10);  // Take last 10 digits
    console.log(`🔍 Fallback: checking phone (last 10 digits): ${cleanPhone}`);
    return users.find(u => {
      const userPhone = u.phone.replace(/\D/g, '').slice(-10);
      return userPhone === cleanPhone && u.status === 'Active';
    });
  }
  
  return user;
}

/**
 * Get bus objects by their bus codes
 * If no codes provided, returns all active buses
 * 
 * @param {Array|null} busCodes - Array of bus codes to filter by
 * @returns {Array} Array of matching bus objects
 */
export function getBusesByCode(busCodes) {
  const buses = loadBuses();
  if (!busCodes || busCodes.length === 0) {
    return buses.filter(bus => bus.status === 'Active');
  }
  return buses.filter(bus => busCodes.includes(bus.busCode));
}

/**
 * Get all active buses in the system
 * 
 * @returns {Array} Array of all active bus objects
 */
export function getAllActiveBuses() {
  const buses = loadBuses();
  return buses.filter(bus => bus.status === 'Active');
}

/**
 * Get the buses a specific user has access to
 * Admin users get access to all active buses
 * Regular users only get their assigned buses
 * 
 * @param {Object} user - The user object
 * @returns {Array} Array of bus objects the user can access
 */
export function getBusesForUser(user) {
  if (!user) return [];
  
  // Admins have access to all active buses
  if (user.role === 'Admin') {
    return getAllActiveBuses();
  }
  
  // Regular users only get their assigned buses
  return getBusesByCode(user.assignedBuses);
}

/**
 * Format the bus selection menu text for display
 * Shows numbered list of buses for the user to choose from
 * 
 * @param {Array} buses - Array of bus objects to display
 * @param {boolean} isAdmin - Whether the user is an admin (shows different header)
 * @returns {string} Formatted menu text for WhatsApp
 */
export function formatBusSelectionMenu(buses, isAdmin = false) {
  let menuText = `🚌 *Select Bus*\n\n`;
  
  // Show appropriate header based on user role
  if (isAdmin) {
    menuText += `You have access to all buses. Please select one:\n\n`;
  } else if (buses.length > 1) {
    menuText += `You are assigned to multiple buses. Please select one:\n\n`;
  }
  
  // List each bus with a number for selection
  buses.forEach((bus, index) => {
    const num = index + 1;
    const statusEmoji = bus.status === 'Active' ? '✅' : '🔧';
    menuText += `${num}️⃣ ${bus.busCode} - ${bus.registrationNumber} ${statusEmoji}\n`;
  });
  
  // Add instructions for selection
  menuText += `\nReply with bus number (1`;
  if (buses.length > 1) {
    menuText += ` to ${buses.length}`;
  }
  menuText += `):`;
  
  return menuText;
}

/**
 * Get a bus object from user's numeric selection
 * 
 * @param {Array} buses - The array of available buses
 * @param {string} selection - The user's input (should be a number)
 * @returns {Object|null} The selected bus object or null if invalid selection
 */
export function getBusBySelection(buses, selection) {
  const num = parseInt(selection);
  if (isNaN(num) || num < 1 || num > buses.length) {
    return null;
  }
  return buses[num - 1];  // Convert 1-based selection to 0-based index
}

/**
 * Show the bus selection menu to a user
 * If user has only one bus, auto-selects it
 * If user has multiple buses, shows selection menu
 * 
 * @param {Object} sock - The WhatsApp socket connection
 * @param {string} sender - The WhatsApp sender ID
 * @param {Object} user - The user object
 * @returns {Object|Promise} Either auto-select info or sends menu message
 */
export function showBusSelectionMenu(sock, sender, user) {
  const buses = getBusesForUser(user);
  
  // Handle case where user has no buses assigned
  if (buses.length === 0) {
    return sock.sendMessage(sender, {
      text: "⚠️ No buses assigned to you. Please contact admin."
    });
  }
  
  // Auto-select if only one bus is available
  if (buses.length === 1) {
    return { autoSelect: true, bus: buses[0] };
  }
  
  // Show selection menu for multiple buses
  const menuText = formatBusSelectionMenu(buses, user.role === 'Admin');
  sock.sendMessage(sender, { text: menuText });
  
  return { autoSelect: false, buses: buses };
}
