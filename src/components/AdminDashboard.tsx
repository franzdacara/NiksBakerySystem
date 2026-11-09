import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BakeryStore, SaleRecord } from '../models/BakeryStore';
import { isSupabaseConfigured } from '../lib/supabase';
import { peso, pesoShort, manilaDay, CATEGORY_ICONS, LOW_STOCK } from '../lib/format';

interface AdminDashboardProps {
    store: BakeryStore;
}

type Range = 'today' | '7d' | '30d' | 'all';
const RANGES: { key: Range; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
];

const DAY_MS = 86_400_000;
const REFRESH_MS = 30_000;

// Chart ink (kept recessive so the data is what stands out)
const INK = { series: '#b45309', grid: '#e1e0d9', axis: '#898781', text: '#52514e' };
// Status colors are always paired with an icon + label, never color alone
const STATUS = { good: '#0ca30c', warning: '#fab219', critical: '#d03b3b' };

const manilaDayStart = (ms: number) => new Date(`${manilaDay(ms)}T00:00:00+08:00`).getTime();
const manilaHour = (ms: number) =>
    Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(ms));
const dayLabel = (ms: number) =>
    new Date(ms).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

const sinceFor = (range: Range): number | undefined => {
    const today = manilaDayStart(Date.now());
    if (range === 'today') return today;
    if (range === '7d') return today - 6 * DAY_MS;
    if (range === '30d') return today - 29 * DAY_MS;
    return undefined;
};

interface TrendPoint { label: string; revenue: number; units: number }

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ store }) => {
    const { items } = store;

    const [range, setRange] = useState<Range>('7d');
    const [sales, setSales] = useState<SaleRecord[]>([]);
    const [stock, setStock] = useState<Record<string, number> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [updatedAt, setUpdatedAt] = useState<number | null>(null);
    const [trendView, setTrendView] = useState<'chart' | 'table'>('chart');
    const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all');
    const [stockSearch, setStockSearch] = useState('');

    const load = useCallback(async (showSpinner: boolean) => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            setError('Connect Supabase (see .env) to load sales history and stock levels.');
            return;
        }
        if (showSpinner) setLoading(true);
        try {
            const [salesRows, stockRows] = await Promise.all([
                store.fetchSalesHistory(sinceFor(range)),
                store.fetchStockLevels(),
            ]);
            setSales(salesRows);
            setStock(stockRows);
            setError(null);
            setUpdatedAt(Date.now());
        } catch (e) {
            setError('Could not load data. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, [store, range]);

    useEffect(() => {
        load(true);
        const timer = setInterval(() => load(false), REFRESH_MS);
        return () => clearInterval(timer);
    }, [load]);

    // ---------- derived data ----------
    const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);

    const lines = useMemo(() => sales.flatMap(s => {
        const item = itemMap.get(s.itemId);
        if (!item) return [];
        const price = s.unitPrice ?? item.sellingPrice;
        return [{ ...s, item, revenue: s.quantity * price, cost: s.quantity * item.costPrice }];
    }), [sales, itemMap]);

    const totals = useMemo(() => {
        const revenue = lines.reduce((a, l) => a + l.revenue, 0);
        const cost = lines.reduce((a, l) => a + l.cost, 0);
        const units = lines.reduce((a, l) => a + l.quantity, 0);
        return { revenue, profit: revenue - cost, units };
    }, [lines]);

    const trend: TrendPoint[] = useMemo(() => {
        if (range === 'today') {
            const buckets: TrendPoint[] = Array.from({ length: 24 }, (_, h) => ({ label: hourLabel(h), revenue: 0, units: 0 }));
            lines.forEach(l => {
                const b = buckets[manilaHour(l.timestamp)];
                b.revenue += l.revenue; b.units += l.quantity;
            });
            // Trim empty hours at both ends so the chart isn't mostly blank
            const used = buckets.map((b, i) => (b.units > 0 ? i : -1)).filter(i => i >= 0);
            const first = Math.min(used[0] ?? 6, 6);
            const last = Math.max(used[used.length - 1] ?? 18, Math.min(manilaHour(Date.now()), 23), 18);
            return buckets.slice(first, last + 1);
        }

        const todayStart = manilaDayStart(Date.now());
        let start = sinceFor(range);
        if (start === undefined) {
            const earliest = lines.length ? Math.min(...lines.map(l => l.timestamp)) : Date.now();
            start = manilaDayStart(earliest);
        }
        const dayCount = Math.min(366, Math.round((todayStart - start) / DAY_MS) + 1);
        const firstDay = todayStart - (dayCount - 1) * DAY_MS;
        const byDay = new Map<string, TrendPoint>();
        for (let i = 0; i < dayCount; i++) {
            const ms = firstDay + i * DAY_MS;
            byDay.set(manilaDay(ms), { label: dayLabel(ms), revenue: 0, units: 0 });
        }
        lines.forEach(l => {
            const b = byDay.get(manilaDay(l.timestamp));
            if (b) { b.revenue += l.revenue; b.units += l.quantity; }
        });
        return Array.from(byDay.values());
    }, [lines, range]);

    const topItems = useMemo(() => {
        const map = new Map<string, { name: string; revenue: number; units: number }>();
        lines.forEach(l => {
            const row = map.get(l.item.id) ?? { name: l.item.name, revenue: 0, units: 0 };
            row.revenue += l.revenue; row.units += l.quantity;
            map.set(l.item.id, row);
        });
        return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    }, [lines]);

    const byCategory = useMemo(() => {
        const map = new Map<string, number>();
        lines.forEach(l => map.set(l.item.category, (map.get(l.item.category) ?? 0) + l.revenue));
        return Array.from(map.entries()).map(([category, revenue]) => ({ category, revenue })).sort((a, b) => b.revenue - a.revenue);
    }, [lines]);

    const stockRows = useMemo(() => items.map(item => {
        const qty = stock ? (stock[item.id] ?? 0) : 0;
        const status: 'out' | 'low' | 'ok' = qty <= 0 ? 'out' : qty <= LOW_STOCK ? 'low' : 'ok';
        return { item, qty, status };
    }).sort((a, b) => a.qty - b.qty || a.item.name.localeCompare(b.item.name)), [items, stock]);

    const outCount = stockRows.filter(r => r.status === 'out').length;
    const lowCount = stockRows.filter(r => r.status === 'low').length;
    const maxStock = Math.max(1, ...stockRows.map(r => r.qty));
    const totalUnitsInStock = stockRows.reduce((a, r) => a + r.qty, 0);
    const stockValue = stockRows.reduce((a, r) => a + r.qty * r.item.sellingPrice, 0);

    const visibleStock = stockRows
        .filter(r => stockFilter === 'all' || r.status === stockFilter)
        .filter(r => !stockSearch.trim() || r.item.name.toLowerCase().includes(stockSearch.trim().toLowerCase()));

    const recent = lines.slice(0, 12);
    const rangeLabel = RANGES.find(r => r.key === range)!.label;

    return (
        <div className="space-y-5 sm:space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div role="tablist" aria-label="Date range" className="flex gap-1 p-1 bg-stone-200/60 rounded-xl self-start overflow-x-auto max-w-full">
                    {RANGES.map(r => (
                        <button
                            key={r.key}
                            role="tab"
                            aria-selected={range === r.key}
                            onClick={() => setRange(r.key)}
                            className={`h-10 px-4 rounded-lg text-sm font-bold whitespace-nowrap transition ${range === r.key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-400">
                    {updatedAt && <span>Updated {new Date(updatedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' })}</span>}
                    <button
                        onClick={() => load(true)}
                        disabled={loading}
                        className="h-10 px-4 rounded-xl bg-white border border-stone-200 text-stone-600 font-bold hover:bg-stone-50 active:scale-95 transition disabled:opacity-50"
                    >
                        <i className={`fas fa-rotate mr-2 ${loading ? 'fa-spin' : ''}`}></i>Refresh
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm flex items-start gap-3">
                    <i className="fas fa-circle-exclamation mt-0.5"></i><span>{error}</span>
                </div>
            )}

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <Kpi icon="fa-peso-sign" tone="bg-amber-100 text-amber-800" label={`Revenue · ${rangeLabel}`} value={peso(totals.revenue)} loading={loading} hero />
                <Kpi icon="fa-chart-line" tone="bg-green-100 text-green-700" label="Est. profit" value={peso(totals.profit)} sub="Revenue − cost price" loading={loading} />
                <Kpi icon="fa-bag-shopping" tone="bg-purple-100 text-purple-700" label="Units sold" value={totals.units.toLocaleString()} loading={loading} />
                <Kpi
                    icon="fa-triangle-exclamation"
                    tone="bg-red-100 text-red-700"
                    label="Stock alerts"
                    value={`${outCount + lowCount}`}
                    sub={`${outCount} out · ${lowCount} low`}
                    loading={loading}
                />
            </div>

            {/* Sales trend */}
            <Card
                title={range === 'today' ? 'Sales by hour' : 'Sales over time'}
                subtitle="Revenue per period"
                action={
                    <div className="flex gap-1 p-1 bg-stone-100 rounded-lg" role="tablist" aria-label="Chart or table">
                        {(['chart', 'table'] as const).map(v => (
                            <button
                                key={v}
                                role="tab"
                                aria-selected={trendView === v}
                                onClick={() => setTrendView(v)}
                                className={`h-8 px-3 rounded-md text-xs font-bold capitalize transition ${trendView === v ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                }
            >
                {trendView === 'chart' ? (
                    <div className="h-64 sm:h-80 -ml-2" role="img" aria-label={`Revenue chart, ${peso(totals.revenue)} total for ${rangeLabel}`}>
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
                            <AreaChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={INK.series} stopOpacity={0.22} />
                                        <stop offset="100%" stopColor={INK.series} stopOpacity={0.02} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid stroke={INK.grid} strokeWidth={1} vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: INK.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} minTickGap={18} tickMargin={8} />
                                <YAxis tick={{ fill: INK.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={pesoShort} />
                                <Tooltip content={<TrendTooltip />} cursor={{ stroke: INK.axis, strokeWidth: 1, strokeDasharray: '3 3' }} />
                                <Area
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke={INK.series}
                                    strokeWidth={2}
                                    fill="url(#revFill)"
                                    activeDot={{ r: 6, fill: INK.series, stroke: '#fff', strokeWidth: 2 }}
                                    dot={trend.length <= 14 ? { r: 3, fill: INK.series, stroke: '#fff', strokeWidth: 2 } : false}
                                    isAnimationActive={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="max-h-80 overflow-auto rounded-xl border border-stone-100">
                        <table className="w-full text-sm text-left">
                            <thead className="sticky top-0 bg-stone-50 text-[11px] uppercase tracking-wider text-stone-400">
                                <tr><th className="px-4 py-2">{range === 'today' ? 'Hour' : 'Date'}</th><th className="px-4 py-2 text-right">Units</th><th className="px-4 py-2 text-right">Revenue</th></tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100 tabular-nums">
                                {trend.map((p, i) => (
                                    <tr key={i}><td className="px-4 py-2 text-stone-700">{p.label}</td><td className="px-4 py-2 text-right text-stone-500">{p.units}</td><td className="px-4 py-2 text-right font-bold text-stone-800">{peso(p.revenue)}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && totals.units === 0 && !error && (
                    <p className="text-center text-sm text-stone-400 mt-3">No sales recorded for this period yet.</p>
                )}
            </Card>

            {/* Rankings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
                <Card title="Best sellers" subtitle={`Top items by revenue · ${rangeLabel}`}>
                    {topItems.length === 0 ? <Empty text="No sales yet" /> : (
                        <ul className="space-y-3">
                            {topItems.map(t => (
                                <BarRow key={t.name} label={t.name} value={t.revenue} max={topItems[0].revenue} display={peso(t.revenue)} sub={`${t.units} sold`} />
                            ))}
                        </ul>
                    )}
                </Card>
                <Card title="Sales by category" subtitle={`Share of revenue · ${rangeLabel}`}>
                    {byCategory.length === 0 ? <Empty text="No sales yet" /> : (
                        <ul className="space-y-3">
                            {byCategory.map(c => (
                                <BarRow
                                    key={c.category}
                                    icon={CATEGORY_ICONS[c.category as keyof typeof CATEGORY_ICONS]}
                                    label={c.category}
                                    value={c.revenue}
                                    max={byCategory[0].revenue}
                                    display={peso(c.revenue)}
                                    sub={`${totals.revenue > 0 ? Math.round((c.revenue / totals.revenue) * 100) : 0}%`}
                                />
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            {/* Stock remaining */}
            <Card
                title="Stock remaining"
                subtitle={`${totalUnitsInStock.toLocaleString()} units on hand · worth ${peso(stockValue)} at selling price`}
            >
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                        <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-stone-400"></i>
                        <input
                            type="search"
                            placeholder="Search items…"
                            value={stockSearch}
                            onChange={e => setStockSearch(e.target.value)}
                            className="w-full h-11 pl-11 pr-4 bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                        />
                    </div>
                    <div className="flex gap-1 p-1 bg-stone-100 rounded-xl self-start">
                        {([
                            ['all', `All ${stockRows.length}`],
                            ['low', `Low ${lowCount}`],
                            ['out', `Out ${outCount}`],
                        ] as const).map(([key, label]) => (
                            <button
                                key={key}
                                onClick={() => setStockFilter(key)}
                                className={`h-9 px-3 rounded-lg text-sm font-bold whitespace-nowrap transition ${stockFilter === key ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {stock === null && !loading ? (
                    <Empty text="Stock levels unavailable" />
                ) : visibleStock.length === 0 ? (
                    <Empty text="No items match" />
                ) : (
                    <ul className="max-h-[32rem] overflow-y-auto divide-y divide-stone-100 -mx-1 px-1">
                        {visibleStock.map(({ item, qty, status }) => (
                            <li key={item.id} className="py-3 flex items-center gap-3">
                                <span className="hidden sm:flex w-9 h-9 flex-shrink-0 rounded-full bg-stone-100 text-stone-500 items-center justify-center">
                                    <i className={`fas ${CATEGORY_ICONS[item.category] || 'fa-bread-slice'} text-sm`}></i>
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p className="font-bold text-stone-800 truncate">{item.name}</p>
                                        <p className="font-extrabold text-stone-900 tabular-nums whitespace-nowrap">
                                            {qty} <span className="text-xs font-semibold text-stone-400">{item.unit}</span>
                                        </p>
                                    </div>
                                    <div className="mt-1.5 h-2 rounded-full bg-stone-100 overflow-hidden">
                                        <div className="h-full rounded-r-[4px] rounded-l-full" style={{ width: `${Math.max(qty > 0 ? 2 : 0, (qty / maxStock) * 100)}%`, background: INK.series }}></div>
                                    </div>
                                </div>
                                <StatusPill status={status} />
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {/* Recent sales */}
            <Card title="Recent sales" subtitle={`Latest entries · ${rangeLabel}`}>
                {recent.length === 0 ? <Empty text="No sales yet" /> : (
                    <ul className="divide-y divide-stone-100">
                        {recent.map(l => (
                            <li key={l.id} className="py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-bold text-stone-800 truncate">{l.item.name}</p>
                                    <p className="text-xs text-stone-400">
                                        {new Date(l.timestamp).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                        {' · '}{l.quantity} × {peso(l.revenue / l.quantity)}
                                    </p>
                                </div>
                                <p className="font-extrabold text-stone-900 tabular-nums whitespace-nowrap">{peso(l.revenue)}</p>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <p className="text-xs text-stone-400 text-center px-4">
                Revenue uses the price recorded at sale time when available, otherwise the item's current selling price.
            </p>
        </div>
    );
};

// ---------- small presentational pieces ----------

const Card: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, subtitle, action, children }) => (
    <section className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
                <h3 className="text-lg font-bold text-stone-800">{title}</h3>
                {subtitle && <p className="text-xs sm:text-sm text-stone-400">{subtitle}</p>}
            </div>
            {action}
        </div>
        {children}
    </section>
);

const Kpi: React.FC<{ icon: string; tone: string; label: string; value: string; sub?: string; loading?: boolean; hero?: boolean }> = ({ icon, tone, label, value, sub, loading, hero }) => (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 sm:p-5 min-w-0">
        <div className="flex items-center gap-3 mb-2">
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><i className={`fas ${icon} text-sm`}></i></span>
            <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 leading-tight">{label}</p>
        </div>
        {loading
            ? <div className="h-8 w-28 rounded-lg bg-stone-100 animate-pulse"></div>
            : <p className={`font-extrabold text-stone-900 tabular-nums truncate ${hero ? 'text-xl min-[420px]:text-2xl sm:text-3xl' : 'text-xl min-[420px]:text-2xl'}`}>{value}</p>}
        {sub && !loading && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
    </div>
);

const BarRow: React.FC<{ label: string; value: number; max: number; display: string; sub?: string; icon?: string }> = ({ label, value, max, display, sub, icon }) => (
    <li title={`${label}: ${display}${sub ? ` (${sub})` : ''}`}>
        <div className="flex items-baseline justify-between gap-3 mb-1">
            <p className="text-sm font-semibold text-stone-700 truncate">
                {icon && <i className={`fas ${icon} text-stone-400 mr-2 w-4 text-center`}></i>}{label}
            </p>
            <p className="text-sm tabular-nums whitespace-nowrap">
                <span className="font-extrabold text-stone-900">{display}</span>
                {sub && <span className="text-xs text-stone-400 ml-2">{sub}</span>}
            </p>
        </div>
        <div className="h-2 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-r-[4px] rounded-l-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: INK.series }}></div>
        </div>
    </li>
);

const StatusPill: React.FC<{ status: 'out' | 'low' | 'ok' }> = ({ status }) => {
    const cfg = {
        out: { icon: 'fa-circle-xmark', color: STATUS.critical, label: 'Out' },
        low: { icon: 'fa-triangle-exclamation', color: STATUS.warning, label: 'Low' },
        ok: { icon: 'fa-circle-check', color: STATUS.good, label: 'OK' },
    }[status];
    return (
        <span className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-bold text-stone-600 w-14 justify-end">
            <i className={`fas ${cfg.icon}`} style={{ color: cfg.color }}></i>{cfg.label}
        </span>
    );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
    <p className="py-8 text-center text-sm text-stone-400">{text}</p>
);

const TrendTooltip: React.FC<{ active?: boolean; payload?: any[]; label?: string }> = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = payload[0].payload as TrendPoint;
    return (
        <div className="bg-white border border-stone-200 rounded-xl shadow-lg px-3 py-2 text-sm">
            <p className="text-xs font-bold text-stone-400 mb-0.5">{label}</p>
            <p className="font-extrabold text-stone-900">{peso(point.revenue)}</p>
            <p className="text-xs text-stone-500">{point.units} unit{point.units === 1 ? '' : 's'} sold</p>
        </div>
    );
};
