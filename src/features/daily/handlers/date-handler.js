import { format, parse, isValid } from "date-fns";

export function parseDate(value) {
  try {
    let normalizedValue = value.replace(/^\(*|\)*$/g, "").replace(/\*/g, "").trim().toLowerCase();

    const now = new Date();
    let targetDate = null;

    if (normalizedValue === "today") {
      targetDate = now;
    } else if (normalizedValue === "yesterday") {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() - 1);
    } else if (normalizedValue === "tomorrow") {
      targetDate = new Date(now);
      targetDate.setDate(now.getDate() + 1);
    }

    if (!targetDate) {
      const textDateMatch = normalizedValue.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
      if (textDateMatch) {
        const [_, d, monthName, y] = textDateMatch;
        const monthIndex = new Date(`${monthName} 1, ${y}`).getMonth();
        if (!isNaN(monthIndex)) {
          targetDate = new Date(y, monthIndex, parseInt(d, 10));
        }
      }
    }

    if (!targetDate) {
      const dateMatch = normalizedValue.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [_, dd, mm, yy] = dateMatch;
        const parsed = parse(`${dd}/${mm}/${yy}`, "dd/MM/yyyy", new Date());
        if (isValid(parsed)) targetDate = parsed;
      }
    }

    if (!targetDate || !isValid(targetDate)) {
      return null;
    }

    return targetDate;
  } catch (err) {
    console.error("❌ Error parsing date:", err);
    return null;
  }
}

export function formatDate(date) {
  try {
    return format(date, "EEEE, dd MMMM yyyy");
  } catch (err) {
    console.error("❌ Error formatting date:", err);
    return null;
  }
}

export function getDateKey(date) {
  try {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (err) {
    console.error("❌ Error getting date key:", err);
    return null;
  }
}

export function getPrimaryKey(busCode, date) {
  try {
    const dateKey = getDateKey(date);
    if (!dateKey) return null;
    return `${busCode}_${dateKey}`;
  } catch (err) {
    console.error("❌ Error getting primary key:", err);
    return null;
  }
}

export function getPrimaryKeyFromDateString(busCode, dateString) {
  try {
    return `${busCode}_${dateString}`;
  } catch (err) {
    console.error("❌ Error getting primary key from string:", err);
    return null;
  }
}

export function extractBusCodeFromKey(primaryKey) {
  try {
    const parts = primaryKey.split('_');
    return parts.length >= 2 ? parts[0] : null;
  } catch (err) {
    console.error("❌ Error extracting bus code:", err);
    return null;
  }
}

export function extractDateFromKey(primaryKey) {
  try {
    const parts = primaryKey.split('_');
    return parts.length >= 2 ? parts[1] : null;
  } catch (err) {
    console.error("❌ Error extracting date:", err);
    return null;
  }
}
