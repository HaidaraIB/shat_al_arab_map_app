import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  CheckCircle2, 
  Circle, 
  Search, 
  Map as MapIcon, 
  LayoutGrid, 
  TrendingUp,
  Filter,
  LogOut,
  User as UserIcon,
  Users as UsersIcon,
  Settings,
  Bell,
  ChevronLeft,
  Info,
  Maximize2,
  Minimize2,
  Save,
  RotateCcw,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Unit, UnitStatus, Block } from './types';
import type { PlotStatus } from './types/map';
import { isUnitAvailableForSales, unitStatusDetailAr, unitStatusLabelAr } from './utils/plotStatus';
import type { MapData } from './types/map';
import { legacyBlocksFromMapData, enrichMapDataFromCategoryConfigs, applyCategoryConfigsToMap } from './utils/legacyBlocksFromMap';
import { MapCanvas } from './components/map/MapCanvas';
import { ConfirmDialog } from './components/map/ConfirmDialog';
import { LoadingIndicator, LoadingSpinner } from './components/ui/LoadingIndicator';
import { useToast } from './components/ui/Toast';
import { useMapStore, bootstrapPublicMap } from './store/mapStore';
import { MAP_ZONES, getZoneConfig, type MapZoneId } from './config/zones';
import { useAuth } from './lib/auth';
import { getSupabase, isSupabaseConfigured } from './lib/supabase';
import { publishDesignRemote, upsertPlotStateFromPlot, reseedPlotStateRemote } from './lib/mapRemote';
import { createEmployee, updateEmployee, deleteEmployee } from './lib/employees';
import type { Database } from './lib/database.types';
import type { UserRole } from './lib/database.types';

type SalesLogRow = Database['public']['Tables']['sales_log']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];

interface CategoryConfig {
  basePrice: number;
  baseEmployeePrice: number;
  baseArea: number;
  cornerPremium: number;
  cornerAreaBonus: number;
}

const DEFAULT_CONFIGS: Record<'A' | 'B' | 'C', CategoryConfig> = {
  A: { basePrice: 250000000, baseEmployeePrice: 250000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
  B: { basePrice: 220000000, baseEmployeePrice: 220000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
  C: { basePrice: 180000000, baseEmployeePrice: 180000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
};

const CATEGORY_CONFIGS_STORAGE_KEY = 'shat_al_arab_category_configs_v1'
const LEGACY_CATEGORY_CONFIGS_STORAGE_KEY = CATEGORY_CONFIGS_STORAGE_KEY

function categoryConfigsStorageKey(mapId: MapZoneId): string {
  return `shat_al_arab_category_configs_${mapId}_v1`
}

function zonePrefsStorageKey(mapId: MapZoneId): string {
  return `shat_al_arab_zone_prefs_${mapId}_v1`
}

type ZonePrefs = {
  reservationDuration: number
  manualCollectionRate: number | null
}

function loadZonePrefs(mapId: MapZoneId): ZonePrefs {
  if (typeof window === 'undefined') return { reservationDuration: 24, manualCollectionRate: null }
  try {
    const raw = window.localStorage.getItem(zonePrefsStorageKey(mapId))
    if (!raw) return { reservationDuration: 24, manualCollectionRate: null }
    const p = JSON.parse(raw) as Partial<ZonePrefs>
    return {
      reservationDuration: typeof p.reservationDuration === 'number' ? p.reservationDuration : 24,
      manualCollectionRate: typeof p.manualCollectionRate === 'number' ? p.manualCollectionRate : null,
    }
  } catch {
    return { reservationDuration: 24, manualCollectionRate: null }
  }
}

function persistZonePrefs(mapId: MapZoneId, prefs: ZonePrefs): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(zonePrefsStorageKey(mapId), JSON.stringify(prefs))
  } catch {
    // ignore quota / private mode
  }
}

function cloneCategoryConfigs(c: Record<'A' | 'B' | 'C', CategoryConfig>): Record<'A' | 'B' | 'C', CategoryConfig> {
  return {
    A: { ...c.A },
    B: { ...c.B },
    C: { ...c.C },
  }
}

function parseMetaNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Reads category cards from the loaded map (plot meta is the source of truth after save). */
function deriveCategoryConfigsFromMap(map: MapData): Record<'A' | 'B' | 'C', CategoryConfig> {
  const out = cloneCategoryConfigs(DEFAULT_CONFIGS)
  for (const cat of ['A', 'B', 'C'] as const) {
    const catPlots = map.plots.filter((p) => (p.meta as Record<string, unknown> | undefined)?.category === cat)
    if (catPlots.length === 0) continue

    const normal =
      catPlots.find((p) => (p.meta as Record<string, unknown>).unitType !== 'ركن') ?? catPlots[0]
    const corner = catPlots.find((p) => (p.meta as Record<string, unknown>).unitType === 'ركن')

    const nm = normal?.meta as Record<string, unknown> | undefined
    if (nm) {
      const bp = parseMetaNum(nm.price)
      const bep = parseMetaNum(nm.employeePrice)
      const ba = parseMetaNum(nm.area)
      if (bp != null) out[cat].basePrice = bp
      if (bep != null) out[cat].baseEmployeePrice = bep
      if (ba != null) out[cat].baseArea = ba
    }

    if (corner?.meta && nm) {
      const cm = corner.meta as Record<string, unknown>
      const cp = parseMetaNum(cm.price)
      const ca = parseMetaNum(cm.area)
      const baseP = parseMetaNum(nm.price) ?? out[cat].basePrice
      const baseA = parseMetaNum(nm.area) ?? out[cat].baseArea
      if (cp != null && baseP > 0) {
        const pct = ((cp / baseP - 1) * 100)
        if (Number.isFinite(pct)) out[cat].cornerPremium = Math.round(pct * 100) / 100
      }
      if (ca != null && baseA != null) {
        out[cat].cornerAreaBonus = Math.round(ca - baseA)
      }
    }
  }
  return out
}

function loadCategoryConfigsFromStorage(mapId: MapZoneId = 'default'): Record<'A' | 'B' | 'C', CategoryConfig> | null {
  if (typeof window === 'undefined') return null
  try {
    const keys = [categoryConfigsStorageKey(mapId)]
    if (mapId === 'default') keys.push(LEGACY_CATEGORY_CONFIGS_STORAGE_KEY)
    let raw: string | null = null
    for (const key of keys) {
      raw = window.localStorage.getItem(key)
      if (raw) break
    }
    if (!raw) return null
    const p = JSON.parse(raw) as unknown
    if (!p || typeof p !== 'object') return null
    for (const cat of ['A', 'B', 'C'] as const) {
      const c = (p as Record<string, unknown>)[cat]
      if (!c || typeof c !== 'object') return null
      const o = c as Record<string, unknown>
      if (
        typeof o.basePrice !== 'number' ||
        typeof o.baseArea !== 'number' ||
        typeof o.cornerPremium !== 'number' ||
        typeof o.cornerAreaBonus !== 'number'
      ) {
        return null
      }
    }
    const loaded = cloneCategoryConfigs(p as Record<'A' | 'B' | 'C', CategoryConfig>)
    for (const cat of ['A', 'B', 'C'] as const) {
      const o = (p as Record<string, unknown>)[cat] as Record<string, unknown>
      if (typeof o.baseEmployeePrice === 'number') {
        loaded[cat].baseEmployeePrice = o.baseEmployeePrice
      } else {
        loaded[cat].baseEmployeePrice = loaded[cat].basePrice
      }
    }
    return loaded
  } catch {
    return null
  }
}

function persistCategoryConfigsToStorage(c: Record<'A' | 'B' | 'C', CategoryConfig>, mapId: MapZoneId): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(categoryConfigsStorageKey(mapId), JSON.stringify(c))
  } catch {
    // ignore quota / private mode
  }
}

export default function App() {
  const toast = useToast();
  const { profile, isAdmin, signOut } = useAuth();
  const initialCategoryConfigs = useMemo(
    () => cloneCategoryConfigs(loadCategoryConfigsFromStorage('default') ?? DEFAULT_CONFIGS),
    [],
  );
  const [configs, setConfigs] = useState(initialCategoryConfigs);
  const [savedConfigs, setSavedConfigs] = useState(() => cloneCategoryConfigs(initialCategoryConfigs));
  const [settingsSaveLoading, setSettingsSaveLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | UnitStatus>('all');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [view, setView] = useState<'dashboard' | 'map' | 'settings' | 'sales_reports' | 'notifications' | 'profile' | 'users'>('map');
  const [teamProfiles, setTeamProfiles] = useState<ProfileRow[]>([]);
  const [salesLog, setSalesLog] = useState<SalesLogRow[]>([]);
  const [reservationDuration, setReservationDuration] = useState<number>(24);
  const [manualCollectionRate, setManualCollectionRate] = useState<number | null>(null);
  const [isEditingCollection, setIsEditingCollection] = useState(false);
  const [tempCollection, setTempCollection] = useState<string>('');

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookingName, setBookingName] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempPrice, setTempPrice] = useState<number | string>('');
  const [isEditingEmployeePrice, setIsEditingEmployeePrice] = useState(false);
  const [tempEmployeePrice, setTempEmployeePrice] = useState<number | string>('');
  const [editingUnitIdInTable, setEditingUnitIdInTable] = useState<string | null>(null);
  const [tempPriceInTable, setTempPriceInTable] = useState<number | string>('');
  const [editingEmployeePriceUnitId, setEditingEmployeePriceUnitId] = useState<string | null>(null);
  const [tempEmployeePriceInTable, setTempEmployeePriceInTable] = useState<number | string>('');
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [resetDefaultsConfirmOpen, setResetDefaultsConfirmOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<ProfileRow | null>(null)
  const [pendingEmployeeUpdate, setPendingEmployeeUpdate] = useState<null | {
    userId: string
    userName: string
    name: string
    role: UserRole
    nextRole: UserRole
  }>(null)
  const [deleteEmployeeRequest, setDeleteEmployeeRequest] = useState<null | {
    userId: string
    userName: string
  }>(null)
  const [signOutActionLoading, setSignOutActionLoading] = useState(false)
  const [resetDefaultsLoading, setResetDefaultsLoading] = useState(false)
  const [employeeSaveLoading, setEmployeeSaveLoading] = useState(false)
  const [deleteEmployeeLoading, setDeleteEmployeeLoading] = useState(false)
  const selectedPlotIdsOnMap = useMapStore((s) => s.selectedPlotIds);
  const plotSelectionOpensUnitModal = useMapStore((s) => s.plotSelectionOpensUnitModal);
  const hoveredPlotIdOnMap = useMapStore((s) => s.hoveredPlotId);
  const mapData = useMapStore((s) => s.map);
  const activeMapId = useMapStore((s) => s.activeMapId);
  const zoneLoading = useMapStore((s) => s.zoneLoading);
  const setActiveMapId = useMapStore((s) => s.setActiveMapId);
  const updateMapPlot = useMapStore((s) => s.updatePlot);
  const activeZone = useMemo(() => getZoneConfig(activeMapId), [activeMapId]);

  const handleZoneChange = React.useCallback((nextZoneId: MapZoneId) => {
    if (nextZoneId === activeMapId || zoneLoading) return
    persistCategoryConfigsToStorage(configs, activeMapId)
    persistZonePrefs(activeMapId, {
      reservationDuration,
      manualCollectionRate,
    })
    setActiveMapId(nextZoneId)
  }, [activeMapId, zoneLoading, configs, reservationDuration, manualCollectionRate, setActiveMapId])

  const configsLoadedForZoneRef = useRef<MapZoneId | null>(null)

  useEffect(() => {
    const prefs = loadZonePrefs(activeMapId)
    setReservationDuration(prefs.reservationDuration)
    setManualCollectionRate(prefs.manualCollectionRate)

    const stored = loadCategoryConfigsFromStorage(activeMapId)
    if (stored) {
      setConfigs(stored)
      setSavedConfigs(cloneCategoryConfigs(stored))
      configsLoadedForZoneRef.current = activeMapId
      return
    }

    configsLoadedForZoneRef.current = null
    const defaults = cloneCategoryConfigs(DEFAULT_CONFIGS)
    setConfigs(defaults)
    setSavedConfigs(defaults)
  }, [activeMapId])

  useEffect(() => {
    if (configsLoadedForZoneRef.current === activeMapId) return
    if (loadCategoryConfigsFromStorage(activeMapId)) return
    if (!mapData.plots?.length) return
    const derived = deriveCategoryConfigsFromMap(mapData)
    setConfigs(derived)
    setSavedConfigs(cloneCategoryConfigs(derived))
    configsLoadedForZoneRef.current = activeMapId
  }, [activeMapId, mapData])

  useEffect(() => {
    persistZonePrefs(activeMapId, { reservationDuration, manualCollectionRate })
  }, [activeMapId, reservationDuration, manualCollectionRate])

  useEffect(() => {
    void bootstrapPublicMap()
  }, [])

  const SALES_ALLOWED_VIEWS = ['map', 'profile'] as const
  useEffect(() => {
    if (!isAdmin && !SALES_ALLOWED_VIEWS.includes(view as typeof SALES_ALLOWED_VIEWS[number])) {
      setView('map')
    }
  }, [isAdmin, view])

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    void supabase
      .from('sales_log')
      .select('*')
      .eq('map_id', activeMapId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setSalesLog((data ?? []) as SalesLogRow[])
      })

    const ch = supabase
      .channel(`sales_log_ins_${activeMapId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sales_log' },
        (payload) => {
          const row = payload.new as SalesLogRow
          if (row.map_id !== activeMapId) return
          setSalesLog((prev) => [row, ...prev].slice(0, 200))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(ch)
    }
  }, [activeMapId])

  const reloadTeamProfiles = React.useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })
    setTeamProfiles((data ?? []) as ProfileRow[])
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setTeamProfiles([])
      return
    }
    void reloadTeamProfiles()
  }, [isAdmin, view, reloadTeamProfiles])

  const data = useMemo(
    () => legacyBlocksFromMapData(enrichMapDataFromCategoryConfigs(mapData, savedConfigs)),
    [mapData, savedConfigs],
  );

  const soldUnits = useMemo(() => {
    return data.flatMap(b => b.units.filter(u => u.status === UnitStatus.SOLD));
  }, [data]);

  const recentSoldUnits = useMemo(() => {
    return [...soldUnits].slice(0, 10);
  }, [soldUnits]);

  const stats = useMemo(() => {
    let total = 0, sold = 0, reserved = 0, employeeReserved = 0;
    data.forEach(block => {
      block.units.forEach(unit => {
        total++;
        if (unit.status === UnitStatus.SOLD) sold++;
        if (unit.status === UnitStatus.RESERVED) reserved++;
        if (unit.status === UnitStatus.EMPLOYEE_RESERVED) employeeReserved++;
      });
    });
    const occupied = sold + reserved + employeeReserved;
    return {
      total, sold, reserved, employeeReserved, available: total - occupied,
      percentage: Math.round((occupied / total) * 100)
    };
  }, [data]);

  const updateUnitPrice = async (unitId: string, newPrice: number) => {
    updateMapPlot(unitId, { meta: { ...(mapData.plots.find((p) => p.id === unitId)?.meta ?? {}), price: newPrice } })
    const plot = useMapStore.getState().map.plots.find((p) => p.id === unitId)
    if (plot) await upsertPlotStateFromPlot(plot, activeMapId)
  }

  const updateUnitEmployeePrice = async (unitId: string, newEmployeePrice: number) => {
    updateMapPlot(unitId, {
      meta: { ...(mapData.plots.find((p) => p.id === unitId)?.meta ?? {}), employeePrice: newEmployeePrice },
    })
    const plot = useMapStore.getState().map.plots.find((p) => p.id === unitId)
    if (plot) await upsertPlotStateFromPlot(plot, activeMapId)
  }

  const handleBooking = async (unitId: string, status: UnitStatus, name?: string, note?: string, durationHours?: number) => {
    const reservedUntilIso =
      (status === UnitStatus.RESERVED && durationHours)
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : undefined
    const plot = mapData.plots.find((p) => p.id === unitId)
    if (plot) {
      updateMapPlot(unitId, {
        status: status as PlotStatus,
        meta: {
          ...(plot.meta ?? {}),
          customerName: status !== UnitStatus.AVAILABLE ? name : undefined,
          note: status !== UnitStatus.AVAILABLE ? note : undefined,
          reservedAt: status === UnitStatus.RESERVED ? new Date().toISOString() : undefined,
          reservedUntil: status === UnitStatus.RESERVED ? reservedUntilIso : undefined,
        },
      })
      const next = useMapStore.getState().map.plots.find((p) => p.id === unitId)
      if (next) await upsertPlotStateFromPlot(next, activeMapId)
    }

    setBookingName('')
    setBookingNote('')
  }

  const unitById = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const b of data) for (const u of b.units) m.set(u.id, u);
    return m;
  }, [data]);

  const openUnitModal = (unit: Unit, options?: { fromSettingsPreview?: boolean }) => {
    if (!isAdmin && !isUnitAvailableForSales(unit.status)) return
    const resolved = options?.fromSettingsPreview ? unit : (unitById.get(unit.id) ?? unit);
    setSelectedUnit(resolved);
    setTempPrice(resolved.price || 0);
    setTempEmployeePrice(resolved.employeePrice || 0);
    setIsEditingPrice(false);
    setIsEditingEmployeePrice(false);
  };

  useEffect(() => {
    if (!selectedUnit || view === 'settings') return;
    const fresh = unitById.get(selectedUnit.id);
    if (fresh) setSelectedUnit(fresh);
  }, [unitById, selectedUnit?.id, view]);

  const mapFocusedUnit = useMemo(() => {
    const id = hoveredPlotIdOnMap || selectedPlotIdsOnMap[0] || null;
    if (!id) return null;
    const u = unitById.get(id) || null;
    if (!u) return null;
    if (!isAdmin && !isUnitAvailableForSales(u.status)) return null;
    return u;
  }, [hoveredPlotIdOnMap, selectedPlotIdsOnMap, unitById, isAdmin]);

  useEffect(() => {
    if (selectedPlotIdsOnMap.length !== 1 || !plotSelectionOpensUnitModal) return;
    const u = unitById.get(selectedPlotIdsOnMap[0]);
    useMapStore.setState({ plotSelectionOpensUnitModal: false });
    if (u && (isAdmin || isUnitAvailableForSales(u.status))) openUnitModal(u);
  }, [selectedPlotIdsOnMap, plotSelectionOpensUnitModal, unitById, isAdmin]);

  const filteredData = useMemo(() => {
    return data.map(block => ({
      ...block,
      units: block.units.filter(u => {
        const q = searchTerm.toLowerCase();
        const matchesSearch =
          u.id.toLowerCase().includes(q) ||
          (u.propertyCode?.toLowerCase().includes(q) ?? false) ||
          u.number.toLowerCase().includes(q) ||
          u.block.toLowerCase().includes(q);
        const matchesFilter = filter === 'all' || u.status === filter;
        return matchesSearch && matchesFilter;
      })
    })).filter(b => b.units.length > 0);
  }, [data, searchTerm, filter]);

  const updateAllPrices = async (newConfigs: typeof configs) => {
    useMapStore.setState((s) => ({
      map: applyCategoryConfigsToMap(s.map, newConfigs),
    }))
    const map = useMapStore.getState().map
    if (!isSupabaseConfigured()) {
      return { plotStateError: null as string | null, designError: null as string | null }
    }
    const plotStateResult = await reseedPlotStateRemote(map, activeMapId)
    const designResult = await publishDesignRemote(map, activeMapId)
    const plotStateError = plotStateResult.error ?? null
    const designError = designResult.error ?? null
    if (plotStateError) console.warn('[settings] plot_state sync:', plotStateError)
    if (designError) console.warn('[settings] design publish:', designError)
    return { plotStateError, designError }
  }

  const configsDirty = useMemo(() => {
    return (['A', 'B', 'C'] as const).some(
      (cat) =>
        configs[cat].basePrice !== savedConfigs[cat].basePrice ||
        configs[cat].baseEmployeePrice !== savedConfigs[cat].baseEmployeePrice ||
        configs[cat].baseArea !== savedConfigs[cat].baseArea ||
        configs[cat].cornerPremium !== savedConfigs[cat].cornerPremium ||
        configs[cat].cornerAreaBonus !== savedConfigs[cat].cornerAreaBonus,
    )
  }, [configs, savedConfigs])

  const settingsPreviewData = useMemo(
    () => legacyBlocksFromMapData(applyCategoryConfigsToMap(mapData, configs)),
    [mapData, configs],
  )

  const handleSaveProjectSettings = async () => {
    setSettingsSaveLoading(true)
    try {
      const { plotStateError, designError } = await updateAllPrices(configs)
      const ok = !plotStateError && !designError
      if (ok) {
        const next = cloneCategoryConfigs(configs)
        setSavedConfigs(next)
        persistCategoryConfigsToStorage(next, activeMapId)
        toast.success(
          isSupabaseConfigured()
            ? 'تم حفظ إعدادات المشروع ومزامنتها مع الخادم.'
            : 'تم حفظ الإعدادات محليًا في المتصفح.',
        )
      } else {
        const msg = [plotStateError, designError].filter(Boolean).join(' · ')
        toast.error(msg || 'فشل الحفظ على الخادم — لم تُحدَّث البيانات.')
      }
    } finally {
      setSettingsSaveLoading(false)
    }
  }

  const handleConfirmSignOut = async () => {
    setSignOutActionLoading(true)
    try {
      await signOut()
      setSignOutConfirmOpen(false)
    } finally {
      setSignOutActionLoading(false)
    }
  }

  const handleConfirmResetDefaults = async () => {
    setResetDefaultsLoading(true)
    try {
      const defaults = cloneCategoryConfigs(DEFAULT_CONFIGS)
      setConfigs(defaults)
      const { plotStateError, designError } = await updateAllPrices(defaults)
      const ok = !plotStateError && !designError
      setResetDefaultsConfirmOpen(false)
      if (ok) {
        setSavedConfigs(defaults)
        persistCategoryConfigsToStorage(defaults, activeMapId)
        toast.success('تم استعادة الإعدادات الافتراضية وحفظها.')
      } else {
        const msg = [plotStateError, designError].filter(Boolean).join(' · ')
        toast.error(msg || 'تعذر حفظ الإعدادات الافتراضية على الخادم.')
      }
    } finally {
      setResetDefaultsLoading(false)
    }
  }

  const handleConfirmEmployeeUpdate = async () => {
    if (!pendingEmployeeUpdate) return
    const { userId, name, role } = pendingEmployeeUpdate
    setEmployeeSaveLoading(true)
    try {
      const res = await updateEmployee(userId, { name, role })
      if (res.ok === false) {
        toast.error(res.error)
        return
      }
      await reloadTeamProfiles()
      setPendingEmployeeUpdate(null)
      setEditingEmployee(null)
      toast.success('تم تحديث بيانات الموظف.')
    } finally {
      setEmployeeSaveLoading(false)
    }
  }

  const handleConfirmDeleteEmployee = async () => {
    if (!deleteEmployeeRequest) return
    setDeleteEmployeeLoading(true)
    try {
      const res = await deleteEmployee(deleteEmployeeRequest.userId)
      if (res.ok === false) {
        toast.error(res.error)
        return
      }
      await reloadTeamProfiles()
      setDeleteEmployeeRequest(null)
      toast.success('تم حذف الموظف.')
    } finally {
      setDeleteEmployeeLoading(false)
    }
  }

  return (
    <div className={`min-h-screen flex bg-slate-100 font-sans text-slate-800 selection:bg-primary/20 selection:text-primary ${view === 'map' ? 'overflow-visible' : 'overflow-hidden'}`} dir="rtl">
      {/* Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && !isFullscreen && (
          <motion.aside 
            initial={{ x: 300 }} animate={{ x: 0 }} exit={{ x: 300 }}
            className="w-64 bg-white border-l border-slate-200 z-50 flex flex-col shadow-xl"
          >
            <div className="p-6 pb-2 border-b border-slate-50">
              <div className="flex items-center gap-3 text-primary">
                <div className="p-2 bg-primary rounded-lg text-white shadow-lg shadow-primary/20">
                  <Building2 size={24} />
                </div>
                <h1 className="font-extrabold text-lg tracking-tight">شط العرب</h1>
              </div>
            </div>
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {isAdmin && (
                <SidebarItem icon={<LayoutGrid size={20} />} label="لوحة التحكم" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
              )}
              <SidebarItem icon={<MapIcon size={20} />} label="خريطة المدينة" active={view === 'map'} onClick={() => setView('map')} />
              {isAdmin && (
                <>
                  <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">الإحصائيات</div>
                  <SidebarItem icon={<TrendingUp size={20} />} label="تقارير البيع" active={view === 'sales_reports'} onClick={() => setView('sales_reports')} />
                  <SidebarItem icon={<Bell size={20} />} label="التنبيهات" badge={salesLog.length.toString()} active={view === 'notifications'} onClick={() => setView('notifications')} />
                  <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">الإدارة</div>
                  <SidebarItem icon={<UsersIcon size={20} />} label="موظفي المبيعات" active={view === 'users'} onClick={() => setView('users')} />
                </>
              )}
            </nav>
            <div className="p-4 border-t border-slate-100 space-y-1">
              <SidebarItem icon={<UserIcon size={20} />} label="الملف الشخصي" active={view === 'profile'} onClick={() => setView('profile')} />
              {isAdmin && (
                <SidebarItem icon={<Settings size={20} />} label="الإعدادات" active={view === 'settings'} onClick={() => setView('settings')} />
              )}
              <SidebarItem
                icon={<LogOut size={20} />}
                label="خروج"
                className="text-red-500 hover:bg-red-50"
                onClick={() => setSignOutConfirmOpen(true)}
              />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 flex flex-col h-screen relative ${view === 'map' ? 'overflow-visible min-h-0' : 'overflow-hidden'}`}>
        {!isFullscreen && (
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute top-6 right-6 z-50 p-2 bg-white rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-colors"
          >
            {isSidebarOpen ? <ChevronLeft size={20} /> : <div className="p-0.5"><LayoutGrid size={20} /></div>}
          </button>
        )}

        {!isFullscreen && (
          <header className="h-20 bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0 z-40 pr-20 gap-4">
          <div className="flex items-center gap-4 bg-slate-100 rounded-2xl px-4 py-2 w-full max-w-lg border border-slate-200/50">
            <Search size={18} className="text-slate-400" />
            <input 
              type="text" placeholder="ابحث عن وحدة أو بلوك..."
              className="bg-transparent border-none outline-none text-sm w-full font-medium"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ZoneTabBar activeMapId={activeMapId} loading={zoneLoading} onChange={handleZoneChange} />
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50 hidden md:flex shrink-0">
            <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>الكل</FilterTab>
            <FilterTab active={filter === UnitStatus.AVAILABLE} onClick={() => setFilter(UnitStatus.AVAILABLE)}>المتبقية</FilterTab>
            <FilterTab active={filter === UnitStatus.SOLD} onClick={() => setFilter(UnitStatus.SOLD)}>المباعة</FilterTab>
          </div>
        </header>
        )}

        <div className={`flex-1 relative min-h-0 ${view === 'map' ? 'overflow-visible' : 'overflow-hidden'}`}>
          <AnimatePresence mode="wait">
            {view === 'dashboard' ? (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="h-full overflow-y-auto p-8 space-y-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">لوحة التحكم — {activeZone.labelAr}</h2>
                  <p className="text-slate-400 font-bold mt-1 text-sm">إحصائيات ووحدات {activeZone.labelAr}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard label="إجمالي الوحدات" value={stats.total} icon={<Building2 className="text-blue-500" />} sub={activeZone.labelAr} />
                  <StatCard label="الوحدات المباعة" value={stats.sold} icon={<CheckCircle2 className="text-red-600" />} sub={`${stats.percentage}% مباع`} />
                  <StatCard label="الوحدات المتبقية" value={stats.available} icon={<Circle className="text-amber-500" />} sub={`${100 - stats.percentage}% متبقي`} />
                  <div className="bg-primary rounded-3xl p-6 text-white shadow-lg shadow-primary/20 relative overflow-hidden group">
                    <TrendingUp className="absolute -bottom-2 -right-2 opacity-20" size={80} />
                    <div className="flex justify-between items-start relative z-10">
                      <span className="text-sm font-bold opacity-80">نسبة التحصيل</span>
                      <button 
                        onClick={() => {
                          setTempCollection((manualCollectionRate !== null ? manualCollectionRate : stats.percentage).toString());
                          setIsEditingCollection(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white/10 hover:bg-white/20 rounded-xl"
                      >
                        <Settings size={14} />
                      </button>
                    </div>
                    {isEditingCollection ? (
                      <div className="mt-2 flex items-center gap-2 relative z-10">
                        <input 
                          type="number"
                          className="w-20 bg-white/10 border border-white/20 rounded-xl px-2 py-1 text-2xl font-black outline-none focus:ring-2 focus:ring-white/40"
                          value={tempCollection}
                          onChange={(e) => setTempCollection(e.target.value)}
                          onBlur={() => {
                            const val = parseFloat(tempCollection);
                            if (!isNaN(val)) setManualCollectionRate(val);
                            setIsEditingCollection(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const val = parseFloat(tempCollection);
                              if (!isNaN(val)) setManualCollectionRate(val);
                              setIsEditingCollection(false);
                            }
                          }}
                          autoFocus
                        />
                        <span className="text-2xl font-black">%</span>
                      </div>
                    ) : (
                      <div className="mt-2 relative z-10">
                        <h3 className="text-4xl font-black">{manualCollectionRate !== null ? manualCollectionRate : stats.percentage}%</h3>
                        <div className="mt-3 flex items-center gap-2">
                           <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                             <motion.div 
                               initial={{ width: 0 }}
                               animate={{ width: `${manualCollectionRate !== null ? manualCollectionRate : stats.percentage}%` }}
                               className="h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]"
                             />
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-12">
                  {filteredData.map(block => (
                    <div key={block.id} className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <h2 className="text-xl font-black">{block.name}</h2>
                        <span className="text-xs font-bold text-slate-400">{block.units.length} وحدة</span>
                      </div>
                      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 xl:grid-cols-16 gap-2">
                        {block.units.map(u => (
                          <UnitBox key={u.id} unit={u} onClick={() => openUnitModal(u)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : view === 'sales_reports' ? (
              <motion.div key="sales_reports" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full overflow-y-auto p-8 space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">تقارير المبيعات — {activeZone.labelAr}</h2>
                    <p className="text-slate-400 font-bold mt-1 text-sm">مبيعات وعمليات {activeZone.labelAr} فقط</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="px-6 py-3 bg-red-600 text-white rounded-2xl shadow-lg shadow-red-900/25 flex items-center gap-3">
                      <TrendingUp size={20} />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold opacity-80">إجمالي المبيعات</span>
                        <span className="text-xl font-black tabular-nums">{soldUnits.reduce((acc, u) => acc + (u.price || 0), 0).toLocaleString()} <span className="text-xs">IQD</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {data.map(block => {
                    const blockSold = block.units.filter(u => u.status === UnitStatus.SOLD);
                    if (blockSold.length === 0) return null;
                    return (
                      <div key={block.id} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm transition-all hover:shadow-md">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-black text-lg text-slate-800 tracking-tight">{block.name}</h4>
                          <span className="px-3 py-1 bg-red-100 text-red-800 rounded-xl text-[10px] font-black">{blockSold.length} مبيع</span>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs font-bold text-slate-400">
                            <span>القيمة الإجمالية</span>
                            <span className="text-red-700">{blockSold.reduce((acc, u) => acc + (u.price || 0), 0).toLocaleString()} IQD</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-red-600" style={{ width: `${(blockSold.length / block.units.length) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-slate-800">سجل المبيعات (قاعدة البيانات)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">التاريخ</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الإجراء</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الوحدة</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">العميل</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {salesLog.slice(0, 80).map((row) => {
                          const u = unitById.get(row.plot_id)
                          return (
                            <tr
                              key={row.id}
                              className="hover:bg-slate-50 transition-colors cursor-pointer"
                              onClick={() => u && openUnitModal(u)}
                            >
                              <td className="p-4 text-xs font-medium text-slate-500">
                                {new Date(row.created_at).toLocaleString('ar-IQ')}
                              </td>
                              <td className="p-4 font-bold text-slate-700">{row.action}</td>
                              <td className="p-4 font-black">{row.plot_id}</td>
                              <td className="p-4 font-bold text-slate-700">{row.customer_name || '—'}</td>
                              <td
                                className={`p-4 text-left font-black ${
                                  row.action === 'sold' ? 'text-red-600' : 'text-primary'
                                }`}
                              >
                                {row.price != null ? `${Number(row.price).toLocaleString()} IQD` : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : view === 'notifications' ? (
              <motion.div key="notifications" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="h-full overflow-y-auto p-8 space-y-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">التنبيهات — {activeZone.labelAr}</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight">سجل العمليات الأخير لـ {activeZone.labelAr}</p>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-[24px] shadow-sm flex items-center gap-4">
                    <Bell className="text-amber-500" />
                    <span className="font-black text-lg tabular-nums">{salesLog.length}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {salesLog.slice(0, 40).map((row, idx) => {
                    const u = unitById.get(row.plot_id)
                    const title =
                      row.action === 'sold'
                        ? `بيع: ${row.plot_id}`
                        : row.action === 'reserved'
                          ? `حجز: ${row.plot_id}`
                          : row.action === 'employee_reserved'
                            ? `حجز للموظف: ${row.plot_id}`
                          : row.action === 'released'
                            ? `إلغاء حجز: ${row.plot_id}`
                            : `تغيير سعر: ${row.plot_id}`
                    const iconAccent =
                      row.action === 'sold'
                        ? 'bg-red-100 text-red-600 group-hover:bg-red-600 group-hover:text-white'
                        : row.action === 'reserved'
                          ? 'bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white'
                          : row.action === 'employee_reserved'
                            ? 'bg-violet-100 text-violet-700 group-hover:bg-violet-600 group-hover:text-white'
                          : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white'
                    const customerAccent =
                      row.action === 'sold'
                        ? 'text-red-700'
                        : row.action === 'reserved'
                          ? 'text-amber-800'
                          : row.action === 'employee_reserved'
                            ? 'text-violet-800'
                          : 'text-primary'
                    return (
                      <motion.div
                        key={row.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => u && openUnitModal(u)}
                      >
                        <div
                          className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${iconAccent}`}
                        >
                          <CheckCircle2 size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-black text-slate-800">{title}</h4>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {new Date(row.created_at).toLocaleString('ar-IQ')}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 font-medium leading-relaxed" dir="rtl">
                            {row.customer_name ? (
                              <>
                                العميل: <span className={`font-black ${customerAccent}`}>{row.customer_name}</span>
                                {row.price != null && (
                                  <>
                                    {' · '}
                                    القيمة:{' '}
                                    <span className="font-bold text-slate-800">{Number(row.price).toLocaleString()} IQD</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                  {salesLog.length === 0 && (
                    <div className="py-20 text-center text-slate-300">
                      <Bell size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-black text-xl">لا توجد تنبيهات حالية</p>
                      <p className="text-sm font-bold opacity-60">سيتم عرض النشاطات هنا عند حجز الوحدات</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : view === 'profile' ? (
              <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="h-full min-h-0 overflow-y-auto p-12 pb-16 flex flex-col items-center">
                <div className="w-full max-w-2xl shrink-0 bg-white rounded-[48px] border border-slate-200 shadow-2xl flex flex-col items-center p-12 pb-14 relative">
                   <div className="absolute top-0 left-0 right-0 h-40 bg-primary/5 -z-10" />
                   <div className="w-32 h-32 rounded-[40px] bg-white border-4 border-white shadow-2xl flex items-center justify-center text-primary mb-6 group overflow-hidden">
                     <UserIcon size={64} className="group-hover:scale-110 transition-transform" />
                   </div>
                   <h2 className="text-4xl font-black text-slate-900 tracking-tight">
                     {profile?.name || (isAdmin ? 'مدير' : 'مندوب')}
                   </h2>
                   <p className="text-slate-400 font-bold mb-2 uppercase tracking-widest text-xs">
                     {isAdmin ? 'أدمن مبيعات' : 'مندوب مبيعات'}
                   </p>
                   
                   <div className="w-full grid grid-cols-2 gap-4 mb-8">
                     <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col items-center gap-2">
                       <CheckCircle2 className="text-green-500" size={24} />
                       <span className="text-xs font-black text-slate-400 uppercase tracking-widest">إجمالي المبيعات</span>
                       <span className="text-2xl font-black text-slate-800">{soldUnits.length}</span>
                     </div>
                     <div className="p-6 bg-slate-50 rounded-[32px] border border-slate-100 flex flex-col items-center gap-2">
                       <TrendingUp className="text-primary" size={24} />
                       <span className="text-xs font-black text-slate-400 uppercase tracking-widest">نسبة الإنجاز</span>
                       <span className="text-2xl font-black text-slate-800">{stats.percentage}%</span>
                     </div>
                   </div>

                   <div className="w-full space-y-3">
                     <div className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl hover:border-primary/20 transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <Settings className="text-slate-400 group-hover:text-primary transition-colors" />
                          <span className="font-bold text-slate-700">تعديل ملف المستخدم</span>
                        </div>
                        <ChevronLeft size={20} className="text-slate-300 transform rotate-180" />
                     </div>
                     <div className="flex items-center justify-between p-5 bg-white border border-slate-100 rounded-3xl hover:border-primary/20 transition-all cursor-pointer group">
                        <div className="flex items-center gap-4">
                          <Bell className="text-slate-400 group-hover:text-primary transition-colors" />
                          <span className="font-bold text-slate-700">تفضيلات التنبيهات</span>
                        </div>
                        <ChevronLeft size={20} className="text-slate-300 transform rotate-180" />
                     </div>
                   </div>

                   <button
                     type="button"
                    onClick={() => setSignOutConfirmOpen(true)}
                     className="mt-12 w-full text-red-600 font-black text-sm bg-red-50 hover:bg-red-100 px-8 py-4 rounded-2xl transition-all"
                   >
                     تسجيل الخروج من النظام
                   </button>
                </div>
              </motion.div>
            ) : view === 'users' ? (
              <motion.div key="users" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="h-full overflow-y-auto p-12 flex flex-col gap-8">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">موظفي المبيعات</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight">
                      المستخدمون المسجّلون في نظام التوثيق السحابي. أضِف موظفًا جديدًا أو عدّل/احذف الحسابات الحالية من البطاقات أدناه.
                    </p>
                  </div>
                </div>

                <AddEmployeeForm onCreated={() => void reloadTeamProfiles()} />

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {teamProfiles.map((user) => (
                    <motion.div
                      key={user.id}
                      layout
                      className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative group overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-24 bg-slate-50 -z-10" />
                      <div className="flex items-start justify-between">
                        <div className="w-16 h-16 rounded-2xl bg-white border-2 border-white shadow-xl flex items-center justify-center text-primary mb-4">
                          <UserIcon size={32} />
                        </div>
                        <span
                          className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}
                        >
                          {user.role === 'admin' ? 'مدير' : 'مندوب'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-800">{user.name}</h3>
                        {user.id === profile?.id && (
                          <span className="text-[10px] font-bold text-slate-300 mt-1 inline-block">(أنت)</span>
                        )}
                      </div>
                      <div className="mt-6 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingEmployee(user)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <Pencil size={14} />
                          تعديل
                        </button>
                        <button
                          type="button"
                          disabled={user.id === profile?.id}
                          onClick={() =>
                            setDeleteEmployeeRequest({ userId: user.id, userName: user.name })
                          }
                          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 text-xs font-black text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          title={user.id === profile?.id ? 'لا يمكن حذف حسابك' : 'حذف الموظف'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-6 pt-6 border-t border-slate-50">
                        <span className="text-[10px] font-bold text-slate-300">
                          تمت الإضافة {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : view === 'settings' ? (
              <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full min-h-0 overflow-y-auto flex flex-col p-8 gap-6">
                <div className="flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">إعدادات {activeZone.labelAr}</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight uppercase">التحكم بالأسعار والمساحات لـ {activeZone.labelAr}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSaveProjectSettings()}
                      disabled={!configsDirty || settingsSaveLoading}
                      className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-2xl text-xs font-black hover:opacity-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {settingsSaveLoading ? (
                        <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
                      ) : (
                        <Save size={16} />
                      )}
                      <span>حفظ التغييرات</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setResetDefaultsConfirmOpen(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-2xl text-xs font-black hover:bg-slate-200 transition-all"
                    >
                      <RotateCcw size={16} />
                      <span>استعادة الافتراضي</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
                  {(['A', 'B', 'C'] as const).map(cat => (
                    <div key={cat} className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={`px-4 py-1 rounded-xl text-[10px] font-black uppercase ${
                          cat === 'A' ? 'bg-purple-100 text-purple-700' : cat === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                        }`}>تصنيف {cat}</span>
                        <Settings size={16} className="text-slate-300" />
                      </div>
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">السعر الداخلي الأساسي (IQD)</label>
                          <input 
                            type="number" 
                            step={1000}
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 font-black text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                            value={configs[cat].basePrice}
                            onChange={(e) => {
                              const newCfgs = { ...configs, [cat]: { ...configs[cat], basePrice: Number(e.target.value) } };
                              setConfigs(newCfgs);
                            }}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">سعر المندوب الأساسي (IQD)</label>
                          <input
                            type="number"
                            step={1000}
                            className="w-full bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2 font-black text-emerald-800 outline-none focus:ring-2 focus:ring-emerald-200/60"
                            value={configs[cat].baseEmployeePrice}
                            onChange={(e) => {
                              const newCfgs = { ...configs, [cat]: { ...configs[cat], baseEmployeePrice: Number(e.target.value) } };
                              setConfigs(newCfgs);
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">المساحة (م²)</label>
                            <input 
                              type="number" 
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 font-black text-slate-700 outline-none"
                              value={configs[cat].baseArea}
                              onChange={(e) => {
                                const newCfgs = { ...configs, [cat]: { ...configs[cat], baseArea: Number(e.target.value) } };
                                setConfigs(newCfgs);
                              }}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">زيادة الركن (%)</label>
                            <input 
                              type="number" 
                              className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 font-black text-amber-600 outline-none"
                              value={configs[cat].cornerPremium}
                              onChange={(e) => {
                                const newCfgs = { ...configs, [cat]: { ...configs[cat], cornerPremium: Number(e.target.value) } };
                                setConfigs(newCfgs);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex min-h-[min(65vh,900px)] flex-1 flex-col overflow-hidden rounded-[40px] border border-slate-200 bg-white shadow-2xl">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight">معاينة قائمة الوحدات المحدثة</span>
                    <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm scale-90 origin-left">
                      {['الكل', 'A', 'B', 'C'].map((cat) => (
                        <button key={cat} onClick={() => setSearchTerm(cat === 'الكل' ? '' : cat)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${ (cat === 'الكل' && searchTerm === '') || searchTerm === cat ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600' }`}> {cat === 'الكل' ? 'الكل' : `تصنيف ${cat}`} </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">الوحدة</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">النوع</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">المساحة</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">العميل</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">السعر الداخلي</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">سعر المندوب</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {settingsPreviewData.flatMap(b => b.units)
                          .filter(u => !searchTerm || u.category === searchTerm || u.id.includes(searchTerm))
                          .map(unit => (
                          <tr key={unit.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => openUnitModal(unit, { fromSettingsPreview: true })}>
                            <td className="p-6 font-black text-slate-800">وحدة {unit.id}</td>
                            <td className="p-6">
                              <span className={`px-3 py-1 rounded-lg text-[10px] font-black ${unit.unitType === 'ركن' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                {unit.unitType}
                              </span>
                            </td>
                            <td className="p-6 font-bold text-slate-600">{unit.area} م²</td>
                            <td className="p-6 font-bold text-slate-600">
                              {unit.customerName || <span className="opacity-20">-</span>}
                            </td>
                            <td className="p-6 text-left font-black text-primary tabular-nums text-lg">
                              {editingUnitIdInTable === unit.id ? (
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    step={1000}
                                    className="w-32 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-sm text-slate-800 outline-none"
                                    value={tempPriceInTable}
                                    onChange={(e) => setTempPriceInTable(e.target.value)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const val = Number(tempPriceInTable);
                                      if (!isNaN(val)) {
                                        void updateUnitPrice(unit.id, val);
                                        setEditingUnitIdInTable(null);
                                      }
                                    }}
                                    className="p-1 px-3 bg-primary text-white rounded-lg text-xs font-bold"
                                  >حفظ</button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingUnitIdInTable(null);
                                    }}
                                    className="p-1 px-3 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-200"
                                  >إلغاء</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 group/price min-w-[200px]">
                                  <span className="opacity-0 group-hover/price:opacity-100 transition-opacity">
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingUnitIdInTable(unit.id);
                                        setTempPriceInTable(unit.price || 0);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg "
                                    >
                                      <Settings size={14} />
                                    </button>
                                  </span>
                                  <span>{(unit.price || 0).toLocaleString()} <span className="text-[10px] opacity-40">IQD</span></span>
                                </div>
                              )}
                            </td>
                            <td className="p-6 text-left font-black text-emerald-700 tabular-nums text-lg">
                              {editingEmployeePriceUnitId === unit.id ? (
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    step={1000}
                                    className="w-32 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-sm text-slate-800 outline-none"
                                    value={tempEmployeePriceInTable}
                                    onChange={(e) => setTempEmployeePriceInTable(e.target.value)}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const val = Number(tempEmployeePriceInTable);
                                      if (!isNaN(val)) {
                                        void updateUnitEmployeePrice(unit.id, val);
                                        setEditingEmployeePriceUnitId(null);
                                      }
                                    }}
                                    className="p-1 px-3 bg-primary text-white rounded-lg text-xs font-bold"
                                  >حفظ</button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingEmployeePriceUnitId(null);
                                    }}
                                    className="p-1 px-3 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-200"
                                  >إلغاء</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 group/emp-price min-w-[200px]">
                                  <span className="opacity-0 group-hover/emp-price:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingEmployeePriceUnitId(unit.id);
                                        setTempEmployeePriceInTable(unit.employeePrice || 0);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg "
                                    >
                                      <Settings size={14} />
                                    </button>
                                  </span>
                                  <span>
                                    {(unit.employeePrice ?? 0).toLocaleString()}{' '}
                                    <span className="text-[10px] opacity-40">IQD</span>
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-slate-50 text-center bg-slate-50/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic flex items-center justify-center gap-2">
                       <Save size={12} /> اضغط «حفظ التغييرات» لتطبيق الأسعار والمساحات وحفظها على الخادم
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`h-full flex flex-col md:flex-row overflow-visible min-h-0 min-w-0 ${isFullscreen ? 'p-0 gap-0' : 'p-6 gap-6'}`}>
                <div className={`flex-1 min-w-0 bg-white ${isFullscreen ? 'rounded-0' : 'rounded-[40px] border border-slate-200 shadow-2xl'} overflow-visible relative flex flex-col min-h-0`}>
                  <div className={`p-6 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md z-10 ${isFullscreen ? 'sticky top-0' : ''}`}>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg">{activeZone.titleAr}</h3>
                      <p className="text-[10px] font-bold text-slate-400 tracking-widest">مدينة شط العرب السكنية</p>
                    </div>
                    <div className="flex gap-4 items-center">
                      <button 
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg hover:shadow-slate-200 transition-all"
                      >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        <span>{isFullscreen ? 'تصغير' : 'ملء الشاشة'}</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 min-w-0 relative bg-slate-50">
                    <MapCanvas />
                    {zoneLoading && (
                      <div
                        className="absolute inset-0 z-50 flex items-center justify-center bg-slate-50/80 backdrop-blur-[2px]"
                        aria-busy="true"
                        aria-live="polite"
                      >
                        <LoadingIndicator
                          size="lg"
                          message={`جاري تحميل ${activeZone.labelAr}…`}
                          label={`جاري تحميل ${activeZone.labelAr}`}
                        />
                      </div>
                    )}
                  </div>
                </div>
                {!isFullscreen && (
                  <div className="w-80 flex flex-col gap-6">
                  <div className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-200">
                    <div className="flex items-center gap-3 border-b border-slate-100 pb-3 mb-4">
                      <Info className="text-primary" size={18} />
                      <span className="font-black text-sm">تفاصيل المنطقة</span>
                    </div>
                    {mapFocusedUnit ? (
                      <div className="space-y-3 text-slate-700">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                          <p className="text-[10px] font-black text-slate-400">الوحدة</p>
                          <p className="text-xl font-black">#{mapFocusedUnit.number}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-slate-100 p-2">
                            <p className="text-[10px] font-black text-slate-400">البلوك</p>
                            <p className="font-black">{mapFocusedUnit.block}</p>
                          </div>
                          <div className="rounded-xl border border-slate-100 p-2">
                            <p className="text-[10px] font-black text-slate-400">المساحة</p>
                            <p className="font-black">{mapFocusedUnit.area} م²</p>
                          </div>
                        </div>
                        <button
                          onClick={() => openUnitModal(mapFocusedUnit)}
                          className="w-full rounded-xl bg-primary px-4 py-2 text-xs font-black text-white hover:opacity-90"
                        >
                          {isAdmin ? 'فتح إجراءات الوحدة' : 'عرض السعر'}
                        </button>
                        {mapFocusedUnit.employeePrice != null && !isAdmin && (
                          <p className="text-center text-sm font-black text-primary tabular-nums">
                            {mapFocusedUnit.employeePrice.toLocaleString()}{' '}
                            <span className="text-[10px] opacity-50">IQD</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-500 space-y-2 px-2">
                        <MapIcon size={28} className="mx-auto opacity-25" />
                        <p className="text-xs font-bold leading-relaxed">
                          {isAdmin
                            ? 'حرّك المؤشر فوق أي قطعة لعرض التفاصيل، أو انقر القطعة لفتح إجراءات الوحدة.'
                            : 'انقر على الوحدات المتاحة فقط لعرض سعر العرض.'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-2xl relative overflow-hidden grow flex flex-col">
                    <Building2 className="absolute -bottom-6 -left-6 opacity-10" size={120} />
                    <h4 className="text-lg font-black mb-4">ملخص {activeZone.labelAr}</h4>
                    <div className="space-y-4 relative z-10 flex-1">
                      <div className="flex justify-between text-xs font-bold opacity-60"><span>نسبة المبيع الكلية</span><span>{stats.percentage}%</span></div>
                      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${stats.percentage}%` }} className="h-full bg-primary shadow-[0_0_15px_rgba(29,49,94,0.5)]" />
                      </div>
                      <div className="pt-4 grid grid-cols-1 gap-4">
                        <div className="flex items-end gap-3">
                          <p className="text-4xl font-black text-red-400">{stats.sold}</p>
                          <p className="text-[10px] font-bold opacity-40 uppercase tracking-tight mb-2">وحدة مباعة</p>
                        </div>
                        <div className="flex items-end gap-3">
                          <p className="text-4xl font-black text-primary/70">{stats.available}</p>
                          <p className="text-[10px] font-bold opacity-40 uppercase tracking-tight mb-2">وحدة متاحة</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto pt-6 border-t border-white/5">
                      <p className="text-[10px] font-bold text-white/30 tracking-widest text-center">مشروع شط العرب السكني</p>
                    </div>
                  </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {selectedUnit && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white w-full max-w-lg rounded-[40px] p-10 shadow-2xl flex flex-col gap-6 overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-start">
                <div><h3 className="text-3xl font-black text-slate-900">وحدة {selectedUnit.number}</h3><p className="text-slate-400 font-bold flex items-center gap-2 mt-1 px-1 tracking-tight">بلوك {selectedUnit.block}</p></div>
                <div className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest ${
                  selectedUnit.status === UnitStatus.SOLD ? 'bg-red-100 text-red-800' :
                  selectedUnit.status === UnitStatus.RESERVED ? 'bg-amber-100 text-amber-700' :
                  selectedUnit.status === UnitStatus.EMPLOYEE_RESERVED ? 'bg-violet-100 text-violet-800' :
                  'bg-green-100 text-green-700'}`}>
                  {unitStatusLabelAr(selectedUnit.status, isAdmin)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                <DetailRow label="كود العقار" value={selectedUnit.propertyCode ?? (selectedUnit.number || selectedUnit.id)} />
                <DetailRow
                  label="التصنيف"
                  value={
                    selectedUnit.category ? `تصنيف ${selectedUnit.category}` : 'تصنيف غير محدد'
                  }
                />
                <DetailRow label="النوع" value={selectedUnit.unitType || 'عادي'} />
                <DetailRow label="المساحة" value={`${selectedUnit.area || 200} م²`} />
                {isAdmin && (
                  <DetailRow label="الحالة" value={unitStatusDetailAr(selectedUnit.status, isAdmin)} />
                )}
                {isAdmin ? (
                  <>
                    <div className="space-y-1 relative group col-span-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">السعر الداخلي</p>
                      {isEditingPrice ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            step={1000}
                            className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const val = Number(tempPrice);
                              if (!isNaN(val)) {
                                void updateUnitPrice(selectedUnit.id, val);
                                setIsEditingPrice(false);
                                setSelectedUnit({ ...selectedUnit, price: val });
                              }
                            }}
                            className="p-1 px-3 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:bg-primary transition-colors"
                          >حفظ</button>
                          <button
                            onClick={() => setIsEditingPrice(false)}
                            className="p-1 px-3 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                          >إلغاء</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group">
                          <p className="text-lg font-black text-slate-800 leading-tight tracking-tight">
                            {selectedUnit.price != null && !Number.isNaN(selectedUnit.price) ? (
                              <>
                                {selectedUnit.price.toLocaleString()}{' '}
                                <span className="text-[10px] opacity-40">IQD</span>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </p>
                          <button
                            onClick={() => {
                              setTempPrice(selectedUnit.price || 0);
                              setIsEditingPrice(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md text-[10px] font-bold"
                          >تعديل</button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 relative group col-span-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">سعر المندوب</p>
                      {isEditingEmployeePrice ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            step={1000}
                            className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                            value={tempEmployeePrice}
                            onChange={(e) => setTempEmployeePrice(e.target.value)}
                            autoFocus
                          />
                          <button
                            onClick={() => {
                              const val = Number(tempEmployeePrice);
                              if (!isNaN(val)) {
                                void updateUnitEmployeePrice(selectedUnit.id, val);
                                setIsEditingEmployeePrice(false);
                                setSelectedUnit({ ...selectedUnit, employeePrice: val });
                              }
                            }}
                            className="p-1 px-3 bg-primary text-white rounded-lg text-xs font-bold shadow-sm hover:bg-primary transition-colors"
                          >حفظ</button>
                          <button
                            onClick={() => setIsEditingEmployeePrice(false)}
                            className="p-1 px-3 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                          >إلغاء</button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between group">
                          <p className="text-lg font-black text-slate-800 leading-tight tracking-tight">
                            {selectedUnit.employeePrice != null && !Number.isNaN(selectedUnit.employeePrice) ? (
                              <>
                                {selectedUnit.employeePrice.toLocaleString()}{' '}
                                <span className="text-[10px] opacity-40">IQD</span>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </p>
                          <button
                            onClick={() => {
                              setTempEmployeePrice(selectedUnit.employeePrice || 0);
                              setIsEditingEmployeePrice(true);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md text-[10px] font-bold"
                          >تعديل</button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-1 col-span-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">السعر</p>
                    <p className="text-2xl font-black text-primary leading-tight tracking-tight">
                      {selectedUnit.employeePrice != null && !Number.isNaN(selectedUnit.employeePrice) ? (
                        <>
                          {selectedUnit.employeePrice.toLocaleString()}{' '}
                          <span className="text-[10px] opacity-40">IQD</span>
                        </>
                      ) : (
                        <span className="text-slate-400 text-lg">غير محدد</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {isAdmin && selectedUnit.status === UnitStatus.AVAILABLE ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">اسم العميل</label>
                    <input 
                      type="text" 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="أدخل اسم العميل الكامل..."
                      value={bookingName}
                      onChange={(e) => setBookingName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">ملاحظات الحجز</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px]"
                      placeholder="أضف أي ملاحظات إضافية هنا..."
                      value={bookingNote}
                      onChange={(e) => setBookingNote(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">مدة الحجز المبدئي (ساعة)</label>
                    <div className="flex gap-2">
                       {[24, 48, 72].map(hours => (
                         <button 
                           key={hours}
                           onClick={() => setReservationDuration(hours)}
                           className={`flex-1 py-3 rounded-2xl font-black text-xs border-2 transition-all ${reservationDuration === hours ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-100 text-slate-400'}`}
                         >{hours} ساعة</button>
                       ))}
                    </div>
                  </div>
                </div>
              ) : isAdmin && selectedUnit.status === UnitStatus.SOLD ? (
                <div className="space-y-4 bg-red-50 p-6 rounded-3xl border border-red-200">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">اسم الحاجز</span>
                    <span className="text-lg font-black text-red-900">{selectedUnit.customerName || 'غير محدد'}</span>
                  </div>
                  {selectedUnit.note && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-red-700 uppercase tracking-widest">الملاحظات</span>
                      <p className="text-sm font-medium text-red-900 leading-relaxed">{selectedUnit.note}</p>
                    </div>
                  )}
                </div>
              ) : isAdmin && selectedUnit.status === UnitStatus.EMPLOYEE_RESERVED ? (
                <div className="space-y-4 bg-violet-50 p-6 rounded-3xl border border-violet-200">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">حجز للموظف</span>
                    <span className="text-lg font-black text-violet-900">{selectedUnit.customerName || 'غير محدد'}</span>
                  </div>
                  {selectedUnit.note && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-violet-700 uppercase tracking-widest">الملاحظات</span>
                      <p className="text-sm font-medium text-violet-900 leading-relaxed">{selectedUnit.note}</p>
                    </div>
                  )}
                </div>
              ) : isAdmin ? (
                <div className="space-y-4 bg-amber-50 p-6 rounded-3xl border border-amber-200">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">اسم الحاجز</span>
                    <span className="text-lg font-black text-amber-900">{selectedUnit.customerName || 'غير محدد'}</span>
                  </div>
                  {selectedUnit.status === UnitStatus.RESERVED && selectedUnit.reservedUntil && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">ينتهي الحجز في</span>
                        <span className="text-sm font-bold text-amber-700">{new Date(selectedUnit.reservedUntil).toLocaleString('ar-IQ')}</span>
                     </div>
                  )}
                  {selectedUnit.note && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">الملاحظات</span>
                      <p className="text-sm font-medium text-amber-900 leading-relaxed">{selectedUnit.note}</p>
                    </div>
                  )}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 mt-2">
                {isAdmin && (
                  selectedUnit.status === UnitStatus.AVAILABLE ? (
                    <>
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          void handleBooking(selectedUnit.id, UnitStatus.SOLD, bookingName, bookingNote);
                          setSelectedUnit(null);
                        }}
                        className="flex-1 py-5 rounded-3xl bg-red-600 text-white font-black text-lg shadow-xl shadow-red-900/25 hover:bg-red-700 transition-all"
                      >تأكيد الحجز النهائي</button>
                      <button
                        onClick={() => {
                          void handleBooking(selectedUnit.id, UnitStatus.RESERVED, bookingName, bookingNote, reservationDuration);
                          setSelectedUnit(null);
                        }}
                        className="flex-1 py-5 rounded-3xl bg-amber-500 text-white font-black text-lg shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all"
                      >حجز مبدئي</button>
                    </div>
                    <button
                      onClick={() => {
                        void handleBooking(selectedUnit.id, UnitStatus.EMPLOYEE_RESERVED, bookingName, bookingNote);
                        setSelectedUnit(null);
                      }}
                      className="w-full py-4 rounded-3xl bg-violet-600 text-white font-black text-base shadow-xl shadow-violet-200 hover:bg-violet-700 transition-all"
                    >حجز للموظف</button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        void handleBooking(selectedUnit.id, UnitStatus.AVAILABLE);
                        setSelectedUnit(null);
                      }}
                      className="w-full py-5 rounded-3xl bg-slate-100 text-slate-700 font-black text-lg hover:bg-slate-200 transition-all"
                    >إلغاء الحجز</button>
                  )
                )}
                <button
                  onClick={() => {
                    setSelectedUnit(null);
                    setBookingName('');
                    setBookingNote('');
                    setIsEditingPrice(false);
                    setIsEditingEmployeePrice(false);
                  }}
                  className="py-2 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-slate-900 transition-colors"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <ConfirmDialog
        open={signOutConfirmOpen}
        title="تأكيد تسجيل الخروج"
        message="سيتم إنهاء جلستك الحالية والعودة إلى صفحة تسجيل الدخول."
        confirmLabel="تسجيل الخروج"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        confirmLoading={signOutActionLoading}
        onConfirm={() => void handleConfirmSignOut()}
        onCancel={() => setSignOutConfirmOpen(false)}
      />
      <ConfirmDialog
        open={resetDefaultsConfirmOpen}
        title="استعادة الإعدادات الافتراضية"
        message="سيتم تحديث أسعار ومساحات الفئات A/B/C في الخريطة الحالية بالقيم الافتراضية."
        confirmLabel="استعادة"
        cancelLabel="إلغاء"
        confirmVariant="amber"
        confirmLoading={resetDefaultsLoading}
        onConfirm={() => void handleConfirmResetDefaults()}
        onCancel={() => setResetDefaultsConfirmOpen(false)}
      />
      <EditEmployeeModal
        employee={editingEmployee}
        onClose={() => setEditingEmployee(null)}
        onRequestSave={(payload) => {
          if (payload.role !== payload.previousRole) {
            setPendingEmployeeUpdate({
              userId: payload.userId,
              userName: payload.userName,
              name: payload.name,
              role: payload.role,
              nextRole: payload.role,
            })
            return
          }
          setEmployeeSaveLoading(true)
          void (async () => {
            try {
              const res = await updateEmployee(payload.userId, {
                name: payload.name,
                role: payload.role,
              })
              if (res.ok === false) {
                toast.error(res.error)
                return
              }
              await reloadTeamProfiles()
              setEditingEmployee(null)
              toast.success('تم تحديث بيانات الموظف.')
            } finally {
              setEmployeeSaveLoading(false)
            }
          })()
        }}
        saveLoading={employeeSaveLoading}
      />
      <ConfirmDialog
        open={pendingEmployeeUpdate !== null}
        title="تأكيد تغيير الصلاحية"
        message={
          pendingEmployeeUpdate
            ? `سيتم تحديث ${pendingEmployeeUpdate.userName} وتغيير دوره إلى ${pendingEmployeeUpdate.nextRole === 'admin' ? 'مدير' : 'مندوب'}.`
            : ''
        }
        confirmLabel="تأكيد التحديث"
        cancelLabel="إلغاء"
        confirmVariant="amber"
        confirmLoading={employeeSaveLoading}
        onConfirm={() => void handleConfirmEmployeeUpdate()}
        onCancel={() => setPendingEmployeeUpdate(null)}
      />
      <ConfirmDialog
        open={deleteEmployeeRequest !== null}
        title="تأكيد حذف الموظف"
        message={
          deleteEmployeeRequest
            ? `سيتم حذف حساب ${deleteEmployeeRequest.userName} نهائيًا من نظام التوثيق. لا يمكن التراجع عن هذا الإجراء.`
            : ''
        }
        confirmLabel="حذف"
        cancelLabel="إلغاء"
        confirmVariant="danger"
        confirmLoading={deleteEmployeeLoading}
        onConfirm={() => void handleConfirmDeleteEmployee()}
        onCancel={() => setDeleteEmployeeRequest(null)}
      />

    </div>
  );
}

function SidebarItem({ icon, label, active = false, badge, className = '', onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all group ${active ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'} ${className}`}>
      <div className="flex items-center gap-3"><span className={`${active ? 'text-white' : 'text-slate-400 group-hover:text-primary'} transition-colors`}>{icon}</span><span className="font-bold text-sm tracking-tight">{label}</span></div>
      {badge && <span className={`${active ? 'bg-white text-primary' : 'bg-primary text-white'} text-[9px] px-2 py-0.5 rounded-full font-black`}>{badge}</span>}
    </button>
  );
}

function ZoneTabBar({
  activeMapId,
  loading = false,
  onChange,
}: {
  activeMapId: MapZoneId
  loading?: boolean
  onChange: (id: MapZoneId) => void
}) {
  return (
    <div
      className="flex items-center gap-2 bg-slate-100 rounded-xl p-1 border border-slate-200 shrink-0"
      aria-busy={loading}
    >
      {MAP_ZONES.map((zone) => (
        <button
          key={zone.id}
          type="button"
          disabled={loading}
          onClick={() => onChange(zone.id)}
          className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
            activeMapId === zone.id
              ? 'bg-slate-900 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {zone.labelAr}
        </button>
      ))}
      {loading && (
        <LoadingSpinner size="sm" className="mx-1" label="جاري تحميل الزون" />
      )}
    </div>
  )
}

function FilterTab({ children, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${active ? 'bg-white shadow-xl shadow-slate-200 text-primary ring-1 ring-slate-200/5' : 'text-slate-500 hover:text-slate-900'}`}>{children}</button>
  );
}

function StatCard({ label, value, icon, sub }: any) {
  return (
    <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex flex-col gap-2 transition-all hover:shadow-md">
      <div className="flex items-center justify-between"><span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{label}</span><div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-white transition-colors">{icon}</div></div>
      <div className="flex flex-col"><span className="text-3xl font-black text-slate-900 leading-none">{value}</span><span className="text-[10px] text-slate-400 font-bold mt-1 tracking-tight">{sub}</span></div>
    </div>
  );
}

function UnitBox({ unit, onClick }: any) {
  return (
    <motion.button whileHover={{ scale: 1.1, y: -2 }} whileTap={{ scale: 0.9 }} onClick={onClick} className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all shadow-sm ${
      unit.status === UnitStatus.SOLD ? 'border-red-600 bg-red-600 text-white shadow-red-900/25' :
      unit.status === UnitStatus.EMPLOYEE_RESERVED ? 'border-violet-600 bg-violet-600 text-white shadow-violet-900/25' :
      unit.status === UnitStatus.RESERVED ? 'border-amber-500 bg-amber-500 text-white shadow-amber-200' :
      'border-slate-100 bg-white text-slate-600 hover:border-primary/20 hover:bg-primary/10'
    }`}>
      <span className="text-[8px] font-black opacity-40 uppercase tracking-tight">{unit.block}</span>
      <span className="text-sm font-black leading-none">{unit.number}</span>
    </motion.button>
  );
}

function DetailRow({ label, value }: any) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">{label}</p>
      <p className="text-lg font-black text-slate-800 leading-tight tracking-tight">{value}</p>
    </div>
  );
}

function BlockStat({ label, value, color }: any) {
  return (
    <div className={`p-4 rounded-2xl border-2 ${color === 'primary' ? 'bg-primary/5 border-primary/10 text-primary' : 'bg-slate-50 border-slate-100 text-slate-900'}`}>
      <p className="text-[10px] font-black opacity-40 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black leading-none mt-1">{value}</p>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded-lg shadow-sm border border-slate-200/50 ${color}`} />
      <span className="text-[11px] font-bold text-slate-500 tracking-tight uppercase">{label}</span>
    </div>
  );
}

function EditEmployeeModal({
  employee,
  onClose,
  onRequestSave,
  saveLoading,
}: {
  employee: ProfileRow | null
  onClose: () => void
  onRequestSave: (payload: {
    userId: string
    userName: string
    name: string
    role: UserRole
    previousRole: UserRole
  }) => void
  saveLoading: boolean
}) {
  const [name, setName] = useState('')
  const [role, setRole] = useState<UserRole>('sales')

  useEffect(() => {
    if (!employee) return
    setName(employee.name)
    setRole(employee.role)
  }, [employee])

  if (!employee) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onRequestSave({
      userId: employee.id,
      userName: employee.name,
      name: trimmed,
      role,
      previousRole: employee.role,
    })
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      dir="rtl"
      onClick={() => {
        if (!saveLoading) onClose()
      }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-[32px] border border-slate-200 shadow-2xl p-8 space-y-5"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2 bg-primary/10 rounded-2xl text-primary">
            <Pencil size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-800">تعديل الموظف</h3>
            <p className="text-[11px] font-bold text-slate-400">تحديث الاسم أو صلاحية الدور.</p>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            الاسم الكامل
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
            الدور
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="sales">مندوب</option>
            <option value="admin">مدير</option>
          </select>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saveLoading}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-black text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saveLoading || !name.trim()}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-black hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saveLoading ? (
              <LoadingSpinner size="sm" className="border-white/30 border-t-white" />
            ) : null}
            حفظ
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

function AddEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await createEmployee({ email, password, name });
      if (res.ok === false) {
        toast.error(res.error);
        return;
      }
      toast.success('تمت إضافة الموظف بنجاح.');
      setName('');
      setEmail('');
      setPassword('');
      onCreated();
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8 space-y-5"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="p-2 bg-primary/10 rounded-2xl text-primary">
          <UserPlus size={20} />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-800">إضافة مندوب مبيعات</h3>
          <p className="text-[11px] font-bold text-slate-400">يُنشأ حساب مندوب فقط. حسابات المدير تُضاف من لوحة Supabase مباشرة.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">الاسم الكامل</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">البريد الإلكتروني</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">كلمة المرور</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 ps-12 pe-4 py-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary/30"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 start-0 flex items-center justify-center w-10 text-slate-400 hover:text-slate-700 focus:outline-none rounded-xl"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 text-sm font-black text-white shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
        >
          {pending ? (
            <>
              <LoadingSpinner size="sm" className="border-white/25 border-t-white" label="جاري إضافة الموظف" />
              جاري الإضافة…
            </>
          ) : (
            <>
              <UserPlus size={16} />
              إضافة الموظف
            </>
          )}
        </button>
      </div>
    </form>
  );
}
