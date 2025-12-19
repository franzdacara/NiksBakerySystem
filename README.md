# Nik's Bakery System

A comprehensive bakery management system for tracking production, sales, inventory, and generating daily shift reports.

## Features

- **Shift Management**: Start and end shifts with automatic inventory carry-over
- **Production Tracking**: Log production batches with search and category filters
- **Sales Entry (POS)**: Easy-to-use point of sale with stock validation
- **Inventory Management**: Manage product catalog with categories and pricing
- **Daily Inventory Sheet**: Track beginning, production, ending, and sold quantities
- **PDF Reports**: Auto-generate and download shift reports on shift end
- **Dashboard**: Visual charts showing production vs sales data

## Tech Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite
- **Charts**: Recharts
- **PDF Generation**: jsPDF + jspdf-autotable
- **Styling**: Tailwind CSS

## Prerequisites

- Node.js (v20.19.0+ or v22.12.0+ recommended)
- npm (v10+)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd NiksBakerySystem
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run the development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   
   Navigate to `http://localhost:3000` (or the port shown in terminal)

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder.

## Preview Production Build

```bash
npm run preview
```

## Usage Guide

### Starting a Shift
1. Log in with any username/password (default: nikko/S2e3r3!@)
2. Click "Start New Shift" - inventory automatically carries over from previous shift

### Recording Production
1. Go to "Production" tab
2. Search or filter items by category
3. Click "Add" on an item and enter quantity produced

### Recording Sales
1. Go to "Sales Entry" tab
2. Click on a product to add sales (disabled if out of stock)
3. Enter quantity (cannot exceed available stock)
4. View session sales summary on the right panel

### Ending a Shift
1. Click "End Shift" button
2. System redirects to Inventory Sheet with pre-filled ending counts
3. Verify/adjust ending inventory counts
4. Click "Confirm End Shift"
5. PDF report automatically downloads

### PDF Report Contents
- Shift date and time
- Complete inventory summary table
- Total revenue and production cost
- Estimated profit
- Production log with timestamps

## Project Structure

```
NiksBakerySystem/
├── App.tsx                 # Main app component
├── index.tsx               # Entry point
├── types.ts                # TypeScript types
├── constants.ts            # Initial items data
├── services/
│   └── pdfReport.ts        # PDF generation utility
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx       # Dashboard with charts
│   │   ├── ProductionPanel.tsx # Production management
│   │   ├── SalesPos.tsx        # Point of sale
│   │   ├── InventoryManager.tsx# Product catalog
│   │   ├── InventorySheet.tsx  # Daily inventory sheet
│   │   ├── Login.tsx           # Login screen
│   │   └── StartShiftModal.tsx # (Legacy) Shift start modal
│   └── models/
│       └── BakeryStore.ts      # State management store
└── package.json
```

## License

Private project for Nik's Bakery.
