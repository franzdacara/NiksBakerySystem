
export enum ShiftStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
}

export enum DischargeReason {
  EXPIRED = 'Expired',
  DAMAGED = 'Damaged',
  QUALITY_ISSUE = 'Quality Issue',
  OTHER = 'Other',
}

export interface BakeryItem {
  id: string;
  name: string;
  category: 'Bread' | 'Pastry' | 'Cake' | 'Beverage' | 'Coffee';
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

export interface DischargeEntry {
  id: string;
  itemId: string;
  quantity: number;
  reason: DischargeReason;
  notes?: string;
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
  discharges: DischargeEntry[];
  inventoryStart: Record<string, number>;
  inventoryEnd: Record<string, number>;
}


