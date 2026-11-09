import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { BakeryStore } from '../models/BakeryStore';
import { Credits } from './Credits';

interface LoginProps {
    store: BakeryStore;
}

export const Login: React.FC<LoginProps> = ({ store }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const success = await store.login(username, password);

        setIsLoading(false);

        if (!success) {
            Swal.fire({
                icon: 'error',
                title: 'Login Failed',
                text: 'Invalid username or password',
                confirmButtonColor: '#92400e'
            });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#fdfaf5] p-4 sm:p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-amber-100 rounded-full blur-3xl opacity-50"></div>
            <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-stone-200 rounded-full blur-3xl opacity-50"></div>

            <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-stone-100 p-6 sm:p-10 relative z-10">
                <div className="text-center mb-8 sm:mb-10">
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
                            className="w-full px-4 py-3 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                            placeholder="Enter username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            autoComplete="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-stone-700 mb-2">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                required
                                className="w-full pl-4 pr-11 py-3 text-base bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800 transition"
                                placeholder="Enter password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 focus:outline-none transition p-1.5 flex items-center justify-center cursor-pointer"
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                                <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-lg`}></i>
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center">
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Signing In...
                            </span>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="mt-8 sm:mt-10 pt-6 border-t border-stone-100">
                    <Credits />
                    <p className="text-[10px] text-stone-300 italic text-center mt-1">Built for modern artisan bakeries</p>
                </div>
            </div>
        </div>
    );
};
