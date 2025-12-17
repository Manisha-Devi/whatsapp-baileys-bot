/**
 * db.js - Database Management Module
 * 
 * This module manages all JSON-based databases for the WhatsApp bot application.
 * It uses LowDB for persistent JSON file storage and handles:
 * - Daily reports data (daily_data.json)
 * - Daily report status tracking (daily_status.json)
 * - Booking records (bookings_data.json)
 * - Booking status tracking (bookings_status.json)
 * 
 * Each database file is automatically created if missing or corrupted.
 */

import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "fs";

// Database file paths - stored in the storage directory
const dailyDataFile = "./storage/daily_data.json";
const dailyStatusFile = "./storage/daily_status.json";
const bookingsDataFile = "./storage/bookings_data.json";
const bookingsStatusFile = "./storage/bookings_status.json";
const cashDataFile = "./storage/cash_data.json";

// Create daily_data.json if it doesn't exist or is empty
// This file stores daily report entries keyed by bus code and date
if (!fs.existsSync(dailyDataFile) || fs.statSync(dailyDataFile).size === 0) {
  fs.writeFileSync(dailyDataFile, JSON.stringify({}, null, 2));
}

// Create daily_status.json if it doesn't exist or is empty
// This file tracks the collection/deposit status of daily reports
if (!fs.existsSync(dailyStatusFile) || fs.statSync(dailyStatusFile).size === 0) {
  fs.writeFileSync(dailyStatusFile, JSON.stringify([], null, 2));
}

// Create bookings_data.json if it doesn't exist or is empty
// This file stores booking records keyed by booking ID
if (!fs.existsSync(bookingsDataFile) || fs.statSync(bookingsDataFile).size === 0) {
  fs.writeFileSync(bookingsDataFile, JSON.stringify({}, null, 2));
}

// Create bookings_status.json if it doesn't exist or is empty
// This file tracks the status of bookings (pending/confirmed/completed)
if (!fs.existsSync(bookingsStatusFile) || fs.statSync(bookingsStatusFile).size === 0) {
  fs.writeFileSync(bookingsStatusFile, JSON.stringify([], null, 2));
}

// Create cash_data.json if it doesn't exist or is empty
// This file stores cash deposit records
if (!fs.existsSync(cashDataFile) || fs.statSync(cashDataFile).size === 0) {
  fs.writeFileSync(cashDataFile, JSON.stringify({}, null, 2));
}

// Initialize daily_data.json database using LowDB
// Default structure is an empty object for storing daily entries
const dailyDataAdapter = new JSONFile(dailyDataFile);
const db = new Low(dailyDataAdapter, {});

// Read and validate daily data database
// If corrupted or invalid, reset to empty object
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

// Initialize daily_status.json database using LowDB
// Default structure is an empty array for status records
const dailyStatusAdapter = new JSONFile(dailyStatusFile);
const statusDb = new Low(dailyStatusAdapter, []);

// Read and validate daily status database
// If corrupted or invalid, reset to empty array
try {
  await statusDb.read();
  if (!Array.isArray(statusDb.data)) {
    statusDb.data = [];
    await statusDb.write();
  }
} catch (err) {
  console.error("⚠️ daily_status.json corrupted, resetting...");
  statusDb.data = [];
  await statusDb.write();
}

// Initialize bookings_data.json database using LowDB
// Default structure is an empty object for storing booking records
const bookingsDataAdapter = new JSONFile(bookingsDataFile);
const bookingsDb = new Low(bookingsDataAdapter, {});

// Read and validate bookings data database
// If corrupted or invalid, reset to empty object
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

// Initialize bookings_status.json database using LowDB
// Default structure is an empty array for booking status records
const bookingsStatusAdapter = new JSONFile(bookingsStatusFile);
const bookingsStatusDb = new Low(bookingsStatusAdapter, []);

// Read and validate bookings status database
// If corrupted or invalid, reset to empty array
try {
  await bookingsStatusDb.read();
  if (!Array.isArray(bookingsStatusDb.data)) {
    bookingsStatusDb.data = [];
    await bookingsStatusDb.write();
  }
} catch (err) {
  console.error("⚠️ bookings_status.json corrupted, resetting...");
  bookingsStatusDb.data = [];
  await bookingsStatusDb.write();
}

// Initialize cash_data.json database using LowDB
// Default structure is an empty object for storing cash deposit records
const cashDataAdapter = new JSONFile(cashDataFile);
const cashDb = new Low(cashDataAdapter, {});

// Read and validate cash data database
// If corrupted or invalid, reset to empty object
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

// Export daily data database as default (main database)
export default db;

// Export additional databases for use in other modules
export { statusDb, bookingsDb, bookingsStatusDb, cashDb };
