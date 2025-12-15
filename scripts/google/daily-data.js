/**
 * ============================================================
 * 🔁 Google Sheet ↔ Server Two-Way Sync Script
 * ============================================================
 * 
 * YEH SCRIPT KYA KARTA HAI:
 * - Google Sheet se data leke Server pe bhejta hai
 * - Server se data leke Google Sheet mein update karta hai
 * - Dono taraf sync hota hai (Two-Way)
 * 
 * KAISE KAAM KARTA HAI:
 * 1. Sheet se saara data padhta hai
 * 2. Server se saara data lata hai (GET request)
 * 3. Dono ko compare karta hai - jo naya/updated hai wo rakhta hai
 * 4. Merged data server pe bhejta hai (POST request)
 * 5. Agar server pe naya data mila, sheet bhi update karta hai
 * 
 * IMPORTANT: submittedAt timestamp se decide hota hai ki kaunsa data naya hai
 * 
 * Author: Pankaj
 * ============================================================
 */

function syncBothWays() {
  // ========================================
  // 📌 CONFIGURATION - Yahan apni settings dalo
  // ========================================
  
  // Sheet ka naam jahan daily data hai
  const SHEET_NAME = "DailyData";
  
  // Server ke URLs - yahan se data aata/jaata hai
  const SERVER_GET = "https://bot.sukoononline.com/daily_data.json";   // Data lene ke liye
  const SERVER_POST = "https://bot.sukoononline.com/update-daily-data"; // Data bhejne ke liye
  
  // API Key - Server ke saath authentication ke liye (apna key dalo)
  const API_KEY = "MySuperSecretKey12345"; // <-- APNA ACTUAL KEY YAHAN DALO

  // ========================================
  // 🛠️ HELPER FUNCTIONS - Internal use ke liye
  // ========================================
  
  /**
   * JSON String ko Object mein convert karta hai
   * Example: '{"name":"Ali"}' → {name: "Ali"}
   * 
   * Kab use hota hai: Jab Sheet mein object/array as string saved ho
   * 
   * @param {any} value - Koi bhi value
   * @returns {any} - Agar JSON hai toh parsed object, warna same value
   */
  function tryParseJSON(value) {
    try {
      // Sirf string values check karo
      if (typeof value === "string") {
        const trimmed = value.trim();
        // Agar { ya [ se start hota hai, toh JSON ho sakta hai
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          return JSON.parse(trimmed); // Parse karke object/array return karo
        }
      }
    } catch (err) {
      // Agar parse fail ho, kuch mat karo (original value return hogi)
    }
    return value; // Original value return karo
  }

  /**
   * 7-digit PrimaryKey ko 8-digit mein convert karta hai
   * Example: "1112025" → "01112025"
   * 
   * Kyun zaroori hai: Dates kabhi kabhi 01122025 ki jagah 1122025 aa jaati hai
   * Yeh unhe fix karta hai taaki sab consistent rahe
   * 
   * @param {string} key - PrimaryKey (date format: DDMMYYYY)
   * @returns {string} - Fixed 8-digit key
   */
  function normalizeKey(key) {
    // Agar exactly 7 digits hai
    if (/^\d{7}$/.test(key)) {
      return key.padStart(8, "0"); // Aage 0 lagao
    }
    return key; // Already sahi hai toh wahi return karo
  }

  // ========================================
  // 📊 STEP 1: Sheet Reference Lo
  // ========================================
  
  // Active spreadsheet mein se DailyData sheet kholo
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  // Agar sheet nahi mili toh error log karo aur exit karo
  if (!sheet) {
    return Logger.log("❌ Sheet not found: " + SHEET_NAME);
  }

  // ========================================
  // 📖 STEP 2: Sheet Se Data Padho
  // ========================================
  
  // Sheet ka saara data 2D array mein lo
  // Example: [["PrimaryKey", "Diesel", ...], ["01122025", 500, ...], ...]
  const values = sheet.getDataRange().getValues();
  
  // Pehli row headers hai, use alag nikalo
  // shift() pehla element remove karke return karta hai
  const headers = values.shift(); // ["PrimaryKey", "Diesel", "Adda", ...]
  
  // Sheet data ko object mein convert karenge
  // Format: { "01122025": {Diesel: 500, Adda: 100, ...}, ... }
  const sheetData = {};

  // Har row ko process karo (headers ke baad wali rows)
  for (const row of values) {
    const record = {}; // Ek record banao
    
    // Har column ko header ke saath map karo
    headers.forEach((h, i) => {
      // 🩹 IMPORTANT: Empty headers skip karo (yeh "":"" bug fix karta hai)
      // Agar header khali hai ya sirf spaces hai, toh skip karo
      if (h && h.toString().trim() !== '') {
        // Value ko record mein dalo (JSON parse karke)
        record[h] = tryParseJSON(row[i]);
      }
    });
    
    // Sirf valid records process karo (jismein PrimaryKey ho)
    if (record.PrimaryKey) {
      // PrimaryKey fix karo (7-digit → 8-digit)
      const fixedKey = normalizeKey(record.PrimaryKey);
      
      // PrimaryKey record se hatao (key alag store hogi)
      delete record.PrimaryKey;
      
      // sheetData mein add karo
      // Key = PrimaryKey, Value = record object
      sheetData[fixedKey] = record;
    }
  }

  // ========================================
  // 🌐 STEP 3: Server Se Data Lo (GET Request)
  // ========================================
  
  let serverData = {}; // Server ka data yahan aayega
  
  try {
    // Server se data fetch karo with API Key authentication
    const response = UrlFetchApp.fetch(SERVER_GET, {
      method: "get",                              // GET request
      muteHttpExceptions: true,                   // Errors ko catch karne do
      headers: { 
        Authorization: "Bearer " + API_KEY        // API Key header mein bhejo
      },
    });
    
    // Agar success (200 OK)
    if (response.getResponseCode() === 200) {
      // Response text ko JSON parse karo
      serverData = JSON.parse(response.getContentText() || "{}");
    } else {
      // Koi aur status code aaya
      Logger.log("⚠️ Server responded: " + response.getResponseCode());
    }
  } catch (err) {
    // Network error ya kuch aur problem
    return Logger.log("❌ Failed to fetch server data: " + err);
  }

  // ========================================
  // 🔄 STEP 4: Compare & Merge Data
  // ========================================
  
  // Merged data - server data se start karo, phir sheet data merge karo
  const merged = { ...serverData }; // Server data copy karo
  
  // Counters - kitne records sync hue
  let newToServer = 0;  // Sheet → Server bhejne wale
  let newToSheet = 0;   // Server → Sheet laane wale

  // -----------------------------------------
  // 📤 Sheet ke records check karo - Server pe bhejna hai?
  // -----------------------------------------
  for (const [key, sheetRec] of Object.entries(sheetData)) {
    const serverRec = serverData[key]; // Server pe yeh record hai?
    
    if (!serverRec) {
      // ✅ Naya record - Server pe nahi hai, add karo
      merged[key] = sheetRec;
      newToServer++;
    } else {
      // 🕐 Dono jagah hai - Timestamp compare karo, naya wala rakho
      
      // Sheet record ka time (agar nahi hai toh 1970 maano)
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      
      // Server record ka time
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
        : new Date(0);
      
      // Agar Sheet wala naya hai toh usse rakho
      if (sheetTime > serverTime) {
        merged[key] = sheetRec;
        newToServer++;
      }
    }
  }

  // -----------------------------------------
  // 📥 Server ke records check karo - Sheet mein laana hai?
  // -----------------------------------------
  for (const [key, serverRec] of Object.entries(serverData)) {
    const sheetRec = sheetData[key]; // Sheet mein yeh record hai?
    
    if (!sheetRec) {
      // ✅ Naya record - Sheet mein nahi hai, add hoga
      merged[key] = serverRec;
      newToSheet++;
    } else {
      // 🕐 Dono jagah hai - Check karo server wala naya hai?
      const sheetTime = sheetRec.submittedAt 
        ? new Date(sheetRec.submittedAt) 
        : new Date(0);
      const serverTime = serverRec.submittedAt 
        ? new Date(serverRec.submittedAt) 
        : new Date(0);
      
      // Agar Server wala naya hai
      if (serverTime > sheetTime) {
        newToSheet++;
      }
    }
  }

  // ========================================
  // 📤 STEP 5: Merged Data Server Pe Bhejo (POST Request)
  // ========================================
  
  try {
    // POST request options
    const postOptions = {
      method: "post",                             // POST request
      contentType: "application/json",            // JSON data bhej rahe hai
      payload: JSON.stringify(merged),            // Merged data as JSON string
      muteHttpExceptions: true,                   // Errors catch karo
      headers: { 
        Authorization: "Bearer " + API_KEY        // API Key authentication
      },
    };
    
    // Server pe data bhejo
    const resp = UrlFetchApp.fetch(SERVER_POST, postOptions);
    
    // Log success message
    Logger.log(
      `✅ Pushed ${newToServer} record(s) to server. Response: ${resp.getResponseCode()}`
    );
  } catch (err) {
    Logger.log("❌ Failed to push to server: " + err);
  }

  // ========================================
  // 📥 STEP 6: Sheet Update Karo (Agar Server Se Naya Data Aaya)
  // ========================================
  
  // Sirf tab update karo jab server se naye records aaye
  if (newToSheet > 0) {
    
    // Merged object ko array mein convert karo
    // Har record mein PrimaryKey bhi daalo (sheet ke liye)
    const allRecords = Object.entries(merged).map(([key, rec]) => ({
      PrimaryKey: key,  // Key as PrimaryKey column
      ...rec,           // Baaki saari fields
    }));

    // Sheet mein columns ka order - yeh wahi order hai jo aapki sheet mein hai
    const expectedHeaders = [
      "PrimaryKey",        // Unique ID (DDMMYYYY + BusCode)
      "sender",            // WhatsApp number jisne submit kiya
      "Dated",             // Date (DD/MM/YYYY format)
      "busCode",           // Bus ka code (UP35AT1234)
      "Diesel",            // Diesel expense
      "Adda",              // Adda expense
      "Union",             // Union expense
      "TotalCashCollection", // Total collection
      "Online",            // Online payment
      "CashHandover",      // Cash handover
      "EmployExpenses",    // Employee expenses
      "ExtraExpenses",     // Extra expenses
      "submittedAt",       // Kab submit hua (timestamp)
      "Remarks",           // Koi remarks
      "Status",            // Status (approved/pending etc)
    ];

    // Sirf wahi headers rakho jo actually data mein hai
    const headersList = expectedHeaders.filter((h) => h in allRecords[0]);

    // Records ko rows mein convert karo (2D array)
    // Har row mein values headers ke order mein hongi
    const rows = allRecords.map((rec) =>
      headersList.map((h) =>
        // Agar object hai toh JSON string banao, warna direct value
        typeof rec[h] === "object" ? JSON.stringify(rec[h]) : rec[h] || ""
      )
    );

    // Sheet clear karo (purana data hatao)
    sheet.clearContents();
    
    // Headers likho (Row 1)
    sheet.getRange(1, 1, 1, headersList.length).setValues([headersList]);
    
    // Data rows likho (Row 2 onwards)
    sheet.getRange(2, 1, rows.length, headersList.length).setValues(rows);
  }

  // ========================================
  // ✅ STEP 7: Success Message
  // ========================================
  
  // User ko notification dikhao (bottom right corner)
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `✅ Sync Complete → Sent: ${newToServer}, ← Received: ${newToSheet}`,
    "Daily Data Sync"
  );

  // Console mein bhi log karo
  Logger.log(`🔁 Sync Done. Sent: ${newToServer}, Received: ${newToSheet}`);
}
