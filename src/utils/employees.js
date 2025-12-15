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
const usersFile = "./src/data/users.json";

// Cache for employee data to avoid repeated file reads
let employeesData = null;
let usersData = null;

/**
 * Load users data from the JSON file
 * Returns cached data if already loaded
 * 
 * @returns {Object} Object containing users array
 */
function loadUsers() {
  try {
    if (!fs.existsSync(usersFile)) {
      console.warn("⚠️ users.json not found");
      return { users: [] };
    }
    const data = fs.readFileSync(usersFile, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ Error loading users:", err);
    return { users: [] };
  }
}

/**
 * Get all users (with caching)
 * Uses cached data if available to improve performance
 * 
 * @returns {Array} Array of user objects
 */
export function getUsers() {
  if (!usersData) {
    usersData = loadUsers();
  }
  return usersData.users || [];
}

/**
 * Extract phone number from WhatsApp sender ID
 * Handles formats like:
 * - "919797304901@s.whatsapp.net"
 * - "919797304901:2@s.whatsapp.net" (multi-device with device suffix)
 * - "+919797304901@s.whatsapp.net"
 * 
 * @param {string} sender - WhatsApp sender ID
 * @returns {string} Extracted phone number (last 10 digits)
 */
function extractPhoneFromSender(sender) {
  if (!sender) return "";
  let phone = sender.replace("@s.whatsapp.net", "");
  phone = phone.split(":")[0];
  phone = phone.replace(/^\+/, "");
  phone = phone.replace(/\D/g, "");
  if (phone.length > 10) {
    phone = phone.slice(-10);
  }
  return phone;
}

/**
 * Get user's full name by phone number
 * Matches phone from WhatsApp sender ID against users.json
 * 
 * @param {string} sender - WhatsApp sender ID (e.g., "919797304901@s.whatsapp.net")
 * @returns {string|null} User's full name or null if not found
 */
export function getUserNameByPhone(sender) {
  const phone = extractPhoneFromSender(sender);
  if (!phone) return null;
  
  const users = getUsers();
  const user = users.find(u => u.phone === phone);
  
  if (!user) return null;
  
  const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
  return parts.join(" ") || null;
}

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
 * Converts active employees to expense objects with their full names, roles and daily wages
 * All employee expenses are treated as cash payments
 * 
 * @param {string} busCode - The bus code to get expenses for
 * @returns {Array} Array of expense objects with name, role, amount, and mode
 */
export function getEmployExpensesForBus(busCode) {
  const activeEmployees = getActiveEmployeesByBus(busCode);
  return activeEmployees.map((emp) => {
    // Build full name from firstName, middleName, lastName
    const nameParts = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean);
    const fullName = nameParts.join(" ") || emp.role;
    
    return {
      name: fullName,      // Full name (e.g., "Sanjay Kumar")
      role: emp.role,      // Role (e.g., "Driver", "Conductor")
      amount: emp.daily,   // Daily wage amount
      mode: "cash",        // All employee payments are in cash
    };
  });
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
