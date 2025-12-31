/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js Server (Cash Deposits)
 * ------------------------------------------------------------
 * Features:
 *  ✅ Handles Deposit ID based JSON structure
 *  ✅ Auto-parses JSON-like strings (dailyEntries, bookingEntries, breakdown, balance)
 *  ✅ Keeps consistent column order in sheet
 *  ✅ Uses Bearer Token authentication
 *  ✅ Added "Dated" field in "Day, DD Month YYYY" format in JSON
 *  ✅ Keeps "depositedAt" as raw timestamp
 *  ✅ Formats "sender" to display User Name based on internal ID
 * 
 * Updated: December 2025
 */

function syncCashData() {
  const SHEET_NAME = "CashData";
  const SERVER_GET = "https://bot.sukoononline.com/cash_data.json";
  const SERVER_POST = "https://bot.sukoononline.com/update-cash-data";
  const API_KEY = "MySuperSecretKey12345"; // <-- replace with your actual key

  // --- Helper: Try to parse JSON-like strings ---
  function tryParseJSON(value) {
    try {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          return JSON.parse(trimmed);
        }
      }
    } catch (err) {}
    return value;
  }

  /**
   * Formats a date string into "Day, DD Month YYYY"
   * Example: 2025-12-17 -> Wednesday, 17 December 2025
   */
  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      const date = new Date(dateStr);
      const options = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
      return date.toLocaleDateString('en-GB', options);
    } catch (e) {
      return "";
    }
  }

  /**
   * Maps sender ID to User Name
   */
  function getUserName(sender) {
    if (!sender) return "";
    const cleanId = sender.toString().split('@')[0];
    
    // User Mapping based on src/data/users.json
    const userMap = {
      "207150735483028": "Pankaj Parihar",
      "24696179441690": "Akshay Kumar"
    };

    return userMap[cleanId] || cleanId;
  }

  // --- STEP 1: Get sheet reference ---
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return Logger.log("❌ Sheet not found: " + SHEET_NAME);

  // --- STEP 2: Read all data from sheet ---
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  const sheetData = {};

  for (const row of values) {
    const record = {};
    headers.forEach((h, i) => {
      if (h && h.toString().trim() !== '') {
        record[h] = tryParseJSON(row[i]);
      }
    });
    if (record.PrimaryKey) {
      const key = record.PrimaryKey;
      delete record.PrimaryKey;
      sheetData[key] = record;
    }
  }

  // --- STEP 3: Load server data (GET + Bearer Auth) ---
  let serverData = {};
  try {
    const response = UrlFetchApp.fetch(SERVER_GET, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + API_KEY },
    });
    if (response.getResponseCode() === 200) {
      serverData = JSON.parse(response.getContentText() || "{}");
    } else {
      Logger.log("⚠️ Server responded: " + response.getResponseCode());
    }
  } catch (err) {
    return Logger.log("❌ Failed to fetch server data: " + err);
  }

  // --- STEP 4: Compare & Merge ---
  const merged = { ...serverData };
  let newToServer = 0;
  let newToSheet = 0;

  // Check Sheet records - Need to send to Server?
  for (const [key, sheetRec] of Object.entries(sheetData)) {
    const serverRec = serverData[key];
    
    if (!serverRec) {
      if (sheetRec.depositedAt) sheetRec.Dated = formatDate(sheetRec.depositedAt);
      merged[key] = sheetRec;
      newToServer++;
    } else {
      const sheetTime = sheetRec.depositedAt 
        ? new Date(sheetRec.depositedAt) 
        : new Date(0);
      
      const serverTime = serverRec.depositedAt 
        ? new Date(serverRec.depositedAt) 
        : new Date(0);
      
      if (sheetTime > serverTime) {
        if (sheetRec.depositedAt) sheetRec.Dated = formatDate(sheetRec.depositedAt);
        merged[key] = sheetRec;
        newToServer++;
      }
    }
  }

  // Check Server records - Need to bring to Sheet?
  for (const [key, serverRec] of Object.entries(serverData)) {
    if (serverRec.depositedAt && !serverRec.Dated) {
      serverRec.Dated = formatDate(serverRec.depositedAt);
    }
    
    const sheetRec = sheetData[key];
    
    if (!sheetRec) {
      merged[key] = serverRec;
      newToSheet++;
    } else {
      const sheetTime = sheetRec.depositedAt 
        ? new Date(sheetRec.depositedAt) 
        : new Date(0);
      const serverTime = serverRec.depositedAt 
        ? new Date(serverRec.depositedAt) 
        : new Date(0);
      
      if (serverTime > sheetTime) {
        newToSheet++;
      }
    }
  }

  // --- STEP 5: Push merged data to server (POST + Auth) ---
  try {
    const postOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(merged),
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + API_KEY },
    };
    const resp = UrlFetchApp.fetch(SERVER_POST, postOptions);
    Logger.log(
      `✅ Pushed ${newToServer} record(s) to server. Response: ${resp.getResponseCode()}`
    );
  } catch (err) {
    Logger.log("❌ Failed to push to server: " + err);
  }

  // --- STEP 6: Update Sheet if new data found from server ---
  if (newToSheet > 0) {
    const allRecords = Object.entries(merged).map(([key, rec]) => ({
      PrimaryKey: key,
      ...rec,
      sender: getUserName(rec.sender) // Map ID to Name for display
    }));

    const expectedHeaders = [
      "PrimaryKey",
      "sender",
      "Dated",
      "busCode",
      "amount",
      "dailyEntries",
      "bookingEntries",
      "breakdown",
      "balance",
      "remarks",
      "depositedAt"
    ];

    const headersList = expectedHeaders.filter((h) => h in allRecords[0]);

    const rows = allRecords.map((rec) =>
      headersList.map((h) => {
        const val = rec[h];
        if (val === undefined || val === null) return "";
        if (typeof val === "object") return JSON.stringify(val);
        return val;
      })
    );

    sheet.clearContents();
    sheet.getRange(1, 1, 1, headersList.length).setValues([headersList]);
    sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
  }

  // --- STEP 7: Success Message ---
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync Complete → Sent: ${newToServer}, ← Received: ${newToSheet}`,
    "Cash Deposit Sync"
  );

  Logger.log(`🔁 Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}
