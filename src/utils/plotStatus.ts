import type { PlotStatus } from '../types/map'
import { UnitStatus } from '../types'

/** Map plot color key — sales staff see employee holds as sold. */
export function plotVisualStatus(status: PlotStatus, isAdmin: boolean): PlotStatus {
  if (!isAdmin && status === 'employee_reserved') return 'sold'
  return status
}

export function unitStatusFromPlot(status: PlotStatus): UnitStatus {
  switch (status) {
    case 'sold':
      return UnitStatus.SOLD
    case 'reserved':
      return UnitStatus.RESERVED
    case 'employee_reserved':
      return UnitStatus.EMPLOYEE_RESERVED
    default:
      return UnitStatus.AVAILABLE
  }
}

/** Arabic label; sales never see the employee-hold label (shown as final hold). */
export function unitStatusLabelAr(status: UnitStatus, isAdmin: boolean): string {
  if (!isAdmin && status === UnitStatus.EMPLOYEE_RESERVED) return 'محجوزة نهائياً'
  switch (status) {
    case UnitStatus.SOLD:
      return 'محجوزة نهائياً'
    case UnitStatus.RESERVED:
      return 'حجز مبدئي'
    case UnitStatus.EMPLOYEE_RESERVED:
      return 'حجز للموظف'
    default:
      return 'متاحة للبيع'
  }
}

export function unitStatusDetailAr(status: UnitStatus, isAdmin: boolean): string {
  if (!isAdmin && status === UnitStatus.EMPLOYEE_RESERVED) return 'محجوز نهائياً'
  switch (status) {
    case UnitStatus.SOLD:
      return 'محجوز نهائياً'
    case UnitStatus.RESERVED:
      return 'حجز مبدئي'
    case UnitStatus.EMPLOYEE_RESERVED:
      return 'حجز للموظف'
    default:
      return 'متاح'
  }
}

export function isUnitAvailableForSales(status: UnitStatus): boolean {
  return status === UnitStatus.AVAILABLE
}

export function isUnitOccupied(status: UnitStatus): boolean {
  return status !== UnitStatus.AVAILABLE
}
