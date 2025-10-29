function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 🧩 Detect which sheet to use
    const sheetName = data.dataType || "Daily"; // Default is Daily
    let sheet = ss.getSheetByName(sheetName);

    // ✅ Create sheet if missing
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow([
        "Timestamp",
        "Sender",
        "Dated",
        "Diesel",
        "Adda",
        "Union",
        "TotalCashCollection",
        "Online",
        "CashHandover",
        "ExtraExpenses"
      ]);
    }

    // 🧾 Format extra expenses
    const expenses = data.ExtraExpenses?.map(e => `${e.name}: ₹${e.amount}`).join(", ") || "";

    // ✅ Append row
    sheet.appendRow([
      new Date(),
      data.sender || "",
      data.Dated || "",
      data.Diesel || "",
      data.Adda || "",
      data.Union || "",
      data.TotalCashCollection || "",
      data.Online || "",
      data.CashHandover || "",
      expenses
    ]);

    return ContentService.createTextOutput("✅ Data added to " + sheetName);
  } catch (err) {
    return ContentService.createTextOutput("❌ Error: " + err);
  }
}
