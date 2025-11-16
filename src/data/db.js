// db.js - Manages both daily_data.json and daily_status.json
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "fs";

const dailyDataFile = "./storage/daily_data.json";
const dailyStatusFile = "./storage/daily_status.json";

// ✅ Create daily_data.json if missing or empty
if (!fs.existsSync(dailyDataFile) || fs.statSync(dailyDataFile).size === 0) {
  fs.writeFileSync(dailyDataFile, JSON.stringify({}, null, 2));
}

// ✅ Create daily_status.json if missing or empty
if (!fs.existsSync(dailyStatusFile) || fs.statSync(dailyStatusFile).size === 0) {
  fs.writeFileSync(dailyStatusFile, JSON.stringify([], null, 2));
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

// Export both databases
export default db;
export { statusDb };
