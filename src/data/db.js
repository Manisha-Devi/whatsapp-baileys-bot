// db.js - Manages daily and booking databases
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "fs";

const dailyDataFile = "./storage/daily_data.json";
const dailyStatusFile = "./storage/daily_status.json";
const bookingsDataFile = "./storage/bookings_data.json";
const bookingsStatusFile = "./storage/bookings_status.json";

// ✅ Create daily_data.json if missing or empty
if (!fs.existsSync(dailyDataFile) || fs.statSync(dailyDataFile).size === 0) {
  fs.writeFileSync(dailyDataFile, JSON.stringify({}, null, 2));
}

// ✅ Create daily_status.json if missing or empty
if (!fs.existsSync(dailyStatusFile) || fs.statSync(dailyStatusFile).size === 0) {
  fs.writeFileSync(dailyStatusFile, JSON.stringify([], null, 2));
}

// ✅ Create bookings_data.json if missing or empty
if (!fs.existsSync(bookingsDataFile) || fs.statSync(bookingsDataFile).size === 0) {
  fs.writeFileSync(bookingsDataFile, JSON.stringify({}, null, 2));
}

// ✅ Create bookings_status.json if missing or empty
if (!fs.existsSync(bookingsStatusFile) || fs.statSync(bookingsStatusFile).size === 0) {
  fs.writeFileSync(bookingsStatusFile, JSON.stringify([], null, 2));
}

// Initialize daily_data.json database
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

// Initialize daily_status.json database
const dailyStatusAdapter = new JSONFile(dailyStatusFile);
const statusDb = new Low(dailyStatusAdapter, []);

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

// Initialize bookings_data.json database
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

// Initialize bookings_status.json database
const bookingsStatusAdapter = new JSONFile(bookingsStatusFile);
const bookingsStatusDb = new Low(bookingsStatusAdapter, []);

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

// Export all databases
export default db;
export { statusDb, bookingsDb, bookingsStatusDb };
