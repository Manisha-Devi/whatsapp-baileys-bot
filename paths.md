# Project Folder Structure

## Root Level Files
```
├── package.json          # Node.js dependencies and project metadata
├── package-lock.json     # Locked dependency versions
├── .env                  # Environment variables (API_KEY, PORT, QR_TOKEN_SECRET, etc.)
├── .gitignore            # Git ignore rules
├── replit.md             # Project documentation and architecture notes
├── paths.md              # This file - folder structure documentation
└── README.md             # (optional) Project README
```

## Source Code (`/src`)
Main application source code following modular architecture.

### `/src/server/`
Express server and WhatsApp socket management.
```
src/server/
└── index.js              # Main server file (Express + Baileys integration)
                          # Handles QR login, webhooks, REST API endpoints
```

### `/src/features/daily/`
Daily business operations feature module (handlers, orchestration, utilities).
```
src/features/daily/
├── daily.js                      # Main message orchestrator
├── daily_status.js               # Status query handler (Initiated/Collected/Deposited)
├── daily_status_update.js        # Status update command handler
│
├── handlers/                     # Specialized message handlers
│   ├── command-handler.js        # Clear, Daily commands (today, last N days, date)
│   ├── date-handler.js           # Date parsing and validation
│   ├── expense-handler.js        # Expense tracking (cash/online modes)
│   ├── fetch-handler.js          # Fetch existing record workflows
│   ├── field-handler.js          # Field extraction and validation
│   └── submit-handler.js         # Submit and update confirmation logic
│
└── utils/                        # Reusable utilities
    ├── calculations.js           # Business logic (cash handover, completeness)
    ├── formatters.js             # Text formatting helpers
    ├── helpers.js                # Safe messaging and DB wrappers
    └── messages.js               # Message template functions
```

### `/src/data/`
Database adapters and data access layer.
```
src/data/
└── db.js                 # LowDB adapter for daily_data.json
                          # Handles JSON file-based storage
```

## External Integration Scripts (`/scripts`)
Scripts for external systems (Google Apps Script, deployment helpers).

### `/scripts/google/`
Google Apps Script files for bidirectional Sheets sync.
```
scripts/google/
├── daily-data.js         # Sync daily_data.json to/from Google Sheets
└── daily-status.js       # Sync daily_status.json to/from Google Sheets
```

## Runtime Data (`/storage/`)
**Git-ignored** - Mutable JSON files persisted by LowDB at runtime.
```
storage/
├── daily_data.json       # Main transaction records (key: DDMMYYYY)
└── daily_status.json     # Status update logs
```

## Archived Data (`/archive/`)
**Not used in runtime** - Reference data or deprecated files.
```
archive/
└── admin/                # Archived reference data (buses, employees, users)
    └── data/
        ├── buses.json
        ├── employee.json
        └── users.json
```

## WhatsApp Authentication (`/auth_info/`)
**Git-ignored** - Multi-file auth state managed by Baileys.
```
auth_info/                # Session credentials and encryption keys
```

---

## Environment Variables (.env)
Required configuration:
```
API_KEY=MySuperSecretKey12345      # Bearer token for REST API endpoints
PORT=3000                          # Server port (default: 3000)
QR_TOKEN_SECRET=YourSecretHere     # HMAC secret for QR URL signing
QR_TOKEN_TTL_SECONDS=300           # QR token expiry (default: 5 minutes)
```

---

## Key Architectural Decisions

1. **src-based modular layout**: All source code under `/src`, organized by server/features/data layers
2. **Feature-based organization**: Daily feature logic grouped under `/src/features/daily/`
3. **Separation of concerns**: Handlers, utilities, and orchestration clearly separated
4. **Runtime data isolation**: Mutable JSON files in `/storage/` (git-ignored) separate from source code
5. **External scripts separation**: Google Apps Script files in `/scripts/google/`
6. **Archive for unused assets**: Old reference data moved to `/archive/` to reduce noise

---

## Import Paths Reference

### From server (`src/server/index.js`):
```javascript
import { handleIncomingMessageFromDaily } from "../features/daily/daily.js";
```

### From daily orchestrator (`src/features/daily/daily.js`):
```javascript
import { handleDailyStatus } from "./daily_status.js";
import { handleClearCommand } from "./handlers/command-handler.js";
import { safeSendMessage } from "./utils/helpers.js";
import { recalculateCashHandover } from "./utils/calculations.js";
```

### From handlers (`src/features/daily/handlers/*.js`):
```javascript
import db from "../../data/db.js";
import { safeSendMessage } from "../utils/helpers.js";
import { capitalize } from "../utils/formatters.js";
```

### From utilities (`src/features/daily/utils/*.js`):
```javascript
import db from "../../data/db.js";
```

### From data layer (`src/data/db.js`):
```javascript
// File path to storage
const file = "../../storage/daily_data.json";
```

---

## File Paths in Code

### Server endpoints (src/server/index.js):
- Read daily data: `fs.readFileSync("../../storage/daily_data.json")`
- Read status log: `fs.readFileSync("../../storage/daily_status.json")`

### Status update handler (src/features/daily/daily_status_update.js):
- Status log: `path.join(".", "storage", "daily_status.json")`
- Data file: `path.join(".", "storage", "daily_data.json")`

### Database adapter (src/data/db.js):
- Daily data: `"../../storage/daily_data.json"`
