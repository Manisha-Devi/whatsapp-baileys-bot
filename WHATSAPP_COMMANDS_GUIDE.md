# WhatsApp Bot Commands Guide

This guide shows all available WhatsApp commands for the Bus Transportation Management Bot.

**NEW**: The bot now supports **menu-based navigation** for easier use!

---

## 🏠 GETTING STARTED - Menu Navigation

### Quick Start with Menu System

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

### Navigation Flow

```
Entry (Main Menu)
  ├─ Daily
  │   ├─ Data (Enter daily reports without "daily" prefix)
  │   ├─ Status (Check/update status without "daily" prefix)
  │   └─ Exit (Back to Main Menu)
  │
  ├─ Booking
  │   ├─ Data (Enter bookings without "booking" prefix)
  │   ├─ Status (Check/update status without "booking" prefix)
  │   └─ Exit (Back to Main Menu)
  │
  └─ Exit (Close menu)
```

---

## 📊 DAILY FEATURE - Two Ways to Use

### Method 1: Menu-Based (Recommended)

1. Send `Entry` to open menu
2. Reply `Daily`
3. Reply `Data` for data entry OR `Status` for status management
4. Enter your commands **without** the "daily" prefix
5. Reply `Exit` to go back

**Example Data Entry:**
```
Entry
Daily
Data

Dated 15/11/2025
Diesel 5000
Adda 200
Union 150
Total Cash Collection 25000
Online 3000
Remarks All ok
Submit

Exit
```

### Method 2: Traditional (With Prefix)

All commands must start with `daily` prefix:

#### 1. Submit Daily Report

```
daily
Dated 15/11/2025
Diesel 5000
Adda 200
Union 150
Total Cash Collection 25000
Online 3000
Remarks All payments received
Submit
```

#### Using Expense Commands
```
daily
Dated 16/11/2025
Expense Diesel 5000 cash
Expense Adda 200 cash
Expense Union 150 online
Expense Mechanic 1500 cash remarks engine repair
Total Cash Collection 28000
Online 4500
Submit
```

#### Field Formats
- **Dated**: `Dated DD/MM/YYYY` or `Dated today` or `Dated yesterday`
- **Diesel**: `Diesel 5000` (amount in rupees)
- **Adda**: `Adda 200` (adda fee)
- **Union**: `Union 150` (union fee)
- **Total Cash Collection**: `Total Cash Collection 25000`
- **Online**: `Online 3000` (online payment amount)
- **Extra Expenses**: `Expense [name] [amount] [cash/online] remarks [details]`
- **Remarks**: `Remarks your comments here`

---

### 2. View Daily Status

#### Menu Mode:
```
Entry → Daily → Status
status initiated
status collected
status deposited
```

#### Traditional Mode:
```
daily status initiated
daily status collected
daily status deposited
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

### 3. Update Daily Status

#### Menu Mode (Entry → Daily → Status):
```
update status 15/11/2025 collected
update status 15/11/2025 deposited remarks bank deposit done
update status 10/11/2025 to 15/11/2025 collected
```

#### Traditional Mode:
```
daily update status 15/11/2025 collected
daily update status 15/11/2025 deposited remarks bank deposit done
daily update status 10/11/2025 to 15/11/2025 collected
daily update status 15/11/2025,16/11/2025,17/11/2025 collected
```

**Allowed Status Values:**
- `collected` - Cash has been collected
- `deposited` - Cash has been deposited to bank

---

### 4. Fetch Daily Records

#### Menu Mode (Entry → Daily → Data):
```
today
yesterday
last 7
15/11/2025
10/11/2025 to 15/11/2025
```

#### Traditional Mode:
```
daily today
daily yesterday
daily last 7
daily 15/11/2025
daily 10/11/2025 to 15/11/2025
```

---

### 5. Delete Expenses

#### Menu Mode (Entry → Daily → Data):
```
expense delete 1
expense delete mechanic
```

#### Traditional Mode:
```
daily expense delete 1
daily expense delete mechanic
```

---

### 6. Clear Session

#### Menu Mode (Entry → Daily → Data):
```
clear
```

#### Traditional Mode:
```
daily clear
```

---

## 🚌 BOOKINGS FEATURE - Two Ways to Use

### Method 1: Menu-Based (Recommended)

1. Send `Entry` to open menu
2. Reply `Booking`
3. Reply `Data` for booking entry OR `Status` for status management
4. Enter your commands **without** the "booking" prefix
5. Reply `Exit` to go back

**Example Booking Entry:**
```
Entry
Booking
Data

Customer Name Rahul Sharma
Customer Phone 9876543210
Pickup Location Delhi Railway Station
Drop Location Agra
Travel Date 20/11/2025
Vehicle Type Tempo Traveller
Number of Passengers 12
Total Fare 8000
Advance Paid 3000
Submit

Exit
```

### Method 2: Traditional (With Prefix)

#### 1. Create New Booking

```
booking
Customer Name Rahul Sharma
Customer Phone 9876543210
Pickup Location Delhi Railway Station
Drop Location Agra
Travel Date 20/11/2025
Vehicle Type Tempo Traveller
Number of Passengers 12
Total Fare 8000
Advance Paid 3000
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
- **Remarks**: `Remarks [additional notes]`

---

### 2. View Booking Status

#### Menu Mode (Entry → Booking → Status):
```
status pending
status confirmed
status completed
status cancelled
```

#### Traditional Mode:
```
booking status pending
booking status confirmed
booking status completed
booking status cancelled
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

### 3. Update Booking Status

#### Menu Mode (Entry → Booking → Status):
```
update status BK001 confirmed
update status BK001 confirmed remarks customer verified
update status BK002 completed
```

#### Traditional Mode:
```
booking update status BK001 confirmed
booking update status BK001 confirmed remarks customer verified
booking update status BK002 completed
booking update status BK003 cancelled remarks customer request
```

**Allowed Booking Status Values:**
- `pending` - Booking created, awaiting confirmation
- `confirmed` - Booking confirmed
- `completed` - Trip completed successfully
- `cancelled` - Booking cancelled

---

### 4. Fetch Booking Details

#### Menu Mode (Entry → Booking → Data):
```
BK001
20/11/2025
9876543210
20/11/2025 to 25/11/2025
```

#### Traditional Mode:
```
booking BK001
booking 20/11/2025
booking 9876543210
booking 20/11/2025 to 25/11/2025
```

---

### 5. Clear Booking Session

#### Menu Mode (Entry → Booking → Data):
```
clear
```

#### Traditional Mode:
```
booking clear
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
1. **Use Entry command**: Start with `Entry` for guided menu system
2. **No prefix needed**: When in menu mode, no need to type "daily" or "booking"
3. **Easy navigation**: Use `Exit` to go back one level
4. **Get help anytime**: Type `Help` when in Data or Status mode

### Daily Reports
1. **Always start with the date**: `Dated DD/MM/YYYY`
2. **Use expense commands for better tracking**: Include cash/online mode
3. **Add remarks for clarity**: Important details about the day
4. **Submit only when all fields are complete**: Bot will notify you
5. **Update status progressively**: Initiated → Collected → Deposited

### Bookings
1. **Confirm customer details**: Double-check phone number and name
2. **Specify vehicle type clearly**: Bus, Car, Tempo Traveller, etc.
3. **Record advance payment**: Track balance amount automatically
4. **Use remarks for special requests**: AC/Non-AC, pickup time, etc.
5. **Update status promptly**: Keep bookings current

---

## 🆘 Help Commands

Get help anytime by sending:

### Quick Help (from anywhere):
```
Daily help
Booking help
```

### Contextual Help (when in menu):
```
Entry → Daily → Data → Help
Entry → Daily → Status → Help
Entry → Booking → Data → Help
Entry → Booking → Status → Help
```

---

## 📝 Notes

- All dates should be in DD/MM/YYYY format
- Phone numbers should be 10 digits
- Amount fields accept numbers only (₹ symbol not needed)
- Status updates are case-insensitive
- You can edit fields before submitting by sending them again
- Use `clear` to start fresh if you make mistakes
- **Menu mode** is the easiest way to use the bot!

---

## 🎯 Quick Reference

### Essential Commands

| Command | Purpose |
|---------|---------|
| `Entry` | Open main menu |
| `Exit` | Go back one level / close menu |
| `Daily` | Select daily reports (from main menu) |
| `Booking` | Select bookings (from main menu) |
| `Data` | Data entry mode |
| `Status` | Status management mode |
| `Help` | Show help for current context |
| `Clear` | Clear current session |
| `Submit` | Submit your entry |

---

## 🔗 Related Documentation

- See `replit.md` for technical architecture
- See `paths.md` for codebase structure
- Contact admin for feature requests or issues

---

**Version**: 2.0 - Menu-Based Navigation  
**Last Updated**: November 17, 2025
