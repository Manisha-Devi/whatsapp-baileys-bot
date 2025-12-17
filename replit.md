# Overview

This WhatsApp bot, built with Baileys, automates business operations for a bus transportation company. It facilitates daily operational reporting (expenses, collections, cash handover) and manages customer bookings (passenger details, routes, payments). The bot offers conversational interfaces, uses LowDB for data persistence, and integrates with Google Sheets for reporting and synchronization. The primary goal is to streamline daily operations and booking management through an intuitive chat interface.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Framework
- **WhatsApp Integration**: Utilizes @whiskeysockets/baileys for WhatsApp Web protocol communication.
- **Authentication**: Multi-file authentication with QR code-based login.
- **Communication Pattern**: Event-driven message handling with conversational state machines per user.

## Application Structure
The application follows a modular `src`-based architecture:
- **Server Layer**: Express.js server managing WhatsApp socket lifecycle and authentication.
- **Message Orchestrators**: Dedicated orchestrators (`src/features/daily/daily.js`, `src/features/bookings/booking.js`) route messages to appropriate handlers.
- **Handler Modules**: Specialized handlers manage specific conversation flows (e.g., `command-handler`, `date-handler`, `expense-handler`, `field-handler`, `submit-handler`).
- **Utility Modules**: Reusable business logic (e.g., `helpers`, `formatters`, `calculations`, `messages`).
- **Status Handlers**: Unified handlers for status queries and updates.
- **Data Layer**: LowDB adapter for JSON-based storage.

## State Management
- **Session State**: In-memory global objects (`global.userData`, `global.bookingData`) track conversation state per user.
- **Conversation State Machine**: Flags like `waitingForSubmit`, `confirmingFetch` manage multi-step workflows.

## Data Persistence
- **Database**: LowDB with JSONFile adapter for lightweight JSON-based storage.
- **Schema**: Flat key-value structure; daily records by date, booking records by Booking ID.
- **Runtime Data**: Stored in `storage/` (git-ignored) including `daily_data.json`, `daily_status.json`, `bookings_data.json`, `bookings_status.json`.

## Business Logic
- **Daily Feature**: Auto-calculation of cash handover, dual-mode expense tracking (cash/online), multi-stage validation, and conflict resolution for existing records.
- **Booking Feature (Updated Dec 2025)**: 
  - **Type 2 Booking**: Full bus booking for private/marriage events
  - **Simple Commands**: Name, Mobile, Pickup, Drop, Date, Bus, Total Fare, Advance, Remarks
  - **Date Range Support**: Single day (`Date 20/12/2025`) or multi-day (`Date 20/12/2025 to 22/12/2025`)
  - **Bus Integration**: Auto-fills bus details from `buses.json` (registration, type, capacity)
  - **Zero Advance Support**: Allows `Advance 0` for bookings without upfront payment
  - **Yes/No Confirmation**: Submit with Yes/Y or No/N instead of "submit" command
  - **Auto-calculations**: Balance = Total Fare - Advance

## Message Flow Architecture
Incoming WhatsApp messages are routed by orchestrators to specific handlers. Handlers process messages, extract fields, perform calculations (e.g., `recalculateCashHandover`), and send summary messages. State is persisted to LowDB via safe wrappers.

## Menu-Based Navigation System
- **Interactive Menus**: Implemented a comprehensive menu system with an "Entry" command for navigation.
- **Context-Aware Help**: Help messages adapt based on the current menu context.
- **Advanced Reports**: Comprehensive reporting options for daily data including specific dates, ranges, and periods (Today, Last N Days, N Days Ago, Specific Date, Date Range, This Month, This Week).
- **Menu Breadcrumb**: "Menu" command displays current navigation path and quick actions.

## Bus Selection Feature (NEW)
- **User Authentication**: Users are identified by phone number against `src/data/users.json`.
- **Role-Based Access**: 
  - **Admin**: Access to all active buses, must select one before proceeding.
  - **MIS Assistant**: Access only to assigned buses. If single bus assigned, auto-selected.
- **Bus Selection Flow**: Before main menu, users with multiple buses must select one.
- **Primary Key Format**: Daily data now uses `busCode_date` format (e.g., `BUS101_15/11/2025`) allowing multiple buses to have entries on the same date.
- **Data Files**: 
  - `src/data/users.json`: User profiles with phone, role, and assigned buses.
  - `src/data/buses.json`: Bus inventory with status and details.
- **Switch Bus**: Users can switch between their assigned buses using "Switch" or "S" command from main menu.

## Multi-Line Field Input (Updated Dec 2025)
- **Unified Field Extraction**: The `handleFieldExtraction` function in `field-handler.js` now handles Driver/Conductor patterns alongside Diesel, Adda, Union, etc.
- **Pending Updates Queue**: When multi-line input contains fields that need update confirmation, all pending updates are queued and prompted sequentially.
- **Employee Expense Defaults**: When processing Driver/Conductor fields, the system loads bus-specific employee defaults from `getEmployExpensesForBus` before comparison.

## API Security
- Bearer token authentication for all REST endpoints using environment variables.

## Error Handling
- Try-catch wrappers, safe database operations, graceful degradation, and comprehensive logging.

## Design Patterns
- **Handler Pattern**: Modular handlers for distinct conversation types.
- **Guard Clauses**: For early returns in handlers.
- **State Machine**: Explicit flags for multi-turn conversations.
- **Facade Pattern**: Utility modules abstract common operations.

# External Dependencies

## Core Libraries
- **@whiskeysockets/baileys**: WhatsApp Web API client.
- **pino**: Logging framework.
- **lowdb**: Lightweight JSON database.
- **express**: HTTP server for REST API endpoints.

## Utilities
- **date-fns**: Date parsing and formatting.
- **dotenv**: Environment variable management.
- **qrcode** / **qrcode-terminal**: QR code generation for WhatsApp authentication.

## Google Integration
- **googleapis**: Used in Google Apps Script files for Google Sheets integration and data synchronization.

## Database
- **Storage**: File-based JSON storage via LowDB in the `./storage/` directory.
  - `db`: `daily_data.json`
  - `statusDb`: `daily_status.json`
  - `bookingsDb`: `bookings_data.json`
  - `bookingsStatusDb`: `bookings_status.json`
- **Backup/Sync**: Google Sheets serves as a secondary data store and reporting interface, with server endpoints for data consumption and updates.

## Authentication
- **WhatsApp**: Multi-file authentication state stored in `./auth_info`.
- **API Security**: Bearer token authentication via `API_KEY` environment variable.