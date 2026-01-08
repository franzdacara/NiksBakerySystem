import React, { useState, useEffect } from 'react';
import { BakeryStore } from '../models/BakeryStore';
import { DischargeReason, ShiftStatus } from '../../types';

interface DischargePanelProps {
    store: BakeryStore;
}

export const DischargePanel: React.FC<DischargePanelProps> = ({ store }) => {
    const { items, shift } = store;
    const [selectedItemId, setSelectedItemId] = useState('');
    const [quantity, setQuantity] = useState<number>(1);
    const [reason, setReason] = useState<DischargeReason>(DischargeReason.EXPIRED);
    const [notes, setNotes] = useState('');
    const [search, setSearch] = useState('');
    const [, setTick] = useState(0);

    useEffect(() => {
        return store.subscribe(() => setTick(t => t + 1));
    }, [store]);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase())
    );

    const handleAddDischarge = () => {
        if (!selectedItemId || quantity <= 0) return;
        store.addDischarge(selectedItemId, quantity, reason, notes || undefined);
        // Reset form
        setSelectedItemId('');
        setQuantity(1);
        setNotes('');
    };

    const getItemName = (itemId: string) => {
        const item = items.find(i => i.id === itemId);
        return item ? item.name : 'Unknown';
    };

    const totalBO = store.totalDischarges;

    const isShiftClosed = shift.status === ShiftStatus.CLOSED;

    return (
        <div className="animate-in slide-in-from-bottom-4 duration-500 space-y-6">
            {/* Add Discharge Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
                <h3 className="text-lg font-bold text-stone-800 flex items-center mb-6">
                    <i className="fas fa-trash-alt mr-3 text-red-600"></i>
                    Add BO / Discharge Entry
                </h3>

                {isShiftClosed ? (
                    <div className="text-center py-8 text-stone-400">
                        <i className="fas fa-lock text-4xl mb-3 opacity-50"></i>
                        <p>Shift is closed. Start a new shift to add discharges.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Item Search/Select */}
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                                Select Item
                            </label>
                            <div className="relative">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"></i>
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                                />
                            </div>
                            <select
                                value={selectedItemId}
                                onChange={(e) => setSelectedItemId(e.target.value)}
                                className="w-full mt-2 px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white"
                            >
                                <option value="">-- Select an item --</option>
                                {filteredItems.map(item => (
                                    <option key={item.id} value={item.id}>
                                        {item.name} ({item.category})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Quantity */}
                        <div>
                            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                                Quantity
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                            />
                        </div>

                        {/* Reason */}
                        <div>
                            <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                                Reason
                            </label>
                            <select
                                value={reason}
                                onChange={(e) => setReason(e.target.value as DischargeReason)}
                                className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 bg-white"
                            >
                                <option value={DischargeReason.EXPIRED}>Expired</option>
                                <option value={DischargeReason.DAMAGED}>Damaged</option>
                                <option value={DischargeReason.QUALITY_ISSUE}>Quality Issue</option>
                                <option value={DischargeReason.OTHER}>Other</option>
                            </select>
                        </div>

                        {/* Add Button */}
                        <div className="flex items-end">
                            <button
                                onClick={handleAddDischarge}
                                disabled={!selectedItemId || quantity <= 0}
                                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-semibold transition-all shadow-md active:scale-95"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                Add BO
                            </button>
                        </div>
                    </div>
                )}

                {/* Notes (optional) */}
                {!isShiftClosed && (
                    <div className="mt-4">
                        <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                            Notes (Optional)
                        </label>
                        <input
                            type="text"
                            placeholder="Add notes about this discharge..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-2.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500"
                        />
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center space-x-4">
                    <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-red-100 text-red-700">
                        <i className="fas fa-box-open text-lg"></i>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Total BO Items</p>
                        <p className="text-xl font-bold text-stone-800">{totalBO.count} units</p>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center space-x-4">
                    <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                        <i className="fas fa-peso-sign text-lg"></i>
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">BO Cost (Loss)</p>
                        <p className="text-xl font-bold text-red-600">₱{totalBO.cost.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Discharge List */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
                <div className="p-6 border-b border-stone-200 bg-stone-50">
                    <h3 className="text-lg font-bold text-stone-800 flex items-center">
                        <i className="fas fa-list mr-3 text-amber-700"></i>
                        Current Shift BO Entries
                    </h3>
                    <p className="text-xs text-stone-500 mt-1">
                        {shift.discharges.length} discharge{shift.discharges.length !== 1 ? 's' : ''} recorded
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-stone-100 text-stone-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Item</th>
                                <th className="px-4 py-4 text-center">Qty</th>
                                <th className="px-4 py-4">Reason</th>
                                <th className="px-4 py-4">Notes</th>
                                <th className="px-4 py-4">Time</th>
                                <th className="px-6 py-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                            {shift.discharges.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-stone-400">
                                        <i className="fas fa-inbox text-3xl mb-3 opacity-30"></i>
                                        <p>No discharges recorded for this shift.</p>
                                    </td>
                                </tr>
                            ) : (
                                shift.discharges.map(discharge => (
                                    <tr key={discharge.id} className="hover:bg-stone-50 transition">
                                        <td className="px-6 py-3 font-medium text-stone-800">
                                            {getItemName(discharge.itemId)}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-red-600">
                                            {discharge.quantity}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase ${discharge.reason === DischargeReason.EXPIRED ? 'bg-yellow-100 text-yellow-800' :
                                                discharge.reason === DischargeReason.DAMAGED ? 'bg-red-100 text-red-800' :
                                                    discharge.reason === DischargeReason.QUALITY_ISSUE ? 'bg-orange-100 text-orange-800' :
                                                        'bg-stone-100 text-stone-800'
                                                }`}>
                                                {discharge.reason}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-stone-500 text-xs">
                                            {discharge.notes || '-'}
                                        </td>
                                        <td className="px-4 py-3 text-stone-500 text-xs">
                                            {new Date(discharge.timestamp).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            <button
                                                onClick={() => store.removeDischarge(discharge.id)}
                                                disabled={isShiftClosed}
                                                className="text-red-500 hover:text-red-700 disabled:text-stone-300 disabled:cursor-not-allowed transition"
                                                title="Remove discharge"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
