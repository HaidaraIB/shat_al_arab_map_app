
export enum UnitStatus {
  SOLD = 'sold',
  AVAILABLE = 'available',
  RESERVED = 'reserved'
}

export enum UserRole {
  ADMIN = 'admin',
  SALES = 'sales'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Unit {
  id: string;
  block: string;
  number: string;
  status: UnitStatus;
  price?: number;
  area?: number;
  unitType?: 'ركن' | 'عادي';
  category?: 'A' | 'B' | 'C';
  customerName?: string;
  note?: string;
  reservedUntil?: string;
  reservedAt?: string;
}

export interface Block {
  id: string;
  name: string;
  units: Unit[];
  layout: {
    x: number; // percentage
    y: number; // percentage
    w: number; // percentage
    h: number; // percentage
    cols: number;
    rows: number;
    isVertical?: boolean;
  };
}
