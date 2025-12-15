/**
 * ============================================================
 * Two-Way Sync Script: Google Sheet <-> Node.js Server
 * ============================================================
 * 
 * WHAT THIS SCRIPT DOES:
 * - Reads data from Google Sheet and sends it to the server
 * - Fetches data from server and updates Google Sheet
 * - Two-way synchronization (both directions)
 * 
 * HOW IT WORKS:
 * 1. Reads all data from the Sheet
 * 2. Fetches all data from Server (GET request)
 * 3. Compares both datasets - keeps newer/updated records
 * 4. Sends merged data to server (POST request)
 * 5. If server has new data, updates the Sheet
 * 
 * IMPORTANT: The submittedAt timestamp determines which record is newer
 * 
 * Author: Pankaj
 * ============================================================
 */

function syncBothWays() {
  // ========================================
  // CONFIGURATION - Set your settings here
  // ========================================
  
  // Name of the sheet containing daily data
  const SHEET_NAME = "DailyData";
  
  // Server URLs - where data is fetched from and sent to
  const SERVER_GET = "https://bot.sukoononline.com/daily_data.json";   // For fetching data
  const SERVER_POST = "https://bot.sukoononline.com/update-daily-data"; // For sending data
  
  // API Key - for authentication with the server (replace with your actual key)
  const API_KEY = "MySuperSecretKey12345"; // <-- PUT YOUR ACTUAL KEY HERE

  // ========================================
  // HELPER FUNCTIONS - For internal use
  // ========================================
  
  /**
   * Converts JSON strings to JavaScript objects
   * Example: '{"name":"Ali"}' becomes {name: "Ali"}
   * 
   * When used: When Sheet has objects/arrays saved as strings
   * 
   * @param {any} value - Any value
   * @returns {any} - If JSON, returns parsed object; otherwise returns same value
   */
  function tryParseJSON(value) {
    try {
      // Only check string values
      if (typeof value === "string") {
        const trimmed = value.trim();
        // If starts with { or [, it might be JSON
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          return JSON.parse(trimmed); // Parse and return object/array
        }
      }
    } catch (err) {
      // If parsing fails, do nothing (original value will be returned)
    }
    return value; // Return original value
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
    // If exactly 7 digits
    if (/^\d{7}$/.test(key)) {
      return key.padStart(8, "0"); // Add leading zero
    }
    return key; // Already correct, return as is
  }

  // ========================================
  // STEP 1: Get Sheet Reference
  // ========================================
  
  // Open the DailyData sheet from the active spreadsheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  // If sheet not found, log error and exit
  if (!sheet) {
    return Logger.log("Sheet not found: " + SHEET_NAME);
  }

  // ========================================
  // STEP 2: Read Data from Sheet
  // ========================================
  
  // Get all sheet data as a 2D array
  // Example: [["PrimaryKey", "Diesel", ...], ["01122025", 500, ...], ...]
  const values = sheet.getDataRange().getValues();
  
  // First row is headers, extract them separately
  // shift() removes and returns the first element
  const headers = values.shift(); // ["PrimaryKey", "Diesel", "Adda", ...]
  
  // Convert sheet data to an object
  // Format: { "01122025": {Diesel: 500, Adda: 100, ...}, ... }
  const sheetData = {};

  // Process each row (rows after headers)
  for (const row of values) {
    const record = {}; // Create a record object
    
    // Map each column to its header
    headers.forEach((h, i) => {
      // IMPORTANT: Skip empty headers (this fixes the "":"" bug)
      // If header is empty or only whitespace, skip it
      if (h && h.toString().trim() !== '') {
        // Add value to record (parse JSON if applicable)
        record[h] = tryParseJSON(row[i]);
      }
    });
    
    // Only process valid records (those with PrimaryKey)
    if (record.PrimaryKey) {
      // Fix PrimaryKey (7-digit to 8-digit)
      const fixedKey = normalizeKey(record.PrimaryKey);
      
      // Remove PrimaryKey from record (key will be stored separately)
      delete record.PrimaryKey;
      
      // Add to sheetData
      // Key = PrimaryKey, Value = record object
      sheetData[fixedKey] = record;
    }
  }

  // ========================================
  // STEP 3: Fetch Data from Server (GET Request)
  // ========================================
  
  let serverData = {}; // Server data will be stored here
  
  try {
    // Fetch data from server with API Key authentication
    const response = UrlFetchApp.fetch(SERVER_GET, {
      method: "get",                              // GET request
      muteHttpExceptions: true,                   // Allow catching errors
      headers: { 
        Authorization: "Bearer " + API_KEY        // Send API Key in header
      },
    });
    
    // If success (200 OK)
    if (response.getResponseCode() === 200) {
      // Parse response text as JSON
      serverData = JSON.parse(response.getContentText() || "{}");
    } else {
      // Some other status code received
      Logger.log("Server responded: " + response.getResponseCode());
    }
  } catch (err) {
    // Network error or other problem
    return Logger.log("Failed to fetch server data: " + err);
  }

  // ========================================
  // STEP 4: Compare & Merge Data
  // ========================================
  
  // Merged data - start with server data, then merge sheet data
  const merged = { ...serverData }; // Copy server data
  
  // Counters - how many records are synced
  let newToServer = 0;  // Records to send: Sheet -> Server
  let newToSheet = 0;   // Records to receive: Server -> Sheet

  // -----------------------------------------
  // Check Sheet records - Need to send to Server?
  // -----------------------------------------
  for (const [key, sheetRec] of Object.entries(sheetData)) {
    const serverRec = serverData[key]; // Does this record exist on server?
    
    if (!serverRec) {
      // NEW RECORD - Not on server, add it
      merged[key] = sheetRec;
      newToServer++;
    } else {
      // EXISTS IN BOTH - Compare timestamps, keep newer one
      
      // Sheet record timestamp (if not available, assume 1970)
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      
      // Server record timestamp
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
        : new Date(0);
      
      // If Sheet version is newer, use it
      if (sheetTime > serverTime) {
        merged[key] = sheetRec;
        newToServer++;
      }
    }
  }

  // -----------------------------------------
  // Check Server records - Need to bring to Sheet?
  // -----------------------------------------
  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key]; // Does this record exist in sheet?
    
    if (!sheetRec) {
      // NEW RECORD - Not in sheet, will be added
      merged[key] = serverRec;
      newToSheet++;
    } else {
      // EXISTS IN BOTH - Check if server version is newer
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
        : new Date(0);
      
      // If Server version is newer
      if (serverTime > sheetTime) {
        newToSheet++;
      }
    }
  }

  // ========================================
  // STEP 5: Send Merged Data to Server (POST Request)
  // ========================================
  
  try {
    // POST request options
    const postOptions = {
      method: "post",                             // POST request
      contentType: "application/json",            // Sending JSON data
      payload: JSON.stringify(merged),            // Merged data as JSON string
      muteHttpExceptions: true,                   // Catch errors
      headers: { 
        Authorization: "Bearer " + API_KEY        // API Key authentication
      },
    };
    
    // Send data to server
    const resp = UrlFetchApp.fetch(SERVER_POST, postOptions);
    
    // Log success message
    Logger.log(
      `Pushed ${newToServer} record(s) to server. Response: ${resp.getResponseCode()}`
    );
  } catch (err) {
    Logger.log("Failed to push to server: " + err);
  }

  // ========================================
  // STEP 6: Update Sheet (If New Data from Server)
  // ========================================
  
  // Only update if there are new records from server
  if (newToSheet > 0) {
    
    // Convert merged object to array
    // Add PrimaryKey to each record (needed for sheet)
    const allRecords = Object.entries(merged).map(([key, rec]) => ({
      PrimaryKey: key,  // Key as PrimaryKey column
      ...rec,           // All other fields
    }));

    // Column order in sheet - matches your sheet structure
    const expectedHeaders = [
      "PrimaryKey",        // Unique ID (DDMMYYYY + BusCode)
      "sender",            // WhatsApp number that submitted
      "Dated",             // Date (DD/MM/YYYY format)
      "busCode",           // Bus code (UP35AT1234)
      "Diesel",            // Diesel expense
      "Adda",              // Adda expense
      "Union",             // Union expense
      "TotalCashCollection", // Total collection
      "Online",            // Online payment
      "CashHandover",      // Cash handover
      "EmployExpenses",    // Employee expenses
      "ExtraExpenses",     // Extra expenses
      "submittedAt",       // Submission timestamp
      "Remarks",           // Any remarks
      "Status",            // Status (approved/pending etc)
    ];

    // Keep only headers that actually exist in data
    const headersList = expectedHeaders.filter((h) => h in allRecords[0]);

    // Convert records to rows (2D array)
    // Each row has values in header order
    const rows = allRecords.map((rec) =>
      headersList.map((h) =>
        // If object, convert to JSON string; otherwise use direct value
        typeof rec[h] === "object" ? JSON.stringify(rec[h]) : rec[h] || ""
      )
    );

    // Clear sheet (remove old data)
    sheet.clearContents();
    
    // Write headers (Row 1)
    sheet.getRange(1, 1, 1, headersList.length).setValues([headersList]);
    
    // Write data rows (Row 2 onwards)
    sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
  }

  // ========================================
  // STEP 7: Success Message
  // ========================================
  
  // Show notification to user (bottom right corner)
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Sync Complete - Sent: ${newToServer}, Received: ${newToSheet}`,
    "Daily Data Sync"
  );

  // Also log to console
  Logger.log(`Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}
