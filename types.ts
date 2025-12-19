
export enum ShiftStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
}

export interface BakeryItem {
  id: string;
  name: string;
  category: 'Bread' | 'Pastry' | 'Cake' | 'Beverage';
  unit: string;
  costPrice: number;
  sellingPrice: number;
}

export interface ProductionEntry {
  id: string;
  itemId: string;
  quantity: number;
  timestamp: number;
}

export interface SaleEntry {
  id: string;
  itemId: string;
  quantity: number;
  timestamp: number;
}

export interface Shift {
  id: string;
  status: ShiftStatus;
  startTime: number | null;
  endTime: number | null;
  openingCash: number;
  closingCash: number | null;
  production: ProductionEntry[];
  sales: SaleEntry[];
  inventoryStart: Record<string, number>;
  inventoryEnd: Record<string, number>;
}


