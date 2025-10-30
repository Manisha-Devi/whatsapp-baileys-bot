/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js Server
 * ------------------------------------------------------------
 * Author: Pankaj’s Bot System
 * Security: Includes API Key authentication (Bearer token)
 * Features:
 *  ✅ Compares both sides (Google Sheet + Server)
 *  ✅ Syncs only newer or missing records
 *  ✅ Auto-updates both sheet and server safely
 */

function syncBothWays() {
  const SHEET_NAME = "DailyData";
  const SERVER_GET = "https://bot.sukoononline.com/daily_data.json";
  const SERVER_POST = "https://bot.sukoononline.com/update-daily-data";
  const API_KEY = "MySuperSecretKey12345"; // 🔐 same as in your .env file

  // --- STEP 1: Get Sheet Reference ---
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return Logger.log("❌ Sheet not found: " + SHEET_NAME);

  // --- STEP 2: Load Google Sheet Data ---
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const sheetData = {};

  for (const row of values) {
    const record = {};
    headers.forEach((h, i) => (record[h] = row[i]));
    if (record.PrimaryKey) sheetData[record.PrimaryKey] = record;
  }

  // --- STEP 3: Load Server Data (GET) ---
  let serverData = {};
  try {
    const response = UrlFetchApp.fetch(SERVER_GET, {
      method: "get",
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() === 200) {
      serverData = JSON.parse(response.getContentText() || "{}");
    } else {
      Logger.log("⚠️ Server responded with: " + response.getResponseCode());
    }
  } catch (err) {
    return Logger.log("❌ Failed to fetch server data: " + err);
  }

  // --- STEP 4: Compare and Merge ---
  const merged = { ...serverData };
  let newToServer = 0;
  let newToSheet = 0;

  // → Update server with newer or missing sheet records
  for (const [key, sheetRec] of Object.entries(sheetData)) {
    const serverRec = serverData[key];
    if (!serverRec) {
      merged[key] = sheetRec;
      newToServer++;
    } else if (
      sheetRec.submittedAt &&
      serverRec.submittedAt &&
      new Date(sheetRec.submittedAt) > new Date(serverRec.submittedAt)
    ) {
      merged[key] = sheetRec;
      newToServer++;
    }
  }

  // ← Update sheet with missing server records
  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key];
    if (!sheetRec) {
      merged[key] = serverRec;
      newToSheet++;
    }
  }

  // --- STEP 5: Push Merged Data Back to Server (POST + API KEY) ---
  try {
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(merged),
      muteHttpExceptions: true,
      headers: {
        Authorization: "Bearer " + API_KEY, // 🔑 Secure Auth Header
      },
    };

    const resp = UrlFetchApp.fetch(SERVER_POST, options);
    Logger.log(
      `✅ Pushed ${newToServer} records to server. Response: ${resp.getResponseCode()}`
    );
  } catch (err) {
    Logger.log("❌ Failed to push to server: " + err);
  }

  // --- STEP 6: Update Google Sheet if New Data Found from Server ---
  if (newToSheet > 0) {
    const allRecords = Object.values(merged);
    if (allRecords.length === 0) return;

    const headersList = Object.keys(allRecords[0]);
    const rows = allRecords.map((rec) => headersList.map((h) => rec[h] || ""));

    sheet.clearContents();
    sheet.getRange(1, 1, 1, headersList.length).setValues([headersList]);
    sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
  }

  // --- STEP 7: Completion Toast ---
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync Complete: → ${newToServer} updates sent, ← ${newToSheet} updates received.`,
    "Two-Way Sync"
  );

  Logger.log(
    `🔁 Two-Way Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`
  );
}
