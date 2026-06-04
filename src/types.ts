
export enum UnitStatus {
  SOLD = 'sold',
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  /** Admin-only hold; sales see this as sold on the map. */
  EMPLOYEE_RESERVED = 'employee_reserved',
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
  /** Block title for display (marker text or block.label), not necessarily the internal block id. */
  block: string;
  /** Human property code: typically "BlockLabel-unitLabel" matching map labels; falls back to unit number. */
  propertyCode?: string;
  number: string;
  status: UnitStatus;
  price?: number;
  /** Price shown to sales employees (may differ from internal `price`). */
  employeePrice?: number;
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
  layout: MapBlockLayout;
}

export interface MapBlockLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  cols: number;
  rows: number;
  rotation?: number;
  numbering?: {
    reverseRows?: boolean;
    reverseCols?: boolean;
    mode?: 'default' | 'splitColumns2' | 'a3Legacy';
  };
}

export interface RoadSegment {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vertical?: boolean;
}

export interface Facility {
  id: string;
  label: string;
  subLabel?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'school' | 'market' | 'station' | 'service' | 'utility';
}

export interface MapGeometry {
  artboard: {
    width: number;
    height: number;
  };
  roads: RoadSegment[];
  facilities: Facility[];
}
