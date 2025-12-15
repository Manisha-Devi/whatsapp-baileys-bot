/**
 * employees.js - Employee Data Management
 * 
 * This module handles loading and querying employee data.
 * Employees are bus staff (drivers, conductors) whose daily wages
 * are automatically added as expenses in daily reports.
 * 
 * Data is loaded from src/data/employee.json
 */

import fs from "fs";

// Path to the employee data file
const employeeFile = "./src/data/employee.json";

// Cache for employee data to avoid repeated file reads
let employeesData = null;

/**
 * Load employee data from the JSON file
 * Returns cached data if already loaded
 * 
 * @returns {Object} Object containing employees array
 */
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

/**
 * Get all employees (with caching)
 * Uses cached data if available to improve performance
 * 
 * @returns {Array} Array of employee objects
 */
export function getEmployees() {
  if (!employeesData) {
    employeesData = loadEmployees();
  }
  return employeesData.employees || [];
}

/**
 * Get active employees assigned to a specific bus
 * Only returns employees who:
 * - Are assigned to the specified bus
 * - Have 'Active' status
 * - Have a daily wage greater than 0
 * 
 * @param {string} busCode - The bus code to filter by
 * @returns {Array} Array of active employee objects for that bus
 */
export function getActiveEmployeesByBus(busCode) {
  const employees = getEmployees();
  return employees.filter(
    (emp) =>
      emp.busCode === busCode &&
      emp.status === "Active" &&
      emp.daily > 0  // Only include employees with a daily wage
  );
}

/**
 * Get employee expenses formatted for daily reports
 * Converts active employees to expense objects with their roles and daily wages
 * All employee expenses are treated as cash payments
 * 
 * @param {string} busCode - The bus code to get expenses for
 * @returns {Array} Array of expense objects with name, amount, and mode
 */
export function getEmployExpensesForBus(busCode) {
  const activeEmployees = getActiveEmployeesByBus(busCode);
  return activeEmployees.map((emp) => ({
    name: emp.role,      // Use the role (e.g., "Driver", "Conductor") as the expense name
    amount: emp.daily,   // Daily wage amount
    mode: "cash",        // All employee payments are in cash
  }));
}

/**
 * Reload employee data from file
 * Clears the cache and forces a fresh read
 * Use this after the employee.json file has been updated
 * 
 * @returns {Array} Freshly loaded array of employee objects
 */
export function reloadEmployees() {
  employeesData = null;  // Clear cache
  return getEmployees(); // Load fresh data
}
