import { BakeryItem, Shift, ShiftStatus, ProductionEntry, SaleEntry } from '../../types';
import { INITIAL_ITEMS, CREDENTIALS } from '../../constants';

// Simple event emitter for store updates
type Listener = () => void;

export class BakeryStore {
    items: BakeryItem[];
    shift: Shift;
    isAuthenticated: boolean;
    private listeners: Set<Listener> = new Set();

    constructor() {
        // Load from localStorage or defaults
        const savedItems = localStorage.getItem('bakery_items');
        this.items = savedItems ? JSON.parse(savedItems) : INITIAL_ITEMS;

        const savedShift = localStorage.getItem('current_shift');
        const parsedShift = savedShift ? JSON.parse(savedShift) : null;

        this.shift = parsedShift ? {
            ...parsedShift,
            inventoryStart: parsedShift.inventoryStart || {},
            inventoryEnd: parsedShift.inventoryEnd || {}
        } : {
            id: Date.now().toString(),
            status: ShiftStatus.CLOSED,
            startTime: null,
            endTime: null,
            openingCash: 0,
            closingCash: null,
            production: [],
            sales: [],
            inventoryStart: {},
            inventoryEnd: {}
        };

        this.isAuthenticated = localStorage.getItem('is_authenticated') === 'true';
    }

    // Subscriptions
    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify() {
        this.listeners.forEach(l => l());
        this.persist();
    }

    private persist() {
        localStorage.setItem('bakery_items', JSON.stringify(this.items));
        localStorage.setItem('current_shift', JSON.stringify(this.shift));
        localStorage.setItem('is_authenticated', this.isAuthenticated.toString());
    }

    // Auth Actions
    login(username: string, password: string): boolean {
        if (username === CREDENTIALS.username && password === CREDENTIALS.password) {
            this.isAuthenticated = true;
            this.notify();
            return true;
        }
        return false;
    }

    logout() {
        this.isAuthenticated = false;
        this.notify();
    }

    // Shift Actions
    startShift() {
        // Always load from previous shift's ending inventory, or initialize to 0 for all items
        let finalInventoryStart: Record<string, number> = {};

        const savedShift = localStorage.getItem('current_shift');
        const prevShift: Shift | null = savedShift ? JSON.parse(savedShift) : null;
        
        if (prevShift && prevShift.status === ShiftStatus.CLOSED && prevShift.inventoryEnd && Object.keys(prevShift.inventoryEnd).length > 0) {
            // Use previous shift's ending inventory as this shift's beginning
            finalInventoryStart = { ...prevShift.inventoryEnd };
        } else {
            // Initialize all items to 0 if no previous shift
            this.items.forEach(item => {
                finalInventoryStart[item.id] = 0;
            });
        }

        this.shift = {
            id: Date.now().toString(),
            status: ShiftStatus.OPEN,
            startTime: Date.now(),
            endTime: null,
            openingCash: 0,
            closingCash: null,
            production: [],
            sales: [],
            inventoryStart: finalInventoryStart,
            inventoryEnd: {}
        };
        this.notify();
    }

    // New method: Calculate expected inventory end based on sales
    prefillEndingInventory() {
        const newInventoryEnd: Record<string, number> = {};

        this.items.forEach(item => {
            const beg = this.shift.inventoryStart[item.id] || 0;
            const prod = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((acc, p) => acc + p.quantity, 0);

            // Sales Qty from additive log
            const sold = this.shift.sales
                .filter(s => s.itemId === item.id)
                .reduce((acc, s) => acc + s.quantity, 0);

            // Logic: End = (Beg + Prod) - Sold
            // If Sold > Available, we assume End is 0 (or allow negative if logical, but usually 0 floor)
            const expectedEnd = Math.max(0, (beg + prod) - sold);
            newInventoryEnd[item.id] = expectedEnd;
        });

        this.shift.inventoryEnd = newInventoryEnd;
        this.notify();
    }

    endShift(closingCash: number) {
        this.shift = {
            ...this.shift,
            status: ShiftStatus.CLOSED,
            endTime: Date.now(),
            closingCash
        };
        this.notify();
    }

    // Production Actions
    addProduction(itemId: string, quantity: number) {
        const entry: ProductionEntry = {
            id: Math.random().toString(36).substr(2, 9),
            itemId,
            quantity,
            timestamp: Date.now()
        };
        this.shift.production = [...this.shift.production, entry];
        this.notify();
    }

    // Sales Actions
    addSale(itemId: string, quantity: number) {
        const entry: SaleEntry = {
            id: Math.random().toString(36).substr(2, 9),
            itemId,
            quantity,
            timestamp: Date.now()
        };
        this.shift.sales = [...this.shift.sales, entry];
        this.notify();
    }

    setSalesQuantity(itemId: string, quantity: number) {
        // Remove existing sales for this item
        const otherSales = this.shift.sales.filter(s => s.itemId !== itemId);

        if (quantity > 0) {
            // Add single consolidated entry
            const entry: SaleEntry = {
                id: Math.random().toString(36).substr(2, 9),
                itemId,
                quantity,
                timestamp: Date.now()
            };
            this.shift.sales = [...otherSales, entry];
        } else {
            this.shift.sales = otherSales;
        }
        this.notify();
    }

    // Item Actions
    addItem(item: BakeryItem) {
        this.items = [...this.items, item];
        this.notify();
    }

    updateItem(updatedItem: BakeryItem) {
        this.items = this.items.map(i => i.id === updatedItem.id ? updatedItem : i);
        this.notify();
    }

    resetCatalog() {
        this.items = INITIAL_ITEMS;
        this.notify();
    }

    // Inventory Actions
    setEndingInventory(itemId: string, count: number) {
        this.shift.inventoryEnd = {
            ...this.shift.inventoryEnd,
            [itemId]: count
        };
        this.notify();
    }

    // Computed Values
    get inventorySheetData() {
        return this.items.map(item => {
            const beg = this.shift.inventoryStart[item.id] || 0;
            const prod = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((sum, p) => sum + p.quantity, 0);
            const total = beg + prod;
            const end = this.shift.inventoryEnd[item.id] !== undefined ? this.shift.inventoryEnd[item.id] : 0;
            // Sold = Total - Ending (if ending is entered, else 0 or assume full sale? Logic: usually Sold is derived)
            // If ending is not set, we can't calculate sold accurately yet, or assume 0 sold? 
            // In this specific flow: Sold = (Beg + Prod) - End
            const sold = this.shift.inventoryEnd[item.id] !== undefined ? Math.max(0, total - end) : 0;

            return {
                item,
                beg,
                prod,
                total,
                end: this.shift.inventoryEnd[item.id], // could be undefined
                sold,
                amount: sold * item.sellingPrice
            };
        });
    }

    get totalRevenue() {
        // Use inventory calculation if available, otherwise fall back to logged sales? 
        // For mixed mode, we sum the "Amount" column of the sheet.
        return this.inventorySheetData.reduce((acc, row) => acc + row.amount, 0);
    }

    get totalCost() {
        return this.shift.production.reduce((acc, prod) => {
            const item = this.items.find(i => i.id === prod.itemId);
            return acc + (item ? item.costPrice * prod.quantity : 0);
        }, 0);
    }

    get salesData() {
        return this.items.map(item => {
            const produced = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((sum, p) => sum + p.quantity, 0);
            
            const sold = this.shift.sales
                .filter(s => s.itemId === item.id)
                .reduce((sum, s) => sum + s.quantity, 0);

            return {
                name: item.name,
                produced,
                sold
            };
        }).filter(data => data.produced > 0 || data.sold > 0); // Only show items with activity
    }
}

export const bakeryStore = new BakeryStore();
