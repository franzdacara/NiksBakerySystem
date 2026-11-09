import Swal from 'sweetalert2';
import { BakeryItem, Shift, ShiftStatus, ProductionEntry, SaleEntry, DischargeEntry, DischargeReason, UserRole } from '../../types';
import { INITIAL_ITEMS } from '../../constants';
import { supabase } from '../lib/supabase';

/**
 * BakeryStore - the app's data layer.
 *
 * Supabase is the ONLY place data lives: items, the current shift and its status,
 * production, sales, discharges, ending-inventory counts, stock and login sessions.
 * Nothing is cached in the browser except one opaque session token (so a page
 * reload knows which database session is its own).
 *
 * Screens read from this object's in-memory copy, which is refreshed from the
 * database on login, on every page visit, when the tab regains focus and
 * periodically (see sync()). Writes update the screen immediately, are saved to the
 * database, and if a save fails the screen is rolled back to what the database holds.
 */

// Simple event emitter for store updates
type Listener = () => void;

// The ONLY thing kept in the browser: a random id for the database session row.
const SESSION_TOKEN_KEY = 'niks_session_token';
const readToken = (): string | null => { try { return localStorage.getItem(SESSION_TOKEN_KEY); } catch { return null; } };
const saveToken = (t: string) => { try { localStorage.setItem(SESSION_TOKEN_KEY, t); } catch { /* storage blocked: session just won't survive a reload */ } };
const clearToken = () => { try { localStorage.removeItem(SESSION_TOKEN_KEY); } catch { /* ignore */ } };
/** Earlier versions cached data in the browser; the database is the source of truth now, so delete those leftovers. */
const purgeLegacyStorage = () => {
    try {
        ['bakery_items', 'current_shift', 'is_authenticated', 'current_user'].forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
};

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
    inventory_start?: Record<string, number> | null;
    inventory_end?: Record<string, number> | null;
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

interface DbDischarge {
    id: string;
    shift_id: string;
    item_id: string;
    quantity: number;
    reason: string;
    notes: string | null;
    timestamp: string;
}

/** What login_user() / resume_session() return - deliberately has no password field */
interface DbSessionUser {
    id: string;
    username: string;
    display_name: string;
    role?: string | null; // 'admin' | 'staff'
    token?: string;       // only returned by login_user()
}

/** One row of the sales table, normalised for reporting (all shifts, not just the open one) */
export interface SaleRecord {
    id: string;
    shiftId: string;
    itemId: string;
    quantity: number;
    /** Price captured at time of sale, when the database recorded it */
    unitPrice: number | null;
    timestamp: number;
}

export interface CurrentUser {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
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

const emptyShift = (): Shift => ({
    id: 'no-shift',
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
});

const toMs = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);
const errMessage = (e: unknown) => (e instanceof Error ? e.message : (e as { message?: string })?.message || 'Unknown error');

export class BakeryStore {
    items: BakeryItem[] = [];
    shift: Shift = emptyShift();
    isAuthenticated: boolean = false;
    currentUser: CurrentUser | null = null;

    /** True while the saved login (if any) is being checked on page load */
    isInitializing: boolean = true;
    /** True while data is being loaded from the database right after logging in */
    isLoading: boolean = false;
    /** True while a background refresh from the database is running */
    isSyncing: boolean = false;
    /** When the screen's data was last confirmed against the database */
    lastSyncedAt: number | null = null;
    /** Last problem talking to the database (cleared on the next successful load) */
    loadError: string | null = null;
    /** Reason the last login attempt failed because of a system problem (not a wrong password) */
    loginError: string | null = null;
    isStartingShift: boolean = false;

    private listeners: Set<Listener> = new Set();
    private sessionToken: string | null = null;
    private pendingWrites = 0;          // saves in flight - a refresh is held back until they finish
    private resyncQueued = false;
    private syncPromise: Promise<void> | null = null;
    private endingTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        void this.init();
    }

    // ==================== STARTUP / SESSION ====================

    /** On page load: if the browser holds a session token, ask the database whether it is still valid. */
    private async init() {
        purgeLegacyStorage();
        try {
            const token = readToken();
            if (token && supabase) {
                const { data, error } = await supabase.rpc('resume_session', { p_token: token });
                if (error) {
                    console.error('Could not check saved login:', error);
                } else if (data && data.length > 0) {
                    this.sessionToken = token;
                    this.applyUser(data[0] as DbSessionUser);
                    this.isAuthenticated = true;
                    this.isLoading = true;
                    this.notify();
                    await this.loadFromSupabase();
                } else {
                    clearToken(); // expired, logged out elsewhere, or user deactivated
                }
            }
        } finally {
            this.isInitializing = false;
            this.notify();
        }
    }

    private applyUser(row: DbSessionUser) {
        this.currentUser = {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            role: row.role === 'admin' ? 'admin' : 'staff'
        };
    }

    async login(username: string, password: string): Promise<boolean> {
        this.loginError = null;
        if (!supabase) {
            this.loginError = 'Supabase is not configured. Check your .env file.';
            console.error(this.loginError);
            return false;
        }

        try {
            // The password is checked inside the database against a bcrypt hash (see
            // login_user in supabase_full_setup.sql). The browser never receives a
            // password or hash - only the user's id / name / role and a session token.
            const { data: users, error } = await supabase.rpc('login_user', {
                p_username: username,
                p_password: password
            });

            if (error) {
                console.error('Login error:', error);
                this.loginError = `Database error: ${error.message}. Have you run supabase_full_setup.sql?`;
                return false;
            }

            if (users && users.length > 0) {
                const row = users[0] as DbSessionUser;
                if (!row.token) {
                    this.loginError = 'The database login function is out of date. Re-run supabase_full_setup.sql.';
                    return false;
                }
                this.sessionToken = row.token;
                saveToken(row.token);
                this.applyUser(row);
                this.isAuthenticated = true;
                this.isLoading = true;
                this.notify();
                await this.loadFromSupabase();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Login failed:', error);
            this.loginError = `Could not reach the database: ${errMessage(error)}`;
            return false;
        }
    }

    logout() {
        const token = this.sessionToken;
        this.sessionToken = null;
        clearToken();

        this.cancelEndingTimer();
        this.isAuthenticated = false;
        this.currentUser = null;
        this.items = [];
        this.shift = emptyShift();
        this.lastSyncedAt = null;
        this.loadError = null;
        this.notify();

        // End the session in the database too
        if (token && supabase) {
            supabase.rpc('logout_session', { p_token: token }).then(({ error }) => {
                if (error) console.error('Could not end session in database:', error);
            });
        }
    }

    get isAdmin(): boolean {
        return this.currentUser?.role === 'admin';
    }

    // ==================== LOADING FROM THE DATABASE ====================

    /**
     * Pull everything the screens need from Supabase: items, the active shift (status,
     * times, counts) with its production / sales / discharges. Replaces the in-memory copy.
     */
    async loadFromSupabase(seedIfEmpty: boolean = true): Promise<void> {
        if (!supabase) {
            this.isLoading = false;
            this.loadError = 'Supabase is not configured. Check your .env file.';
            this.notify();
            return;
        }

        try {
            const { data: dbItems, error: itemsError } = await supabase
                .from('items')
                .select('*')
                .order('name');
            if (itemsError) throw itemsError;

            // Brand-new database: seed the catalog from constants.ts once
            if ((!dbItems || dbItems.length === 0) && seedIfEmpty) {
                console.log('No items in database. Seeding with initial items...');
                await this.seedDatabase();
                return; // seedDatabase() loads again when done
            }

            const items: BakeryItem[] = (dbItems || []).map((item: DbItem) => ({
                id: item.id,
                name: item.name,
                category: item.category as BakeryItem['category'],
                unit: item.unit,
                costPrice: Number(item.cost_price),
                sellingPrice: Number(item.selling_price)
            }));

            // The shift that is open right now; if none is open, the most recent one (closed)
            let dbShift: DbShift | null = null;
            const openRes = await supabase.from('shifts').select('*').eq('status', 'OPEN')
                .order('created_at', { ascending: false }).limit(1);
            if (openRes.error) throw openRes.error;
            if (openRes.data && openRes.data.length > 0) {
                dbShift = openRes.data[0] as DbShift;
            } else {
                const lastRes = await supabase.from('shifts').select('*')
                    .order('created_at', { ascending: false }).limit(1);
                if (lastRes.error) throw lastRes.error;
                if (lastRes.data && lastRes.data.length > 0) dbShift = lastRes.data[0] as DbShift;
            }

            let shift = emptyShift();
            if (dbShift) {
                const [prodRes, salesRes, disRes, invRes] = await Promise.all([
                    supabase.from('productions').select('*').eq('shift_id', dbShift.id),
                    supabase.from('sales').select('*').eq('shift_id', dbShift.id),
                    supabase.from('discharges').select('*').eq('shift_id', dbShift.id),
                    supabase.from('global_inventory').select('item_id, quantity'),
                ]);
                for (const res of [prodRes, salesRes, disRes, invRes]) {
                    if (res.error) throw res.error;
                }

                const production: ProductionEntry[] = (prodRes.data || []).map((p: DbProduction) => ({
                    id: p.id, itemId: p.item_id, quantity: p.quantity, timestamp: new Date(p.timestamp).getTime()
                }));
                const sales: SaleEntry[] = (salesRes.data || []).map((s: DbSale) => ({
                    id: s.id, itemId: s.item_id, quantity: s.quantity, timestamp: new Date(s.timestamp).getTime()
                }));
                const discharges: DischargeEntry[] = (disRes.data || []).map((d: DbDischarge) => ({
                    id: d.id, itemId: d.item_id, quantity: d.quantity, reason: d.reason as DischargeReason,
                    notes: d.notes || undefined, timestamp: new Date(d.timestamp).getTime()
                }));

                // Beginning counts are stored on the shift itself. Shifts opened before that column
                // existed have none, so work them back from today's stock: beg = stock + sold + BO - produced.
                let inventoryStart: Record<string, number> = {};
                const saved = dbShift.inventory_start;
                if (saved && Object.keys(saved).length > 0) {
                    inventoryStart = { ...saved };
                } else {
                    const stock: Record<string, number> = {};
                    (invRes.data || []).forEach((r: DbGlobalInventory) => { stock[r.item_id] = r.quantity; });
                    items.forEach(item => {
                        const sum = (rows: { itemId: string; quantity: number }[]) =>
                            rows.filter(r => r.itemId === item.id).reduce((a, r) => a + r.quantity, 0);
                        inventoryStart[item.id] = Math.max(0, (stock[item.id] || 0) + sum(sales) + sum(discharges) - sum(production));
                    });
                }

                shift = {
                    id: dbShift.id,
                    status: dbShift.status as ShiftStatus,
                    startTime: toMs(dbShift.start_time),
                    endTime: toMs(dbShift.end_time),
                    openingCash: Number(dbShift.opening_cash),
                    closingCash: dbShift.closing_cash !== null && dbShift.closing_cash !== undefined ? Number(dbShift.closing_cash) : null,
                    production,
                    sales,
                    discharges,
                    inventoryStart,
                    inventoryEnd: { ...(dbShift.inventory_end || {}) }
                };
            }

            this.items = items;
            this.shift = shift;
            this.lastSyncedAt = Date.now();
            this.loadError = null;
        } catch (error) {
            console.error('Failed to load from Supabase:', error);
            this.loadError = errMessage(error);
        } finally {
            this.isLoading = false;
            this.notify();
        }
    }

    /**
     * Background refresh from the database - call when a page is opened, when the tab regains
     * focus, or on a timer. Safe to call often: overlapping calls share one request, and it
     * waits while a save is still in flight so it can never overwrite unsaved work.
     */
    sync(): Promise<void> {
        if (!supabase || !this.isAuthenticated || this.isLoading) return Promise.resolve();
        if (this.pendingWrites > 0) {
            this.resyncQueued = true;
            return Promise.resolve();
        }
        if (this.syncPromise) return this.syncPromise;

        this.isSyncing = true;
        this.notify();
        this.syncPromise = this.loadFromSupabase(false).finally(() => {
            this.syncPromise = null;
            this.isSyncing = false;
            this.notify();
        });
        return this.syncPromise;
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
            if (error) throw error;

            console.log('Database seeded successfully!');
            await this.loadFromSupabase(false);
        } catch (error) {
            console.error('Failed to seed database:', error);
            this.loadError = `Could not create the starting item list: ${errMessage(error)}`;
            this.isLoading = false;
            this.notify();
        }
    }

    // ==================== SUBSCRIPTIONS ====================

    subscribe(listener: Listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private notify() {
        this.listeners.forEach(l => l());
    }

    // ==================== SAVING TO THE DATABASE ====================

    private reportError(what: string, message: string) {
        Swal.fire({
            toast: true,
            position: 'top',
            icon: 'error',
            title: `Couldn't save: ${what}`,
            text: message,
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true
        });
    }

    private runQueuedSync() {
        if (this.pendingWrites === 0 && this.resyncQueued) {
            this.resyncQueued = false;
            void this.sync();
        }
    }

    /**
     * Run one database write. If it fails the user is told, and the screen is re-loaded from
     * the database so it never keeps showing something that was not actually saved.
     */
    private async write(
        what: string,
        op: () => PromiseLike<{ error: { message: string } | null }>
    ): Promise<boolean> {
        if (!supabase) {
            this.reportError(what, 'Database is not configured.');
            return false;
        }
        this.pendingWrites++;
        let ok = false;
        try {
            const { error } = await op();
            if (error) {
                console.error(`Saving ${what} failed:`, error);
                this.reportError(what, error.message);
            } else {
                ok = true;
            }
        } catch (error) {
            console.error(`Saving ${what} failed:`, error);
            this.reportError(what, errMessage(error));
        } finally {
            this.pendingWrites--;
        }
        if (!ok) this.resyncQueued = true; // roll the screen back to what the database holds
        this.runQueuedSync();
        return ok;
    }

    // ==================== SHIFT ACTIONS ====================

    async startShift() {
        if (this.isStartingShift) return;
        this.isStartingShift = true;
        this.notify();

        try {
            if (!supabase) throw new Error('Database is not configured.');

            // Another device may already have a shift open - join it instead of opening a second one
            const { data: open, error: openError } = await supabase
                .from('shifts').select('id').eq('status', 'OPEN').limit(1);
            if (openError) throw openError;
            if (open && open.length > 0) {
                await this.loadFromSupabase(false);
                Swal.fire({
                    toast: true, position: 'top', icon: 'info', title: 'A shift is already open',
                    showConfirmButton: false, timer: 2500
                });
                return;
            }

            // Beginning counts = the stock the database holds right now
            const stock = (await this.fetchStockLevels()) ?? {};
            const inventoryStart: Record<string, number> = {};
            this.items.forEach(item => { inventoryStart[item.id] = stock[item.id] ?? 0; });

            const newShiftId = crypto.randomUUID();
            const startedAt = Date.now();
            const { error } = await supabase.from('shifts').insert({
                id: newShiftId,
                status: 'OPEN',
                start_time: new Date(startedAt).toISOString(),
                opening_cash: 0,
                user_id: this.currentUser?.username || null,
                user_display_name: this.currentUser?.displayName || null,
                inventory_start: inventoryStart,
                inventory_end: {}
            });
            if (error) throw error;

            // Make sure every item has a stock row (new items added since the last shift)
            const missing = this.items.filter(i => stock[i.id] === undefined).map(i => ({ item_id: i.id, quantity: 0 }));
            if (missing.length > 0) {
                const { error: stockError } = await supabase.from('global_inventory')
                    .upsert(missing, { onConflict: 'item_id', ignoreDuplicates: true });
                if (stockError) console.error('Could not create stock rows:', stockError);
            }

            this.shift = {
                id: newShiftId,
                status: ShiftStatus.OPEN,
                startTime: startedAt,
                endTime: null,
                openingCash: 0,
                closingCash: null,
                production: [],
                sales: [],
                discharges: [],
                inventoryStart,
                inventoryEnd: {}
            };
        } catch (error) {
            console.error('Failed to start shift:', error);
            this.reportError('start shift', errMessage(error));
        } finally {
            this.isStartingShift = false;
            this.notify();
        }
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
        this.scheduleEndingSave();
    }

    async endShift(closingCash: number) {
        // The ending counts are saved together with closing the shift
        this.cancelEndingTimer();
        const endedAt = Date.now();
        this.shift = {
            ...this.shift,
            status: ShiftStatus.CLOSED,
            endTime: endedAt,
            closingCash
        };
        this.notify();

        // Calculate totals for the shift report
        const totalProduction = this.shift.production.reduce((acc, p) => acc + p.quantity, 0);
        const totalSoldQty = this.shift.sales.reduce((acc, s) => acc + s.quantity, 0);
        const totalDischarges = this.shift.discharges.reduce((acc, d) => acc + d.quantity, 0);
        const shift = this.shift;
        const totalSales = this.totalRevenue;

        const closed = await this.write('end shift', () => supabase!.from('shifts').update({
            status: 'CLOSED',
            end_time: new Date(endedAt).toISOString(),
            closing_cash: closingCash,
            inventory_end: shift.inventoryEnd
        }).eq('id', shift.id));
        if (!closed) return; // screen is rolled back to the still-open shift; nothing else is written

        // Report for historical tracking
        await this.write('shift report', () => supabase!.from('shift_reports').insert({
            shift_id: shift.id,
            user_id: this.currentUser?.username || null,
            user_display_name: this.currentUser?.displayName || null,
            start_time: shift.startTime ? new Date(shift.startTime).toISOString() : null,
            end_time: new Date(endedAt).toISOString(),
            opening_cash: shift.openingCash,
            closing_cash: closingCash,
            inventory_start: shift.inventoryStart,
            inventory_end: shift.inventoryEnd,
            total_production: totalProduction,
            total_sales: totalSales,
            total_sold_qty: totalSoldQty,
            total_discharges: totalDischarges
        }));
    }

    // ==================== REPORTING (admin dashboard) ====================

    /** Current remaining stock per item, straight from global_inventory. Returns null if it can't be loaded. */
    async fetchStockLevels(): Promise<Record<string, number> | null> {
        if (!supabase) return null;
        const { data, error } = await supabase.from('global_inventory').select('item_id, quantity');
        if (error || !data) {
            console.error('Failed to fetch stock levels:', error);
            return null;
        }
        const stock: Record<string, number> = {};
        data.forEach((row: DbGlobalInventory) => { stock[row.item_id] = row.quantity; });
        return stock;
    }

    /**
     * Every sale across all shifts (newest first), optionally since a given time.
     * Pages through results because Supabase returns at most 1000 rows per request.
     */
    async fetchSalesHistory(sinceMs?: number): Promise<SaleRecord[]> {
        if (!supabase) return [];
        const PAGE = 1000;
        const MAX_PAGES = 30; // safety cap: 30k rows
        const records: SaleRecord[] = [];

        for (let page = 0; page < MAX_PAGES; page++) {
            let query = supabase
                .from('sales')
                .select('*')
                .order('timestamp', { ascending: false })
                .range(page * PAGE, page * PAGE + PAGE - 1);
            if (sinceMs !== undefined) query = query.gte('timestamp', new Date(sinceMs).toISOString());

            const { data, error } = await query;
            if (error) {
                console.error('Failed to fetch sales history:', error);
                throw error;
            }
            (data || []).forEach((s: DbSale & { unit_price?: number | null }) => {
                records.push({
                    id: s.id,
                    shiftId: s.shift_id,
                    itemId: s.item_id,
                    quantity: s.quantity,
                    unitPrice: s.unit_price !== null && s.unit_price !== undefined ? Number(s.unit_price) : null,
                    timestamp: new Date(s.timestamp).getTime()
                });
            });
            if (!data || data.length < PAGE) break;
        }
        return records;
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
    // Each action updates the screen straight away, then saves. The database triggers keep
    // global_inventory (stock) in step with production / sales / discharges.

    async addProduction(itemId: string, quantity: number) {
        const entryId = crypto.randomUUID();
        const entry: ProductionEntry = { id: entryId, itemId, quantity, timestamp: Date.now() };
        const shiftId = this.shift.id;
        this.shift.production = [...this.shift.production, entry];
        this.notify();

        await this.write('production', () => supabase!.from('productions').insert({
            id: entryId,
            shift_id: shiftId,
            item_id: itemId,
            quantity,
            user_id: this.currentUser?.username || null,
            user_display_name: this.currentUser?.displayName || null,
            timestamp: new Date(entry.timestamp).toISOString()
        }));
    }

    async updateProduction(entryId: string, newQuantity: number) {
        if (newQuantity <= 0) {
            console.error('Production quantity must be greater than 0');
            return;
        }

        this.shift.production = this.shift.production.map(p =>
            p.id === entryId ? { ...p, quantity: newQuantity } : p
        );
        this.notify();

        await this.write('production change', () => supabase!.from('productions')
            .update({ quantity: newQuantity }).eq('id', entryId));
    }

    async removeProduction(entryId: string) {
        this.shift.production = this.shift.production.filter(p => p.id !== entryId);
        this.notify();

        await this.write('production removal', () => supabase!.from('productions').delete().eq('id', entryId));
    }

    async setProductionQuantity(itemId: string, quantity: number) {
        const shiftId = this.shift.id;
        const others = this.shift.production.filter(p => p.itemId !== itemId);
        let entry: ProductionEntry | null = null;
        if (quantity > 0) entry = { id: crypto.randomUUID(), itemId, quantity, timestamp: Date.now() };

        this.shift.production = entry ? [...others, entry] : others;
        this.notify();

        const cleared = await this.write('production', () => supabase!.from('productions')
            .delete().eq('shift_id', shiftId).eq('item_id', itemId));
        if (cleared && entry) {
            const e = entry;
            await this.write('production', () => supabase!.from('productions').insert({
                id: e.id,
                shift_id: shiftId,
                item_id: itemId,
                quantity: e.quantity,
                user_id: this.currentUser?.username || null,
                user_display_name: this.currentUser?.displayName || null,
                timestamp: new Date(e.timestamp).toISOString()
            }));
        }
    }

    // ==================== SALES ACTIONS ====================

    async addSale(itemId: string, quantity: number) {
        const entryId = crypto.randomUUID();
        const entry: SaleEntry = { id: entryId, itemId, quantity, timestamp: Date.now() };
        const shiftId = this.shift.id;
        this.shift.sales = [...this.shift.sales, entry];
        this.notify();

        await this.write('sale', () => supabase!.from('sales').insert({
            id: entryId,
            shift_id: shiftId,
            item_id: itemId,
            quantity,
            timestamp: new Date(entry.timestamp).toISOString()
        }));
    }

    async setSalesQuantity(itemId: string, quantity: number) {
        const shiftId = this.shift.id;
        const others = this.shift.sales.filter(s => s.itemId !== itemId);
        let entry: SaleEntry | null = null;
        if (quantity > 0) entry = { id: crypto.randomUUID(), itemId, quantity, timestamp: Date.now() };

        this.shift.sales = entry ? [...others, entry] : others;
        this.notify();

        const cleared = await this.write('sale correction', () => supabase!.from('sales')
            .delete().eq('shift_id', shiftId).eq('item_id', itemId));
        if (cleared && entry) {
            const e = entry;
            await this.write('sale correction', () => supabase!.from('sales').insert({
                id: e.id,
                shift_id: shiftId,
                item_id: itemId,
                quantity: e.quantity,
                timestamp: new Date(e.timestamp).toISOString()
            }));
        }
    }

    // ==================== DISCHARGE/BO ACTIONS ====================

    async addDischarge(itemId: string, quantity: number, reason: DischargeReason, notes?: string) {
        const entryId = crypto.randomUUID();
        const entry: DischargeEntry = { id: entryId, itemId, quantity, reason, notes, timestamp: Date.now() };
        const shiftId = this.shift.id;
        this.shift.discharges = [...this.shift.discharges, entry];
        this.notify();

        await this.write('discharge', () => supabase!.from('discharges').insert({
            id: entryId,
            shift_id: shiftId,
            item_id: itemId,
            quantity,
            reason,
            notes: notes || null,
            timestamp: new Date(entry.timestamp).toISOString()
        }));
    }

    async removeDischarge(id: string) {
        this.shift.discharges = this.shift.discharges.filter(d => d.id !== id);
        this.notify();

        await this.write('discharge removal', () => supabase!.from('discharges').delete().eq('id', id));
    }

    // ==================== ITEM ACTIONS ====================

    async addItem(item: BakeryItem) {
        this.items = [...this.items, item];
        this.notify();

        await this.write('new item', () => supabase!.from('items').insert({
            id: item.id,
            name: item.name,
            category: item.category,
            unit: item.unit,
            cost_price: item.costPrice,
            selling_price: item.sellingPrice
        }));
    }

    async updateItem(updatedItem: BakeryItem) {
        this.items = this.items.map(i => i.id === updatedItem.id ? updatedItem : i);
        this.notify();

        await this.write('item change', () => supabase!.from('items').update({
            name: updatedItem.name,
            category: updatedItem.category,
            unit: updatedItem.unit,
            cost_price: updatedItem.costPrice,
            selling_price: updatedItem.sellingPrice
        }).eq('id', updatedItem.id));
    }

    async deleteItem(itemId: string) {
        this.items = this.items.filter(i => i.id !== itemId);
        this.notify();

        await this.write('item removal', () => supabase!.from('items').delete().eq('id', itemId));
    }

    async resetCatalog() {
        // Fresh ids: the database uses UUIDs, which the short ids in constants.ts are not
        const fresh: BakeryItem[] = INITIAL_ITEMS.map(item => ({ ...item, id: crypto.randomUUID() }));
        this.items = fresh;
        this.notify();

        const NIL_UUID = '00000000-0000-0000-0000-000000000000';
        const cleared = await this.write('catalog reset', () => supabase!.from('items').delete().neq('id', NIL_UUID));
        if (cleared) {
            await this.write('catalog reset', () => supabase!.from('items').insert(fresh.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category,
                unit: item.unit,
                cost_price: item.costPrice,
                selling_price: item.sellingPrice
            }))));
            await this.sync(); // stock rows / history were cleared with the old items
        }
    }

    // ==================== INVENTORY ACTIONS ====================

    async setEndingInventory(itemId: string, count: number) {
        this.shift.inventoryEnd = {
            ...this.shift.inventoryEnd,
            [itemId]: count
        };
        this.notify();
        this.scheduleEndingSave();
    }

    /**
     * Ending counts are typed one keystroke at a time, so they are saved to the shift row after
     * a short pause. While a save is pending a background refresh is held back, so it can't
     * overwrite what is being typed.
     */
    private scheduleEndingSave() {
        if (!supabase || this.shift.status !== ShiftStatus.OPEN) return;
        if (this.endingTimer === null) {
            this.pendingWrites++;
        } else {
            clearTimeout(this.endingTimer);
        }
        this.endingTimer = setTimeout(async () => {
            this.endingTimer = null;
            const { id, inventoryEnd } = this.shift;
            await this.write('ending inventory', () => supabase!.from('shifts')
                .update({ inventory_end: inventoryEnd }).eq('id', id));
            this.pendingWrites--;
            this.runQueuedSync();
        }, 600);
    }

    private cancelEndingTimer() {
        if (this.endingTimer !== null) {
            clearTimeout(this.endingTimer);
            this.endingTimer = null;
            this.pendingWrites--;
        }
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
