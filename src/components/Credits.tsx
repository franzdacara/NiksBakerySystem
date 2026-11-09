import React from 'react';
import { CREDIT_NAME } from '../lib/format';

interface CreditsProps {
    /** 'dark' for use on the dark sidebar, 'light' for light backgrounds */
    tone?: 'dark' | 'light';
    className?: string;
}

export const Credits: React.FC<CreditsProps> = ({ tone = 'light', className = '' }) => {
    const muted = tone === 'dark' ? 'text-stone-500' : 'text-stone-400';
    const strong = tone === 'dark' ? 'text-amber-200' : 'text-stone-700';
    return (
        <div className={`text-center ${className}`}>
            <p className={`text-[10px] uppercase tracking-widest font-bold ${muted}`}>Credits</p>
            <p className={`text-sm mt-1 ${muted}`}>
                Developed by <span className={`font-semibold ${strong}`}>{CREDIT_NAME}</span>
            </p>
            <p className={`text-[11px] mt-0.5 ${muted}`}>NiksBakerySystem &copy; {new Date().getFullYear()}</p>
        </div>
    );
};
