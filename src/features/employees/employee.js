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
  const { startDate, endDate, label } = getSalaryPeriod(command);
  const employees = getEmployees().filter(
    (employee) =>
      employee.busCode === busCode &&
      employee.status === "Active" &&
      Number(employee.salary) > 0
  );

  const [dailyPayments, bookingPayments] = await Promise.all([
    collectEmployeePayments(dailyDb, busCode, startDate, endDate),
    collectEmployeePayments(bookingsDb, busCode, startDate, endDate),
  ]);

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
    let totalPaid = 0;

    for (const employee of employees) {
      const dailyPaid = dailyPayments
        .filter((payment) => paymentMatchesEmployee(payment, employee))
        .reduce((sum, payment) => sum + payment.amount, 0);
      const bookingPaid = bookingPayments
        .filter((payment) => paymentMatchesEmployee(payment, employee))
        .reduce((sum, payment) => sum + payment.amount, 0);
      const paid = dailyPaid + bookingPaid;
      const monthlySalary = Number(employee.salary) || 0;
      const remaining = monthlySalary - paid;

      totalMonthlySalary += monthlySalary;
      totalPaid += paid;

      lines.push(
        `👤 *${employeeName(employee)}*`,
        `Role: ${employee.role || "Employee"}`,
        `Monthly Salary: ₹${monthlySalary.toLocaleString("en-IN")}`,
        `Daily Salary: ₹${(Number(employee.daily) || 0).toLocaleString("en-IN")}`,
        `Daily Report Paid: ₹${dailyPaid.toLocaleString("en-IN")}`,
        `Booking Paid: ₹${bookingPaid.toLocaleString("en-IN")}`,
        `Total Deducted: ₹${paid.toLocaleString("en-IN")}`,
        remaining >= 0
          ? `Remaining Salary: ₹${remaining.toLocaleString("en-IN")}`
          : `Overpaid: ₹${Math.abs(remaining).toLocaleString("en-IN")}`,
        "",
      );
    }

    lines.push(
      "📊 *Total*",
      `Monthly Salary: ₹${totalMonthlySalary.toLocaleString("en-IN")}`,
      `Total Deducted: ₹${totalPaid.toLocaleString("en-IN")}`,
      totalMonthlySalary >= totalPaid
        ? `Remaining Salary: ₹${(totalMonthlySalary - totalPaid).toLocaleString("en-IN")}`
        : `Total Overpaid: ₹${(totalPaid - totalMonthlySalary).toLocaleString("en-IN")}`,
      "",
      "ℹ️ All employee daily-salary payments from Daily Reports and Bookings are deducted from monthly salary, including payments above the configured daily rate.",
    );
  }

  await sock.sendMessage(sender, { text: lines.join("\n") });
}