
import { BakeryItem } from './types';

export const INITIAL_ITEMS: BakeryItem[] = [
  { id: '1', name: 'Sourdough Loaf', category: 'Bread', unit: 'loaf', costPrice: 1.50, sellingPrice: 6.50 },
  { id: '2', name: 'Butter Croissant', category: 'Pastry', unit: 'pcs', costPrice: 0.80, sellingPrice: 3.75 },
  { id: '3', name: 'Baguette', category: 'Bread', unit: 'pcs', costPrice: 0.50, sellingPrice: 2.50 },
  { id: '4', name: 'Pain au Chocolat', category: 'Pastry', unit: 'pcs', costPrice: 0.95, sellingPrice: 4.25 },
  { id: '5', name: 'Cinnamon Roll', category: 'Pastry', unit: 'pcs', costPrice: 1.20, sellingPrice: 4.50 },
  { id: '6', name: 'Espresso', category: 'Beverage', unit: 'cup', costPrice: 0.40, sellingPrice: 3.50 },
  { id: '7', name: 'Latte', category: 'Beverage', unit: 'cup', costPrice: 1.10, sellingPrice: 4.50 },
];

export const APP_COLORS = {
  primary: 'amber-800',
  secondary: 'amber-100',
  accent: 'orange-500',
  background: 'stone-50',
};
