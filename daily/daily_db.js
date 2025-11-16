// daily_db.js
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "fs";

const file = "./daily/data/daily_data.json";

// ✅ Create file if missing or empty
if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
  fs.writeFileSync(file, JSON.stringify({}, null, 2)); // Start with empty object
}

const adapter = new JSONFile(file);
const db = new Low(adapter, {});

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

export default db;
