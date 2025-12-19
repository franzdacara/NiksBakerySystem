import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { BakeryStore } from '../models/BakeryStore';

interface LoginProps {
    store: BakeryStore;
}

export const Login: React.FC<LoginProps> = ({ store }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!store.login(username, password)) {
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: 'Invalid username or password',
                confirmButtonColor: '#92400e'
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#fdfaf5] p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-amber-100 rounded-full blur-3xl opacity-50"></div>
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-stone-200 rounded-full blur-3xl opacity-50"></div>

            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-stone-100 p-10 relative z-10">
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-amber-800 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <i className="fas fa-bread-slice text-3xl text-amber-200"></i>
                    </div>
                    <h1 className="text-3xl font-serif italic text-stone-800">NiksBakerySystem</h1>
                    <p className="text-stone-400 mt-2">Manage your artisan creations with ease.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-2">Username</label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                            placeholder="Enter username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-2">Password</label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                            placeholder="Enter password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98]"
                    >
                        Sign In
                    </button>
                </form>

                <div className="mt-10 pt-6 border-t border-stone-100 text-center">
                    <p className="text-xs text-stone-400 uppercase tracking-widest font-bold">Credits</p>
                    <p className="text-sm text-stone-500 mt-1">NiksBakerySystem &copy; 2024</p>
                    <p className="text-[10px] text-stone-300 italic">Built for modern artisan bakeries</p>
                </div>
            </div>
        </div>
    );
};
