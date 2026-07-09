# Onyx Log — KTM Duke 250 Gen 3 Companion

A premium, localized, full-stack companion application designed specifically for tracking the maintenance logs, fuel efficiency, and technical specifications of the **KTM Duke 250 Gen 3 (2025+)** motorcycle. 

The application is built with the custom **"Trellis" Design System** (an obsidian-black, coolant-ice, and brand KTM orange HUD theme) to match the high-performance racing instrument cluster aesthetic of the machine. It operates entirely on your local machine with zero external cloud dependencies, storing data in an offline-first SQLite database and saving maintenance receipts directly to your local storage.

---

## Key Features

### 1. Garage Dashboard
*   **Active Status Odometer**: Displays current odometer reading, total accumulated expenses (fuel vs. maintenance), and overall average fuel economy.
*   **Maintenance Priority Alerts**: Summarizes the top 3 most urgent tasks (Overdue or Due Soon) from your periodic checklist with visual hazard badges (red, amber, or ice blue) and a direct link to the Planner panel.
*   **Interactive Telemetry Widgets**: 
    *   *Spending Breakdown*: Graphical bar charts representing costs by service categories and fuel expenditure.
    *   *Cost Split Donut*: Interactive SVG donut chart detailing fuel versus general service ratios.
    *   *Recent Activity*: Chronological event feed displaying recent refuels and repairs.
*   **Quick Odometer Sync**: A simple form widget to update the bike's primary odometer reading after rides (instantly synchronizing all planner status thresholds).

### 2. Fuel Mileage Log
*   **Log Entries**: Date, odometer reading, liters filled, price per liter, and total cost.
*   **Smart Fuel Economy Calculation**: Automatically computes **km/L** using the standard **full-to-full** fill-up method (total distance run between full fills divided by fuel added). Handles partial fills by carrying over the volume.
*   **Custom SVG Mileage Graph**: Interactive, lightweight line-chart plotting fuel economy trends over time with hover-activated data data tooltips. No heavy external graphing packages are used.

### 3. Maintenance Timeline & Receipt Storage
*   **Comprehensive Log Forms**: Categorized logs (Engine Oil, Chain Maintenance, Coolant, Air Filter, Brake Pads, Tires, Spark Plug, Accessories & Mods, Other Repairs) with cost and DIY vs. Workshop toggle details.
*   **Multer Receipt Upload**: Integrated drag-and-drop file uploader zone that accepts PNG, JPEG, JPG, and PDF receipts, saving files locally on your computer.
*   **Interactive Receipt Viewer**: Native HTML5 `<dialog>` modals with backdrop blur and light-dismiss fallback (clicking outside the modal closes it) to view receipt scans or PDFs side-by-side with log details.
*   **Orphan Attachment Guard**: Background cleanup logic erases temporary files from disk if the maintenance log form is closed or aborted before saving.

### 4. Maintenance Planner & Checklist
*   **Categorized Checklists**: Dynamically groups tasks into logical folders: **CHAIN CARE** (⛓), **ENGINE & COOLING** (🛢), **BRAKES** (🛑), **TYRES** (🛞), **SUSPENSION** (🔧), and **ELECTRICAL** (🔋) to match typical service workflows.
*   **Dual-Interval Consumption Indicators**: Supports mileage intervals, time-based intervals (months), or both. Renders premium horizontal progress bars showing the exact percentage consumed.
*   **Preconfigured Factory Defaults**: Pre-populated with 11 KTM Duke 250 factory manual settings (e.g. Chain Clean & Lube at 500 km/1 month, Engine Oil at 7,500 km/12 months, Brake Pad Inspection at 5,000 km/6 months, time-only replacements like Coolant/Brake Fluid at 24 months, etc.).
*   **Interactive Baselines & Custom Tasks**: Setup/edit completion milestones using dialog forms, mark tasks completed, or add/delete custom user-defined maintenance tasks.

### 5. Technical Specs & Tightening Torques
*   **Technical Cheat Sheet**: Fluid capacity references (e.g., 1.7L 10W-50 JASO MA2 engine oil, Motorex M3.0 OAT coolant), tyre dimensions, and factory slack tolerances.
*   **Torque Reference Card**: Mapped torque values in Newton-meters (Nm) for common garage tasks (rear axle nut, oil drain plugs, caliper bolts, spark plugs) to ensure safe DIY servicing without damaging soft aluminum threads.

---

## 📁 Project Directory Structure

```
onyx-log/
├── package.json             # Root workspace coordinating client & server scripts
├── server/                  # Backend application
│   ├── server.js            # Express API server, auth, uploads & static routes
│   ├── db.js                # SQLite connection and migration setup
│   ├── fuelEconomy.js       # Shared full-to-full fuel-economy calculation
│   ├── database.db          # SQLite database storage (generated on start)
│   ├── uploads/             # Stores physical receipt scans and PDF attachments
│   ├── package.json         # Backend Node package specifications
│   └── test_db.js           # Integration database smoke tests
└── client/                  # Frontend Single Page App
    ├── vite.config.js       # Vite server configurations with api proxying
    ├── package.json         # React and icon libraries specifications
    ├── index.html           # Main entry document
    └── src/
        ├── main.jsx         # App bootstrapping
        ├── App.jsx          # Auth gate, tab navigation and root state controller
        ├── api.js           # Auth-aware fetch client (token + 401 handling)
        ├── index.css        # CSS Custom Design system (Trellis theme)
        └── components/
            ├── Login.jsx            # Access-code gate
            ├── Dashboard.jsx
            ├── FuelLog.jsx
            ├── MaintenanceLog.jsx
            ├── MaintenancePlanner.jsx
            └── SpecsSheet.jsx
```

---

## Setup and Installation

### Prerequisites
Make sure you have [Node.js](https://nodejs.org) installed on your system.
*   *Recommended Node Version:* v20+ or v24+
*   *Recommended NPM Version:* v10+

### Installation
1. Clone or navigate to the project directory:
   ```bash
   cd /home/ahad/onyx-log
   ```
2. Install all root, backend, and frontend dependencies in a single step:
   ```bash
   npm run install-all
   ```

---

## Running the Application

### Option A: Concurrent Development Mode (Recommended for Tweaks)
Runs the backend Express API (port 5000) and the React/Vite development server (port 5173) concurrently. Includes automatic client hot-reloads and backend server restarts on file changes.
```bash
npm run dev
```
Navigate to **`http://localhost:5173`** in your browser.

### Option B: Integrated Single-Port Production Mode
Builds the React client into static HTML/CSS/JS bundles and starts the Express server which hosts both the API and the user interface from a single port (5000).
```bash
# 1. Compile the React client code
npm run build

# 2. Start the local server
npm start
```
Navigate to **`http://localhost:5000`** in your browser.

---

## Authentication

The cockpit is gated by a single shared access code. On login the server issues a
signed, 30-day HMAC token (`expiry.signature`) that the client stores in
`localStorage` and sends as a `Bearer` token on every `/api` request; protected
`/uploads` assets accept the same token via a `?token=` query parameter. All API
routes except `POST /api/auth/login` require a valid token.

Set the access code with the `ACCESS_PASSWORD` environment variable. If it is
unset, the server falls back to the default `onyx250` and logs a warning — **always
set a strong `ACCESS_PASSWORD` for any non-local deployment.**

### Environment Variables
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Port the Express server listens on. |
| `DATA_DIR` | `server/` | Directory for `database.db` and `uploads/` (set to `/data` in production). |
| `ACCESS_PASSWORD` | `onyx250` | Shared access code for the login screen. |

---

## Database Specifications (SQLite)

The SQLite database file (`server/database.db`) is automatically initialized and migrates itself when you start the server for the first time.

### Tables

#### 1. `bike_status`
Tracks the current state of the motorcycle. Only contains a single row with `id = 1`.
- `id` (INTEGER, Primary Key, enforced constant)
- `current_odometer` (INTEGER, default 0): Current odometer of the bike.
- `session_secret` (TEXT): Random per-install HMAC key used to sign session tokens.

#### 2. `fuel_logs`
Stores refueling entries.
- `id` (INTEGER, Primary Key AUTOINCREMENT)
- `date` (TEXT, YYYY-MM-DD)
- `odometer` (INTEGER)
- `liters` (REAL)
- `price_per_liter` (REAL)
- `total_cost` (REAL)
- `full_tank` (INTEGER, 0 or 1)

#### 3. `maintenance_logs`
Stores maintenance events and associated files.
- `id` (INTEGER, Primary Key AUTOINCREMENT)
- `date` (TEXT, YYYY-MM-DD)
- `odometer` (INTEGER)
- `category` (TEXT)
- `cost` (REAL, default 0)
- `is_diy` (INTEGER, 0 or 1)
- `description` (TEXT)
- `bill_path` (TEXT, path to uploaded receipt file)

#### 4. `maintenance_planner`
Stores periodic service checklist tasks, intervals, and completion baselines.
- `id` (INTEGER, Primary Key AUTOINCREMENT)
- `task_name` (TEXT)
- `interval_km` (INTEGER, nullable)
- `interval_months` (INTEGER, nullable)
- `last_done_date` (TEXT, nullable)
- `last_done_odometer` (INTEGER, nullable)
- `is_custom` (INTEGER, default 0: 0 for factory defaults, 1 for user-defined tasks)

---

## API Documentation

All API requests are sent to the local server at `http://localhost:5000/api/*`.

### Dashboard
*   **`GET /api/dashboard`**
    *   *Returns:* Dashboard statistics including current odo, total costs, and average mileage.
    *   *Response Format:*
        ```json
        {
          "currentOdometer": 5230,
          "totalFuelCost": 12890.50,
          "totalMaintenanceCost": 3600.00,
          "fuelEntriesCount": 11,
          "maintenanceEntriesCount": 6,
          "averageMileage": 33.45
        }
        ```

### Odometer Status
*   **`POST /api/odometer`**
    *   *Body Parameters:* `{ currentOdometer?: number }`
    *   *Action:* Updates active odometer metrics manually.

### Fuel Logs
*   **`GET /api/fuel`**: Returns all fuel logs sorted descending by odometer reading.
*   **`POST /api/fuel`**
    *   *Body Parameters:* `{ date: string, odometer: number, liters: number, pricePerLiter: number, totalCost: number, fullTank: boolean }`
    *   *Action:* Saves fuel entry. Automatically increases `current_odometer` in `bike_status` if the log's odometer is greater.
*   **`DELETE /api/fuel/:id`**: Deletes fuel entry.

### Maintenance Logs
*   **`GET /api/maintenance`**: Returns all maintenance logs sorted descending by odometer.
*   **`POST /api/maintenance`**
    *   *Body Parameters:* `{ date: string, odometer: number, category: string, cost?: number, isDiy?: boolean, description?: string, billPath?: string }`
    *   *Action:* Saves maintenance log. Synchronizes primary odometer.
*   **`DELETE /api/maintenance/:id`**: Deletes log entry and deletes the linked uploaded physical receipt file from disk.

### Maintenance Planner
*   **`GET /api/planner`**
    *   *Returns:* Current odometer and all checklist tasks (including calculated remaining mileage/days, urgency statuses, and consumed life percentages).
*   **`POST /api/planner`**
    *   *Body Parameters:* `{ taskName: string, intervalKm?: number, intervalMonths?: number, lastDoneDate?: string, lastDoneOdometer?: number }`
    *   *Action:* Saves a custom checklist task.
*   **`PUT /api/planner/:id`**
    *   *Body Parameters:* `{ taskName: string, intervalKm?: number, intervalMonths?: number, lastDoneDate?: string, lastDoneOdometer?: number }`
    *   *Action:* Edits task attributes.
*   **`POST /api/planner/:id/complete`**
    *   *Body Parameters:* `{ completionDate: string, completionOdometer: number }`
    *   *Action:* Records a completion baseline for the task.
*   **`DELETE /api/planner/:id`**: Deletes a custom checklist task.

### File Uploads
*   **`POST /api/upload`**
    *   *Multipart File Field:* `bill`
    *   *Action:* Uploads a receipt file (PNG, JPG, JPEG, or PDF).
    *   *Returns:* `{ filePath: "/uploads/bill-..." }`
*   **`DELETE /api/upload/:filename`**
    *   *Action:* Deletes a physical file from the `uploads` directory. Used to clean up orphaned receipt scans.

---

## Color Palette & Aesthetic Guidelines

The app's styling uses pure **Vanilla CSS** (defined in `client/src/index.css`) utilizing the custom **"Trellis" Design System** tokens:

- **Theme Background**: Deep obsidian-black (`#0a0a0c`) preventing browser light flashes, using radial gradients.
- **Card Styling**: Charcoal-grey anodized graphite panels (`#131417` and `#171920`) with 1px border styling (`#24262d`).
- **Identity Accent**: Brand KTM Orange (`#ff5a0a`) for keylines and active components.
- **Status Indicators (Cold → Hot)**: 
  - *Coolant Ice* (`rgb(79, 163, 209)`): Optimal/cool state and metrics highlight.
  - *Caution Amber* (`#ffb020`): Advisory warnings.
  - *Critical Red* (`#ff2e2e`): Immediate action alerts.
- **Typography**: 
  - *Cockpit Headers*: `Chakra Petch`
  - *Telemetry Data*: `IBM Plex Mono`
  - *General Body*: `IBM Plex Sans`
- **Micro-Animations**: Staggered ECU Boot card entries, glowing SVG status rings, and smooth transition backdrops.
