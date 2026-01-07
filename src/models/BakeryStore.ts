import { BakeryItem, Shift, ShiftStatus, ProductionEntry, SaleEntry } from '../../types';
import { INITIAL_ITEMS, CREDENTIALS } from '../../constants';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Simple event emitter for store updates
type Listener = () => void;

// Database row types
interface DbItem {
    id: string;
    name: string;
    category: string;
    unit: string;
    cost_price: number;
    selling_price: number;
}

interface DbShift {
    id: string;
    status: string;
    start_time: string | null;
    end_time: string | null;
    opening_cash: number;
    closing_cash: number | null;
}

interface DbProduction {
    id: string;
    shift_id: string;
    item_id: string;
    quantity: number;
    timestamp: string;
}

interface DbSale {
    id: string;
    shift_id: string;
    item_id: string;
    quantity: number;
    timestamp: string;
}

interface DbInventory {
    shift_id: string;
    item_id: string;
    beginning: number;
    ending: number | null;
}

export class BakeryStore {
    items: BakeryItem[];
    shift: Shift;
    isAuthenticated: boolean;
    isLoading: boolean = true;
    private listeners: Set<Listener> = new Set();

    constructor() {
        // Load from localStorage first (fast startup)
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

        // Then sync with Supabase in background
        if (isSupabaseConfigured) {
            this.loadFromSupabase();
        } else {
            this.isLoading = false;
        }
    }

    // ==================== SUPABASE SYNC ====================

    async loadFromSupabase() {
        if (!supabase) return;

        try {
            // Load items from database
            const { data: dbItems, error: itemsError } = await supabase
                .from('items')
                .select('*')
                .order('name');

            if (itemsError) {
                console.error('Error loading items:', itemsError);
                this.isLoading = false;
                return;
            }

            // If no items in database, seed with initial items from constants
            if (!dbItems || dbItems.length === 0) {
                console.log('No items in database. Seeding with initial items...');
                await this.seedDatabase();
                return; // seedDatabase will call loadFromSupabase again
            }

            // Use items from database
            this.items = dbItems.map((item: DbItem) => ({
                id: item.id,
                name: item.name,
                category: item.category as BakeryItem['category'],
                unit: item.unit,
                costPrice: Number(item.cost_price),
                sellingPrice: Number(item.selling_price)
            }));

            // Load active shift (most recent OPEN or last CLOSED)
            const { data: dbShifts } = await supabase
                .from('shifts')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(1);

            if (dbShifts && dbShifts.length > 0) {
                const dbShift = dbShifts[0] as DbShift;

                // Load production for this shift
                const { data: dbProduction } = await supabase
                    .from('production')
                    .select('*')
                    .eq('shift_id', dbShift.id);

                // Load sales for this shift
                const { data: dbSales } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('shift_id', dbShift.id);

                // Load inventory for this shift
                const { data: dbInventory } = await supabase
                    .from('inventory')
                    .select('*')
                    .eq('shift_id', dbShift.id);

                const inventoryStart: Record<string, number> = {};
                const inventoryEnd: Record<string, number> = {};

                (dbInventory || []).forEach((inv: DbInventory) => {
                    inventoryStart[inv.item_id] = inv.beginning;
                    if (inv.ending !== null) {
                        inventoryEnd[inv.item_id] = inv.ending;
                    }
                });

                this.shift = {
                    id: dbShift.id,
                    status: dbShift.status as ShiftStatus,
                    startTime: dbShift.start_time ? new Date(dbShift.start_time).getTime() : null,
                    endTime: dbShift.end_time ? new Date(dbShift.end_time).getTime() : null,
                    openingCash: Number(dbShift.opening_cash),
                    closingCash: dbShift.closing_cash ? Number(dbShift.closing_cash) : null,
                    production: (dbProduction || []).map((p: DbProduction) => ({
                        id: p.id,
                        itemId: p.item_id,
                        quantity: p.quantity,
                        timestamp: new Date(p.timestamp).getTime()
                    })),
                    sales: (dbSales || []).map((s: DbSale) => ({
                        id: s.id,
                        itemId: s.item_id,
                        quantity: s.quantity,
                        timestamp: new Date(s.timestamp).getTime()
                    })),
                    inventoryStart,
                    inventoryEnd
                };
            }

            this.isLoading = false;
            this.persist();
            this.notify();
        } catch (error) {
            console.error('Failed to load from Supabase:', error);
            this.isLoading = false;
        }
    }

    // Seed database with initial items from constants
    async seedDatabase() {
        if (!supabase) return;

        try {
            console.log('Seeding database with', INITIAL_ITEMS.length, 'items...');

            const itemsToInsert = INITIAL_ITEMS.map(item => ({
                id: crypto.randomUUID(),
                name: item.name,
                category: item.category,
                unit: item.unit,
                cost_price: item.costPrice,
                selling_price: item.sellingPrice
            }));

            const { error } = await supabase.from('items').insert(itemsToInsert);

            if (error) {
                console.error('Failed to seed database:', error);
                return;
            }

            console.log('Database seeded successfully!');

            // Reload from database to get the seeded items
            await this.loadFromSupabase();
        } catch (error) {
            console.error('Seeding error:', error);
        }
    }

    // ==================== SUBSCRIPTIONS ====================

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

    // ==================== AUTH ACTIONS ====================

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

    // ==================== SHIFT ACTIONS ====================

    async startShift() {
        let finalInventoryStart: Record<string, number> = {};

        const savedShift = localStorage.getItem('current_shift');
        const prevShift: Shift | null = savedShift ? JSON.parse(savedShift) : null;

        if (prevShift && prevShift.status === ShiftStatus.CLOSED && prevShift.inventoryEnd && Object.keys(prevShift.inventoryEnd).length > 0) {
            finalInventoryStart = { ...prevShift.inventoryEnd };
        } else {
            this.items.forEach(item => {
                finalInventoryStart[item.id] = 0;
            });
        }

        const newShiftId = crypto.randomUUID();

        this.shift = {
            id: newShiftId,
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

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('shifts').insert({
                    id: newShiftId,
                    status: 'OPEN',
                    start_time: new Date().toISOString(),
                    opening_cash: 0
                });

                // Insert inventory start records
                const inventoryRecords = Object.entries(finalInventoryStart).map(([itemId, beginning]) => ({
                    shift_id: newShiftId,
                    item_id: itemId,
                    beginning
                }));

                if (inventoryRecords.length > 0) {
                    await supabase.from('inventory').insert(inventoryRecords);
                }
            } catch (error) {
                console.error('Failed to sync shift start to Supabase:', error);
            }
        }

        this.notify();
    }

    prefillEndingInventory() {
        const newInventoryEnd: Record<string, number> = {};

        this.items.forEach(item => {
            const beg = this.shift.inventoryStart[item.id] || 0;
            const prod = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((acc, p) => acc + p.quantity, 0);

            const sold = this.shift.sales
                .filter(s => s.itemId === item.id)
                .reduce((acc, s) => acc + s.quantity, 0);

            const expectedEnd = Math.max(0, (beg + prod) - sold);
            newInventoryEnd[item.id] = expectedEnd;
        });

        this.shift.inventoryEnd = newInventoryEnd;
        this.notify();
    }

    async endShift(closingCash: number) {
        this.shift = {
            ...this.shift,
            status: ShiftStatus.CLOSED,
            endTime: Date.now(),
            closingCash
        };

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('shifts').update({
                    status: 'CLOSED',
                    end_time: new Date().toISOString(),
                    closing_cash: closingCash
                }).eq('id', this.shift.id);

                // Update inventory ending values
                for (const [itemId, ending] of Object.entries(this.shift.inventoryEnd)) {
                    await supabase.from('inventory').upsert({
                        shift_id: this.shift.id,
                        item_id: itemId,
                        beginning: this.shift.inventoryStart[itemId] || 0,
                        ending
                    }, { onConflict: 'shift_id,item_id' });
                }
            } catch (error) {
                console.error('Failed to sync shift end to Supabase:', error);
            }
        }

        this.notify();
    }

    // ==================== PRODUCTION ACTIONS ====================

    async addProduction(itemId: string, quantity: number) {
        const entryId = crypto.randomUUID();
        const entry: ProductionEntry = {
            id: entryId,
            itemId,
            quantity,
            timestamp: Date.now()
        };
        this.shift.production = [...this.shift.production, entry];

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('production').insert({
                    id: entryId,
                    shift_id: this.shift.id,
                    item_id: itemId,
                    quantity,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to sync production to Supabase:', error);
            }
        }

        this.notify();
    }

    // ==================== SALES ACTIONS ====================

    async addSale(itemId: string, quantity: number) {
        const entryId = crypto.randomUUID();
        const entry: SaleEntry = {
            id: entryId,
            itemId,
            quantity,
            timestamp: Date.now()
        };
        this.shift.sales = [...this.shift.sales, entry];

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('sales').insert({
                    id: entryId,
                    shift_id: this.shift.id,
                    item_id: itemId,
                    quantity,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to sync sale to Supabase:', error);
            }
        }

        this.notify();
    }

    async setSalesQuantity(itemId: string, quantity: number) {
        const otherSales = this.shift.sales.filter(s => s.itemId !== itemId);

        // Delete existing sales for this item in Supabase
        if (supabase) {
            try {
                await supabase.from('sales')
                    .delete()
                    .eq('shift_id', this.shift.id)
                    .eq('item_id', itemId);
            } catch (error) {
                console.error('Failed to delete sales from Supabase:', error);
            }
        }

        if (quantity > 0) {
            const entryId = crypto.randomUUID();
            const entry: SaleEntry = {
                id: entryId,
                itemId,
                quantity,
                timestamp: Date.now()
            };
            this.shift.sales = [...otherSales, entry];

            // Add new consolidated entry
            if (supabase) {
                try {
                    await supabase.from('sales').insert({
                        id: entryId,
                        shift_id: this.shift.id,
                        item_id: itemId,
                        quantity,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    console.error('Failed to sync sale to Supabase:', error);
                }
            }
        } else {
            this.shift.sales = otherSales;
        }
        this.notify();
    }

    // ==================== ITEM ACTIONS ====================

    async addItem(item: BakeryItem) {
        this.items = [...this.items, item];

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('items').insert({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    cost_price: item.costPrice,
                    selling_price: item.sellingPrice
                });
            } catch (error) {
                console.error('Failed to sync item to Supabase:', error);
            }
        }

        this.notify();
    }

    async updateItem(updatedItem: BakeryItem) {
        this.items = this.items.map(i => i.id === updatedItem.id ? updatedItem : i);

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('items').update({
                    name: updatedItem.name,
                    category: updatedItem.category,
                    unit: updatedItem.unit,
                    cost_price: updatedItem.costPrice,
                    selling_price: updatedItem.sellingPrice
                }).eq('id', updatedItem.id);
            } catch (error) {
                console.error('Failed to update item in Supabase:', error);
            }
        }

        this.notify();
    }

    async resetCatalog() {
        this.items = INITIAL_ITEMS;

        // Sync to Supabase - delete all and re-insert
        if (supabase) {
            try {
                await supabase.from('items').delete().neq('id', '');

                const itemsToInsert = INITIAL_ITEMS.map(item => ({
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    unit: item.unit,
                    cost_price: item.costPrice,
                    selling_price: item.sellingPrice
                }));

                await supabase.from('items').insert(itemsToInsert);
            } catch (error) {
                console.error('Failed to reset catalog in Supabase:', error);
            }
        }

        this.notify();
    }

    // ==================== INVENTORY ACTIONS ====================

    async setEndingInventory(itemId: string, count: number) {
        this.shift.inventoryEnd = {
            ...this.shift.inventoryEnd,
            [itemId]: count
        };

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('inventory').upsert({
                    shift_id: this.shift.id,
                    item_id: itemId,
                    beginning: this.shift.inventoryStart[itemId] || 0,
                    ending: count
                }, { onConflict: 'shift_id,item_id' });
            } catch (error) {
                console.error('Failed to update inventory in Supabase:', error);
            }
        }

        this.notify();
    }

    // ==================== COMPUTED VALUES ====================

    get inventorySheetData() {
        return this.items.map(item => {
            const beg = this.shift.inventoryStart[item.id] || 0;
            const prod = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((sum, p) => sum + p.quantity, 0);
            const total = beg + prod;
            const end = this.shift.inventoryEnd[item.id] !== undefined ? this.shift.inventoryEnd[item.id] : 0;
            const sold = this.shift.inventoryEnd[item.id] !== undefined ? Math.max(0, total - end) : 0;

            return {
                item,
                beg,
                prod,
                total,
                end: this.shift.inventoryEnd[item.id],
                sold,
                amount: sold * item.sellingPrice
            };
        });
    }

    get totalRevenue() {
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
        }).filter(data => data.produced > 0 || data.sold > 0);
    }
}

export const bakeryStore = new BakeryStore();
