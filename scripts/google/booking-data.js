/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js Server (Bookings)
 * ------------------------------------------------------------
 * Features:
 *  ✅ Supports nested objects (Location, Date, TotalFare, etc.)
 *  ✅ PrimaryKey normalization (7→8 digit fix)
 *  ✅ Auto-parses JSON-like strings before sending
 *  ✅ Keeps consistent column order in sheet
 *  ✅ Uses Bearer Token authentication
 *  ✅ Handles Post-Booking expense fields
 * 
 * Updated: December 2025
 */

function syncBookingData() {
  const SHEET_NAME = "BookingData";
  const SERVER_GET = "https://bot.sukoononline.com/booking_data.json";
  const SERVER_POST = "https://bot.sukoononline.com/update-booking-data";
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
   * Converts 7-digit PrimaryKey to 8-digit format
   * Example: "1112025" becomes "01112025"
   * 
   * Why needed: Dates sometimes come as 1122025 instead of 01122025
   * This fixes them to keep everything consistent
   * 
   * @param {string} key - PrimaryKey (date format: DDMMYYYY)
   * @returns {string} - Fixed 8-digit key
   */
  function normalizeKey(key) {
    if (/^\d{7}$/.test(key)) {
      return key.padStart(8, "0");
    }
    return key;
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
      const fixedKey = normalizeKey(record.PrimaryKey);
      delete record.PrimaryKey;
      sheetData[fixedKey] = record;
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
      merged[key] = sheetRec;
      newToServer++;
    } else {
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
        : new Date(0);
      
      if (sheetTime > serverTime) {
        merged[key] = sheetRec;
        newToServer++;
      }
    }
  }

  // Check Server records - Need to bring to Sheet?
  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key];
    
    if (!sheetRec) {
      merged[key] = serverRec;
      newToSheet++;
    } else {
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
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
    }));

    const expectedHeaders = [
      "PrimaryKey",
      "Sender",
      "BookingDate",
      "BusCode",
      "CustomerName",
      "CustomerPhone",
      "Location",
      "Date",
      "Capacity",
      "TotalFare",
      "AdvancePaid",
      "BalanceAmount",
      "Diesel",
      "Adda",
      "Union",
      "EmployExpenses",
      "ExtraExpenses",
      "Status",
      "Remarks",
      "submittedAt",
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

  // --- STEP 7: Completion message ---
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync Complete → Sent: ${newToServer}, ← Received: ${newToSheet}`,
    "Booking Data Sync"
  );

  Logger.log(`🔁 Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}
