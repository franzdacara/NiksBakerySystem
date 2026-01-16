import { BakeryItem, Shift, ShiftStatus, ProductionEntry, SaleEntry, DischargeEntry, DischargeReason } from '../../types';
import { INITIAL_ITEMS } from '../../constants';
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

interface DbDischarge {
    id: string;
    shift_id: string;
    item_id: string;
    quantity: number;
    reason: string;
    notes: string | null;
    timestamp: string;
}

interface DbUser {
    id: string;
    username: string;
    password: string;
    display_name: string;
    is_active: boolean;
}

interface DbGlobalInventory {
    item_id: string;
    quantity: number;
}

interface DbShiftReport {
    id: string;
    shift_id: string;
    user_id: string | null;
    user_display_name: string | null;
    start_time: string;
    end_time: string;
    opening_cash: number;
    closing_cash: number;
    total_sales: number;
    total_production: number;
    total_sold_qty: number;
    total_discharges: number;
    inventory_start: Record<string, number>;
    inventory_end: Record<string, number>;
    created_at: string;
}

export interface ShiftReport {
    id: string;
    shiftId: string;
    userId: string | null;
    userDisplayName: string | null;
    startTime: number;
    endTime: number;
    openingCash: number;
    closingCash: number;
    totalSales: number;
    totalProduction: number;
    totalSoldQty: number;
    totalDischarges: number;
    inventoryStart: Record<string, number>;
    inventoryEnd: Record<string, number>;
    createdAt: number;
}

export class BakeryStore {
    items: BakeryItem[];
    shift: Shift;
    isAuthenticated: boolean;
    currentUser: { id: string; username: string; displayName: string } | null = null;
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
            discharges: [],
            inventoryStart: {},
            inventoryEnd: {}
        };

        this.isAuthenticated = localStorage.getItem('is_authenticated') === 'true';
        const savedUser = localStorage.getItem('current_user');
        this.currentUser = savedUser ? JSON.parse(savedUser) : null;

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
                    .from('productions')
                    .select('*')
                    .eq('shift_id', dbShift.id);

                // Load sales for this shift
                const { data: dbSales } = await supabase
                    .from('sales')
                    .select('*')
                    .eq('shift_id', dbShift.id);

                // Load inventory from global_inventory (current state)
                const { data: globalInv } = await supabase
                    .from('global_inventory')
                    .select('*');

                const inventoryStart: Record<string, number> = {};
                const inventoryEnd: Record<string, number> = {};

                (globalInv || []).forEach((inv: { item_id: string; quantity: number }) => {
                    inventoryStart[inv.item_id] = inv.quantity;
                    inventoryEnd[inv.item_id] = inv.quantity;
                });

                // Load discharges for this shift
                const { data: dbDischarges } = await supabase
                    .from('discharges')
                    .select('*')
                    .eq('shift_id', dbShift.id);

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
                    discharges: (dbDischarges || []).map((d: DbDischarge) => ({
                        id: d.id,
                        itemId: d.item_id,
                        quantity: d.quantity,
                        reason: d.reason as DischargeReason,
                        notes: d.notes || undefined,
                        timestamp: new Date(d.timestamp).getTime()
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

    async login(username: string, password: string): Promise<boolean> {
        if (!supabase) {
            console.error('Supabase not configured');
            return false;
        }

        try {
            const { data: users, error } = await supabase
                .from('users')
                .select('id, username, password, display_name, is_active')
                .eq('username', username.toLowerCase())
                .eq('is_active', true)
                .limit(1);

            if (error) {
                console.error('Login error:', error);
                return false;
            }

            if (users && users.length > 0) {
                const user = users[0] as DbUser;
                if (user.password === password) {
                    this.isAuthenticated = true;
                    this.currentUser = {
                        id: user.id,
                        username: user.username,
                        displayName: user.display_name
                    };
                    localStorage.setItem('current_user', JSON.stringify(this.currentUser));
                    this.notify();
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        }
    }

    logout() {
        this.isAuthenticated = false;
        this.currentUser = null;
        localStorage.removeItem('current_user');
        this.notify();
    }

    // ==================== SHIFT ACTIONS ====================

    async startShift() {
        let finalInventoryStart: Record<string, number> = {};

        // Fetch current inventory from global_inventory table
        if (supabase) {
            try {
                const { data: globalInv } = await supabase
                    .from('global_inventory')
                    .select('item_id, quantity');

                if (globalInv && globalInv.length > 0) {
                    globalInv.forEach((inv: DbGlobalInventory) => {
                        finalInventoryStart[inv.item_id] = inv.quantity;
                    });
                }
            } catch (error) {
                console.error('Failed to fetch global inventory:', error);
            }
        }

        // Ensure all items have an entry (default to 0 for new items)
        this.items.forEach(item => {
            if (finalInventoryStart[item.id] === undefined) {
                finalInventoryStart[item.id] = 0;
            }
        });

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
            discharges: [],
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
                    opening_cash: 0,
                    user_id: this.currentUser?.username || null
                });

                // Ensure global_inventory has entries for all items
                for (const item of this.items) {
                    await supabase.from('global_inventory').upsert({
                        item_id: item.id,
                        quantity: finalInventoryStart[item.id] || 0
                    }, { onConflict: 'item_id' });
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

            // BO (discharges) should also reduce the inventory
            const bo = this.shift.discharges
                .filter(d => d.itemId === item.id)
                .reduce((acc, d) => acc + d.quantity, 0);

            const expectedEnd = Math.max(0, (beg + prod) - sold - bo);
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

        // Calculate totals for the shift report
        const totalProduction = this.shift.production.reduce((acc, p) => acc + p.quantity, 0);
        const totalSoldQty = this.shift.sales.reduce((acc, s) => acc + s.quantity, 0);
        const totalDischarges = this.shift.discharges.reduce((acc, d) => acc + d.quantity, 0);

        // Sync to Supabase
        if (supabase) {
            try {
                // Update shift status
                await supabase.from('shifts').update({
                    status: 'CLOSED',
                    end_time: new Date().toISOString(),
                    closing_cash: closingCash
                }).eq('id', this.shift.id);

                // Create shift report for historical tracking
                await supabase.from('shift_reports').insert({
                    shift_id: this.shift.id,
                    user_id: this.currentUser?.username || null,
                    user_display_name: this.currentUser?.displayName || null,
                    start_time: this.shift.startTime ? new Date(this.shift.startTime).toISOString() : null,
                    end_time: new Date().toISOString(),
                    opening_cash: this.shift.openingCash,
                    closing_cash: closingCash,
                    inventory_start: this.shift.inventoryStart,
                    inventory_end: this.shift.inventoryEnd,
                    total_production: totalProduction,
                    total_sales: this.totalRevenue,
                    total_sold_qty: totalSoldQty,
                    total_discharges: totalDischarges
                });
            } catch (error) {
                console.error('Failed to sync shift end to Supabase:', error);
            }
        }

        this.notify();
    }

    // ==================== SHIFT REPORTS ====================

    async getShiftReports(limit: number = 20): Promise<ShiftReport[]> {
        if (!supabase) return [];

        try {
            const { data, error } = await supabase
                .from('shift_reports')
                .select('*')
                .order('end_time', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Failed to fetch shift reports:', error);
                return [];
            }

            return (data || []).map((r: DbShiftReport) => ({
                id: r.id,
                shiftId: r.shift_id,
                userId: r.user_id,
                userDisplayName: r.user_display_name,
                startTime: new Date(r.start_time).getTime(),
                endTime: new Date(r.end_time).getTime(),
                openingCash: Number(r.opening_cash),
                closingCash: Number(r.closing_cash),
                totalSales: Number(r.total_sales),
                totalProduction: r.total_production,
                totalSoldQty: r.total_sold_qty,
                totalDischarges: r.total_discharges,
                inventoryStart: r.inventory_start || {},
                inventoryEnd: r.inventory_end || {},
                createdAt: new Date(r.created_at).getTime()
            }));
        } catch (error) {
            console.error('Failed to fetch shift reports:', error);
            return [];
        }
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

        // Sync to Supabase - trigger will auto-update global_inventory
        if (supabase) {
            try {
                await supabase.from('productions').insert({
                    id: entryId,
                    shift_id: this.shift.id,
                    item_id: itemId,
                    quantity,
                    user_id: this.currentUser?.username || null,
                    user_display_name: this.currentUser?.displayName || null,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to sync production to Supabase:', error);
            }
        }

        this.notify();
    }

    async updateProduction(entryId: string, newQuantity: number) {
        if (newQuantity <= 0) {
            console.error('Production quantity must be greater than 0');
            return;
        }

        this.shift.production = this.shift.production.map(p =>
            p.id === entryId ? { ...p, quantity: newQuantity } : p
        );

        // Sync to Supabase - trigger will auto-update global_inventory
        if (supabase) {
            try {
                await supabase.from('productions').update({
                    quantity: newQuantity
                }).eq('id', entryId);
            } catch (error) {
                console.error('Failed to update production in Supabase:', error);
            }
        }

        this.notify();
    }

    async removeProduction(entryId: string) {
        this.shift.production = this.shift.production.filter(p => p.id !== entryId);

        // Sync to Supabase - trigger will auto-update global_inventory
        if (supabase) {
            try {
                await supabase.from('productions').delete().eq('id', entryId);
            } catch (error) {
                console.error('Failed to delete production from Supabase:', error);
            }
        }

        this.notify();
    }

    async setProductionQuantity(itemId: string, quantity: number) {
        const otherProductions = this.shift.production.filter(p => p.itemId !== itemId);

        // Delete existing productions for this item in Supabase
        if (supabase) {
            try {
                await supabase.from('productions')
                    .delete()
                    .eq('shift_id', this.shift.id)
                    .eq('item_id', itemId);
            } catch (error) {
                console.error('Failed to delete productions from Supabase:', error);
            }
        }

        if (quantity > 0) {
            const entryId = crypto.randomUUID();
            const entry: ProductionEntry = {
                id: entryId,
                itemId,
                quantity,
                timestamp: Date.now()
            };
            this.shift.production = [...otherProductions, entry];

            // Add new consolidated entry
            if (supabase) {
                try {
                    await supabase.from('productions').insert({
                        id: entryId,
                        shift_id: this.shift.id,
                        item_id: itemId,
                        quantity,
                        user_id: this.currentUser?.username || null,
                        user_display_name: this.currentUser?.displayName || null,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    console.error('Failed to sync production to Supabase:', error);
                }
            }
        } else {
            this.shift.production = otherProductions;
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

    // ==================== DISCHARGE/BO ACTIONS ====================

    async addDischarge(itemId: string, quantity: number, reason: DischargeReason, notes?: string) {
        const entryId = crypto.randomUUID();
        const entry: DischargeEntry = {
            id: entryId,
            itemId,
            quantity,
            reason,
            notes,
            timestamp: Date.now()
        };
        this.shift.discharges = [...this.shift.discharges, entry];

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('discharges').insert({
                    id: entryId,
                    shift_id: this.shift.id,
                    item_id: itemId,
                    quantity,
                    reason,
                    notes: notes || null,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Failed to sync discharge to Supabase:', error);
            }
        }

        this.notify();
    }

    async removeDischarge(id: string) {
        this.shift.discharges = this.shift.discharges.filter(d => d.id !== id);

        // Sync to Supabase
        if (supabase) {
            try {
                await supabase.from('discharges').delete().eq('id', id);
            } catch (error) {
                console.error('Failed to delete discharge from Supabase:', error);
            }
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

        // Note: global_inventory is updated via triggers when sales/production/discharge happen
        // No need to manually sync here

        this.notify();
    }

    // ==================== COMPUTED VALUES ====================

    get inventorySheetData() {
        return this.items.map(item => {
            const beg = this.shift.inventoryStart[item.id] || 0;
            const prod = this.shift.production
                .filter(p => p.itemId === item.id)
                .reduce((sum, p) => sum + p.quantity, 0);
            const bo = this.shift.discharges
                .filter(d => d.itemId === item.id)
                .reduce((sum, d) => sum + d.quantity, 0);
            const total = beg + prod;
            const end = this.shift.inventoryEnd[item.id] !== undefined ? this.shift.inventoryEnd[item.id] : 0;
            // Sold = Total - Ending - BO
            const sold = this.shift.inventoryEnd[item.id] !== undefined ? Math.max(0, total - end - bo) : 0;

            return {
                item,
                beg,
                prod,
                bo,
                total,
                end: this.shift.inventoryEnd[item.id],
                sold,
                amount: sold * item.sellingPrice
            };
        });
    }

    get totalDischarges() {
        return this.shift.discharges.reduce((acc, d) => {
            const item = this.items.find(i => i.id === d.itemId);
            return {
                count: acc.count + d.quantity,
                cost: acc.cost + (item ? item.costPrice * d.quantity : 0)
            };
        }, { count: 0, cost: 0 });
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
