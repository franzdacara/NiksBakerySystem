import type { BakeryItem } from '../../types';

/** Format a number as Philippine Peso, e.g. ₱1,250.00 */
export const peso = (n: number): string =>
    '₱' + (Number.isFinite(n) ? n : 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Compact peso for chart axes, e.g. ₱1.2k */
export const pesoShort = (n: number): string => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `₱${(n / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `₱${(n / 1_000).toFixed(1)}k`;
    return `₱${Math.round(n)}`;
};

/** Font Awesome icon per catalog category */
export const CATEGORY_ICONS: Record<BakeryItem['category'], string> = {
    Bread: 'fa-bread-slice',
    Pastry: 'fa-cookie-bite',
    Cake: 'fa-cake-candles',
    Beverage: 'fa-bottle-water',
    Coffee: 'fa-mug-hot',
    'Ice Cream': 'fa-ice-cream',
};

/** Calendar day (YYYY-MM-DD) of a timestamp in Philippine time */
export const manilaDay = (ms: number): string =>
    new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

/** At or below this many units left, an item is flagged "low stock" */
export const LOW_STOCK = 5;

export const CREDIT_NAME = 'Nikko Dacara';
