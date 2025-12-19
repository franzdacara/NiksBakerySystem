import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { BakeryStore } from '../models/BakeryStore';
import { BakeryItem } from '../../types';

interface InventoryManagerProps {
    store: BakeryStore;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({ store }) => {
    const { items } = store;
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    const categories = ['all', ...Array.from(new Set(items.map(i => i.category)))];

    const filteredItems = items
        .filter(i => categoryFilter === 'all' || i.category === categoryFilter)
        .filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    const handleAddItem = () => {
        const name = prompt("Item name:");
        if (!name) return;
        const cat = prompt("Category (Bread/Pastry/Cake/Beverage):", "Bread") as any;
        const cost = parseFloat(prompt("Cost Price:", "1.00") || "0");
        const sell = parseFloat(prompt("Selling Price:", "3.00") || "0");

        const newItem: BakeryItem = {
            id: Date.now().toString(),
            name,
            category: cat,
            unit: 'pcs',
            costPrice: cost,
            sellingPrice: sell
        };
        store.addItem(newItem);
    };

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                {/* Header with Search and Filters */}
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xl font-bold text-stone-800 flex items-center">
                                <i className="fas fa-boxes mr-3 text-amber-700"></i>
                                Items Library
                            </h3>
                            <p className="text-xs text-stone-500 mt-1">Manage your product catalog</p>
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

                <table className="w-full text-left">
                    <thead className="bg-stone-100 border-b border-stone-200">
                        <tr>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Item Name</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Category</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Cost</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase">Retail</th>
                            <th className="px-6 py-4 text-xs font-bold text-stone-500 uppercase text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {filteredItems.map(item => (
                            <tr key={item.id} className="hover:bg-stone-50 transition">
                                <td className="px-6 py-4 font-medium text-stone-800">{item.name}</td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full uppercase">{item.category}</span>
                                </td>
                                <td className="px-6 py-4 text-stone-600">₱{item.costPrice.toFixed(2)}</td>
                                <td className="px-6 py-4 text-stone-800 font-semibold">₱{item.sellingPrice.toFixed(2)}</td>
                                <td className="px-6 py-4 text-center">
                                    <button className="text-stone-400 hover:text-amber-700 mx-2">
                                        <i className="fas fa-edit"></i>
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
                <div className="p-6 bg-stone-50 border-t border-stone-200 text-center">
                    <button
                        onClick={handleAddItem}
                        className="text-amber-800 font-bold flex items-center justify-center mx-auto hover:underline"
                    >
                        <i className="fas fa-plus-circle mr-2"></i> Add New Catalog Item
                    </button>
                    <button
                        onClick={async () => {
                            const result = await Swal.fire({
                                title: 'Reset Catalog?',
                                text: 'This will delete all custom items and restore defaults.',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonColor: '#dc2626',
                                cancelButtonColor: '#78716c',
                                confirmButtonText: 'Yes, Reset',
                                cancelButtonText: 'Cancel'
                            });
                            if (result.isConfirmed) {
                                store.resetCatalog();
                                Swal.fire({
                                    icon: 'success',
                                    title: 'Catalog Reset',
                                    text: 'Catalog has been restored to defaults',
                                    confirmButtonColor: '#92400e'
                                });
                            }
                        }}
                        className="text-stone-400 text-xs mt-4 hover:text-red-500 transition"
                    >
                        Reset Catalog to Defaults
                    </button>
                </div>
            </div>
        </div>
    );
};
