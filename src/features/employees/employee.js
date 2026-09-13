/**
 * Employee menu and salary reporting.
 *
 * Employee CRUD options are intentionally displayed as unavailable until
 * those operations are implemented. Salary reporting is read-only and uses
 * employee.json plus daily/booking employee salary expenses.
 */
import { format, startOfMonth, endOfMonth, subMonths, isWithinInterval, parse } from "date-fns";
import dailyDb, { bookingsDb } from "../../utils/db.js";
import { getEmployees } from "../../utils/employees.js";

const DAILY_SALARY_TYPE = "dailySalary";

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
    monthDate = startOfMonth(subMonths(now, 1));
  } else {
    const monthMatch = normalized.match(
      /(?:salary\s+)?(?:this month|month)?\s*(\d{1,2})[/-](\d{4})$/
    );
    const namedMonthMatch = normalized.match(
      /(?:salary\s+)?(?:this month|month)?\s*([a-z]{3,9})\s+(\d{4})$/
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
        monthDate = new Date(Number(namedMonthMatch[2]), monthIndex, 1);
      }
    }
  }

  return {
    startDate: startOfMonth(monthDate),
    endDate: endOfMonth(monthDate),
    label: format(monthDate, "MMMM yyyy"),
  };
}

export async function sendEmployeeSalaryReport(sock, sender, state, command = "salary") {
  const busCode = state.selectedBus;
  const currentPeriod = getSalaryPeriod(command);
  const lastMonthDate = startOfMonth(subMonths(currentPeriod.startDate, 1));
  const lastPeriod = {
    startDate: lastMonthDate,
    endDate: endOfMonth(lastMonthDate),
  };
  const { startDate, endDate, label } = currentPeriod;
  const employees = getEmployees().filter(
    (employee) =>
      employee.busCode === busCode &&
      employee.status === "Active" &&
      Number(employee.salary) > 0
  );

  const [dailyPayments, bookingPayments, lastDailyPayments, lastBookingPayments] = await Promise.all([
    collectEmployeePayments(dailyDb, busCode, startDate, endDate),
    collectEmployeePayments(bookingsDb, busCode, startDate, endDate),
    collectEmployeePayments(dailyDb, busCode, lastPeriod.startDate, lastPeriod.endDate),
    collectEmployeePayments(bookingsDb, busCode, lastPeriod.startDate, lastPeriod.endDate),
  ]);
  const currentPayments = [...dailyPayments, ...bookingPayments];
  const lastMonthPayments = [...lastDailyPayments, ...lastBookingPayments];

  const lines = [
    "💰 *Employee Salary Report*",
    `📅 Period: *${label}*`,
    `🚌 Bus: *${state.selectedBusInfo?.registrationNumber || busCode}*`,
    "",
  ];

  if (employees.length === 0) {
    lines.push("⚠️ No active employees with a monthly salary were found for this bus.");
  } else {
    let totalMonthlySalary = 0;
    let totalLastMonthAdvance = 0;
    let totalCurrentAdvance = 0;
    let totalRemaining = 0;

    for (const employee of employees) {
      const lastEmployeePayments = getEmployeePayments(lastMonthPayments, employee);
      const monthlySalary = Number(employee.salary) || 0;
      const dailySalary = Number(employee.daily) || 0;
      const dailyRows = getDailyPaymentRows(currentPayments, employee, dailySalary);
      const lastMonthPaid = lastEmployeePayments.reduce((sum, payment) => sum + payment.amount, 0);
      const currentAdvance = dailyRows.reduce((sum, row) => sum + row.advance, 0);
      // A month with no recorded payments has no advance or deduction.
      // When records exist, a positive value means advance paid and a
      // negative value means salary still pending from that month.
      const lastMonthAdvance =
        lastEmployeePayments.length > 0 ? lastMonthPaid - monthlySalary : 0;
      const remaining = monthlySalary - lastMonthAdvance - currentAdvance;

      totalMonthlySalary += monthlySalary;
      totalLastMonthAdvance += lastMonthAdvance;
      totalCurrentAdvance += currentAdvance;
      totalRemaining += remaining;

      lines.push(
        `👤 *${employeeName(employee)}*`,
        `Role: ${employee.role || "Employee"}`,
        `Monthly Salary: ${formatRupees(monthlySalary)}`,
        `Daily Salary: ${formatRupees(dailySalary)}`,
        "",
        "*Daily Payment Report:*",
        ...(dailyRows.length > 0
          ? dailyRows.map(
              (row) =>
                `${format(row.date, "dd MMM yyyy")} | Cash ${formatRupees(row.cash)} | Online ${formatRupees(row.online)} | Total ${formatRupees(row.total)}`
            )
          : ["No Daily or Booking salary payment recorded."]),
        "",
        "*Salary Summary:*",
        `Last Month Advance: ${formatSignedRupees(lastMonthAdvance)}`,
        `This Month Advance: ${formatSignedRupees(currentAdvance)}`,
        `This Month Remaining: ${formatSignedRupees(remaining)}`,
        "",
      );
    }

    lines.push(
      "📊 *Total*",
      `Monthly Salary: ${formatRupees(totalMonthlySalary)}`,
      `Last Month Advance: ${formatSignedRupees(totalLastMonthAdvance)}`,
      `This Month Advance: ${formatSignedRupees(totalCurrentAdvance)}`,
      `This Month Remaining: ${formatSignedRupees(totalRemaining)}`,
      "",
      "ℹ️ Only actual payments in Daily Reports and Bookings are counted. A day with no payment is not added automatically.",
      "ℹ️ This Month Remaining = Monthly Salary − Last Month Advance − This Month Advance.",
    );
  }

  await sock.sendMessage(sender, { text: lines.join("\n") });
}