// data_sync.js
import { google } from "googleapis";
import fs from "fs";
import db from "./daily_db.js";

// === CONFIGURATION ===
// Your Google Sheet ID (replace this with your own)
const SHEET_ID = "YOUR_GOOGLE_SHEET_ID";
const SHEET_NAME = "DailyData";

// === AUTHENTICATION ===
// Make sure you have credentials.json from Google Cloud Console
// and token.json after initial OAuth setup
async function authorize() {
  const credentials = JSON.parse(fs.readFileSync("credentials.json", "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const token = JSON.parse(fs.readFileSync("token.json", "utf-8"));
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

// === SYNC FUNCTION ===
export async function syncDailyDataToSheet() {
  const auth = await authorize();
  const sheets = google.sheets({ version: "v4", auth });

  await db.read();
  const data = db.data;

  const rows = [];

  for (const [key, record] of Object.entries(data)) {
    const diesel = record.Diesel?.amount || "";
    const adda = record.Adda?.amount || "";
    const union = record.Union?.amount || "";
    const extraList = (record.ExtraExpenses || [])
      .map((e) => `${e.name}: ${e.amount} (${e.mode})`)
      .join(", ");

    rows.push([
      key, // PrimaryKey
      record.submittedAt || "",
      record.sender || "",
      record.Dated || "",
      diesel,
      adda,
      union,
      record.TotalCashCollection || "",
      record.Online || "",
      record.CashHandover || "",
      extraList,
    ]);
  }

  // === WRITE HEADER + DATA ===
  const header = [
    [
      "PrimaryKey",
      "SubmittedAt",
      "Sender",
      "Dated",
      "Diesel",
      "Adda",
      "Union",
      "TotalCashCollection",
      "Online",
      "CashHandover",
      "ExtraExpenses",
    ],
  ];

  try {
    // Clear the sheet first
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
    });

    // Write header
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1`,
      valueInputOption: "RAW",
      resource: { values: header },
    });

    // Write all data
    if (rows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A2`,
        valueInputOption: "RAW",
        resource: { values: rows },
      });
    }

    console.log(`✅ Synced ${rows.length} records to Google Sheet.`);
  } catch (err) {
    console.error("❌ Failed to sync data:", err.message);
  }
}

// === RUN DIRECTLY ===
if (process.argv[1].includes("data_sync.js")) {
  syncDailyDataToSheet();
}
