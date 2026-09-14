# WhatsApp Bot Commands Guide

This guide shows all available WhatsApp commands for the Bus Transportation Management Bot.

**IMPORTANT**: The bot now uses **menu-only navigation**. All commands must be accessed through the menu system.

---

## 🏠 GETTING STARTED

### Quick Start

Send **Entry** to open the interactive menu:

```
Entry
```

You'll see:
```
🏠 Main Menu

Please select an option:

📊 Reply Daily - for Daily Reports
🚌 Reply Booking - for Booking Management
🚪 Reply Exit - to close menu
```

### Complete Navigation Flow

```
Entry (Main Menu)
  ├─ Daily
  │   ├─ Data (Enter daily reports)
  │   ├─ Status (Check/update status)
  │   ├─ Reports (View reports - multiple formats)
  │   ├─ Help (Get command help)
  │   └─ Exit (Back to Main Menu)
  │
  ├─ Booking
  │   ├─ Data (Enter bookings)
  │   ├─ Status (Check/update status)
  │   ├─ Reports (Coming soon)
  │   ├─ Help (Get command help)
  │   └─ Exit (Back to Main Menu)
  │
  └─ Exit (Close menu)
```

### Menu Breadcrumb

Type **Menu** anytime to see your current location:

```
Menu
```

You'll see your current path, for example:
```
📍 Current Location:
🏠 Main Menu -> 📊 Daily Menu -> 📊 Reports

Quick Actions:
• Reply Entry - Go to Main Menu
• Reply Exit - Go back to Daily Menu
• Reply Help - Get help for current section
```

---

## 📈 COMBINED REPORT FEATURE

### Navigation

```
Entry → Bus Selection → Select Bus → Report
```

The Report section combines Daily and Booking data for the selected bus and
calculates collections, expenses, net profit, and average profit per day.

### Average Commands

```
Average Today
Average This Week
Average This Month
Average This Year
Average July
Average July 2025
Average 1 Sept to 15 Sept
Average 1 Sept 2025 to 15 Sept
Average 1 Sept 2025 to 15 Sept 2025
Average 01/09/2025 to 15/09/2025
```

For a month without a year, the current year is used. For a date range, if
only one year is provided, it is applied to both dates. If both dates include
a year, each date uses its specified year.

Each average report includes separate Daily and Booking sections plus an
Overall section with total collection, total expenses, net profit, working
days,
and average profit per day.

---

## 📊 DAILY FEATURE

### 1. Submit Daily Report

**Navigation**: `Entry → Daily → Data`

Then enter your data (no prefix needed):

```
Dated 15/11/2025
Diesel 5000
Adda 200
Union 150
Total Cash Collection 25000
Online 3000
Remarks All ok
Submit
```

#### Field Formats
- **Dated**: `Dated DD/MM/YYYY` or `Dated today` or `Dated yesterday`
- **Diesel**: `Diesel 5000` (amount in rupees)
- **Adda**: `Adda 200` (adda fee)
- **Union**: `Union 150` (union fee)
- **Total Cash Collection**: `Total Cash Collection 25000`
- **Online**: `Online 3000` (online payment amount)
- **Remarks**: `Remarks your comments here`

#### Using Expense Commands

You can use detailed expense tracking:

```
Dated 16/11/2025
Expense Diesel 5000 cash
Expense Adda 200 cash
Expense Union 150 online
Expense Mechanic 1500 cash remarks engine repair
Total Cash Collection 28000
Online 4500
Submit
```

**Expense Format**: `Expense [name] [amount] [cash/online] remarks [details]`

---

### 2. Fetch Daily Records

**Navigation**: `Entry → Daily → Data`

Fetch existing records by:

```
today
yesterday
last 7
entries
entries 10
last 10 entries
15/11/2025
10/11/2025 to 15/11/2025
```

**Supported formats:**
- `today` - Today's record
- `yesterday` - Yesterday's record
- `last [N]` - Last N days (e.g., `last 7`, `last 30`)
- `entries` - Last 5 saved entries, even when some dates are missing
- `entries [N]` or `last [N] entries` - Last N saved entries
- `this month` - All current-month entries, newest first
- `last month` - All previous-month entries, newest first
- `jul`, `july`, or `july 2025` - All entries for the named month, newest first
- `DD/MM/YYYY` - Specific date
- `DD/MM/YYYY to DD/MM/YYYY` - Date range

---

### 3. View Daily Reports

**Navigation**: `Entry → Daily → Reports`

The Reports section supports multiple formats:

#### Today's Report
```
Today
```

#### Last N Days
```
Last 5 Days
Last 10 Days
Last 30 Days
```

#### N Days Ago
```
5 Days Ago
10 Days Ago
```

#### Specific Date
```
15/11/2025
```

#### Date Range
```
10/11/2025 to 15/11/2025
```

#### This Month
```
This Month
```

#### This Week
```
This Week
```

**Example Output:**
```
✅ Today 📅 Dated: Sunday, 17 November 2025

💵 Diesel: ₹5000
💵 Adda: ₹200
💵 Union: ₹150
💰 Total Cash Collection: ₹25000
💳 Online: ₹3000
🏦 Cash Handover: ₹19650
📝 Remarks: All ok
📊 Status: Initiated
```

For date ranges, you'll get multiple reports formatted with day names and dates.

---

### 4. View Daily Status

**Navigation**: `Entry → Daily → Status`

Check records by status:

```
status initiated
status collected
status deposited
```

**Example Output:**
```
📊 *Pending Daily Entries (Status: Initiated)*

📅 Friday, 15 November 2025
💵 Cash Handover: ₹24150

📅 Thursday, 14 November 2025
💵 Cash Handover: ₹22500

📊 *Total Pending Entries:* 2
💰 *Total Cash Handover:* ₹46650
```

---

### 5. Update Daily Status

**Navigation**: `Entry → Daily → Status`

Update status of existing records:

```
update status 15/11/2025 collected
update status 15/11/2025 deposited remarks bank deposit done
update status 10/11/2025 to 15/11/2025 collected
update status 15/11/2025,16/11/2025,17/11/2025 collected
```

**Allowed Status Values:**
- `collected` - Cash has been collected
- `deposited` - Cash has been deposited to bank

---

### 6. Employee Expenses (Manual Entry)

**Navigation**: `Entry → Daily → Data`

Driver and Conductor expenses are loaded automatically from employee data. However, you can also add or update them manually:

```
driver 250
conductor 150
driver 200 online
conductor 100 online
```

**Format**: `[driver/conductor] [amount] [optional: online]`

**Examples:**
- `driver 250` - Set driver expense to ₹250 (cash)
- `conductor 150` - Set conductor expense to ₹150 (cash)
- `driver 200 online` - Set driver expense to ₹200 (online payment)

**Note**: Manual entries will override the automatic values. This is useful when:
- Automatic data is not available
- You need to correct the amount
- Driver/Conductor is different for that day

---

### 7. Delete Expenses

**Navigation**: `Entry → Daily → Data`

Delete specific expenses:

```
expense delete 1
expense delete mechanic
```

- By number: `expense delete 1` (deletes first extra expense)
- By name: `expense delete mechanic` (deletes expense with "mechanic" in name)

---

### 8. Clear Session

**Navigation**: `Entry → Daily → Data`

Clear current session to start fresh:

```
clear
```

---

## 🚌 BOOKINGS FEATURE

### 1. Create New Booking

**Navigation**: `Entry → Booking → Data`

Enter booking details:

```
Customer Name Rahul Sharma
Customer Phone 9876543210
Pickup Location Delhi Railway Station
Drop Location Agra
Travel Date 20/11/2025
Vehicle Type Tempo Traveller
Number of Passengers 12
Total Fare 8000
Advance Paid 3000
Remarks AC required
Submit
```

#### Field Formats
- **Customer Name**: `Customer Name [full name]`
- **Customer Phone**: `Customer Phone [10-digit number]`
- **Pickup Location**: `Pickup Location [address/place]`
- **Drop Location**: `Drop Location [destination]`
- **Travel Date**: `Travel Date DD/MM/YYYY`
- **Vehicle Type**: `Vehicle Type [bus/car/tempo traveller/etc]`
- **Number of Passengers**: `Number of Passengers [count]`
- **Total Fare**: `Total Fare [amount]`
- **Advance Paid**: `Advance Paid [amount]`
- **Remarks**: `Remarks [additional notes]` (optional)

**Note**: Balance amount is automatically calculated as `Total Fare - Advance Paid`

---

### 2. Fetch Booking Details

**Navigation**: `Entry → Booking → Data`

Fetch bookings by:

```
BK001
20/11/2025
9876543210
20/11/2025 to 25/11/2025
```

**Supported formats:**
- `BK[ID]` - Booking ID (e.g., `BK001`)
- `DD/MM/YYYY` - Travel date
- `[10-digit phone]` - Customer phone number
- `DD/MM/YYYY to DD/MM/YYYY` - Date range

---

### 3. View Booking Reports

**Navigation**: `Entry → Booking → Reports`

View booking records one by one, newest first:

```
Entries
Entries 5
Last 5 Entries
This Month
Last Month
July
July 2025
```

`Entries` shows the latest 5 bookings by default. Each booking is sent as a
separate WhatsApp message with customer, route, travel date, fare, advance,
balance, status, payment history, expenses, and remarks where available.

---

### 4. View Booking Status

**Navigation**: `Entry → Booking → Status`

Check bookings by status:

```
status pending
status confirmed
status completed
status cancelled
```

**Example Output:**
```
📊 *Bookings with Status: Pending*

📅 20/11/2025
👤 Rahul Sharma (9876543210)
📍 Delhi → Agra
🚐 Tempo Traveller (12 passengers)
💰 Total: ₹8000 | Paid: ₹3000 | Balance: ₹5000

📊 *Total Pending Bookings:* 1
💵 *Total Balance Amount:* ₹5000
```

---

### 5. Update Booking Status

**Navigation**: `Entry → Booking → Status`

Update booking status:

```
update status BK001 confirmed
update status BK001 confirmed remarks customer verified
update status BK002 completed
update status BK003 cancelled remarks customer request
```

**Allowed Booking Status Values:**
- `pending` - Booking created, awaiting confirmation
- `confirmed` - Booking confirmed
- `completed` - Trip completed successfully
- `cancelled` - Booking cancelled

---

### 6. Clear Booking Session

**Navigation**: `Entry → Booking → Data`

Clear current session:

```
clear
```

---

## 🔄 Common Patterns

### Status Flow - Daily
```
Initiated → Collected → Deposited
```

### Status Flow - Bookings
```
Pending → Confirmed → Completed
         ↓
    Cancelled
```

---

## 💡 Tips & Best Practices

### Menu Navigation
1. **Start with Entry**: Always begin with `Entry` command
2. **Use Menu command**: Type `Menu` to see where you are
3. **Navigate easily**: Use `Exit` to go back one level
4. **Get help anytime**: Type `Help` in any section
5. **No prefixes needed**: When in menu mode, commands work without "daily" or "booking" prefix

### Daily Reports
1. **Always start with the date**: `Dated DD/MM/YYYY`
2. **Use expense commands for better tracking**: Include cash/online mode
3. **Add remarks for clarity**: Important details about the day
4. **Submit only when complete**: Bot will notify when all required fields are filled
5. **Update status progressively**: Initiated → Collected → Deposited
6. **Use Reports section**: View formatted reports with multiple date options

### Bookings
1. **Confirm customer details**: Double-check phone number and name
2. **Specify vehicle type clearly**: Bus, Car, Tempo Traveller, etc.
3. **Record advance payment**: Balance is calculated automatically
4. **Use remarks for special requests**: AC/Non-AC, pickup time, etc.
5. **Update status promptly**: Keep bookings current

---

## 🆘 Help Commands

Get help anytime by typing `Help` when you're in any section:

```
Entry → Daily → Data → Help
Entry → Daily → Status → Help
Entry → Daily → Reports → Help
Entry → Booking → Data → Help
Entry → Booking → Status → Help
```

Each section provides context-specific help showing all available commands for that section.

---

## 📝 Notes

- All dates should be in DD/MM/YYYY format
- Phone numbers should be 10 digits
- Amount fields accept numbers only (₹ symbol not needed)
- Status updates are case-insensitive
- You can edit fields before submitting by sending them again
- Use `clear` to start fresh if you make mistakes
- Use `Menu` command to check your current location
- Use `Exit` to go back one level in navigation

---

## 🎯 Quick Reference

### Essential Commands

| Command | Purpose | Where to Use |
|---------|---------|--------------|
| `Entry` | Open main menu | Anywhere |
| `Exit` | Go back one level | Any menu |
| `Menu` | Show current location | Anywhere |
| `Daily` | Select daily reports | Main menu |
| `Booking` | Select bookings | Main menu |
| `Data` | Data entry mode | Daily/Booking menu |
| `Status` | Status management | Daily/Booking menu |
| `Reports` | View reports | Daily/Booking menu |
| `Help` | Show contextual help | Any submenu |
| `Clear` | Clear current session | Data mode |
| `Submit` | Submit your entry | Data entry |
| `Driver [amt]` | Set driver expense | Daily data entry |
| `Conductor [amt]` | Set conductor expense | Daily data entry |

### Daily Reports Formats

| Format | Example | Description |
|--------|---------|-------------|
| Today | `Today` | Today's report |
| Last N Days | `Last 7 Days` | Last N days reports |
| N Days Ago | `5 Days Ago` | Report from N days ago |
| Specific Date | `15/11/2025` | Single date report |
| Date Range | `10/11/2025 to 15/11/2025` | Multiple dates |
| This Month | `This Month` | Current month reports |
| This Week | `This Week` | Current week reports |

---

## 🔗 Related Documentation

- See `replit.md` for technical architecture
- Contact admin for feature requests or issues

---

**Version**: 3.0 - Menu-Only Navigation with Advanced Reports  
**Last Updated**: November 17, 2025
