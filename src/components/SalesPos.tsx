import React, { useState, useEffect, useRef } from 'react';
import { BakeryStore } from '../models/BakeryStore';
import { ShiftStatus } from '../../types';

interface SalesPosProps {
    store: BakeryStore;
}

export const SalesPos: React.FC<SalesPosProps> = ({ store }) => {
    const [, forceUpdate] = useState(0);

    // Subscribe to store updates
    useEffect(() => {
        return store.subscribe(() => {
            forceUpdate(n => n + 1);
        });
    }, [store]);

    const { shift, items, items: allItems, totalRevenue } = store;

    // Filter state
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Modal state
    const [selectedItem, setSelectedItem] = useState<{ id: string; name: string } | null>(null);
    const [qtyInput, setQtyInput] = useState('');
    const [mode, setMode] = useState<'ADD' | 'EDIT'>('ADD');
    const inputRef = useRef<HTMLInputElement>(null);

    const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

    const filteredItems = allItems
        .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
        .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    // Focus input when modal opens
    useEffect(() => {
        if (selectedItem && inputRef.current) {
            inputRef.current.focus();
            if (mode === 'EDIT') {
                inputRef.current.select();
            }
        }
    }, [selectedItem, mode]);

    // Grid Click: Add to existing
    const handleItemClick = (item: { id: string; name: string }) => {
        if (shift.status === ShiftStatus.CLOSED) return;
        setSelectedItem(item);
        setMode('ADD');
        setQtyInput('');
    };

    // Summary Click: Edit total directly
    const handleSummaryClick = (item: { id: string; name: string; qty: number }) => {
        if (shift.status === ShiftStatus.CLOSED) return;
        setSelectedItem(item);
        setMode('EDIT');
        setQtyInput(item.qty.toString());
    };

    const handleConfirm = () => {
        if (!selectedItem) return;
        const qty = parseInt(qtyInput);

        if (!isNaN(qty)) {
            if (mode === 'ADD' && qty > 0) {
                store.addSale(selectedItem.id, qty);
            } else if (mode === 'EDIT') {
                store.setSalesQuantity(selectedItem.id, Math.max(0, qty));
            }
        }

        setSelectedItem(null);
        setQtyInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm();
        } else if (e.key === 'Escape') {
            setSelectedItem(null);
        }
    };

    // Calculate aggregated sales for display
    const aggregatedSales = items.map(item => {
        const qty = shift.sales
            .filter(s => s.itemId === item.id)
            .reduce((acc, s) => acc + s.quantity, 0);
        return {
            ...item,
            qty,
            amount: qty * item.sellingPrice
        };
    }).filter(i => i.qty > 0);

    // Calculate available quantity for each item (beginning + production - sold)
    const getAvailableQty = (itemId: string) => {
        const beg = shift.inventoryStart[itemId] || 0;
        const prod = shift.production
            .filter(p => p.itemId === itemId)
            .reduce((sum, p) => sum + p.quantity, 0);
        const sold = shift.sales
            .filter(s => s.itemId === itemId)
            .reduce((sum, s) => sum + s.quantity, 0);
        return beg + prod - sold;
    };

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto h-[calc(100vh-140px)] flex flex-col lg:flex-row gap-6">

            {/* Left Column: Product Grid */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-stone-200 flex flex-col overflow-hidden">
                {/* Header with Search and Filters */}
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-bold text-stone-800">Product Catalog</h3>
                            <span className={`ml-3 px-3 py-1 rounded-full text-xs font-bold uppercase ${shift.status === ShiftStatus.OPEN ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {shift.status}
                            </span>
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
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredItems.map(item => {
                            const availableQty = getAvailableQty(item.id);
                            const isOutOfStock = availableQty <= 0;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleItemClick(item)}
                                    disabled={shift.status === ShiftStatus.CLOSED || isOutOfStock}
                                    className={`flex flex-col items-center justify-center p-4 border rounded-xl transition-all active:scale-95 group aspect-[4/3] ${isOutOfStock
                                        ? 'bg-stone-100 border-stone-200 opacity-50 cursor-not-allowed'
                                        : 'bg-stone-50 border-stone-200 hover:bg-amber-50 hover:border-amber-300 disabled:opacity-50'
                                        }`}
                                >
                                    <span className={`text-sm font-bold text-center mb-1 line-clamp-2 ${isOutOfStock ? 'text-stone-400' : 'text-stone-700 group-hover:text-amber-900'}`}>{item.name}</span>
                                    <span className="text-amber-600 font-bold text-xs bg-amber-100/50 px-2 py-0.5 rounded-md">₱{item.sellingPrice.toFixed(2)}</span>
                                    <span className={`text-[10px] mt-1 font-semibold ${isOutOfStock ? 'text-red-500' : 'text-stone-400'}`}>
                                        {isOutOfStock ? 'Out of Stock' : `Avail: ${availableQty}`}
                                    </span>
                                </button>
                            );
                        })}
                        {filteredItems.length === 0 && (
                            <div className="col-span-full py-12 text-center text-stone-400">
                                <i className="fas fa-search text-3xl mb-3 opacity-30"></i>
                                <p>No items found matching your search.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Right Column: Sales Summary */}
            <div className="w-full lg:w-96 bg-white rounded-2xl shadow-sm border border-stone-200 flex flex-col">
                <div className="p-6 border-b border-stone-100 bg-stone-50">
                    <h3 className="text-lg font-bold text-stone-800">Session Sales</h3>
                    <p className="text-xs text-stone-500">Click item to edit quantity</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {aggregatedSales.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-stone-300">
                            <i className="fas fa-cash-register text-4xl mb-4 opacity-20"></i>
                            <p className="text-sm">No sales yet</p>
                        </div>
                    ) : (
                        aggregatedSales.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleSummaryClick(item)}
                                disabled={shift.status === ShiftStatus.CLOSED}
                                className="w-full flex justify-between items-center bg-stone-50 p-3 rounded-lg border border-stone-100 hover:bg-amber-50 hover:border-amber-200 transition group text-left"
                            >
                                <div>
                                    <p className="font-bold text-stone-800 group-hover:text-amber-900">{item.name}</p>
                                    <p className="text-xs text-stone-500 group-hover:text-amber-700 flex items-center">
                                        <i className="fas fa-pen mr-1 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                        {item.qty} units × ₱{item.sellingPrice.toFixed(2)}
                                    </p>
                                </div>
                                <p className="font-bold text-green-700">₱{item.amount.toFixed(2)}</p>
                            </button>
                        ))
                    )}
                </div>

                <div className="p-6 border-t border-stone-100 bg-stone-50">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-stone-500 font-bold uppercase text-xs tracking-wider">Total Revenue</span>
                        <span className="text-2xl font-bold text-stone-900">₱{aggregatedSales.reduce((acc, item) => acc + item.amount, 0).toFixed(2)}</span>
                    </div>
                </div>
            </div>

            {/* Quantity Modal */}
            {selectedItem && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-stone-800 mb-1">
                                {mode === 'ADD' ? 'Add Sales' : 'Edit Quantity'}
                            </h3>
                            <p className="text-stone-500 text-sm mb-2">
                                {mode === 'ADD' ? 'Add quantity for' : 'Update total for'} <span className="font-bold text-amber-700">{selectedItem.name}</span>
                            </p>
                            <p className="text-xs text-stone-400 mb-6">
                                Available stock: <span className="font-bold text-green-600">{getAvailableQty(selectedItem.id)}</span>
                            </p>

                            <input
                                ref={inputRef}
                                type="number"
                                min="0"
                                max={mode === 'ADD' ? getAvailableQty(selectedItem.id) : getAvailableQty(selectedItem.id) + (aggregatedSales.find(s => s.id === selectedItem.id)?.qty || 0)}
                                value={qtyInput}
                                onChange={e => {
                                    const val = parseInt(e.target.value) || 0;
                                    const maxQty = mode === 'ADD'
                                        ? getAvailableQty(selectedItem.id)
                                        : getAvailableQty(selectedItem.id) + (aggregatedSales.find(s => s.id === selectedItem.id)?.qty || 0);
                                    if (val <= maxQty) {
                                        setQtyInput(e.target.value);
                                    } else {
                                        setQtyInput(maxQty.toString());
                                    }
                                }}
                                onKeyDown={handleKeyDown}
                                className="w-full text-center text-3xl font-bold text-stone-800 border-b-2 border-amber-500 focus:outline-none mb-8 py-2 bg-transparent placeholder-stone-200"
                                placeholder="0"
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="px-4 py-2 rounded-xl font-bold text-stone-500 hover:bg-stone-100 transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="px-4 py-2 rounded-xl font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-lg hover:shadow-xl transition active:scale-95"
                                >
                                    {mode === 'ADD' ? 'Add' : 'Update'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
