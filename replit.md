# Overview

This is a WhatsApp bot application built with Baileys (WhatsApp Web API) that manages business operations for a bus transportation company. The bot provides two main features:
1. **Daily Reports**: Submit daily operational reports including expenses (diesel, adda fees, union fees), collections (cash and online), and automatic cash handover calculations
2. **Bookings Management**: Handle customer bookings with passenger details, routes, vehicle assignments, and payment tracking

The bot provides conversational interfaces for data entry, validation, and retrieval, with data persistence using LowDB (JSON-based database) and integration with Google Sheets for reporting.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Framework
- **WhatsApp Integration**: Built on @whiskeysockets/baileys library for WhatsApp Web protocol communication
- **Authentication**: Multi-file authentication state management with QR code-based login system
- **Communication Pattern**: Event-driven message handling with conversational state machines per user session

## Application Structure
The application follows a modular src-based architecture (restructured November 2025):

- **Server Layer** (`src/server/index.js`): Express.js REST API server managing WhatsApp socket lifecycle, QR code generation, and authentication state
- **Message Orchestrator** (`src/features/daily/daily.js`): ~110 lines - Clean orchestrator that routes incoming WhatsApp messages to appropriate handlers
- **Handler Modules** (`src/features/daily/handlers/*`): Specialized handlers for different conversation flows:
  - `command-handler.js`: Clear command and daily data fetch commands (today, last N days, specific dates)
  - `date-handler.js`: Date parsing and validation with multiple format support (DD/MM/YYYY, today, yesterday, textual dates)
  - `expense-handler.js`: Expense tracking with cash/online mode support and deletion
  - `fetch-handler.js`: Fetch existing record confirmation and cancel choice workflows
  - `field-handler.js`: Field extraction, validation, and update confirmation logic
  - `submit-handler.js`: Submit and update confirmation workflows with conflict resolution
- **Utility Modules** (`src/features/daily/utils/*`): Reusable business logic:
  - `helpers.js`: Safe wrappers for messaging and database operations (safeSendMessage, safeDbRead, safeDbWrite)
  - `formatters.js`: Text formatting utilities (capitalize, formatExistingForMessage)
  - `calculations.js`: Business calculations (recalculateCashHandover, getCompletionMessage)
  - `messages.js`: Message template functions (sendSummary, sendSubmittedSummary)
- **Status Handlers** (`src/features/daily/daily_status.js`): Unified handler for status queries and updates (merged from separate files)

### Bookings Feature
- **Message Orchestrator** (`src/features/bookings/booking.js`): Clean orchestrator that routes booking-related WhatsApp messages to appropriate handlers
- **Handler Modules** (`src/features/bookings/handlers/*`): Specialized handlers for booking workflows:
  - `command-handler.js`: Clear command and booking fetch commands by ID, date, or phone
  - `field-handler.js`: Field extraction for booking details (customer info, route, vehicle, fare)
  - `submit-handler.js`: Booking submission workflow with validation and ID generation
- **Utility Modules** (`src/features/bookings/utils/*`): Reusable booking logic:
  - `helpers.js`: Safe wrappers for messaging and database operations
  - `messages.js`: Booking summary and completion message functions
- **Status Handlers** (`src/features/bookings/booking_status.js`): Handlers for booking status queries and updates with database persistence
- **Data Layer** (`src/data/db.js`): LowDB adapter for JSON-based storage managing daily and booking databases

## State Management
- **Session State**: In-memory global objects tracking conversation state per WhatsApp sender:
  - `global.userData`: Daily reports session state
  - `global.bookingData`: Bookings session state
- **Conversation State Machine**: Each user session maintains flags like `waitingForSubmit`, `confirmingFetch`, `editingExisting`, `confirmingUpdate` to manage multi-step workflows
- **State Properties**: 
  - Daily sessions store: Dated, Diesel, Adda, Union, TotalCashCollection, Online, ExtraExpenses, CashHandover, Remarks, Status
  - Booking sessions store: BookingDate, CustomerName, CustomerPhone, PickupLocation, DropLocation, TravelDate, VehicleType, NumberOfPassengers, TotalFare, AdvancePaid, BalanceAmount, Status, Remarks

## Data Persistence
- **Database**: LowDB with JSONFile adapter for lightweight JSON-based storage (src/data/db.js)
- **Schema**: Flat key-value structure with different indexing strategies:
  - Daily records: Date-based keys (DDMMYYYY format)
  - Booking records: Booking ID-based keys (BK123456 format)
- **Runtime Data** (git-ignored under `storage/`):
  - `storage/daily_data.json`: Daily transaction records indexed by date
  - `storage/daily_status.json`: Daily status update logs (Initiated, Collected, Deposited)
  - `storage/bookings_data.json`: Booking records indexed by booking ID
  - `storage/bookings_status.json`: Booking status update logs (Pending, Confirmed, Completed, Cancelled)
- **Archived Data**: `archive/admin/data/*.json`: Reference data for buses, employees, and users (not used in runtime)

## Business Logic

### Daily Feature
- **Auto-calculation**: Cash handover automatically computed as: `TotalCashCollection - (cash_expenses + cash_extra_expenses)`
- **Payment Modes**: Dual-mode expense tracking (cash/online) affecting handover calculation
- **Validation**: Multi-stage validation ensuring all required fields present before submission
- **Conflict Resolution**: Detects existing records and prompts user for update confirmation

### Booking Feature
- **Auto-calculation**: Balance amount computed as: `TotalFare - AdvancePaid`
- **Numeric Validation**: Robust parsing handles comma-separated currency strings, validates positive numbers
- **Business Rules**: Advance cannot exceed total fare, all numeric fields validated before database write
- **ID Generation**: Auto-generated booking IDs in format BK{timestamp} for uniqueness
- **Status Tracking**: Full lifecycle tracking (Pending → Confirmed → Completed/Cancelled)

## Message Flow Architecture (Restructured Nov 2025)
1. User sends WhatsApp message
2. `src/server/index.js` receives via Baileys and calls `handleIncomingMessageFromDaily`
3. `src/features/daily/daily.js` orchestrator normalizes text and routes to handlers in sequence:
   - Status commands (daily status, update status)
   - Session management (clear, initialization)
   - Confirmation workflows (fetch, cancel, update, submit)
   - Commands (daily, expense delete, remarks)
   - Field extraction (date, expenses, collections)
   - Update confirmations
4. Handlers return boolean/object indicating if they handled the message
5. If field extracted, orchestrator runs:
   - `recalculateCashHandover()` - Updates cash handover based on cash-mode expenses
   - `getCompletionMessage()` - Checks if all required fields present, sets waitingForSubmit flag
   - `sendSummary()` - Sends consolidated message showing all fields and completion status
6. Response sent via `safeSendMessage` wrapper with error handling
7. State persisted to LowDB when submitting via `safeDbWrite` wrapper

## Recent Changes (November 17, 2025)

### Menu Navigation Enhancements (Latest)
- **Removed Traditional Prefix Support**: Users must now use the menu system (no more "daily" or "booking" prefixes)
  - Simplified user experience with single navigation path
  - Entry command opens main menu with all options
- **Enhanced Submenu Options**: Added Help and Reports to Daily and Booking submenus
  - Help option in submenus shows context-specific help without exiting current menu
  - Reports option provides dedicated reporting interface
- **Advanced Reports Feature**: Comprehensive reporting with multiple date format support
  - Today: View today's report
  - Last N Days: View last 5 days, last 10 days, etc.
  - N Days Ago: View report from 6 days ago, etc.
  - Specific Date: View report for DD/MM/YYYY
  - Date Range: View reports from DD/MM/YYYY to DD/MM/YYYY
  - This Month: View all reports for current month
  - This Week: View all reports for current week
  - Each report shows formatted date with day of week (e.g., "Monday, 10 November 2025")
- **Menu Breadcrumb Navigation**: New "Menu" command shows current location
  - Shows navigation path (e.g., "🏠 Main Menu -> 📊 Daily Menu -> 📊 Reports")
  - Provides quick action shortcuts (Entry, Exit, Help)
  - Helps users understand their current position in menu hierarchy
- **Booking Reports Placeholder**: Added defensive message for booking reports (feature under development)
  - Informs users the feature is coming soon
  - Provides clear navigation options to exit

### Earlier November 17, 2025 Changes
- **Menu-Based Navigation System**: Implemented interactive menu system with "Entry" command
  - Users can now navigate: Entry → Daily/Booking → Data/Status/Reports/Help
  - Commands work without prefixes when in menu mode
- **Menu State Management**: Added `src/utils/menu-state.js` and `src/utils/menu-handler.js`
- **Context-Aware Help**: Help messages adapt based on navigation mode (menu vs traditional)
- **Google Sheets Integration Extended**: Created `booking-data.js` and `booking-status.js` scripts
- **Status Command Fix**: Updated regex patterns in status handlers to work with stripped prefixes
- **Enhanced Documentation**: Comprehensive WHATSAPP_COMMANDS_GUIDE.md with both menu and traditional flows

## Previous Changes (November 2025)
- **Src-based Architecture**: Reorganized entire codebase into src/ directory with clear separation (server, features, data)
- **Modular Refactoring**: Broke down monolithic 1154-line `daily.js` into focused modules for better maintainability
- **Status Handler Consolidation**: Merged `daily_status_update.js` into `daily_status.js` for cleaner status management
- **Database Layer Enhancement**: Updated `db.js` to manage four separate databases (daily_data, daily_status, bookings_data, bookings_status)
- **Bookings Feature Added**: Created complete bookings module with field extraction, validation, and submission workflows
- **Booking Database Persistence**: Implemented full database persistence for bookings with status tracking and audit logs
- **Prefix-based Routing**: Added mandatory "daily" and "booking" prefixes for all commands with smart prefix stripping
- **Help Commands**: Added "daily help" and "booking help" commands showing all available features
- **Robust Validation**: Implemented numeric validation for booking amounts with comma-handling and business rule checks
- **Separation of Concerns**: Server, features, data, scripts, and storage are now clearly separated
- **Runtime Data Isolation**: Mutable JSON files moved to git-ignored storage/ directory
- **Improved Documentation**: Added comprehensive WHATSAPP_COMMANDS_GUIDE.md with all prefix requirements
- **Preserved Functionality**: All original business logic, validation, and error handling maintained

## API Security
- Bearer token authentication for all REST endpoints
- API key stored in environment variables
- Middleware validation (`verifyApiKey`) protecting sensitive routes

## Google Sheets Integration
- **Sync Scripts** (`scripts/google/*`): Google Apps Script files for bidirectional sync
- **Endpoints**: Server exposes JSON endpoints (`/daily_data.json`, `/daily_status.json`) for sheet consumption
- **Update API**: POST endpoints (`/update-daily-data`, `/update-daily-status`) accepting sheet modifications
- **Normalization**: Automatic PrimaryKey padding (7-digit to 8-digit) and JSON parsing

## Error Handling
- Try-catch wrappers around all message handlers
- Safe database operations with `safeDbRead`/`safeDbWrite` preventing corruption
- Graceful degradation on parse/validation failures
- Comprehensive logging for debugging

## Design Patterns
- **Handler Pattern**: Separate modules for each conversation type enable clean separation of concerns
- **Guard Clauses**: Early returns in handlers prevent deep nesting
- **State Machine**: Explicit flags manage multi-turn conversations
- **Facade Pattern**: Utility modules (`helpers.js`) abstract common operations like messaging and DB access

# External Dependencies

## Core Libraries
- **@whiskeysockets/baileys** (v7.0.0-rc.6): WhatsApp Web API client for bot functionality
- **pino**: Logging framework (configured with silent level for production)
- **lowdb** (v7.0.1): Lightweight JSON database for data persistence
- **express** (v5.1.0): HTTP server for REST API endpoints and webhook handling

## Utilities
- **date-fns** (v4.1.0): Date parsing and formatting for flexible date input handling
- **dotenv** (v17.2.3): Environment variable management for API keys and configuration
- **qrcode** / **qrcode-terminal**: QR code generation for WhatsApp authentication

## Google Integration
- **googleapis** (v164.1.0): Google Sheets API integration for data synchronization (used in Google Apps Script files, not directly in Node.js server)

## Secondary Dependencies
- **@hapi/boom** (v10.0.1): HTTP error handling utilities (likely for API responses)
- **crypto**: Built-in Node.js module for secure token generation (used in server for QR URL signing)

## Database
- **Storage**: File-based JSON storage via LowDB (no traditional database server required)
- **Adapters**: `src/data/db.js` - Exports four LowDB adapters:
  - `db` (default export): Manages daily_data.json for daily transaction records
  - `statusDb` (named export): Manages daily_status.json for daily status update logs
  - `bookingsDb` (named export): Manages bookings_data.json for booking records
  - `bookingsStatusDb` (named export): Manages bookings_status.json for booking status update logs
- **Runtime Location**: `./storage/` directory (git-ignored) containing operational data files
- **Backup/Sync**: Google Sheets acts as secondary data store and reporting interface (currently implemented for daily data only)

## Authentication
- **WhatsApp**: Multi-file auth state stored in `./auth_info` directory
- **API Security**: Bearer token authentication using environment variable `API_KEY`

## Deployment Considerations
- No external database server required (LowDB uses local filesystem)
- Requires persistent storage for `auth_info` directory and `storage/` JSON files
- Entry point: `src/server/index.js` (configured in package.json)
- Port configuration via `PORT` environment variable (default: 3000)
- Google Sheets sync requires separate deployment of Apps Script files (located in `scripts/google/`) with server URL configuration
- All runtime data in `storage/` should be backed up regularly (not in git)