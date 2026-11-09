import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { BakeryStore } from '../models/BakeryStore';
import { BakeryItem } from '../../types';
import { peso, CATEGORY_ICONS, LOW_STOCK } from '../lib/format';

interface InventoryManagerProps {
    store: BakeryStore;
}

const CATEGORIES = Object.keys(CATEGORY_ICONS) as BakeryItem['category'][];
const UNITS = ['pcs', 'btl', 'cup', 'sachet', 'loaf', 'slice', 'pack', 'box'];

const PAGE_SIZES = [12, 24, 48];

type Sort = 'name' | 'price-asc' | 'price-desc' | 'margin-desc';
type View = 'cards' | 'table';
interface ItemValues {
    name: string;
    category: BakeryItem['category'];
    unit: string;
    costPrice: number;
    sellingPrice: number;
}

/** Profit per unit and margin (% of the selling price) */
const marginOf = (i: { costPrice: number; sellingPrice: number }) => {
    const profit = i.sellingPrice - i.costPrice;
    return { profit, pct: i.sellingPrice > 0 ? (profit / i.sellingPrice) * 100 : 0 };
};
const marginTone = (pct: number) =>
    pct < 0 ? 'text-red-700 bg-red-50' : pct < 15 ? 'text-orange-700 bg-orange-50' : 'text-green-700 bg-green-50';

const toast = (title: string, icon: 'success' | 'info' = 'success') =>
    Swal.fire({ toast: true, position: 'top', icon, title, showConfirmButton: false, timer: 1800, timerProgressBar: true });

export const InventoryManager: React.FC<InventoryManagerProps> = ({ store }) => {
    const { items } = store;
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState<string>('all');
    const [sort, setSort] = useState<Sort>('name');
    const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'table' : 'cards'));
    const [editor, setEditor] = useState<{ item?: BakeryItem } | null>(null);
    const [stock, setStock] = useState<Record<string, number> | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
    const listTopRef = useRef<HTMLDivElement>(null);

    // Any change to what is being looked for starts again from page 1
    useEffect(() => { setPage(1); }, [search, category, sort, pageSize]);

    // Remaining stock per item (refreshed whenever the app re-syncs with the database)
    useEffect(() => {
        let alive = true;
        store.fetchStockLevels().then(s => { if (alive && s) setStock(s); });
        return () => { alive = false; };
    }, [store, store.lastSyncedAt]);

    // ---- derived ----
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        items.forEach(i => { counts[i.category] = (counts[i.category] || 0) + 1; });
        return counts;
    }, [items]);
    const presentCategories = CATEGORIES.filter(c => categoryCounts[c]);
    const avgMargin = items.length ? items.reduce((a, i) => a + marginOf(i).pct, 0) / items.length : 0;

    // Browsing the whole catalog A-Z shows category headings; the list is then ordered by
    // category first so each page keeps a category's items together.
    const grouped = sort === 'name' && category === 'all' && !search.trim();

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = items
            .filter(i => category === 'all' || i.category === category)
            .filter(i => !q || i.name.toLowerCase().includes(q));
        const byName = (a: BakeryItem, b: BakeryItem) => a.name.localeCompare(b.name);
        const by: Record<Sort, (a: BakeryItem, b: BakeryItem) => number> = {
            'name': grouped
                ? (a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) || byName(a, b)
                : byName,
            'price-asc': (a, b) => a.sellingPrice - b.sellingPrice || byName(a, b),
            'price-desc': (a, b) => b.sellingPrice - a.sellingPrice || byName(a, b),
            'margin-desc': (a, b) => marginOf(b).pct - marginOf(a).pct || byName(a, b),
        };
        return [...list].sort(by[sort]);
    }, [items, category, search, sort, grouped]);

    // ---- pagination ----
    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
    const currentPage = Math.min(page, totalPages); // e.g. after deleting the last item on the last page
    const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const showPager = visible.length > PAGE_SIZES[0];
    const goToPage = (p: number) => {
        setPage(Math.min(Math.max(1, p), totalPages));
        listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const groups: { title: string | null; rows: BakeryItem[] }[] = grouped
        ? presentCategories.map(c => ({ title: c, rows: pageRows.filter(i => i.category === c) })).filter(g => g.rows.length > 0)
        : [{ title: null, rows: pageRows }];

    const filtersActive = category !== 'all' || search.trim() !== '';
    const clearFilters = () => { setCategory('all'); setSearch(''); };

    // ---- actions ----
    const handleSave = (values: ItemValues) => {
        const editing = editor?.item;
        if (editing) {
            store.updateItem({ ...editing, ...values });
            toast(`${values.name} updated`);
        } else {
            store.addItem({ id: crypto.randomUUID(), ...values });
            toast(`${values.name} added to the catalog`);
        }
        setEditor(null);
    };

    const handleDelete = async (item: BakeryItem) => {
        setEditor(null);
        let usage;
        try {
            usage = await store.getItemUsage(item.id);
        } catch {
            Swal.fire({ icon: 'error', title: "Couldn't check this item", text: "Its history couldn't be checked, so it was not deleted. Please try again.", confirmButtonColor: '#92400e' });
            return;
        }

        const reasons: string[] = [];
        if (usage.sales) reasons.push(`${usage.sales} sales record${usage.sales === 1 ? '' : 's'}`);
        if (usage.production) reasons.push(`${usage.production} production record${usage.production === 1 ? '' : 's'}`);
        if (usage.discharges) reasons.push(`${usage.discharges} BO / discharge record${usage.discharges === 1 ? '' : 's'}`);
        if (usage.stock > 0) reasons.push(`${usage.stock} still in stock`);

        if (reasons.length > 0) {
            const list = document.createElement('ul');
            list.style.cssText = 'text-align:left;display:inline-block;margin:12px 0 0;padding-left:20px;list-style:disc';
            reasons.forEach(r => { const li = document.createElement('li'); li.textContent = r; list.appendChild(li); });
            const wrap = document.createElement('div');
            const p = document.createElement('div');
            p.textContent = `"${item.name}" can't be deleted because it has:`;
            wrap.append(p, list);
            const note = document.createElement('div');
            note.style.cssText = 'margin-top:14px;font-size:13px;color:#78716c';
            note.textContent = 'Deleting it would also erase that history from your sales reports. You can rename it or change its price instead.';
            wrap.appendChild(note);
            Swal.fire({ icon: 'error', title: 'Cannot delete item', html: wrap, confirmButtonColor: '#92400e' });
            return;
        }

        const result = await Swal.fire({
            title: 'Delete item?',
            text: `"${item.name}" will be removed from the catalog. This can't be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#78716c',
            confirmButtonText: 'Yes, delete',
            cancelButtonText: 'Cancel'
        });
        if (result.isConfirmed) {
            await store.deleteItem(item.id);
            toast(`${item.name} deleted`);
        }
    };

    const handleReset = async () => {
        const result = await Swal.fire({
            title: 'Reset the whole catalog?',
            html: `<div style="text-align:left;font-size:14px;line-height:1.5">
                     This <b>permanently deletes every item and everything tied to them</b> &mdash; sales history, production,
                     BO records and stock &mdash; then restores the ${store.items.length > 0 ? 'default' : ''} starting list.
                   </div>`,
            icon: 'warning',
            input: 'text',
            inputPlaceholder: 'Type RESET to confirm',
            showCancelButton: true,
            confirmButtonColor: '#dc2626',
            cancelButtonColor: '#78716c',
            confirmButtonText: 'Reset catalog',
            preConfirm: (value: string) => {
                if (value.trim().toUpperCase() !== 'RESET') {
                    Swal.showValidationMessage('Type RESET to confirm');
                    return false;
                }
                return true;
            }
        });
        if (result.isConfirmed) {
            await store.resetCatalog();
            toast('Catalog restored to defaults');
        }
    };

    return (
        <div className="space-y-4 sm:space-y-5 pb-24 sm:pb-0">
            {/* Title + primary action */}
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-sm text-stone-500">
                    <i className="fas fa-hand-pointer mr-2 text-amber-700"></i>Tap an item to edit its name, category or prices
                </p>
                <button
                    onClick={() => setEditor({})}
                    className="hidden sm:flex h-11 px-5 rounded-xl bg-amber-800 hover:bg-amber-700 text-white font-bold items-center gap-2 shadow-sm active:scale-95 transition flex-shrink-0"
                >
                    <i className="fas fa-plus"></i>Add item
                </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
                <Stat label="Items" value={String(items.length)} icon="fa-box" tone="bg-amber-100 text-amber-800" />
                <Stat label="Categories" value={String(presentCategories.length)} icon="fa-tags" tone="bg-purple-100 text-purple-700" />
                <Stat label="Avg. margin" value={`${avgMargin.toFixed(0)}%`} icon="fa-percent" tone="bg-green-100 text-green-700" />
            </div>

            {/* Search, categories, sort, view */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-3 sm:p-4 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i>
                        <input
                            type="text"
                            inputMode="search"
                            placeholder="Search items by name…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full h-12 pl-11 pr-11 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch('')}
                                aria-label="Clear search"
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-stone-400 hover:bg-stone-100 flex items-center justify-center"
                            >
                                <i className="fas fa-xmark"></i>
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={sort}
                            onChange={e => setSort(e.target.value as Sort)}
                            aria-label="Sort items"
                            className="flex-1 sm:flex-none h-12 px-3 bg-white border border-stone-200 rounded-xl text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                        >
                            <option value="name">Name A–Z</option>
                            <option value="price-asc">Price: low to high</option>
                            <option value="price-desc">Price: high to low</option>
                            <option value="margin-desc">Best margin first</option>
                        </select>
                        <div className="flex p-1 bg-stone-100 rounded-xl h-12" role="group" aria-label="View">
                            {([['cards', 'fa-table-cells-large', 'Cards'], ['table', 'fa-list', 'Table']] as const).map(([key, icon, label]) => (
                                <button
                                    key={key}
                                    onClick={() => setView(key)}
                                    aria-pressed={view === key}
                                    title={label}
                                    className={`w-11 rounded-lg flex items-center justify-center transition ${view === key ? 'bg-white text-amber-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                                >
                                    <i className={`fas ${icon}`}></i>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {[['all', 'All', items.length] as const, ...presentCategories.map(c => [c, c, categoryCounts[c]] as const)].map(([key, label, count]) => (
                        <button
                            key={key}
                            onClick={() => setCategory(key)}
                            className={`flex-shrink-0 h-10 px-4 rounded-full text-sm font-bold flex items-center gap-2 transition active:scale-95 ${category === key
                                ? 'bg-amber-800 text-white shadow'
                                : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'}`}
                        >
                            {key !== 'all' && <i className={`fas ${CATEGORY_ICONS[key as BakeryItem['category']]} text-xs opacity-80`}></i>}
                            {label}
                            <span className={`text-xs font-semibold ${category === key ? 'text-amber-200' : 'text-stone-400'}`}>{count}</span>
                        </button>
                    ))}
                </div>

                {filtersActive && (
                    <div className="flex items-center justify-between text-sm text-stone-500">
                        <span>Showing <b className="text-stone-800">{visible.length}</b> of {items.length} items</span>
                        <button onClick={clearFilters} className="font-bold text-amber-700 hover:text-amber-900">Clear filters</button>
                    </div>
                )}
            </div>

            {/* Results */}
            <div ref={listTopRef} className="scroll-mt-4 -mb-2"></div>
            {items.length === 0 ? (
                <EmptyPanel
                    icon="fa-boxes-stacked"
                    title="No items yet"
                    text="Add your first product to start selling."
                    action={<button onClick={() => setEditor({})} className="h-11 px-5 rounded-xl bg-amber-800 text-white font-bold active:scale-95 transition"><i className="fas fa-plus mr-2"></i>Add item</button>}
                />
            ) : visible.length === 0 ? (
                <EmptyPanel
                    icon="fa-magnifying-glass"
                    title="No items match"
                    text="Try a different name or category."
                    action={<button onClick={clearFilters} className="h-11 px-5 rounded-xl bg-white border border-stone-200 text-stone-700 font-bold active:scale-95 transition">Clear filters</button>}
                />
            ) : view === 'cards' ? (
                <div className="space-y-6">
                    {groups.map(g => (
                        <section key={g.title ?? 'all'}>
                            {g.title && (
                                <h4 className="flex items-center gap-2 mb-3 text-sm font-bold uppercase tracking-wider text-stone-500">
                                    <i className={`fas ${CATEGORY_ICONS[g.title as BakeryItem['category']]} text-amber-700`}></i>
                                    {g.title}
                                    <span className="text-stone-400 font-semibold normal-case tracking-normal">
                                        · {categoryCounts[g.title]} item{categoryCounts[g.title] === 1 ? '' : 's'}
                                        {/* this page picks up a category that started on an earlier page */}
                                        {visible.findIndex(i => i.category === g.title) < visible.indexOf(g.rows[0]) && ' · continued'}
                                    </span>
                                </h4>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                {g.rows.map(item => (
                                    <ItemCard key={item.id} item={item} stock={stock ? (stock[item.id] ?? 0) : null} onEdit={() => setEditor({ item })} onDelete={() => handleDelete(item)} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[44rem] text-left">
                            <thead className="bg-stone-100 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase">
                                <tr>
                                    <th className="px-5 py-3">Item</th>
                                    <th className="px-4 py-3">Category</th>
                                    <th className="px-4 py-3 text-right">Cost</th>
                                    <th className="px-4 py-3 text-right">Price</th>
                                    <th className="px-4 py-3 text-right">Margin</th>
                                    <th className="px-4 py-3 text-right">Stock</th>
                                    <th className="px-4 py-3 w-24"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {pageRows.map(item => {
                                    const m = marginOf(item);
                                    return (
                                        <tr key={item.id} onClick={() => setEditor({ item })} className="hover:bg-amber-50/50 cursor-pointer transition">
                                            <td className="px-5 py-3 font-semibold text-stone-800">{item.name}</td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full uppercase">
                                                    <i className={`fas ${CATEGORY_ICONS[item.category]}`}></i>{item.category}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-stone-500 tabular-nums">{peso(item.costPrice)}</td>
                                            <td className="px-4 py-3 text-right font-bold text-stone-900 tabular-nums">{peso(item.sellingPrice)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${marginTone(m.pct)}`}>{m.pct.toFixed(0)}%</span>
                                            </td>
                                            <td className="px-4 py-3 text-right"><StockBadge qty={stock ? (stock[item.id] ?? 0) : null} unit={item.unit} /></td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={e => { e.stopPropagation(); setEditor({ item }); }} aria-label={`Edit ${item.name}`} title="Edit" className="w-9 h-9 rounded-lg text-stone-400 hover:text-amber-700 hover:bg-amber-100 flex items-center justify-center transition"><i className="fas fa-pen"></i></button>
                                                    <button onClick={e => { e.stopPropagation(); handleDelete(item); }} aria-label={`Delete ${item.name}`} title="Delete" className="w-9 h-9 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition"><i className="fas fa-trash"></i></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {showPager && visible.length > 0 && (
                <Pagination
                    page={currentPage}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    total={visible.length}
                    onPage={goToPage}
                    onPageSize={setPageSize}
                />
            )}

            {/* Rarely needed: kept out of the way */}
            <details className="group rounded-2xl border border-stone-200 bg-white">
                <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between text-sm font-semibold text-stone-500 hover:text-stone-700">
                    <span><i className="fas fa-triangle-exclamation mr-2 text-stone-400"></i>Advanced</span>
                    <i className="fas fa-chevron-down text-xs transition group-open:rotate-180"></i>
                </summary>
                <div className="px-4 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-100 pt-3">
                    <p className="text-sm text-stone-500">Restore the starting list of items. <b className="text-stone-700">This deletes all items and their sales, production and stock history.</b></p>
                    <button onClick={handleReset} className="h-10 px-4 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 active:scale-95 transition flex-shrink-0">Reset catalog…</button>
                </div>
            </details>

            {/* Mobile: always-reachable Add button */}
            <button
                onClick={() => setEditor({})}
                aria-label="Add item"
                className="sm:hidden fixed right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 h-14 pl-5 pr-6 rounded-full bg-amber-800 text-white font-bold shadow-xl flex items-center gap-2 active:scale-95 transition"
            >
                <i className="fas fa-plus"></i>Add item
            </button>

            {editor && (
                <ItemEditor
                    item={editor.item}
                    items={items}
                    onSave={handleSave}
                    onDelete={editor.item ? () => handleDelete(editor.item!) : undefined}
                    onClose={() => setEditor(null)}
                />
            )}
        </div>
    );
};

// ---------- pieces ----------

const Stat: React.FC<{ label: string; value: string; icon: string; tone: string }> = ({ label, value, icon, tone }) => (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3 sm:p-4 flex items-center gap-3 min-w-0">
        <span className={`hidden sm:flex w-10 h-10 rounded-xl items-center justify-center flex-shrink-0 ${tone}`}><i className={`fas ${icon}`}></i></span>
        <div className="min-w-0">
            <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-stone-400 truncate">{label}</p>
            <p className="text-xl sm:text-2xl font-extrabold text-stone-900 tabular-nums">{value}</p>
        </div>
    </div>
);

const StockBadge: React.FC<{ qty: number | null; unit: string }> = ({ qty, unit }) => {
    if (qty === null) return <span className="text-xs text-stone-300">—</span>;
    const cfg = qty <= 0
        ? { icon: 'fa-circle-xmark', color: '#d03b3b', label: 'Out' }
        : qty <= LOW_STOCK
            ? { icon: 'fa-triangle-exclamation', color: '#fab219', label: 'Low' }
            : { icon: 'fa-circle-check', color: '#0ca30c', label: '' };
    return (
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-stone-700 tabular-nums">
            <i className={`fas ${cfg.icon} text-xs`} style={{ color: cfg.color }}></i>
            {qty} <span className="text-xs font-semibold text-stone-400">{unit}</span>
            {cfg.label && <span className="text-[11px] font-bold text-stone-500">· {cfg.label}</span>}
        </span>
    );
};

const ItemCard: React.FC<{ item: BakeryItem; stock: number | null; onEdit: () => void; onDelete: () => void }> = ({ item, stock, onEdit, onDelete }) => {
    const m = marginOf(item);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onEdit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
            aria-label={`Edit ${item.name}`}
            className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 text-left hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 active:scale-[0.99] transition cursor-pointer"
        >
            <div className="flex items-start gap-3">
                <span className="w-11 h-11 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0">
                    <i className={`fas ${CATEGORY_ICONS[item.category] || 'fa-bread-slice'}`}></i>
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900 leading-tight line-clamp-2">{item.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{item.category} · per {item.unit}</p>
                </div>
                <button
                    onClick={e => { e.stopPropagation(); onDelete(); }}
                    aria-label={`Delete ${item.name}`}
                    title="Delete"
                    className="w-10 h-10 -mt-1 -mr-1 rounded-full text-stone-300 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition flex-shrink-0"
                >
                    <i className="fas fa-trash"></i>
                </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-stone-50 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Cost</p>
                    <p className="text-sm font-semibold text-stone-600 tabular-nums">{peso(item.costPrice)}</p>
                </div>
                <div className="rounded-xl bg-amber-50 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700/70">Price</p>
                    <p className="text-sm font-extrabold text-amber-800 tabular-nums">{peso(item.sellingPrice)}</p>
                </div>
                <div className={`rounded-xl py-2 ${marginTone(m.pct)}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Margin</p>
                    <p className="text-sm font-extrabold tabular-nums">{m.pct.toFixed(0)}%</p>
                </div>
            </div>
            <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-400">
                <span>In stock</span>
                <StockBadge qty={stock} unit={item.unit} />
            </div>
        </div>
    );
};

/** 1 … 4 5 6 … 12 style page list */
const pageList = (current: number, total: number): (number | '…')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set<number>([1, total, current - 1, current, current + 1]);
    if (current <= 3) [2, 3, 4].forEach(p => pages.add(p));
    if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(p => pages.add(p));
    const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
    const out: (number | '…')[] = [];
    sorted.forEach((p, i) => {
        if (i > 0 && p - sorted[i - 1] > 1) out.push('…');
        out.push(p);
    });
    return out;
};

const Pagination: React.FC<{
    page: number;
    totalPages: number;
    pageSize: number;
    total: number;
    onPage: (p: number) => void;
    onPageSize: (n: number) => void;
}> = ({ page, totalPages, pageSize, total, onPage, onPageSize }) => {
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const nav = 'h-11 min-w-[2.75rem] px-3 rounded-xl border border-stone-200 bg-white text-stone-600 font-bold flex items-center justify-center gap-2 hover:bg-stone-100 active:scale-95 transition disabled:opacity-35 disabled:pointer-events-none';
    return (
        <nav aria-label="Pagination" className="bg-white rounded-2xl border border-stone-200 shadow-sm p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm text-stone-500">
                <span>Showing <b className="text-stone-800 tabular-nums">{from}–{to}</b> of <b className="text-stone-800 tabular-nums">{total}</b></span>
                <label className="flex items-center gap-2">
                    <span className="hidden sm:inline">Per page</span>
                    <select
                        value={pageSize}
                        onChange={e => onPageSize(Number(e.target.value))}
                        aria-label="Items per page"
                        className="h-9 px-2 bg-white border border-stone-200 rounded-lg text-sm font-semibold text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    >
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </label>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
                <button onClick={() => onPage(page - 1)} disabled={page <= 1} className={nav} aria-label="Previous page">
                    <i className="fas fa-chevron-left text-xs"></i><span className="hidden sm:inline">Prev</span>
                </button>

                <span className="sm:hidden text-sm font-bold text-stone-700 px-2">Page {page} of {totalPages}</span>

                <div className="hidden sm:flex items-center gap-1.5">
                    {pageList(page, totalPages).map((p, i) =>
                        p === '…' ? (
                            <span key={`gap-${i}`} className="w-8 text-center text-stone-400">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onPage(p)}
                                aria-label={`Page ${p}`}
                                aria-current={p === page ? 'page' : undefined}
                                className={`h-11 min-w-[2.75rem] px-3 rounded-xl font-bold tabular-nums transition active:scale-95 ${p === page ? 'bg-amber-800 text-white shadow' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-100'}`}
                            >
                                {p}
                            </button>
                        )
                    )}
                </div>

                <button onClick={() => onPage(page + 1)} disabled={page >= totalPages} className={nav} aria-label="Next page">
                    <span className="hidden sm:inline">Next</span><i className="fas fa-chevron-right text-xs"></i>
                </button>
            </div>
        </nav>
    );
};

const EmptyPanel: React.FC<{ icon: string; title: string; text: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm py-14 px-6 text-center">
        <i className={`fas ${icon} text-4xl text-stone-300 mb-3`}></i>
        <p className="font-bold text-stone-700">{title}</p>
        <p className="text-sm text-stone-400 mt-1">{text}</p>
        {action && <div className="mt-5">{action}</div>}
    </div>
);

// ---------- add / edit form ----------

const ItemEditor: React.FC<{
    item?: BakeryItem;
    items: BakeryItem[];
    onSave: (v: ItemValues) => void;
    onDelete?: () => void;
    onClose: () => void;
}> = ({ item, items, onSave, onDelete, onClose }) => {
    const [name, setName] = useState(item?.name ?? '');
    const [category, setCategory] = useState<BakeryItem['category']>(item?.category ?? 'Bread');
    const [unit, setUnit] = useState(item?.unit ?? 'pcs');
    const [cost, setCost] = useState(item ? String(item.costPrice) : '');
    const [price, setPrice] = useState(item ? String(item.sellingPrice) : '');
    const [submitted, setSubmitted] = useState(false);
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (window.matchMedia?.('(pointer: fine)').matches) nameRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const trimmed = name.trim();
    const costN = parseFloat(cost);
    const priceN = parseFloat(price);
    const errors = {
        name: !trimmed
            ? 'Enter an item name'
            : items.some(i => i.id !== item?.id && i.name.trim().toLowerCase() === trimmed.toLowerCase())
                ? 'An item with this name already exists'
                : '',
        cost: isNaN(costN) || costN < 0 ? 'Enter the cost price' : '',
        price: isNaN(priceN) || priceN < 0 ? 'Enter the selling price' : '',
    };
    const valid = !errors.name && !errors.cost && !errors.price;
    const preview = !errors.cost && !errors.price ? marginOf({ costPrice: costN, sellingPrice: priceN }) : null;

    const money = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        let v = e.target.value.replace(/[^0-9.]/g, '');
        const dot = v.indexOf('.');
        if (dot !== -1) v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '').slice(0, 2);
        setter(v.slice(0, 9));
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        if (!valid) return;
        onSave({ name: trimmed, category, unit: unit.trim() || 'pcs', costPrice: costN, sellingPrice: priceN });
    };

    const field = 'w-full h-12 px-4 text-base bg-stone-50 border rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500';
    const label = 'block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5';
    const err = (msg: string) => submitted && msg ? <p className="text-xs font-semibold text-red-600 mt-1">{msg}</p> : null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={item ? 'Edit item' : 'Add item'}>
            <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
            <form
                onSubmit={submit}
                noValidate
                className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[94vh] flex flex-col"
            >
                <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-3">
                    <h3 className="text-xl font-extrabold text-stone-900">{item ? 'Edit item' : 'Add new item'}</h3>
                    <button type="button" onClick={onClose} aria-label="Close" className="w-10 h-10 -mr-2 rounded-full text-stone-400 hover:bg-stone-100 flex items-center justify-center">
                        <i className="fas fa-xmark text-lg"></i>
                    </button>
                </div>

                <div className="px-5 sm:px-6 pb-4 space-y-4 overflow-y-auto">
                    <div>
                        <label className={label} htmlFor="item-name">Item name</label>
                        <input id="item-name" ref={nameRef} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pandesal" autoComplete="off" className={`${field} ${submitted && errors.name ? 'border-red-400' : 'border-stone-200'}`} />
                        {err(errors.name)}
                    </div>

                    <div>
                        <span className={label}>Category</span>
                        <div className="grid grid-cols-3 gap-2">
                            {CATEGORIES.map(c => (
                                <button
                                    type="button"
                                    key={c}
                                    onClick={() => setCategory(c)}
                                    aria-pressed={category === c}
                                    className={`h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition active:scale-95 ${category === c ? 'bg-amber-800 text-white shadow' : 'bg-stone-50 border border-stone-200 text-stone-600 hover:bg-stone-100'}`}
                                >
                                    <i className={`fas ${CATEGORY_ICONS[c]} text-xs`}></i>{c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={label} htmlFor="item-cost">Cost price (₱)</label>
                            <input id="item-cost" value={cost} onChange={money(setCost)} inputMode="decimal" placeholder="0.00" autoComplete="off" className={`${field} ${submitted && errors.cost ? 'border-red-400' : 'border-stone-200'}`} />
                            {err(errors.cost)}
                        </div>
                        <div>
                            <label className={label} htmlFor="item-price">Selling price (₱)</label>
                            <input id="item-price" value={price} onChange={money(setPrice)} inputMode="decimal" placeholder="0.00" autoComplete="off" className={`${field} ${submitted && errors.price ? 'border-red-400' : 'border-stone-200'}`} />
                            {err(errors.price)}
                        </div>
                    </div>

                    {preview && (
                        <div className={`rounded-xl px-4 py-3 text-sm font-semibold flex items-center justify-between gap-3 ${marginTone(preview.pct)}`}>
                            <span>
                                <i className={`fas ${preview.profit < 0 ? 'fa-circle-exclamation' : 'fa-coins'} mr-2`}></i>
                                {preview.profit < 0 ? `Selling below cost: you lose ${peso(-preview.profit)} each` : `You earn ${peso(preview.profit)} on each sale`}
                            </span>
                            <span className="font-extrabold tabular-nums">{preview.pct.toFixed(0)}%</span>
                        </div>
                    )}

                    <div>
                        <label className={label} htmlFor="item-unit">Sold per</label>
                        <input id="item-unit" list="unit-options" value={unit} onChange={e => setUnit(e.target.value)} autoComplete="off" className={`${field} border-stone-200`} />
                        <datalist id="unit-options">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
                    </div>
                </div>

                <div className="px-5 sm:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-stone-100 flex items-center gap-3">
                    {onDelete && (
                        <button type="button" onClick={onDelete} className="h-12 px-4 rounded-xl text-red-600 font-bold hover:bg-red-50 active:scale-95 transition">
                            <i className="fas fa-trash mr-2"></i>Delete
                        </button>
                    )}
                    <div className="flex-1"></div>
                    <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl text-stone-500 font-bold hover:bg-stone-100 active:scale-95 transition">Cancel</button>
                    <button type="submit" className="h-12 px-6 rounded-xl bg-amber-800 hover:bg-amber-700 text-white font-extrabold shadow active:scale-95 transition">
                        {item ? 'Save changes' : 'Add item'}
                    </button>
                </div>
            </form>
        </div>
    );
};
