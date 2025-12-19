import React, { useEffect, useState } from 'react';
import { BakeryStore } from '../models/BakeryStore';
import { ShiftStatus } from '../../types';

interface InventorySheetProps {
    store: BakeryStore;
}

export const InventorySheet: React.FC<InventorySheetProps> = ({ store }) => {
    const { shift, items } = store;
    const [data, setData] = useState(store.inventorySheetData);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

    useEffect(() => {
        // Subscribe to store updates to refresh the sheet
        return store.subscribe(() => {
            setData(store.inventorySheetData);
        });
    }, [store]);

    const filteredData = data
        .filter(row => categoryFilter === 'all' || row.item.category === categoryFilter)
        .filter(row => row.item.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                {/* Header with Search and Filters */}
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-stone-800 flex items-center">
                                <i className="fas fa-clipboard-list mr-3 text-amber-700"></i>
                                Daily Inventory Sheet
                            </h3>
                            <p className="text-xs text-stone-500 mt-1">Sold = (Beginning + Production) - Ending</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                {/* Search */}
                                <div className="relative">
                                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i>
                                    <input
                                        type="text"
                                        placeholder="Search items..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 w-full sm:w-48"
                                    />
                                </div>
                                {/* Category Filter */}
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="px-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 bg-white"
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>
                                            {cat === 'all' ? 'All Categories' : cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total Sales</p>
                                <p className="text-xl font-bold text-green-700">₱{store.totalRevenue.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-stone-100 text-stone-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Item Name</th>
                                <th className="px-4 py-4">Category</th>
                                <th className="px-4 py-4 text-center bg-blue-50/50">Beg</th>
                                <th className="px-4 py-4 text-center bg-amber-50/50">Prod</th>
                                <th className="px-4 py-4 text-center font-extrabold bg-stone-200/50">Total</th>
                                <th className="px-4 py-4 text-center bg-red-50/50 w-32">Ending</th>
                                <th className="px-4 py-4 text-center bg-green-50/50">Sold</th>
                                <th className="px-4 py-4 text-right">Price</th>
                                <th className="px-6 py-4 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {filteredData.map((row) => (
                                <tr key={row.item.id} className="hover:bg-stone-50 transition">
                                    <td className="px-6 py-3 font-medium text-stone-800">{row.item.name}</td>

                                    {/* Category */}
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full uppercase">
                                            {row.item.category}
                                        </span>
                                    </td>

                                    {/* Beginning */}
                                    <td className="px-4 py-3 text-center text-stone-600 bg-blue-50/30">
                                        {row.beg}
                                    </td>

                                    {/* Production */}
                                    <td className="px-4 py-3 text-center text-stone-600 bg-amber-50/30">
                                        {row.prod}
                                    </td>

                                    {/* Total (Beg + Prod) */}
                                    <td className="px-4 py-3 text-center font-bold text-stone-800 bg-stone-200/30">
                                        {row.total}
                                    </td>

                                    {/* Ending (Editable) */}
                                    <td className="px-4 py-3 text-center bg-red-50/30">
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={shift.status === ShiftStatus.CLOSED}
                                            value={row.end !== undefined ? row.end : ''}
                                            placeholder="-"
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const n = parseInt(val);
                                                if (!isNaN(n)) {
                                                    store.setEndingInventory(row.item.id, n);
                                                }
                                            }}
                                            className={`w-20 text-center border-b-2 bg-transparent focus:outline-none focus:border-red-500 transition ${row.end === undefined ? 'border-dashed border-stone-300' : 'border-stone-400 font-bold'}`}
                                        />
                                    </td>

                                    {/* Sold */}
                                    <td className="px-4 py-3 text-center font-bold text-green-700 bg-green-50/30">
                                        {row.sold}
                                    </td>

                                    {/* Price */}
                                    <td className="px-4 py-3 text-right text-stone-500">
                                        ₱{row.item.sellingPrice.toFixed(2)}
                                    </td>

                                    {/* Amount */}
                                    <td className="px-6 py-3 text-right font-bold text-stone-800">
                                        ₱{row.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            {filteredData.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-stone-400">
                                        <i className="fas fa-search text-3xl mb-3 opacity-30"></i>
                                        <p>No items found matching your search.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-stone-50 font-bold border-t border-stone-200">
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-right text-stone-500 uppercase text-xs tracking-widest">Grand Total</td>
                                <td className="px-4 py-4 text-center text-green-700">
                                    {data.reduce((acc, r) => acc + r.sold, 0)}
                                </td>
                                <td></td>
                                <td className="px-6 py-4 text-right text-lg text-stone-900">
                                    ₱{store.totalRevenue.toFixed(2)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
};
