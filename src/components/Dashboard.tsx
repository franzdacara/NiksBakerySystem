import React from 'react';
import { BakeryStore } from '../models/BakeryStore';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface DashboardProps {
    store: BakeryStore;
}

const StatCard: React.FC<{ icon: string; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex items-center space-x-4">
        <div className={`w-12 h-12 flex items-center justify-center rounded-xl ${color}`}>
            <i className={`fas ${icon} text-lg`}></i>
        </div>
        <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold text-stone-800">{value}</p>
        </div>
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ store }) => {
    const { totalRevenue, totalCost, salesData, shift } = store;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard icon="fa-dollar-sign" label="Revenue" value={`₱${totalRevenue.toFixed(2)}`} color="bg-green-100 text-green-700" />
                <StatCard icon="fa-wheat-awn" label="Production Cost" value={`₱${totalCost.toFixed(2)}`} color="bg-orange-100 text-orange-700" />
                <StatCard icon="fa-chart-pie" label="Profit (Est.)" value={`₱${(totalRevenue - totalCost).toFixed(2)}`} color="bg-blue-100 text-blue-700" />
                <StatCard icon="fa-box" label="Total Sold" value={`${shift.sales.reduce((a, b) => a + b.quantity, 0)} units`} color="bg-purple-100 text-purple-700" />
            </div>

            <div className="grid grid-cols-1 gap-8">
                {/* Sales vs Production Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
                    <h3 className="text-lg font-bold mb-6 text-stone-700">Production vs Sales</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" />
                                <YAxis />
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
