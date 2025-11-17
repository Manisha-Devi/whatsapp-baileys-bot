# WhatsApp Bot Commands Guide

This guide shows all available WhatsApp commands for the Bus Transportation Management Bot.

**IMPORTANT**: All commands must start with either `daily` or `booking` prefix.

---

## 📊 DAILY FEATURE - Commands & Examples

**Note**: All daily commands must start with `daily` prefix.

### 1. Submit Daily Report

#### Basic Daily Entry
Send field-by-field information (start with "daily"):

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

#### Get Status by Type
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

#### Update Single Date
```
daily update status 15/11/2025 collected
daily update status 15/11/2025 deposited remarks bank deposit done
```

#### Update Date Range
```
daily update status 10/11/2025 to 15/11/2025 collected
daily update status 01/11/2025 to 05/11/2025 deposited remarks weekly deposit
```

#### Update Multiple Dates (Comma Separated)
```
daily update status 15/11/2025,16/11/2025,17/11/2025 collected
daily update status 10/11/2025,11/11/2025 deposited
```

**Allowed Status Values:**
- `collected` - Cash has been collected
- `deposited` - Cash has been deposited to bank

---

### 4. Fetch Daily Records

#### Fetch Today's Record
```
daily today
```

#### Fetch Yesterday's Record
```
daily yesterday
```

#### Fetch Last N Days
```
daily last 7
daily last 30
```

#### Fetch Specific Date
```
daily 15/11/2025
```

#### Fetch Date Range
```
daily 10/11/2025 to 15/11/2025
```

**Example Output:**
```
📅 *Daily Report for 15/11/2025*

⛽ Diesel: ₹5000 (cash)
🏪 Adda: ₹200 (cash)
👥 Union: ₹150 (online)
💰 Total Cash Collection: ₹25000
💳 Online: ₹3000
💵 Cash Handover: ₹19650
📝 Remarks: All payments received
📊 Status: Initiated
```

---

### 5. Delete Expenses

#### Delete Extra Expense
```
expense delete 1
expense delete mechanic
```

---

### 6. Clear Session

Reset your current data entry session:
```
daily clear
```

---

## 🚌 BOOKINGS FEATURE - Commands & Examples

**Note**: All booking commands must start with `booking` prefix.

> **Note**: The bookings feature has basic field entry implemented. Status queries, fetching records, and database persistence are planned for future updates.



### 1. Create New Booking

#### Basic Booking Entry
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

#### Get Bookings by Status
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

📅 22/11/2025
👤 Priya Verma (9123456789)
📍 Mumbai → Pune
🚌 Bus (45 passengers)
💰 Total: ₹25000 | Paid: ₹10000 | Balance: ₹15000

📊 *Total Pending Bookings:* 2
💵 *Total Balance Amount:* ₹20000
```

---

### 3. Update Booking Status

#### Update Single Booking
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

#### Fetch by Booking ID
```
booking BK001
```

#### Fetch by Date
```
booking 20/11/2025
```

#### Fetch by Customer Phone
```
booking 9876543210
```

#### Fetch Date Range
```
booking 20/11/2025 to 25/11/2025
```

**Example Output:**
```
🎫 *Booking Details - BK001*

📅 Booking Date: 16/11/2025
📅 Travel Date: 20/11/2025
👤 Customer: Rahul Sharma
📱 Phone: 9876543210
📍 Route: Delhi Railway Station → Agra
🚐 Vehicle: Tempo Traveller
👥 Passengers: 12
💰 Total Fare: ₹8000
💵 Advance: ₹3000
💸 Balance: ₹5000
📊 Status: Confirmed
📝 Remarks: Confirmed by customer
```

---

### 5. Clear Booking Session

Reset your current booking entry:
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
```
daily help
booking help
```

---

## 📝 Notes

- All dates should be in DD/MM/YYYY format
- Phone numbers should be 10 digits
- Amount fields accept numbers only (₹ symbol not needed)
- Status updates are case-insensitive
- You can edit fields before submitting by sending them again
- Use `clear` to start fresh if you make mistakes

---

## 🔗 Related Documentation

- See `replit.md` for technical architecture
- See `paths.md` for codebase structure
- Contact admin for feature requests or issues

---

**Version**: 1.0  
**Last Updated**: November 16, 2025
