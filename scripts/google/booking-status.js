/**
 * sync-booking-status.gs
 * Two-way sync: Google Sheet "BookingStatus" <-> Server /booking_status.json
 *
 * Similar to daily-status.js but for bookings
 */

function syncBookingStatus() {
  const SHEET_NAME = "BookingStatus";
  const SERVER_GET = "https://bot.sukoononline.com/booking_status.json";
  const SERVER_POST = "https://bot.sukoononline.com/update-booking-status";
  const API_KEY = "MySuperSecretKey12345"; // <-- replace with your real key

  // --- helpers ---
  function tryParseJSON(value) {
    try {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
      }
    } catch (e) {}
    return value;
  }

  // normalize booking ID
  function normalizeKeyString(key) {
    if (typeof key === "string") {
      return key.trim();
    }
    return key;
  }

  // normalize all keys inside updatedKeys array
  function normalizeUpdatedKeys(arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map((k) => normalizeKeyString(String(k)));
  }

  // --- 1) sheet ref & read ---
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log("❌ Sheet not found: " + SHEET_NAME);
    return;
  }

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 1) {
    Logger.log("ℹ️ Sheet empty.");
  }

  // headers normalization (case-insensitive)
  const headers = (values[0] || []).map((h) => String(h || "").trim());
  const rows = values.slice(1);

  // convert sheet rows into array of status log objects
  const sheetLogs = [];
  for (const r of rows) {
    if (r.every((c) => c === "" || c === null || c === undefined)) continue; // skip blank rows

    const obj = {};
    headers.forEach((h, i) => {
      const key = h || `col${i}`;
      const raw = r[i];
      // prefer structured fields names if present (case-insensitive)
      if (/^updatedon$/i.test(key)) obj.updatedOn = (raw && String(raw).trim()) || null;
      else if (/^updatedkeys$/i.test(key)) {
        const parsed = tryParseJSON(raw);
        if (Array.isArray(parsed)) obj.updatedKeys = parsed.map(String);
        else if (typeof parsed === "string" && parsed.includes(",")) {
          obj.updatedKeys = parsed.split(",").map((x) => x.trim()).filter(Boolean);
        } else if (raw) obj.updatedKeys = [String(raw).trim()];
        else obj.updatedKeys = [];
      } else if (/^remarks$/i.test(key)) obj.remarks = raw || null;
      else obj[key] = raw;
    });

    // only keep entries with updatedOn
    if (obj.updatedOn) {
      // ensure ISO string if user entered date cell
      try {
        // If it's a Date object from sheet, convert to ISO
        if (obj.updatedOn instanceof Date && !isNaN(obj.updatedOn)) {
          obj.updatedOn = obj.updatedOn.toISOString();
        } else {
          obj.updatedOn = String(obj.updatedOn).trim();
        }
      } catch (e) {}
      // normalize updatedKeys values to string
      obj.updatedKeys = normalizeUpdatedKeys(obj.updatedKeys || []);
      sheetLogs.push(obj);
    }
  }

  // --- 2) fetch server logs ---
  let serverLogs = [];
  try {
    const resp = UrlFetchApp.fetch(SERVER_GET, {
      method: "get",
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + API_KEY },
    });
    if (resp.getResponseCode() === 200) {
      serverLogs = JSON.parse(resp.getContentText() || "[]");
      if (!Array.isArray(serverLogs)) serverLogs = [];
    } else {
      Logger.log("⚠️ Server responded: " + resp.getResponseCode());
    }
  } catch (err) {
    Logger.log("❌ Failed to fetch server logs: " + err);
    return;
  }

  // Build maps keyed by updatedOn for quick compare
  const serverMap = {};
  serverLogs.forEach((e) => {
    if (!e || !e.updatedOn) return;
    serverMap[String(e.updatedOn)] = {
      updatedOn: String(e.updatedOn),
      updatedKeys: normalizeUpdatedKeys(e.updatedKeys || []),
      remarks: e.remarks ?? null,
    };
  });

  const sheetMap = {};
  sheetLogs.forEach((e) => {
    sheetMap[String(e.updatedOn)] = {
      updatedOn: String(e.updatedOn),
      updatedKeys: normalizeUpdatedKeys(e.updatedKeys || []),
      remarks: e.remarks ?? null,
    };
  });

  // --- 3) merge logic ---
  const mergedMap = { ...serverMap }; // start from server (server entries preserved)

  let newToServer = 0;
  let newToSheet = 0;

  // Add sheet-only entries to mergedMap (these need to be sent to server)
  for (const [uOn, sheetEntry] of Object.entries(sheetMap)) {
    if (!mergedMap[uOn]) {
      mergedMap[uOn] = sheetEntry;
      newToServer++;
    }
  }

  // Count server-only entries not present in sheet (these should be pulled into sheet)
  for (const [uOn, serverEntry] of Object.entries(serverMap)) {
    if (!sheetMap[uOn]) newToSheet++;
  }

  // --- 4) push merged back to server (array) ---
  const mergedArray = Object.values(mergedMap)
    .sort((a, b) => new Date(a.updatedOn) - new Date(b.updatedOn)); // stable sort by time asc

  try {
    const postOptions = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(mergedArray),
      muteHttpExceptions: true,
      headers: { Authorization: "Bearer " + API_KEY },
    };
    const postResp = UrlFetchApp.fetch(SERVER_POST, postOptions);
    Logger.log(`✅ Pushed ${newToServer} new log(s) to server. Response: ${postResp.getResponseCode()}`);
  } catch (err) {
    Logger.log("❌ Failed to push merged logs to server: " + err);
  }

  // --- 5) update sheet if server had new entries ---
  if (newToSheet > 0) {
    const expectedHeaders = ["UpdatedOn", "UpdatedKeys", "Remarks"];
    const rowsOut = mergedArray.map((rec) => {
      return [
        rec.updatedOn || "",
        Array.isArray(rec.updatedKeys) ? JSON.stringify(rec.updatedKeys) : (rec.updatedKeys || ""),
        rec.remarks || "",
      ];
    });

    // Clear and write
    sheet.clearContents();
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.getRange(2, 1, rowsOut.length, expectedHeaders.length).setValues(rowsOut);
  }

  // --- 6) finish with toast/log ---
  ss.toast(`✅ BookingStatus Sync → Sent: ${newToServer}, ← Received: ${newToSheet}`, "Booking Status Sync");
  Logger.log(`🔁 BookingStatus Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}
