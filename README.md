# KTM Duke 250 Gen 3 Companion App (Tracker)

A premium, localized, full-stack companion application designed specifically for tracking the maintenance logs, fuel efficiency, and technical specifications of the **KTM Duke 250 Gen 3 (2025+)** motorcycle. 

The application is built with a sleek, metallic dark-tech theme (black, silver, steel, and carbon) to match the high-performance racing aesthetic of the machine. It operates entirely on your local machine with zero external cloud dependencies, storing data in an offline-first SQLite database and saving maintenance receipts directly to your local storage.

---

## 🚀 Key Features

### 1. Garage Dashboard
*   **Active Status Odometer**: Displays current odometer reading, total accumulated expenses (fuel vs. maintenance), and overall average fuel economy.
*   **Dynamic SVG Status Rings**: 
    *   *Chain Clean & Lube*: Visual circular indicator tracking mileage since the last chain clean (500 km interval). Turns amber at 400 km and flashes red at 450 km (resets with a single click).
    *   *Scheduled Service*: Countdown progression until the next factory-specified service interval (1st at 1,000 km, subsequently every 7,500 km).
*   **Pre-Ride Checklist**: Dynamic checklists for checking tyre pressures (29 PSI Front / 32 PSI Rear), engine oil sight glass levels, coolant reservoir, and chain slack (33-40 mm play).
*   **Quick Odometer Sync**: A simple form widget to update the bike's primary odometer reading after rides.

### 2. Fuel Mileage Log
*   **Log Entries**: Date, odometer reading, liters filled, price per liter, and total cost.
*   **Smart Fuel Economy Calculation**: Automatically computes **km/L** using the standard **full-to-full** fill-up method (total distance run between full fills divided by fuel added). Handles partial fills by carrying over the volume.
*   **Custom SVG Mileage Graph**: Interactive, lightweight line-chart plotting fuel economy trends over time with hover-activated data tooltips. No heavy external graphing packages are used.

### 3. Maintenance timeline & Receipt Storage
*   **Comprehensive Log Forms**: Categorized logs (Engine Oil, Chain Maintenance, Coolant, Air Filter, Brake Pads, Tires, Spark Plug, Accessories & Mods, Other Repairs) with cost and DIY vs. Workshop toggle details.
*   **Multer Receipt Upload**: Integrated drag-and-drop file uploader zone that accepts PNG, JPEG, JPG, and PDF receipts, saving files locally on your computer.
*   **Interactive Receipt Viewer**: Native HTML5 `<dialog>` modals with backdrop blur and light-dismiss fallback (clicking outside the modal closes it) to view receipt scans or PDFs side-by-side with log details.

### 4. Technical Specs & Tightening Torques
*   **Technical Cheat Sheet**: Fluid capacity references (e.g., 1.7L 10W-50 JASO MA2 engine oil, Motorex M3.0 OAT coolant), tyre dimensions, and factory slack tolerances.
*   **Torque Reference Card**: Mapped torque values in Newton-meters (Nm) for common garage tasks (rear axle nut, oil drain plugs, caliper bolts, spark plugs) to ensure safe DIY servicing without damaging soft aluminum threads.

---

## 📁 Project Directory Structure

```
tracker/
├── package.json             # Root workspace coordinating client & server scripts
├── server/                  # Backend application
│   ├── server.js            # Express API server & static routes
│   ├── db.js                # SQLite connection and migration setup
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
        ├── App.jsx          # Tab navigation and root state controller
        ├── index.css        # CSS Custom Design system (Black/Silver theme)
        └── components/
            ├── Dashboard.jsx
            ├── FuelLog.jsx
            ├── MaintenanceLog.jsx
            └── SpecsSheet.jsx
```

---

## ⚙️ Setup and Installation

### Prerequisites
Make sure you have [Node.js](https://nodejs.org) installed on your system.
*   *Recommended Node Version:* v20+ or v24+
*   *Recommended NPM Version:* v10+

### Installation
1. Clone or navigate to the project directory:
   ```bash
   cd /home/ahad/tracker
   ```
2. Install all root, backend, and frontend dependencies in a single step:
   ```bash
   npm run install-all
   ```

---

## 🏃 Running the Application

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

## 📊 Database Specifications (SQLite)

The SQLite database file (`server/database.db`) is automatically initialized and migrates itself when you start the server for the first time.

### Tables

#### 1. `bike_status`
Tracks the current state of the motorcycle. Only contains a single row with `id = 1`.
- `id` (INTEGER, Primary Key, enforced constant)
- `current_odometer` (INTEGER, default 0): Current odometer of the bike.
- `last_chain_clean_odometer` (INTEGER, default 0): The odometer reading at which the chain was last cleaned.

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

---

## 🛠️ API Documentation

All API requests are sent to the local server at `http://localhost:5000/api/*`.

### Dashboard
*   **`GET /api/dashboard`**
    *   *Returns:* Dashboard statistics including current odo, last chain clean odo, total costs, and average mileage.
    *   *Response Format:*
        ```json
        {
          "currentOdometer": 1500,
          "lastChainCleanOdometer": 1000,
          "totalFuelCost": 3500.50,
          "totalMaintenanceCost": 1200.00,
          "fuelEntriesCount": 3,
          "maintenanceEntriesCount": 2,
          "averageMileage": 32.45
        }
        ```

### Odometer Status
*   **`POST /api/odometer`**
    *   *Body Parameters:* `{ currentOdometer?: number, lastChainCleanOdometer?: number }`
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
    *   *Action:* Saves maintenance log. Synchronizes primary odometer, and if the category is `'Chain Maintenance'`, updates `last_chain_clean_odometer` as well.
*   **`DELETE /api/maintenance/:id`**: Deletes log entry and deletes the linked uploaded physical receipt file from disk.

### File Uploads
*   **`POST /api/upload`**
    *   *Multipart File Field:* `bill`
    *   *Action:* Uploads a receipt file (PNG, JPG, JPEG, or PDF).
    *   *Returns:* `{ filePath: "/uploads/bill-..." }`

---

## 🎨 Color Palette & Aesthetic Guidelines

The app's styling uses pure **Vanilla CSS** (defined in `client/src/index.css`) utilizing the following design tokens:

- **Theme Background**: Deep obsidian-black (`#090a0d`) preventing browser light flashes.
- **Card Styling**: Slightly lighter charcoal-grey (`#12151b`) with 1px border styling to look like milled metal components (`#252a35`).
- **Accent Elements**: Cool silver (`#cbd5e1`) and brilliant white chrome (`#ffffff`) for active icons and text indicators.
- **Alert Colors**: Soft greens (`#10b981`), warnings (`#f59e0b`), and danger highlights (`#ef4444`) to direct user focus to maintenance due status.
- **Micro-Animations**: Smooth hover-state transitions on buttons and cards, glowing SVG alerts, and fade-in backdrops.
