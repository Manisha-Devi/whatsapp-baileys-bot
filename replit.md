# Overview

This is a WhatsApp bot application built with Baileys (WhatsApp Web API) that manages daily business operations for a bus transportation company. The bot enables users to submit daily reports including expenses (diesel, adda fees, union fees), collections (cash and online), and calculates cash handover amounts. It provides a conversational interface for data entry, validation, and retrieval, with data persistence using LowDB (JSON-based database) and integration with Google Sheets for reporting.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Framework
- **WhatsApp Integration**: Built on @whiskeysockets/baileys library for WhatsApp Web protocol communication
- **Authentication**: Multi-file authentication state management with QR code-based login system
- **Communication Pattern**: Event-driven message handling with conversational state machines per user session

## Application Structure
The application follows a modular handler-based architecture (refactored November 2025):

- **Server Layer** (`server.js`): Express.js REST API server managing WhatsApp socket lifecycle, QR code generation, and authentication state
- **Message Orchestrator** (`daily/daily.js`): ~110 lines - Clean orchestrator that routes incoming WhatsApp messages to appropriate handlers
- **Handler Modules** (`daily/handlers/*`): Specialized handlers for different conversation flows:
  - `command-handler.js`: Clear command and daily data fetch commands (today, last N days, specific dates)
  - `date-handler.js`: Date parsing and validation with multiple format support (DD/MM/YYYY, today, yesterday, textual dates)
  - `expense-handler.js`: Expense tracking with cash/online mode support and deletion
  - `fetch-handler.js`: Fetch existing record confirmation and cancel choice workflows
  - `field-handler.js`: Field extraction, validation, and update confirmation logic
  - `submit-handler.js`: Submit and update confirmation workflows with conflict resolution
- **Utility Modules** (`daily/utils/*`): Reusable business logic:
  - `helpers.js`: Safe wrappers for messaging and database operations (safeSendMessage, safeDbRead, safeDbWrite)
  - `formatters.js`: Text formatting utilities (capitalize, formatExistingForMessage)
  - `calculations.js`: Business calculations (recalculateCashHandover, getCompletionMessage)
  - `messages.js`: Message template functions (sendSummary, sendSubmittedSummary)
- **Status Handlers** (`daily/daily_status.js`, `daily/daily_status_update.js`): Standalone handlers for status queries and updates

## State Management
- **Session State**: In-memory global object (`global.userData`) tracking conversation state per WhatsApp sender
- **Conversation State Machine**: Each user session maintains flags like `waitingForSubmit`, `confirmingFetch`, `editingExisting`, `confirmingUpdate` to manage multi-step workflows
- **State Properties**: User sessions store form fields (Dated, Diesel, Adda, Union, TotalCashCollection, Online, ExtraExpenses, CashHandover, Remarks, Status)

## Data Persistence
- **Database**: LowDB with JSONFile adapter for lightweight JSON-based storage
- **Schema**: Flat key-value structure using date-based primary keys (DDMMYYYY format)
- **Files**:
  - `daily/data/daily_data.json`: Main transaction records indexed by date
  - `daily/data/daily_status.json`: Status update logs tracking record lifecycle (Initiated, Collected, Deposited)
  - `admin/data/*.json`: Reference data for buses, employees, and users

## Business Logic
- **Auto-calculation**: Cash handover automatically computed as: `TotalCashCollection - (cash_expenses + cash_extra_expenses)`
- **Payment Modes**: Dual-mode expense tracking (cash/online) affecting handover calculation
- **Validation**: Multi-stage validation ensuring all required fields present before submission
- **Conflict Resolution**: Detects existing records and prompts user for update confirmation

## Message Flow Architecture (Refactored Nov 2025)
1. User sends WhatsApp message
2. `server.js` receives via Baileys and calls `handleIncomingMessageFromDaily`
3. `daily.js` orchestrator normalizes text and routes to handlers in sequence:
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

## Recent Changes (November 2025)
- **Modular Refactoring**: Broke down monolithic 1154-line `daily.js` into focused modules for better maintainability
- **Separation of Concerns**: Utilities, handlers, and orchestration logic now clearly separated
- **Improved Message Flow**: Single consolidated summary message after field extraction (no duplicate messages)
- **Preserved Functionality**: All original business logic, validation, and error handling maintained

## API Security
- Bearer token authentication for all REST endpoints
- API key stored in environment variables
- Middleware validation (`verifyApiKey`) protecting sensitive routes

## Google Sheets Integration
- **Sync Scripts** (`daily/gs/*`): Google Apps Script files for bidirectional sync
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
- **Location**: `./daily/data/` directory containing operational data files
- **Backup/Sync**: Google Sheets acts as secondary data store and reporting interface

## Authentication
- **WhatsApp**: Multi-file auth state stored in `./auth_info` directory
- **API Security**: Bearer token authentication using environment variable `API_KEY`

## Deployment Considerations
- No external database server required (LowDB uses local filesystem)
- Requires persistent storage for `auth_info` directory and `daily/data` JSON files
- Port configuration via `PORT` environment variable (default: 3000)
- Google Sheets sync requires separate deployment of Apps Script files with server URL configuration