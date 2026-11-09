import React from 'react';
import { BakeryStore } from '../models/BakeryStore';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface DashboardProps {
    store: BakeryStore;
}

const StatCard: React.FC<{ icon: string; label: string; value: string; color: string; className?: string }> = ({ icon, label, value, color, className = '' }) => (
    <div className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center space-x-3 sm:space-x-4 ${className}`}>
        <div className={`w-11 h-11 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center rounded-xl ${color}`}>
            <i className={`fas ${icon} text-lg`}></i>
        </div>
        <div className="min-w-0">
            <p className="text-[11px] sm:text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</p>
            <p className="text-lg sm:text-xl font-bold text-stone-800 truncate">{value}</p>
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ store }) => {
    const { totalRevenue, totalCost, salesData, shift, totalDischarges } = store;

    return (
        <div className="space-y-5 sm:space-y-8 animate-in fade-in duration-500">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-6">
                <StatCard icon="fa-peso-sign" label="Revenue" value={`₱${totalRevenue.toFixed(2)}`} color="bg-green-100 text-green-700" />
                <StatCard icon="fa-wheat-awn" label="Production Cost" value={`₱${totalCost.toFixed(2)}`} color="bg-orange-100 text-orange-700" />
                <StatCard icon="fa-chart-pie" label="Profit (Est.)" value={`₱${(totalRevenue - totalCost).toFixed(2)}`} color="bg-blue-100 text-blue-700" />
                <StatCard icon="fa-box" label="Total Sold" value={`${shift.sales.reduce((a, b) => a + b.quantity, 0)} units`} color="bg-purple-100 text-purple-700" />
                <StatCard icon="fa-trash-alt" label="BO / Wastage" value={`${totalDischarges.count} units`} color="bg-red-100 text-red-700" className="min-[420px]:col-span-2 lg:col-span-1" />
            </div>

            <div className="grid grid-cols-1 gap-8">
                {/* Sales vs Production Chart */}
                <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-stone-200">
                    <h3 className="text-lg font-bold mb-4 sm:mb-6 text-stone-700">Production vs Sales</h3>
                    <div className="h-80 -ml-3 sm:ml-0">
                        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 320 }}>
                            <BarChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" angle={-35} textAnchor="end" height={80} interval={0} tick={{ fontSize: 11 }} />
                                <YAxis width={40} allowDecimals={false} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="produced" fill="#92400e" radius={[4, 4, 0, 0]} name="Produced" />
                                <Bar dataKey="sold" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Sold" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
