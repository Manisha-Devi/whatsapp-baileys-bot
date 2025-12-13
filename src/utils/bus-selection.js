import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '../data/users.json');
const busesFilePath = path.join(__dirname, '../data/buses.json');

function loadUsers() {
  try {
    const data = fs.readFileSync(usersFilePath, 'utf8');
    return JSON.parse(data).users || [];
  } catch (err) {
    console.error('Error loading users:', err);
    return [];
  }
}

function loadBuses() {
  try {
    const data = fs.readFileSync(busesFilePath, 'utf8');
    return JSON.parse(data).buses || [];
  } catch (err) {
    console.error('Error loading buses:', err);
    return [];
  }
}

export function getUserByPhone(phoneNumber) {
  const users = loadUsers();
  const cleanId = phoneNumber.replace(/\D/g, '');
  
  console.log(`🔍 Looking for internalId: ${cleanId}`);
  
  const user = users.find(user => {
    const userInternalId = (user.internalId || '').replace(/\D/g, '');
    const match = userInternalId === cleanId && user.status === 'Active';
    if (match) console.log(`✅ Matched user: ${user.firstName} ${user.lastName}`);
    return match;
  });
  
  if (!user) {
    const cleanPhone = cleanId.slice(-10);
    console.log(`🔍 Fallback: checking phone (last 10 digits): ${cleanPhone}`);
    return users.find(u => {
      const userPhone = u.phone.replace(/\D/g, '').slice(-10);
      return userPhone === cleanPhone && u.status === 'Active';
    });
  }
  
  return user;
}

export function getBusesByCode(busCodes) {
  const buses = loadBuses();
  if (!busCodes || busCodes.length === 0) {
    return buses.filter(bus => bus.status === 'Active');
  }
  return buses.filter(bus => busCodes.includes(bus.busCode));
}

export function getAllActiveBuses() {
  const buses = loadBuses();
  return buses.filter(bus => bus.status === 'Active');
}

export function getBusesForUser(user) {
  if (!user) return [];
  
  if (user.role === 'Admin') {
    return getAllActiveBuses();
  }
  
  return getBusesByCode(user.assignedBuses);
}

export function formatBusSelectionMenu(buses, isAdmin = false) {
  let menuText = `🚌 *Select Bus*\n\n`;
  
  if (isAdmin) {
    menuText += `You have access to all buses. Please select one:\n\n`;
  } else if (buses.length > 1) {
    menuText += `You are assigned to multiple buses. Please select one:\n\n`;
  }
  
  buses.forEach((bus, index) => {
    const num = index + 1;
    const statusEmoji = bus.status === 'Active' ? '✅' : '🔧';
    menuText += `${num}️⃣ ${bus.busCode} - ${bus.registrationNumber} ${statusEmoji}\n`;
  });
  
  menuText += `\nReply with bus number (1`;
  if (buses.length > 1) {
    menuText += ` to ${buses.length}`;
  }
  menuText += `):`;
  
  return menuText;
}

export function getBusBySelection(buses, selection) {
  const num = parseInt(selection);
  if (isNaN(num) || num < 1 || num > buses.length) {
    return null;
  }
  return buses[num - 1];
}

export function showBusSelectionMenu(sock, sender, user) {
  const buses = getBusesForUser(user);
  
  if (buses.length === 0) {
    return sock.sendMessage(sender, {
      text: "⚠️ No buses assigned to you. Please contact admin."
    });
  }
  
  if (buses.length === 1) {
    return { autoSelect: true, bus: buses[0] };
  }
  
  // Try native buttons
  try {
    const buttons = buses.map((bus, index) => ({
      buttonId: `${index + 1}`,
      buttonText: { displayText: `${bus.busCode} - ${bus.registrationNumber}` },
      type: 1
    }));
    
    sock.sendMessage(sender, {
      text: `🚌 *Select Bus*\n\n${user.role === 'Admin' ? 'You have access to all buses.' : 'You are assigned to multiple buses.'}`,
      footer: 'Tap to select',
      buttons: buttons,
      headerType: 1
    }).catch(() => {
      // Fallback to text menu if buttons fail
      const menuText = formatBusSelectionMenu(buses, user.role === 'Admin');
      sock.sendMessage(sender, { text: menuText });
    });
  } catch (err) {
    // Fallback to text menu
    const menuText = formatBusSelectionMenu(buses, user.role === 'Admin');
    sock.sendMessage(sender, { text: menuText });
  }
  
  return { autoSelect: false, buses: buses };
}
