/**
 * 🔁 Smart Two-Way Sync between Google Sheet ↔ Node.js Server (Bookings)
 * ------------------------------------------------------------
 * Features:
 *  ✅ Removes PrimaryKey from object before upload
 *  ✅ PrimaryKey normalization
 *  ✅ Auto-parses JSON-like strings before sending
 *  ✅ Keeps consistent column order in sheet
 *  ✅ Uses Bearer Token authentication
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
      record[h] = tryParseJSON(row[i]); // 🧠 convert back objects
    });
    if (record.PrimaryKey) {
      const fixedKey = normalizeKey(record.PrimaryKey);
      delete record.PrimaryKey; // 🩹 remove before sending
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
  if (newToSheet > 0) {
    // Convert JSON object → array with PrimaryKey included for Sheet
    const allRecords = Object.entries(merged).map(([key, rec]) => ({
      PrimaryKey: key,
      ...rec,
    }));

    const expectedHeaders = [
      "PrimaryKey",
      "BookingDate",
      "CustomerName",
      "CustomerPhone",
      "PickupLocation",
      "DropLocation",
      "TravelDate",
      "VehicleType",
      "NumberOfPassengers",
      "TotalFare",
      "AdvancePaid",
      "BalanceAmount",
      "Status",
      "Remarks",
      "submittedAt",
    ];

    const headersList = expectedHeaders.filter((h) => h in allRecords[0]);

    const rows = allRecords.map((rec) =>
      headersList.map((h) =>
        typeof rec[h] === "object" ? JSON.stringify(rec[h]) : rec[h] || ""
      )
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
