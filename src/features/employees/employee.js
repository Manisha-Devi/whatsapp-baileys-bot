/**
 * Employee menu and salary reporting.
 *
 * Employee CRUD options are intentionally displayed as unavailable until
 * those operations are implemented. Salary reporting is read-only and uses
 * employee.json plus daily/booking employee salary expenses.
 */
import fs from "fs";
import { format, startOfMonth, endOfMonth, addMonths, isWithinInterval, parse } from "date-fns";
import dailyDb, { bookingsDb } from "../../utils/db.js";
import { getEmployees } from "../../utils/employees.js";

const DAILY_SALARY_TYPE = "dailySalary";
const CUT_OFF_FILE = "./src/data/cutt-off.json";

function getAmount(value) {
  return Number(value?.amount ?? value) || 0;
}

function getRecordDate(key, busCode) {
  if (!key.startsWith(`${busCode}_`)) return null;
  const dateText = key.slice(busCode.length + 1);

  try {
    return parse(dateText, "dd/MM/yyyy", new Date());
  } catch {
    return null;
  }
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function employeeName(employee) {
  return [employee.firstName, employee.middleName, employee.lastName]
    .filter(Boolean)
    .join(" ")
    .trim() || employee.role || employee.id;
}

function paymentMatchesEmployee(payment, employee) {
  const paymentName = normalizeName(payment.name);
  const fullName = normalizeName(employeeName(employee));
  const role = normalizeName(employee.role);

  // Automatically generated expenses contain the employee's full name.
  if (paymentName && paymentName === fullName) return true;

  // Older/manual records may contain only the role. Attribute those to the
  // employee when the role field identifies the employee.
  return (
    normalizeName(payment.role) === role &&
    (!paymentName || paymentName === role)
  );
}

function getPaymentDateKey(date) {
  return format(date, "yyyy-MM-dd");
}

function formatRupees(amount) {
  return `₹${Math.abs(amount).toLocaleString("en-IN")}`;
}

function formatSignedRupees(amount) {
  if (amount === 0) return "₹0";
  return `${amount > 0 ? "+" : "-"}${formatRupees(amount)}`;
}

function loadCutOffData() {
  try {
    if (!fs.existsSync(CUT_OFF_FILE)) return { cutOffs: [] };
    return JSON.parse(fs.readFileSync(CUT_OFF_FILE, "utf-8"));
  } catch (error) {
    console.error("❌ Error loading employee cut-off data:", error);
    return { cutOffs: [] };
  }
}

function getCutOffForEmployee(employee) {
  const cutOffData = loadCutOffData();
  return (cutOffData.cutOffs || []).find(
    (cutOff) => cutOff.employeeCode === employee.id
  ) || null;
}

function parseCutOffMonth(cutOffMonth) {
  if (!/^\d{4}-\d{2}$/.test(cutOffMonth || "")) return null;
  const [year, month] = cutOffMonth.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function getBusNumber(busCode) {
  const match = String(busCode || "").match(/(\d+)$/);
  return match ? match[1] : busCode || "N/A";
}

async function collectEmployeePayments(db, busCode, startDate, endDate) {
  await db.read();
  const payments = [];

  for (const [key, record] of Object.entries(db.data || {})) {
    const recordDate = getRecordDate(key, busCode);
    if (!recordDate || !isWithinInterval(recordDate, { start: startDate, end: endDate })) {
      continue;
    }

    for (const expense of record.EmployExpenses || []) {
      if (expense.type && expense.type !== DAILY_SALARY_TYPE) continue;
      const amount = getAmount(expense);
      if (amount > 0) {
        payments.push({ ...expense, amount, date: recordDate });
      }
    }
  }

  return payments;
}

function getEmployeePayments(payments, employee) {
  return payments.filter((payment) => paymentMatchesEmployee(payment, employee));
}

function getDailyPaymentRows(payments, employee, dailySalary) {
  const rowsByDate = new Map();

  for (const payment of getEmployeePayments(payments, employee)) {
    const dateKey = getPaymentDateKey(payment.date);
    if (!rowsByDate.has(dateKey)) {
      rowsByDate.set(dateKey, {
        date: payment.date,
        cash: 0,
        online: 0,
      });
    }

    const row = rowsByDate.get(dateKey);
    if (String(payment.mode).toLowerCase() === "online") {
      row.online += payment.amount;
    } else {
      row.cash += payment.amount;
    }
  }

  return [...rowsByDate.values()]
    .sort((a, b) => a.date - b.date)
    .map((row) => {
      const total = row.cash + row.online;
      return {
        ...row,
        total,
        advance: Math.max(total - dailySalary, 0),
      };
    });
}

function getSalaryPeriod(text, now = new Date()) {
  const normalized = text.trim().toLowerCase();
  let monthDate = startOfMonth(now);

  if (normalized.includes("last month")) {
    monthDate = startOfMonth(addMonths(now, -1));
  } else {
    const monthMatch = normalized.match(
      /(?:salary\s+)?(?:this month|month)?\s*(\d{1,2})[/-](\d{4})$/
    );
    const namedMonthMatch = normalized.match(
      /(?:salary\s+)?(?:this month|month)?\s*([a-z]{3,9})(?:\s+(\d{4}))?$/
    );

    if (monthMatch) {
      const month = Number(monthMatch[1]);
      const year = Number(monthMatch[2]);
      if (month >= 1 && month <= 12) monthDate = new Date(year, month - 1, 1);
    } else if (namedMonthMatch) {
      const monthIndex = [
        "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
      ].findIndex((month) => month.startsWith(namedMonthMatch[1].slice(0, 3)));

      if (monthIndex !== -1) {
        monthDate = new Date(
          Number(namedMonthMatch[2] || now.getFullYear()),
          monthIndex,
          1
        );
      }
    }
  }

  return {
    startDate: startOfMonth(monthDate),
    endDate: endOfMonth(monthDate),
    label: format(monthDate, "MMMM yyyy"),
  };
}

export async function sendEmployeeSalaryReport(
  sock,
  sender,
  state,
  command = "salary",
  selectedEmployeeId = null
) {
  const busCode = state.selectedBus;
  const currentPeriod = getSalaryPeriod(command);
  const { startDate, endDate, label } = currentPeriod;
  const employees = getEmployees().filter(
    (employee) =>
      employee.busCode === busCode &&
      (selectedEmployeeId
        ? employee.id === selectedEmployeeId
        : employee.status === "Active")
  );

  const [dailyPayments, bookingPayments] = await Promise.all([
    collectEmployeePayments(dailyDb, busCode, startDate, endDate),
    collectEmployeePayments(bookingsDb, busCode, startDate, endDate),
  ]);
  const currentPayments = [...dailyPayments, ...bookingPayments];
  const vehicleNumber = state.selectedBusInfo?.registrationNumber || busCode;
  const busNumber = getBusNumber(busCode);

  const lines = [
    "💰 *Employee Salary Report*",
    `📅 Period: *${label}*`,
    `🚌 *Vehicle Number: ${vehicleNumber}*`,
    `🔢 *Bus No: ${busNumber}*`,
    "",
  ];

  if (employees.length === 0) {
    lines.push("⚠️ No active employees with a monthly salary were found for this bus.");
  } else {
    let totalMonthlySalary = 0;
    let totalLastMonthAdvance = 0;
    let totalCurrentAdvance = 0;
    let totalRemaining = 0;
    let hasMissingCutOff = false;

    for (const employee of employees) {
      const monthlySalary = Number(employee.salary) || 0;
      const dailySalary = Number(employee.daily) || 0;

      lines.push(
        `👤 *${employeeName(employee)}*`,
        `Role: ${employee.role || "Employee"}`,
        `Monthly Salary: ${formatRupees(monthlySalary)}`,
        `Daily Salary: ${formatRupees(dailySalary)}`,
        "",
        "*Daily Payment Report:*",
      );

      const cutOff = getCutOffForEmployee(employee);
      if (!cutOff) {
        hasMissingCutOff = true;
        lines.push("⚠️ *Employee Cut-off Not Found*", "");
        continue;
      }

      const cutOffDate = parseCutOffMonth(cutOff.cutOffMonth);
      if (!cutOffDate) {
        hasMissingCutOff = true;
        lines.push("⚠️ *Employee Cut-off Not Found*", "");
        continue;
      }

      const calculationStartDate = startOfMonth(addMonths(cutOffDate, 1));
      const calculationPayments = currentPayments.filter(
        (payment) => payment.date >= calculationStartDate
      );
      const dailyRows = getDailyPaymentRows(calculationPayments, employee, dailySalary);
      const currentAdvance = dailyRows.reduce((sum, row) => sum + row.advance, 0);
      const lastMonthAdvance = Number(cutOff.lastMonthAdvance) || 0;
      const remaining = monthlySalary - lastMonthAdvance - currentAdvance;

      totalMonthlySalary += monthlySalary;
      totalLastMonthAdvance += lastMonthAdvance;
      totalCurrentAdvance += currentAdvance;
      totalRemaining += remaining;

      const dailyReportLines = dailyRows.length > 0
        ? dailyRows.map((row) => {
            const paymentParts = [`${format(row.date, "dd MMM yyyy")}`];
            if (row.cash > 0) paymentParts.push(`Cash ${formatRupees(row.cash)}`);
            if (row.online > 0) paymentParts.push(`Online ${formatRupees(row.online)}`);
            paymentParts.push(`Total ${formatRupees(row.total)}`);
            return paymentParts.join(" | ");
          })
        : ["No Daily or Booking salary payment recorded."];

      lines.push(
        ...dailyReportLines,
        "",
        "*Salary Summary:*",
        `Cut-Off Month: ${format(cutOffDate, "MMMM yyyy")}`,
        `Last Month Advance: ${formatSignedRupees(lastMonthAdvance)}`,
        `This Month Advance: ${formatSignedRupees(currentAdvance)}`,
        `This Month Remaining: ${formatSignedRupees(remaining)}`,
        "",
      );
    }

    if (!hasMissingCutOff) {
      lines.push(
        "📊 *Total*",
        `Monthly Salary: ${formatRupees(totalMonthlySalary)}`,
        `Last Month Advance: ${formatSignedRupees(totalLastMonthAdvance)}`,
        `This Month Advance: ${formatSignedRupees(totalCurrentAdvance)}`,
        `This Month Remaining: ${formatSignedRupees(totalRemaining)}`,
        "",
        "ℹ️ Only actual payments after the employee cut-off month are counted. A day with no payment is not added automatically.",
        "ℹ️ This Month Remaining = Monthly Salary − Last Month Advance − This Month Advance.",
      );
    }
  }

  await sock.sendMessage(sender, { text: lines.join("\n") });
}
