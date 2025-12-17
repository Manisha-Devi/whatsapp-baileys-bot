/**
 * db.js - Database Management Module
 * 
 * This module manages all JSON-based databases for the WhatsApp bot application.
 * It uses LowDB for persistent JSON file storage and handles:
 * - Daily reports data (daily_data.json)
 * - Booking records (bookings_data.json)
 * - Cash deposit records (cash_data.json)
 * 
 * Each database file is automatically created if missing or corrupted.
 */

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "fs";

// Database file paths - stored in the storage directory
const dailyDataFile = "./storage/daily_data.json";
const bookingsDataFile = "./storage/bookings_data.json";
const cashDataFile = "./storage/cash_data.json";

// Create daily_data.json if it doesn't exist or is empty
if (!fs.existsSync(dailyDataFile) || fs.statSync(dailyDataFile).size === 0) {
  fs.writeFileSync(dailyDataFile, JSON.stringify({}, null, 2));
}

// Create bookings_data.json if it doesn't exist or is empty
if (!fs.existsSync(bookingsDataFile) || fs.statSync(bookingsDataFile).size === 0) {
  fs.writeFileSync(bookingsDataFile, JSON.stringify({}, null, 2));
}

// Create cash_data.json if it doesn't exist or is empty
if (!fs.existsSync(cashDataFile) || fs.statSync(cashDataFile).size === 0) {
  fs.writeFileSync(cashDataFile, JSON.stringify({}, null, 2));
}

// Initialize daily_data.json database using LowDB
const dailyDataAdapter = new JSONFile(dailyDataFile);
const db = new Low(dailyDataAdapter, {});

try {
  await db.read();
  if (!db.data || typeof db.data !== "object") {
    db.data = {};
    await db.write();
  }
} catch (err) {
  console.error("⚠️ daily_data.json corrupted, resetting...");
  db.data = {};
  await db.write();
}

// Initialize bookings_data.json database using LowDB
const bookingsDataAdapter = new JSONFile(bookingsDataFile);
const bookingsDb = new Low(bookingsDataAdapter, {});

try {
  await bookingsDb.read();
  if (!bookingsDb.data || typeof bookingsDb.data !== "object") {
    bookingsDb.data = {};
    await bookingsDb.write();
  }
} catch (err) {
  console.error("⚠️ bookings_data.json corrupted, resetting...");
  bookingsDb.data = {};
  await bookingsDb.write();
}

// Initialize cash_data.json database using LowDB
const cashDataAdapter = new JSONFile(cashDataFile);
const cashDb = new Low(cashDataAdapter, {});

try {
  await cashDb.read();
  if (!cashDb.data || typeof cashDb.data !== "object") {
    cashDb.data = {};
    await cashDb.write();
  }
} catch (err) {
  console.error("⚠️ cash_data.json corrupted, resetting...");
  cashDb.data = {};
  await cashDb.write();
}

// Dummy exports for backward compatibility (status files removed)
const statusDb = { data: [], read: async () => {}, write: async () => {} };
const bookingsStatusDb = { data: [], read: async () => {}, write: async () => {} };

// Export daily data database as default (main database)
export default db;

// Export additional databases for use in other modules
export { bookingsDb, cashDb, statusDb, bookingsStatusDb };
