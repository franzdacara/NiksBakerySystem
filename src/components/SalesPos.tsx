import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Swal from 'sweetalert2';
import { BakeryStore } from '../models/BakeryStore';
import { ShiftStatus, BakeryItem } from '../../types';
import { supabase } from '../lib/supabase';
import { peso, CATEGORY_ICONS, LOW_STOCK } from '../lib/format';

interface SalesPosProps {
    store: BakeryStore;
    /** The app sidebar is hidden (tablet/desktop), so the bottom order bar can use the full width */
    sidebarHidden?: boolean;
}

/** Ready-made quantities shown in the quantity picker */
const PRESET_QTYS = [1, 2, 3, 4, 5, 6, 10, 12];
const IN_STOCK_ONLY_KEY = 'niks_counter_in_stock_only';
type Picker = { item: BakeryItem; mode: 'cart' | 'shift' } | null;

export const SalesPos: React.FC<SalesPosProps> = ({ store, sidebarHidden = false }) => {
    const [, forceUpdate] = useState(0);
    const [globalStock, setGlobalStock] = useState<Record<string, number>>({});
    const [stockReady, setStockReady] = useState(!supabase);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // Refs so the background timers always see the latest values without re-subscribing
    const submittingRef = useRef(false);
    submittingRef.current = submitting;
    const lastFetchRef = useRef(0);

    /** Re-read remaining stock */
    const refreshStock = useCallback(async () => {
        if (!supabase) return;
        const stock = await store.fetchStockLevels();
        if (stock) {
            setGlobalStock(stock);
            setLastUpdated(Date.now());
        }
        setStockReady(true);
    }, [store]);

    /** Full refresh: stock + prices + sales rung up on other devices */
    const refreshAll = useCallback(async () => {
        if (!supabase || submittingRef.current) return;
        lastFetchRef.current = Date.now();
        setRefreshing(true);
        try {
            await Promise.all([store.sync(), refreshStock()]);
        } finally {
            setRefreshing(false);
        }
    }, [store, refreshStock]);

    useEffect(() => {
        refreshAll(); // when the POS page is opened

        const unsubscribe = store.subscribe(() => {
            forceUpdate(n => n + 1);
            refreshStock();
        });

        // When the person comes back to this tab/window, refresh (skip if we just did)
        const onReturn = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastFetchRef.current > 3000) refreshAll();
        };
        document.addEventListener('visibilitychange', onReturn);
        window.addEventListener('focus', onReturn);

        // While the page stays open, keep stock fresh (other devices may be selling too)
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible' && !submittingRef.current) refreshStock();
        }, 30_000);

        return () => {
            unsubscribe();
            document.removeEventListener('visibilitychange', onReturn);
            window.removeEventListener('focus', onReturn);
            clearInterval(timer);
        };
    }, [store, refreshAll, refreshStock]);

    const { shift, items } = store;
    const isOpen = shift.status === ShiftStatus.OPEN;

    // ---- UI state ----
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string>('all');
    // Hide sold-out products from the grid. Remembered on this device.
    const [inStockOnly, setInStockOnly] = useState(() => {
        try { return localStorage.getItem(IN_STOCK_ONLY_KEY) === '1'; } catch { return false; }
    });
    const toggleInStockOnly = () => {
        setInStockOnly(on => {
            try { localStorage.setItem(IN_STOCK_ONLY_KEY, on ? '0' : '1'); } catch { /* storage blocked: just not remembered */ }
            return !on;
        });
    };
    const [cart, setCart] = useState<Record<string, number>>({});
    const [panelTab, setPanelTab] = useState<'order' | 'shift'>('order');
    const [drawerOpen, setDrawerOpen] = useState(false); // phone/tablet order drawer
    const [picker, setPicker] = useState<Picker>(null);
    const [qtyInput, setQtyInput] = useState('1');
    const [tendered, setTendered] = useState(''); // cash the customer handed over
    const qtyRef = useRef<HTMLInputElement>(null);

    const categories = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.category)))], [items]);

    const filteredItems = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items
            .filter(i => category === 'all' || i.category === category)
            .filter(i => !q || i.name.toLowerCase().includes(q));
    }, [items, category, search]);

    // ---- stock ----
    /** Units available to sell right now. null = still loading. */
    const getAvailable = (itemId: string): number | null => {
        if (supabase) return stockReady ? (globalStock[itemId] ?? 0) : null;
        // No database configured: derive from the current shift
        const beg = shift.inventoryStart[itemId] || 0;
        const prod = shift.production.filter(p => p.itemId === itemId).reduce((a, p) => a + p.quantity, 0);
        const sold = shift.sales.filter(s => s.itemId === itemId).reduce((a, s) => a + s.quantity, 0);
        const bo = shift.discharges.filter(d => d.itemId === itemId).reduce((a, d) => a + d.quantity, 0);
        return Math.max(0, beg + prod - sold - bo);
    };

    /** What the grid shows. With "In stock only" on, sold-out products are left out; products
     *  still loading their stock, or already in the order, stay so nothing disappears mid-sale. */
    const visibleItems = inStockOnly
        ? filteredItems.filter(i => {
            const avail = getAvailable(i.id);
            return avail === null || avail > 0 || (cart[i.id] || 0) > 0;
        })
        : filteredItems;

    // ---- shift (already recorded) sales, aggregated per item ----
    const shiftSales = useMemo(() => items
        .map(item => {
            const qty = shift.sales.filter(s => s.itemId === item.id).reduce((a, s) => a + s.quantity, 0);
            return { item, qty, amount: qty * item.sellingPrice };
        })
        .filter(r => r.qty > 0), [items, shift.sales]);
    const shiftUnits = shiftSales.reduce((a, r) => a + r.qty, 0);
    const shiftRevenue = shiftSales.reduce((a, r) => a + r.amount, 0);

    // ---- cart ----
    const cartLines = Object.entries(cart)
        .map(([id, qty]) => ({ item: items.find(i => i.id === id), qty }))
        .filter((l): l is { item: BakeryItem; qty: number } => !!l.item);
    const cartUnits = cartLines.reduce((a, l) => a + l.qty, 0);
    const cartTotal = cartLines.reduce((a, l) => a + l.qty * l.item.sellingPrice, 0);

    // ---- payment: amount received -> change ----
    const tenderedNum = parseFloat(tendered) || 0;
    const hasTender = tenderedNum > 0;
    const changeDue = Math.round((tenderedNum - cartTotal) * 100) / 100;
    const isShort = hasTender && changeDue < 0;
    /** Bills the customer is most likely to hand over: the next few above the total */
    const quickCash = [20, 50, 100, 200, 500, 1000, 2000, 5000].filter(d => d >= cartTotal).slice(0, 3);

    const setCartQty = (itemId: string, qty: number) => {
        const avail = getAvailable(itemId);
        const clamped = Math.max(0, avail === null ? qty : Math.min(qty, avail));
        setCart(prev => {
            const next = { ...prev };
            if (clamped <= 0) delete next[itemId]; else next[itemId] = clamped;
            return next;
        });
    };

    // ---- quantity picker ----
    const pickerMax = (p: NonNullable<Picker>): number => {
        const avail = getAvailable(p.item.id) ?? 0;
        if (p.mode === 'shift') {
            const sold = shiftSales.find(r => r.item.id === p.item.id)?.qty || 0;
            return avail + sold;
        }
        return avail;
    };

    const openPicker = (item: BakeryItem, mode: 'cart' | 'shift') => {
        if (!isOpen) return;
        const current = mode === 'cart' ? (cart[item.id] || 0) : (shiftSales.find(r => r.item.id === item.id)?.qty || 0);
        setPicker({ item, mode });
        setQtyInput(String(mode === 'cart' ? (current || 1) : current));
    };
    const closePicker = () => setPicker(null);

    // On devices with a real keyboard focus the field; on touch screens leave it so the preset buttons stay visible.
    useEffect(() => {
        if (picker && qtyRef.current && window.matchMedia?.('(pointer: fine)').matches) {
            qtyRef.current.focus();
            qtyRef.current.select();
        }
    }, [picker]);

    const pickerQty = parseInt(qtyInput, 10) || 0;
    const setPickerQty = (n: number) => {
        if (!picker) return;
        setQtyInput(String(Math.max(0, Math.min(n, pickerMax(picker)))));
    };

    const confirmPicker = async () => {
        if (!picker) return;
        const { item, mode } = picker;
        const qty = Math.min(pickerQty, pickerMax(picker));
        closePicker();
        if (mode === 'cart') {
            setCartQty(item.id, qty);
            if (qty > 0) toast(`${qty} × ${item.name} added to order`);
        } else {
            await store.setSalesQuantity(item.id, qty);
        }
    };

    // ---- complete sale ----
    const toast = (title: string, icon: 'success' | 'info' = 'success') =>
        Swal.fire({ toast: true, position: 'top', icon, title, showConfirmButton: false, timer: 1600, timerProgressBar: true });

    const completeSale = async () => {
        if (!isOpen || cartLines.length === 0 || submitting) return;

        if (isShort) {
            Swal.fire({
                icon: 'warning',
                title: 'Payment is short',
                text: `The customer still owes ${peso(Math.abs(changeDue))}.`,
                confirmButtonColor: '#92400e'
            });
            return;
        }

        const short = cartLines.find(l => {
            const avail = getAvailable(l.item.id);
            return avail !== null && l.qty > avail;
        });
        if (short) {
            Swal.fire({
                icon: 'warning',
                title: 'Not enough stock',
                text: `Only ${getAvailable(short.item.id)} of ${short.item.name} left. Please adjust the order.`,
                confirmButtonColor: '#92400e'
            });
            return;
        }

        setSubmitting(true);
        try {
            for (const line of cartLines) {
                await store.addSale(line.item.id, line.qty);
            }
            const total = cartTotal;
            const units = cartUnits;
            const paid = hasTender ? tenderedNum : null;
            const change = changeDue;
            setCart({});
            setTendered('');
            setDrawerOpen(false);
            setPanelTab('order');
            setSubmitting(false); // sale is saved; don't leave "Saving…" showing behind the receipt
            if (paid !== null) {
                // Cash was entered: show the change big enough to read across the counter
                await Swal.fire({
                    icon: 'success',
                    title: 'Sale complete',
                    html: `<div style="font-size:14px;color:#57534e">${units} item${units === 1 ? '' : 's'} · Total ${peso(total)} · Received ${peso(paid)}</div>
                           <div style="margin-top:14px;font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#a8a29e;font-weight:700">Change</div>
                           <div style="font-size:44px;line-height:1.1;font-weight:800;color:#15803d">${peso(change)}</div>`,
                    confirmButtonText: 'Done',
                    confirmButtonColor: '#15803d'
                });
            } else {
                toast(`Sale complete · ${units} item${units === 1 ? '' : 's'} · ${peso(total)}`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const clearOrder = () => {
        setCart({});
        setTendered('');
    };

    // ---- sub views ----
    const StockLabel: React.FC<{ avail: number | null }> = ({ avail }) => {
        if (avail === null) return <span className="text-[11px] font-semibold text-stone-300">checking…</span>;
        if (avail <= 0) return <span className="text-[11px] font-bold text-red-500">Out of stock</span>;
        if (avail <= LOW_STOCK) return <span className="text-[11px] font-bold text-orange-600">Only {avail} left</span>;
        return <span className="text-[11px] font-semibold text-stone-400">{avail} in stock</span>;
    };

    const orderPanel = (onClose?: () => void) => (
        <div className="flex flex-col h-full min-h-0">
            {/* Panel header + tabs */}
            <div className="px-4 pt-4 pb-3 border-b border-stone-100 bg-stone-50/80 rounded-t-3xl lg:rounded-t-2xl">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-stone-800">
                        {panelTab === 'order' ? 'Current Order' : 'Shift Sales'}
                    </h3>
                    {onClose && (
                        <button
                            onClick={onClose}
                            aria-label="Close"
                            className="w-10 h-10 -mr-2 rounded-full text-stone-400 hover:bg-stone-200 active:bg-stone-200 flex items-center justify-center"
                        >
                            <i className="fas fa-xmark text-lg"></i>
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-stone-200/60 rounded-xl">
                    {([
                        ['order', 'New Order', cartUnits],
                        ['shift', 'Shift Sales', shiftUnits],
                    ] as const).map(([key, label, count]) => (
                        <button
                            key={key}
                            onClick={() => setPanelTab(key)}
                            className={`py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${panelTab === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                        >
                            {label}
                            {count > 0 && (
                                <span className={`min-w-[1.4rem] px-1.5 py-0.5 rounded-full text-[11px] leading-none ${panelTab === key ? 'bg-amber-600 text-white' : 'bg-stone-300 text-stone-600'}`}>
                                    {count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Panel body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                {panelTab === 'order' ? (
                    cartLines.length === 0 ? (
                        <EmptyState icon="fa-hand-pointer" title="No items yet" hint="Tap a product to add it to the order." />
                    ) : (
                        cartLines.map(({ item, qty }) => (
                            <div key={item.id} className="bg-stone-50 border border-stone-200 rounded-2xl p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-bold text-stone-800 leading-tight">{item.name}</p>
                                        <p className="text-xs text-stone-500">{peso(item.sellingPrice)} each</p>
                                    </div>
                                    <button
                                        onClick={() => setCartQty(item.id, 0)}
                                        aria-label={`Remove ${item.name}`}
                                        className="w-9 h-9 -mt-1 -mr-1 rounded-full text-stone-300 hover:text-red-500 hover:bg-red-50 active:bg-red-50 flex items-center justify-center"
                                    >
                                        <i className="fas fa-trash-can"></i>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-2">
                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => setCartQty(item.id, qty - 1)}
                                            aria-label="Decrease quantity"
                                            className="w-11 h-11 rounded-xl bg-white border border-stone-200 text-stone-600 text-lg font-bold active:scale-95 transition"
                                        >
                                            <i className="fas fa-minus text-sm"></i>
                                        </button>
                                        <button
                                            onClick={() => openPicker(item, 'cart')}
                                            aria-label={`Edit quantity of ${item.name}`}
                                            className="min-w-[3.25rem] h-11 px-2 rounded-xl bg-white border border-stone-200 text-stone-900 text-lg font-extrabold active:scale-95 transition"
                                        >
                                            {qty}
                                        </button>
                                        <button
                                            onClick={() => setCartQty(item.id, qty + 1)}
                                            disabled={(getAvailable(item.id) ?? 0) <= qty}
                                            aria-label="Increase quantity"
                                            className="w-11 h-11 rounded-xl bg-white border border-stone-200 text-stone-600 text-lg font-bold active:scale-95 transition disabled:opacity-30"
                                        >
                                            <i className="fas fa-plus text-sm"></i>
                                        </button>
                                    </div>
                                    <p className="font-extrabold text-stone-900">{peso(qty * item.sellingPrice)}</p>
                                </div>
                            </div>
                        ))
                    )
                ) : shiftSales.length === 0 ? (
                    <EmptyState icon="fa-receipt" title="No sales recorded yet" hint="Completed orders show up here." />
                ) : (
                    <>
                        <p className="text-xs text-stone-400 px-1">Tap a line to correct its total quantity.</p>
                        {shiftSales.map(({ item, qty, amount }) => (
                            <button
                                key={item.id}
                                onClick={() => openPicker(item, 'shift')}
                                disabled={!isOpen}
                                className="w-full flex items-center justify-between gap-3 bg-stone-50 border border-stone-200 rounded-2xl p-3 text-left hover:bg-amber-50 hover:border-amber-200 active:bg-amber-50 transition"
                            >
                                <div className="min-w-0">
                                    <p className="font-bold text-stone-800 leading-tight">{item.name}</p>
                                    <p className="text-xs text-stone-500">{qty} × {peso(item.sellingPrice)}</p>
                                </div>
                                <p className="font-extrabold text-green-700 whitespace-nowrap">{peso(amount)}</p>
                            </button>
                        ))}
                    </>
                )}
            </div>

            {/* Panel footer */}
            <div className="p-4 border-t border-stone-100 bg-stone-50/80 rounded-b-2xl space-y-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {panelTab === 'order' ? (
                    <>
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total</p>
                                <p className="text-xs text-stone-400">{cartUnits} item{cartUnits === 1 ? '' : 's'}</p>
                            </div>
                            <p className="text-3xl font-extrabold text-stone-900">{peso(cartTotal)}</p>
                        </div>

                        {/* Cash received -> change */}
                        {cartLines.length > 0 && (
                            <div className="rounded-2xl bg-white border border-stone-200 p-3 space-y-2">
                                <label className="block">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Amount received (optional)</span>
                                    <div className="relative mt-1">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-stone-400">₱</span>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            placeholder="0.00"
                                            value={tendered}
                                            onChange={e => {
                                                // digits and one decimal point, max 2 decimals
                                                let v = e.target.value.replace(/[^0-9.]/g, '');
                                                const dot = v.indexOf('.');
                                                if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
                                                setTendered(v.slice(0, 10));
                                            }}
                                            onFocus={e => e.target.select()}
                                            onKeyDown={e => { if (e.key === 'Enter') completeSale(); }}
                                            className="w-full h-14 pl-10 pr-4 text-2xl font-extrabold text-stone-900 bg-amber-50/60 border-2 border-stone-200 rounded-xl focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"
                                        />
                                    </div>
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => setTendered(cartTotal.toFixed(2))}
                                        className="h-10 px-4 rounded-xl text-sm font-bold bg-stone-100 text-stone-700 active:scale-95 transition"
                                    >
                                        Exact
                                    </button>
                                    {quickCash.map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setTendered(String(n))}
                                            className={`h-10 px-4 rounded-xl text-sm font-bold active:scale-95 transition ${tenderedNum === n ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-700'}`}
                                        >
                                            ₱{n.toLocaleString()}
                                        </button>
                                    ))}
                                </div>
                                {hasTender && (
                                    <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${isShort ? 'bg-red-50' : 'bg-green-50'}`}>
                                        <span className="flex items-center gap-2 text-sm font-bold text-stone-600">
                                            <i className={`fas ${isShort ? 'fa-circle-exclamation text-red-500' : 'fa-hand-holding-dollar text-green-600'}`}></i>
                                            {isShort ? 'Short by' : 'Change'}
                                        </span>
                                        <span className={`text-2xl font-extrabold tabular-nums ${isShort ? 'text-red-600' : 'text-green-700'}`}>
                                            {peso(Math.abs(changeDue))}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                onClick={clearOrder}
                                disabled={cartLines.length === 0 || submitting}
                                className="px-4 h-14 rounded-2xl font-bold text-stone-500 bg-white border border-stone-200 disabled:opacity-40 active:scale-95 transition"
                            >
                                Clear
                            </button>
                            <button
                                onClick={completeSale}
                                disabled={!isOpen || cartLines.length === 0 || submitting || isShort}
                                className="flex-1 h-14 rounded-2xl font-extrabold text-lg text-white bg-green-700 hover:bg-green-600 shadow-lg shadow-green-900/10 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition flex items-center justify-center gap-2"
                            >
                                {submitting
                                    ? <><i className="fas fa-spinner fa-spin"></i> Saving…</>
                                    : <><i className="fas fa-check"></i> Complete Sale</>}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Shift revenue</p>
                            <p className="text-xs text-stone-400">{shiftUnits} unit{shiftUnits === 1 ? '' : 's'} sold</p>
                        </div>
                        <p className="text-3xl font-extrabold text-stone-900">{peso(shiftRevenue)}</p>
                    </div>
                )}
            </div>
        </div>
    );

    const pickerAvail = picker ? pickerMax(picker) : 0;

    return (
        <div className="max-w-7xl mx-auto lg:h-[calc(100vh-10rem)] flex flex-col lg:flex-row gap-4 lg:gap-6 pb-28 lg:pb-0">

            {/* ============ Catalog ============ */}
            <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm border border-stone-200 flex flex-col overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-stone-200 bg-stone-50 space-y-3">
                    <div>
                        <div className="flex gap-2">
                            <div className="relative flex-1 min-w-0">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i>
                                <input
                                    type="search"
                                    inputMode="search"
                                    placeholder="Search products…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full h-12 pl-11 pr-4 text-base bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                                />
                            </div>
                            <button
                                onClick={() => refreshAll()}
                                disabled={refreshing || submitting}
                                aria-label="Refresh stock"
                                title="Refresh stock"
                                className="h-12 px-4 flex-shrink-0 rounded-xl bg-white border border-stone-200 text-stone-600 font-bold hover:bg-stone-100 active:scale-95 transition disabled:opacity-60 flex items-center gap-2"
                            >
                                <i className={`fas fa-rotate ${refreshing ? 'fa-spin' : ''}`}></i>
                                <span className="hidden sm:inline">Refresh</span>
                            </button>
                        </div>
                        {supabase && (
                            <p className="mt-1.5 px-1 text-[11px] text-stone-400">
                                {refreshing
                                    ? 'Updating stock…'
                                    : lastUpdated
                                        ? `Stock updated ${new Date(lastUpdated).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' })} · refreshes automatically`
                                        : 'Loading stock…'}
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        <button
                            onClick={toggleInStockOnly}
                            role="switch"
                            aria-checked={inStockOnly}
                            title={inStockOnly ? 'Showing only products with stock' : 'Hide out-of-stock products'}
                            className={`flex-shrink-0 h-10 px-4 rounded-full text-sm font-bold transition active:scale-95 flex items-center gap-2 ${inStockOnly
                                ? 'bg-green-700 text-white shadow'
                                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'}`}
                        >
                            <i className={`fas ${inStockOnly ? 'fa-circle-check' : 'fa-filter'}`}></i>
                            In stock only
                        </button>
                        <span className="flex-shrink-0 w-px h-6 self-center bg-stone-200" aria-hidden="true"></span>
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategory(cat)}
                                className={`flex-shrink-0 h-10 px-4 rounded-full text-sm font-bold transition active:scale-95 ${category === cat
                                    ? 'bg-amber-800 text-white shadow'
                                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'}`}
                            >
                                {cat === 'all' ? 'All' : cat}
                            </button>
                        ))}
                    </div>
                </div>

                {!isOpen && (
                    <div className="mx-3 sm:mx-4 mt-3 p-4 rounded-2xl bg-red-50 border border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <i className="fas fa-lock text-red-400 mt-1"></i>
                            <div>
                                <p className="font-bold text-red-800">Shift is closed</p>
                                <p className="text-sm text-red-600">Start a new shift to begin taking orders.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => store.startShift()}
                            disabled={store.isStartingShift}
                            className="h-11 px-5 rounded-xl bg-green-700 hover:bg-green-600 text-white font-bold disabled:opacity-50 active:scale-95 transition"
                        >
                            {store.isStartingShift ? 'Starting…' : 'Start Shift'}
                        </button>
                    </div>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                        {visibleItems.map(item => {
                            const avail = getAvailable(item.id);
                            const outOfStock = avail !== null && avail <= 0;
                            const inCart = cart[item.id] || 0;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => openPicker(item, 'cart')}
                                    disabled={!isOpen || outOfStock || avail === null}
                                    className={`relative flex flex-col items-center justify-between text-center p-3 min-h-[8.5rem] rounded-2xl border transition active:scale-95 ${inCart > 0
                                        ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/50'
                                        : outOfStock
                                            ? 'bg-stone-100 border-stone-200 opacity-60'
                                            : 'bg-white border-stone-200 hover:border-amber-300 hover:bg-amber-50/50'} disabled:cursor-not-allowed ${!isOpen && !outOfStock ? 'opacity-60' : ''}`}
                                >
                                    {inCart > 0 && (
                                        <span className="absolute -top-2 -right-2 min-w-[1.75rem] h-7 px-2 rounded-full bg-amber-600 text-white text-sm font-extrabold flex items-center justify-center shadow">
                                            {inCart}
                                        </span>
                                    )}
                                    <span className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-1">
                                        <i className={`fas ${CATEGORY_ICONS[item.category] || 'fa-bread-slice'}`}></i>
                                    </span>
                                    <span className="text-sm font-bold text-stone-800 leading-tight line-clamp-2">{item.name}</span>
                                    <span className="mt-1 text-base font-extrabold text-amber-700">{peso(item.sellingPrice)}</span>
                                    <StockLabel avail={avail} />
                                </button>
                            );
                        })}
                    </div>
                    {visibleItems.length === 0 && (
                        filteredItems.length > 0
                            ? <EmptyState icon="fa-box-open" title="Nothing in stock here" hint={'Turn off "In stock only" to see sold-out products.'} />
                            : <EmptyState icon="fa-magnifying-glass" title="No products found" hint="Try a different search or category." />
                    )}
                </div>
            </section>

            {/* ============ Order panel (desktop / large tablet) ============ */}
            <aside className="hidden lg:flex w-96 flex-shrink-0 bg-white rounded-2xl shadow-sm border border-stone-200 flex-col overflow-hidden">
                {orderPanel()}
            </aside>

            {/* ============ Order bar + drawer (phone / tablet) ============ */}
            {!drawerOpen && (
                <div className={`lg:hidden fixed inset-x-0 ${sidebarHidden ? '' : 'md:left-64'} bottom-0 transition-[left] duration-300 ease-in-out motion-reduce:transition-none z-30 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-[#fdfaf5] via-[#fdfaf5]/95 to-transparent`}>
                    <button
                        onClick={() => setDrawerOpen(true)}
                        className="w-full h-16 rounded-2xl bg-stone-900 text-white shadow-xl flex items-center justify-between px-5 active:scale-[0.98] transition"
                    >
                        <span className="flex items-center gap-3">
                            <span className="relative">
                                <i className="fas fa-basket-shopping text-xl"></i>
                                {cartUnits > 0 && (
                                    <span className="absolute -top-2 -right-3 min-w-[1.4rem] h-[1.4rem] px-1 rounded-full bg-amber-500 text-stone-900 text-xs font-extrabold flex items-center justify-center">
                                        {cartUnits}
                                    </span>
                                )}
                            </span>
                            <span className="font-bold">{cartUnits > 0 ? 'View Order' : 'Order is empty'}</span>
                        </span>
                        <span className="text-xl font-extrabold">{peso(cartTotal)}</span>
                    </button>
                </div>
            )}

            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-40 flex items-end justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)}></div>
                    <div className="relative w-full max-w-xl h-[88vh] bg-white rounded-t-3xl shadow-2xl overflow-hidden">
                        {orderPanel(() => setDrawerOpen(false))}
                    </div>
                </div>
            )}

            {/* ============ Quantity picker ============ */}
            {picker && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
                    <div className="absolute inset-0 bg-black/50" onClick={closePicker}></div>
                    <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[95vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                                    {picker.mode === 'cart' ? 'Add to order' : 'Correct shift total'}
                                </p>
                                <h3 className="text-xl font-extrabold text-stone-900 leading-tight">{picker.item.name}</h3>
                                <p className="text-sm text-stone-500 mt-0.5">
                                    {peso(picker.item.sellingPrice)} each · <StockLabel avail={pickerAvail} />
                                </p>
                            </div>
                            <button
                                onClick={closePicker}
                                aria-label="Close"
                                className="w-10 h-10 -mr-2 -mt-1 rounded-full text-stone-400 hover:bg-stone-100 active:bg-stone-100 flex items-center justify-center"
                            >
                                <i className="fas fa-xmark text-lg"></i>
                            </button>
                        </div>

                        {/* Stepper + manual entry */}
                        <div className="flex items-center justify-center gap-3 mb-5">
                            <button
                                onClick={() => setPickerQty(pickerQty - 1)}
                                disabled={pickerQty <= 0}
                                aria-label="Decrease"
                                className="w-16 h-16 rounded-2xl bg-stone-100 text-stone-700 active:scale-95 transition disabled:opacity-30"
                            >
                                <i className="fas fa-minus text-xl"></i>
                            </button>
                            <input
                                ref={qtyRef}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                aria-label="Quantity"
                                value={qtyInput}
                                onChange={e => {
                                    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    if (digits === '') { setQtyInput(''); return; }
                                    setPickerQty(parseInt(digits, 10));
                                }}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') confirmPicker();
                                    if (e.key === 'Escape') closePicker();
                                }}
                                className="w-28 h-16 text-center text-4xl font-extrabold text-stone-900 bg-amber-50 border-2 border-amber-400 rounded-2xl focus:outline-none focus:ring-4 focus:ring-amber-200"
                                placeholder="0"
                            />
                            <button
                                onClick={() => setPickerQty(pickerQty + 1)}
                                disabled={pickerQty >= pickerAvail}
                                aria-label="Increase"
                                className="w-16 h-16 rounded-2xl bg-stone-100 text-stone-700 active:scale-95 transition disabled:opacity-30"
                            >
                                <i className="fas fa-plus text-xl"></i>
                            </button>
                        </div>

                        {/* Preset quantities */}
                        <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2">Quick quantity</p>
                        <div className="grid grid-cols-4 gap-2 mb-6">
                            {PRESET_QTYS.map(n => (
                                <button
                                    key={n}
                                    onClick={() => setPickerQty(n)}
                                    disabled={n > pickerAvail}
                                    className={`h-12 rounded-xl text-lg font-bold transition active:scale-95 disabled:opacity-30 ${pickerQty === n
                                        ? 'bg-amber-600 text-white shadow'
                                        : 'bg-white border border-stone-200 text-stone-700 hover:bg-amber-50'}`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={confirmPicker}
                            disabled={picker.mode === 'cart' && pickerQty === 0 && !cart[picker.item.id]}
                            className={`w-full h-14 rounded-2xl text-lg font-extrabold text-white shadow-lg active:scale-[0.98] transition disabled:opacity-40 ${pickerQty === 0 ? 'bg-red-600' : 'bg-amber-700 hover:bg-amber-600'}`}
                        >
                            {pickerQty === 0
                                ? (picker.mode === 'cart' ? 'Remove from order' : 'Remove from shift sales')
                                : picker.mode === 'cart'
                                    ? `${cart[picker.item.id] ? 'Update' : 'Add'} · ${peso(pickerQty * picker.item.sellingPrice)}`
                                    : `Save · ${peso(pickerQty * picker.item.sellingPrice)}`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

const EmptyState: React.FC<{ icon: string; title: string; hint: string }> = ({ icon, title, hint }) => (
    <div className="py-12 px-4 text-center text-stone-400">
        <i className={`fas ${icon} text-4xl mb-3 opacity-30`}></i>
        <p className="font-bold text-stone-500">{title}</p>
        <p className="text-sm">{hint}</p>
    </div>
);
