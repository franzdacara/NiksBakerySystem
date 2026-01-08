import React, { useState } from 'react';
import { BakeryStore } from '../models/BakeryStore';
import { ShiftStatus } from '../../types';

interface ProductionPanelProps {
    store: BakeryStore;
}

export const ProductionPanel: React.FC<ProductionPanelProps> = ({ store }) => {
    const { shift, items } = store;
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [editingItem, setEditingItem] = useState<{ id: string; name: string } | null>(null);
    const [qtyInput, setQtyInput] = useState('');

    const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

    const filteredItems = items
        .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
        .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    // Calculate production totals per item
    const productionTotals = items.reduce((acc, item) => {
        acc[item.id] = shift.production
            .filter(p => p.itemId === item.id)
            .reduce((sum, p) => sum + p.quantity, 0);
        return acc;
    }, {} as Record<string, number>);

    const handleAddProduction = () => {
        if (!editingItem) return;
        const qty = parseInt(qtyInput);
        if (!isNaN(qty) && qty > 0) {
            store.addProduction(editingItem.id, qty);
        }
        setEditingItem(null);
        setQtyInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleAddProduction();
        } else if (e.key === 'Escape') {
            setEditingItem(null);
        }
    };

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                {/* Header with Search and Filters */}
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-stone-800 flex items-center">
                                <i className="fas fa-mortar-pestle mr-3 text-amber-700"></i>
                                Production Management
                            </h3>
                            <p className="text-xs text-stone-500 mt-1">Click on Add button to record production</p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            {/* Search */}
                            <div className="relative">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i>
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-10 pr-4 py-2 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 w-full sm:w-64"
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
                    </div>
                </div>

                {shift.status === ShiftStatus.CLOSED ? (
                    <div className="p-12 text-center">
                        <div className="bg-amber-50 p-6 rounded-xl inline-block">
                            <i className="fas fa-clock text-amber-600 text-3xl mb-3"></i>
                            <p className="text-amber-800 font-medium">Please open a shift to record production.</p>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-stone-100 border-b border-stone-200">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Item Name</th>
                                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Category</th>
                                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Unit</th>
                                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase text-center">Today's Production</th>
                                    <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {filteredItems.map(item => (
                                    <tr key={item.id} className="hover:bg-stone-50 transition">
                                        <td className="px-6 py-4 font-medium text-stone-800">{item.name}</td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full uppercase">
                                                {item.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-stone-500">{item.unit}</td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={`font-bold text-lg ${productionTotals[item.id] > 0 ? 'text-green-600' : 'text-stone-300'}`}>
                                                {productionTotals[item.id] || 0}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => {
                                                    setEditingItem({ id: item.id, name: item.name });
                                                    setQtyInput('');
                                                }}
                                                className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition active:scale-95"
                                            >
                                                <i className="fas fa-plus mr-2"></i>Add
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-stone-400">
                                            <i className="fas fa-search text-3xl mb-3 opacity-30"></i>
                                            <p>No items found matching your search.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Recent Production Summary */}
                {shift.status === ShiftStatus.OPEN && shift.production.length > 0 && (
                    <div className="p-6 bg-stone-50 border-t border-stone-200">
                        <h4 className="font-bold text-stone-700 mb-4 flex items-center">
                            <i className="fas fa-history mr-2 text-stone-400"></i>
                            Recent Production Entries
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {shift.production.slice().reverse().slice(0, 10).map(p => {
                                const item = items.find(i => i.id === p.itemId);
                                return (
                                    <div key={p.id} className="bg-white px-3 py-2 rounded-lg border border-stone-200 text-sm flex items-center gap-2">
                                        <span className="font-medium text-stone-700">{item?.name}</span>
                                        <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">+{p.quantity}</span>
                                        <span className="text-[10px] text-stone-400">
                                            {new Date(p.timestamp).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Add Production Modal */}
            {editingItem && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-stone-800 mb-1">Add Production</h3>
                            <p className="text-stone-500 text-sm mb-6">
                                Enter quantity for <span className="font-bold text-amber-700">{editingItem.name}</span>
                            </p>

                            <input
                                type="number"
                                min="1"
                                autoFocus
                                value={qtyInput}
                                onChange={e => setQtyInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full text-center text-3xl font-bold text-stone-800 border-b-2 border-amber-500 focus:outline-none mb-8 py-2 bg-transparent placeholder-stone-200"
                                placeholder="0"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setEditingItem(null)}
                                    className="px-4 py-2 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddProduction}
                                    className="px-4 py-2 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-lg hover:shadow-xl transition active:scale-95"
                                >
                                    Add Production
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
