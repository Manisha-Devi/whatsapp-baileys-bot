/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js
 * Author: Pankaj’s Bot System
 */

function syncBothWays() {
  const SHEET_NAME = "DailyData";
  const SERVER_GET = "https://bot.sukoononline.com/daily_data.json";
  const SERVER_POST = "https://bot.sukoononline.com/update-daily-data";

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return Logger.log("❌ Sheet not found.");

  // --- Load Google Sheet Data ---
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const sheetData = {};

  for (const row of values) {
    const record = {};
    headers.forEach((h, i) => (record[h] = row[i]));
    sheetData[record.PrimaryKey] = record;
  }

  // --- Load Server Data ---
  let serverData = {};
  try {
    const response = UrlFetchApp.fetch(SERVER_GET);
    serverData = JSON.parse(response.getContentText());
  } catch (err) {
    return Logger.log("❌ Failed to fetch server data: " + err);
  }

  // --- Compare & Merge ---
  const merged = { ...serverData }; // start from server version
  let newToServer = 0, newToSheet = 0;

  for (const [key, sheetRec] of Object.entries(sheetData)) {
    const serverRec = serverData[key];
    if (!serverRec) {
      // New in Sheet only
      merged[key] = sheetRec;
      newToServer++;
    } else if (sheetRec.submittedAt > serverRec.submittedAt) {
      // Updated in Sheet
      merged[key] = sheetRec;
      newToServer++;
    }
  }

  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key];
    if (!sheetRec) {
      // New in Server only
      merged[key] = serverRec;
      newToSheet++;
    }
  }

  // --- Push merged data back to server ---
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(merged),
    muteHttpExceptions: true,
  };

  try {
    UrlFetchApp.fetch(SERVER_POST, options);
    Logger.log(`✅ Pushed ${newToServer} new/updated records to server`);
  } catch (err) {
    Logger.log("❌ Failed to push to server: " + err);
  }

  // --- Update Google Sheet with new-from-server ---
  if (newToSheet > 0) {
    const headersList = Object.keys(Object.values(merged)[0] || {});
    const rows = Object.entries(merged).map(([key, rec]) =>
      headersList.map((h) => rec[h] || "")
    );
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headersList.length).setValues([headersList]);
    sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync complete. → ${newToServer} updates to server, ← ${newToSheet} updates to sheet.`,
    "Two-Way Sync"
  );
}
