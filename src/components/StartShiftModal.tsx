import React, { useState } from 'react';
import { BakeryStore } from '../models/BakeryStore';
import { Shift, ShiftStatus } from '../../types';

interface StartShiftModalProps {
    store: BakeryStore;
    onClose: () => void;
}

export const StartShiftModal: React.FC<StartShiftModalProps> = ({ store, onClose }) => {
    const [inventory, setInventory] = useState<Record<string, number>>(() => {
        // Try to pre-fill from previous shift
        const savedShift = localStorage.getItem('current_shift');
        const prevShift: Shift | null = savedShift ? JSON.parse(savedShift) : null;
        if (prevShift && prevShift.status === ShiftStatus.CLOSED && prevShift.inventoryEnd) {
            return { ...prevShift.inventoryEnd };
        }
        return {};
    });

    const handleStart = () => {
        store.startShift(inventory);
        onClose();
    };

    const handleChange = (itemId: string, val: string) => {
        const num = parseInt(val) || 0;
        setInventory(prev => ({
            ...prev,
            [itemId]: num
        }));
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50">
                    <div>
                        <h2 className="text-xl font-bold text-stone-800">Start New Shift</h2>
                        <p className="text-sm text-stone-500">Verify beginning inventory counts</p>
                    </div>
                    <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <table className="w-full text-left">
                        <thead className="text-xs font-bold text-stone-500 uppercase bg-stone-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 rounded-l-lg">Item Name</th>
                                <th className="px-4 py-3">Category</th>
                                <th className="px-4 py-3 text-center rounded-r-lg">Beginning Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {store.items.map(item => (
                                <tr key={item.id} className="hover:bg-amber-50/50 transition">
                                    <td className="px-4 py-3 font-medium text-stone-800">{item.name}</td>
                                    <td className="px-4 py-3 text-xs text-stone-500 uppercase">{item.category}</td>
                                    <td className="px-4 py-3 text-center">
                                        <input
                                            type="number"
                                            min="0"
                                            value={inventory[item.id] !== undefined ? inventory[item.id] : ''}
                                            placeholder="0"
                                            onChange={(e) => handleChange(item.id, e.target.value)}
                                            className="w-24 px-3 py-2 bg-stone-50 border border-stone-200 rounded-lg text-center font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="p-6 border-t border-stone-100 bg-stone-50 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl font-semibold text-stone-500 hover:bg-stone-200 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStart}
                        className="px-8 py-2.5 rounded-xl font-bold bg-stone-900 text-white hover:bg-stone-800 shadow-lg hover:shadow-xl transition transform active:scale-95"
                    >
                        Confirm & Start Shift
                    </button>
                </div>
            </div>
        </div>
    );
};
