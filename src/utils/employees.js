import fs from "fs";

const employeeFile = "./src/data/employee.json";

let employeesData = null;

function loadEmployees() {
  try {
    if (!fs.existsSync(employeeFile)) {
      console.warn("⚠️ employee.json not found");
      return { employees: [] };
    }
    const data = fs.readFileSync(employeeFile, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Error loading employees:", err);
    return { employees: [] };
  }
}

export function getEmployees() {
  if (!employeesData) {
    employeesData = loadEmployees();
  }
  return employeesData.employees || [];
}

export function getActiveEmployeesByBus(busCode) {
  const employees = getEmployees();
  return employees.filter(
    (emp) =>
      emp.busCode === busCode &&
      emp.status === "Active" &&
      emp.daily > 0
  );
}

export function getEmployExpensesForBus(busCode) {
  const activeEmployees = getActiveEmployeesByBus(busCode);
  return activeEmployees.map((emp) => ({
    name: emp.role,
    amount: emp.daily,
    mode: "cash",
  }));
}

export function reloadEmployees() {
  employeesData = null;
  return getEmployees();
}
