/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js Server (Bookings)
 * ------------------------------------------------------------
 * Features:
 *  ✅ Supports nested objects (Location, Date, TotalFare, etc.)
 *  ✅ PrimaryKey normalization
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

  // --- Helper: Normalize booking ID ---
  function normalizeKey(key) {
    if (typeof key === "string") {
      return key.trim();
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
      record[h] = tryParseJSON(row[i]);
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

  // → Push newer sheet data to server
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

  // ← Pull missing server data into sheet
  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key];
    if (!sheetRec) {
      merged[key] = serverRec;
      newToSheet++;
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
  if (newToSheet > 0 || Object.keys(merged).length > 0) {
    const allRecords = Object.entries(merged).map(([key, rec]) => ({
      PrimaryKey: key,
      ...rec,
    }));

    if (allRecords.length === 0) {
      Logger.log("⚠️ No records to write to sheet");
      return;
    }

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

    const headersList = expectedHeaders.filter(
      (h) => allRecords.some((rec) => rec[h] !== undefined && rec[h] !== null)
    );

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
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
    }
  }

  // --- STEP 7: Completion message ---
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync Complete → Sent: ${newToServer}, ← Received: ${newToSheet}`,
    "Booking Data Sync"
  );

  Logger.log(`🔁 Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}

/**
 * Helper function to flatten nested booking data for reporting
 * Use this in custom formulas or reports
 */
function flattenBookingRecord(record) {
  return {
    Sender: record.Sender || "",
    BookingDate: record.BookingDate || "",
    BusCode: record.BusCode || "",
    CustomerName: record.CustomerName || "",
    CustomerPhone: record.CustomerPhone || "",
    PickupLocation: record.Location?.Pickup || "",
    DropLocation: record.Location?.Drop || "",
    NoOfDays: record.Date?.NoOfDays || 1,
    StartDate: record.Date?.Start || "",
    EndDate: record.Date?.End || "",
    Capacity: record.Capacity || "",
    TotalFare: record.TotalFare?.Amount || 0,
    AdvancePaid: record.AdvancePaid?.Amount || 0,
    BalanceAmount: record.BalanceAmount?.Amount || 0,
    DieselAmount: record.Diesel?.amount || 0,
    DieselMode: record.Diesel?.mode || "",
    AddaAmount: record.Adda?.amount || 0,
    AddaMode: record.Adda?.mode || "",
    UnionAmount: record.Union?.amount || 0,
    UnionMode: record.Union?.mode || "",
    Status: record.Status || "",
    Remarks: record.Remarks || "",
    submittedAt: record.submittedAt || "",
  };
}

/**
 * Generate a flat report sheet from booking data
 * Creates a new sheet "BookingReport" with flattened columns
 */
function generateFlatBookingReport() {
  const SHEET_NAME = "BookingData";
  const REPORT_SHEET_NAME = "BookingReport";

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dataSheet = ss.getSheetByName(SHEET_NAME);
  if (!dataSheet) return Logger.log("❌ Sheet not found: " + SHEET_NAME);

  let reportSheet = ss.getSheetByName(REPORT_SHEET_NAME);
  if (!reportSheet) {
    reportSheet = ss.insertSheet(REPORT_SHEET_NAME);
  }

  const values = dataSheet.getDataRange().getValues();
  const headers = values.shift();

  const records = [];
  for (const row of values) {
    const record = {};
    headers.forEach((h, i) => {
      try {
        const val = row[i];
        if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
          record[h] = JSON.parse(val);
        } else {
          record[h] = val;
        }
      } catch (err) {
        record[h] = row[i];
      }
    });
    records.push(flattenBookingRecord(record));
  }

  if (records.length === 0) {
    Logger.log("⚠️ No records to report");
    return;
  }

  const flatHeaders = Object.keys(records[0]);
  const flatRows = records.map((rec) => flatHeaders.map((h) => rec[h] || ""));

  reportSheet.clearContents();
  reportSheet.getRange(1, 1, 1, flatHeaders.length).setValues([flatHeaders]);
  reportSheet.getRange(2, 1, flatRows.length, flatHeaders.length).setValues(flatRows);

  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Report generated with ${records.length} records`,
    "Booking Report"
  );
}
