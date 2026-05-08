import React, { useState, useMemo, useEffect } from 'react';
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
  UserPlus
} from 'lucide-react';
import { Unit, UnitStatus, Block, User, UserRole } from './types';
import { legacyBlocksFromMapData } from './utils/legacyBlocksFromMap';
import { MapCanvas } from './components/map/MapCanvas';
import { useMapStore } from './store/mapStore';

interface CategoryConfig {
  basePrice: number;
  baseArea: number;
  cornerPremium: number;
  cornerAreaBonus: number;
}

const DEFAULT_CONFIGS: Record<'A' | 'B' | 'C', CategoryConfig> = {
  A: { basePrice: 250000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
  B: { basePrice: 220000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
  C: { basePrice: 180000000, baseArea: 200, cornerPremium: 15, cornerAreaBonus: 20 },
};

export default function App() {
  const [configs, setConfigs] = useState(DEFAULT_CONFIGS);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | UnitStatus>('all');
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [view, setView] = useState<'dashboard' | 'map' | 'settings' | 'sales_reports' | 'notifications' | 'profile' | 'users'>('map');
  const [currentUser, setCurrentUser] = useState<UserRole>(UserRole.ADMIN);
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'أحمد علي', email: 'ahmed@example.com', role: UserRole.ADMIN, createdAt: new Date().toISOString() },
    { id: '2', name: 'سارة محمد', email: 'sara@example.com', role: UserRole.SALES, createdAt: new Date().toISOString() },
  ]);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.SALES);
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
  const [editingUnitIdInTable, setEditingUnitIdInTable] = useState<string | null>(null);
  const [tempPriceInTable, setTempPriceInTable] = useState<number | string>('');
  const selectedPlotIdOnMap = useMapStore((s) => s.selectedPlotId);
  const hoveredPlotIdOnMap = useMapStore((s) => s.hoveredPlotId);
  const mapData = useMapStore((s) => s.map);
  const updateMapPlot = useMapStore((s) => s.updatePlot);

  const data = useMemo(() => legacyBlocksFromMapData(mapData), [mapData]);

  const soldUnits = useMemo(() => {
    return data.flatMap(b => b.units.filter(u => u.status === UnitStatus.SOLD));
  }, [data]);

  const recentSoldUnits = useMemo(() => {
    return [...soldUnits].slice(0, 10);
  }, [soldUnits]);

  const stats = useMemo(() => {
    let total = 0, sold = 0, reserved = 0;
    data.forEach(block => {
      block.units.forEach(unit => {
        total++;
        if (unit.status === UnitStatus.SOLD) sold++;
        if (unit.status === UnitStatus.RESERVED) reserved++;
      });
    });
    return {
      total, sold, reserved, available: total - sold - reserved,
      percentage: Math.round(((sold + reserved) / total) * 100)
    };
  }, [data]);

  const updateUnitPrice = (unitId: string, newPrice: number) => {
    updateMapPlot(unitId, { meta: { ...(mapData.plots.find((p) => p.id === unitId)?.meta ?? {}), price: newPrice } });
  };

  const handleBooking = (unitId: string, status: UnitStatus, name?: string, note?: string, durationHours?: number) => {
    const reservedUntilIso =
      (status === UnitStatus.RESERVED && durationHours)
        ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
        : undefined;
    const plot = mapData.plots.find((p) => p.id === unitId);
    if (plot) {
      updateMapPlot(unitId, {
        status: status as any,
        meta: {
          ...(plot.meta ?? {}),
          customerName: status !== UnitStatus.AVAILABLE ? name : undefined,
          note: status !== UnitStatus.AVAILABLE ? note : undefined,
          reservedAt: status === UnitStatus.RESERVED ? new Date().toISOString() : undefined,
          reservedUntil: reservedUntilIso,
        },
      });
    }

    // Reset fields
    setBookingName('');
    setBookingNote('');
  };

  const openUnitModal = (unit: Unit) => {
    setSelectedUnit(unit);
    setTempPrice(unit.price || 0);
    setIsEditingPrice(false);
  };

  const unitById = useMemo(() => {
    const m = new Map<string, Unit>();
    for (const b of data) for (const u of b.units) m.set(u.id, u);
    return m;
  }, [data]);

  const mapFocusedUnit = useMemo(() => {
    const id = hoveredPlotIdOnMap || selectedPlotIdOnMap;
    if (!id) return null;
    return unitById.get(id) || null;
  }, [hoveredPlotIdOnMap, selectedPlotIdOnMap, unitById]);

  useEffect(() => {
    if (!selectedPlotIdOnMap) return;
    const u = unitById.get(selectedPlotIdOnMap);
    if (u) openUnitModal(u);
  }, [selectedPlotIdOnMap, unitById]);

  const filteredData = useMemo(() => {
    return data.map(block => ({
      ...block,
      units: block.units.filter(u => {
        const matchesSearch = u.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesFilter = filter === 'all' || u.status === filter;
        return matchesSearch && matchesFilter;
      })
    })).filter(b => b.units.length > 0);
  }, [data, searchTerm, filter]);

  const updateAllPrices = (newConfigs: typeof configs) => {
    useMapStore.setState((s) => ({
      map: {
        ...s.map,
        plots: s.map.plots.map((plot) => {
          const meta = (plot.meta ?? {}) as Record<string, unknown>;
          const cat = meta.category as 'A' | 'B' | 'C' | undefined;
          if (!cat || !newConfigs[cat]) return plot;
          const cfg = newConfigs[cat];
          const isCorner = meta.unitType === 'ركن';
          return {
            ...plot,
            meta: {
              ...meta,
              price: isCorner ? cfg.basePrice * (1 + cfg.cornerPremium / 100) : cfg.basePrice,
              area: isCorner ? cfg.baseArea + cfg.cornerAreaBonus : cfg.baseArea,
            },
          };
        }),
      },
    }));
  };

  const handleAddUser = () => {
    if (!newUserName || !newUserEmail) return;
    const newUser: User = {
      id: Date.now().toString(),
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
      createdAt: new Date().toISOString()
    };
    setUsers([...users, newUser]);
    setNewUserName('');
    setNewUserEmail('');
    setIsAddUserModalOpen(false);
  };

  const removeUser = (id: string) => {
    setUsers(users.filter(u => u.id !== id));
  };

  return (
    <div className={`min-h-screen flex bg-slate-100 font-sans text-slate-800 selection:bg-primary/20 selection:text-primary ${view === 'map' ? 'overflow-visible' : 'overflow-hidden'}`} dir="rtl">
      {/* Role Switcher (For Demo Only) */}
      <div className="fixed bottom-4 left-4 z-[9999] flex gap-2">
        <button 
          onClick={() => {
            setCurrentUser(UserRole.ADMIN);
          }}
          className={`px-4 py-2 rounded-full text-[10px] font-black transition-all shadow-xl ${currentUser === UserRole.ADMIN ? 'bg-primary text-white' : 'bg-white text-slate-400 opacity-50'}`}
        >أدمن</button>
        <button 
          onClick={() => {
            setCurrentUser(UserRole.SALES);
            if (view === 'users') setView('map');
          }}
          className={`px-4 py-2 rounded-full text-[10px] font-black transition-all shadow-xl ${currentUser === UserRole.SALES ? 'bg-primary text-white' : 'bg-white text-slate-400 opacity-50'}`}
        >مندوب مبيعات</button>
      </div>
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
              <SidebarItem icon={<LayoutGrid size={20} />} label="لوحة التحكم" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
              <SidebarItem icon={<MapIcon size={20} />} label="خريطة المدينة" active={view === 'map'} onClick={() => setView('map')} />
              <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">الإحصائيات</div>
              <SidebarItem icon={<TrendingUp size={20} />} label="تقارير البيع" active={view === 'sales_reports'} onClick={() => setView('sales_reports')} />
              <SidebarItem icon={<Bell size={20} />} label="التنبيهات" badge={soldUnits.length.toString()} active={view === 'notifications'} onClick={() => setView('notifications')} />
              {currentUser === UserRole.ADMIN && (
                <>
                  <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">الإدارة</div>
                  <SidebarItem icon={<UsersIcon size={20} />} label="موظفي المبيعات" active={view === 'users'} onClick={() => setView('users')} />
                </>
              )}
            </nav>
            <div className="p-4 border-t border-slate-100 space-y-1">
              <SidebarItem icon={<UserIcon size={20} />} label="الملف الشخصي" active={view === 'profile'} onClick={() => setView('profile')} />
              <SidebarItem icon={<Settings size={20} />} label="الإعدادات" active={view === 'settings'} onClick={() => setView('settings')} />
              <SidebarItem icon={<LogOut size={20} />} label="خروج" className="text-red-500 hover:bg-red-50" />
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
          <header className="h-20 bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between shrink-0 z-40 pr-20">
          <div className="flex items-center gap-4 bg-slate-100 rounded-2xl px-4 py-2 w-full max-w-lg border border-slate-200/50">
            <Search size={18} className="text-slate-400" />
            <input 
              type="text" placeholder="ابحث عن وحدة أو بلوك..."
              className="bg-transparent border-none outline-none text-sm w-full font-medium"
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200/50 hidden md:flex">
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard label="إجمالي الوحدات" value={stats.total} icon={<Building2 className="text-blue-500" />} sub="الزون الأول" />
                  <StatCard label="الوحدات المباعة" value={stats.sold} icon={<CheckCircle2 className="text-primary" />} sub={`${stats.percentage}% مباع`} />
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
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">تقارير المبيعات التفصيلية</h2>
                  <div className="flex gap-4">
                    <div className="px-6 py-3 bg-primary text-white rounded-2xl shadow-lg flex items-center gap-3">
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
                          <span className="px-3 py-1 bg-primary/10 text-primary rounded-xl text-[10px] font-black">{blockSold.length} مبيع</span>
                        </div>
                        <div className="space-y-3">
                          <div className="flex justify-between text-xs font-bold text-slate-400">
                            <span>القيمة الإجمالية</span>
                            <span className="text-primary">{blockSold.reduce((acc, u) => acc + (u.price || 0), 0).toLocaleString()} IQD</span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${(blockSold.length / block.units.length) * 100}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-black text-slate-800">أحدث عمليات البيع</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">الوحدة</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">العميل</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">التصنيف</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">المساحة</th>
                          <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">القيمة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {soldUnits.map(unit => (
                          <tr key={unit.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openUnitModal(unit)}>
                            <td className="p-4 font-black">وحدة {unit.id}</td>
                            <td className="p-4 font-bold text-slate-700">{unit.customerName || 'غير محدد'}</td>
                            <td className="p-4"><span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-black">تصنيف {unit.category}</span></td>
                            <td className="p-4 font-medium text-slate-500">{unit.area} م²</td>
                            <td className="p-4 text-left font-black text-primary">{unit.price?.toLocaleString()} IQD</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : view === 'notifications' ? (
              <motion.div key="notifications" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="h-full overflow-y-auto p-8 space-y-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">التنبيهات والنشاطات</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight">سجل العمليات الأخير للمشروع</p>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-[24px] shadow-sm flex items-center gap-4">
                    <Bell className="text-amber-500" />
                    <span className="font-black text-lg tabular-nums">{soldUnits.length}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {soldUnits.map((unit, idx) => (
                    <motion.div 
                      key={unit.id + idx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => openUnitModal(unit)}
                    >
                      <div className="shrink-0 w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                        <CheckCircle2 size={24} />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-black text-slate-800">تم بيع الوحدة {unit.id}</h4>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">منذ قليل</span>
                        </div>
                        <p className="text-sm text-slate-500 font-medium leading-relaxed" dir="rtl">
                          تم تسجيل الوحدة رقم <span className="font-bold text-slate-800">{unit.number}</span> في <span className="font-bold text-slate-800">{unit.block}</span> باسم <span className="font-black text-primary">{unit.customerName || 'عميل مجهول'}</span>.
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  {soldUnits.length === 0 && (
                    <div className="py-20 text-center text-slate-300">
                      <Bell size={48} className="mx-auto mb-4 opacity-20" />
                      <p className="font-black text-xl">لا توجد تنبيهات حالية</p>
                      <p className="text-sm font-bold opacity-60">سيتم عرض النشاطات هنا عند حجز الوحدات</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : view === 'profile' ? (
              <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} className="h-full overflow-y-auto p-12 flex flex-col items-center">
                <div className="w-full max-w-2xl bg-white rounded-[48px] border border-slate-200 shadow-2xl overflow-hidden flex flex-col items-center p-12 relative">
                   <div className="absolute top-0 left-0 right-0 h-40 bg-primary/5 -z-10" />
                   <div className="w-32 h-32 rounded-[40px] bg-white border-4 border-white shadow-2xl flex items-center justify-center text-primary mb-6 group overflow-hidden">
                     <UserIcon size={64} className="group-hover:scale-110 transition-transform" />
                   </div>
                   <h2 className="text-4xl font-black text-slate-900 tracking-tight">{currentUser === UserRole.ADMIN ? 'أدمن مبيعات' : 'مندوب مبيعات'}</h2>
                   <p className="text-slate-400 font-bold mb-8 uppercase tracking-widest text-xs">مشروع شط العرب السكني</p>
                   
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

                   <button className="mt-12 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-50 px-8 py-3 rounded-2xl transition-all">
                     تسجيل الخروج من النظام
                   </button>
                </div>
              </motion.div>
            ) : view === 'users' ? (
              <motion.div key="users" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="h-full overflow-y-auto p-12 flex flex-col gap-8">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-4xl font-black text-slate-900 tracking-tight">موظفي المبيعات</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight">إدارة صلاحيات فريق العمل للوصول إلى الخريطة والوحدات</p>
                  </div>
                  <button 
                    onClick={() => setIsAddUserModalOpen(true)}
                    className="px-8 py-4 bg-primary text-white rounded-[24px] font-black shadow-lg shadow-primary/20 hover:scale-105 transition-transform flex items-center gap-3"
                  >
                    <UserPlus size={20} />
                    <span>إضافة مندوب جديد</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {users.map(user => (
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
                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase ${user.role === UserRole.ADMIN ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                          {user.role === UserRole.ADMIN ? 'مدير' : 'مندوب'}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-800">{user.name}</h3>
                        <p className="text-sm font-medium text-slate-400">{user.email}</p>
                      </div>
                      <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                         <span className="text-[10px] font-bold text-slate-300">تمت الإضافة {new Date(user.createdAt).toLocaleDateString()}</span>
                         {user.id !== '1' && (
                           <button 
                             onClick={() => removeUser(user.id)}
                             className="text-[10px] font-black text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                           >حذف الموظف</button>
                         )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            ) : view === 'settings' ? (
              <motion.div key="settings" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} className="h-full overflow-hidden flex flex-col p-8 gap-6">
                <div className="flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">إعدادات المشروع العام</h2>
                    <p className="text-slate-400 font-bold mt-1 tracking-tight uppercase">التحكم بالأسعار والمساحات لجميع الفئات</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => { setConfigs(DEFAULT_CONFIGS); updateAllPrices(DEFAULT_CONFIGS); }}
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
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">السعر الأساسي (IQD)</label>
                          <input 
                            type="number" 
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 font-black text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                            value={configs[cat].basePrice}
                            onChange={(e) => {
                              const newCfgs = { ...configs, [cat]: { ...configs[cat], basePrice: Number(e.target.value) } };
                              setConfigs(newCfgs);
                              updateAllPrices(newCfgs);
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
                                updateAllPrices(newCfgs);
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
                                updateAllPrices(newCfgs);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex-1 bg-white rounded-[40px] border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <span className="text-xs font-black text-slate-800 uppercase tracking-tight">معاينة قائمة الوحدات المحدثة</span>
                    <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm scale-90 origin-left">
                      {['الكل', 'A', 'B', 'C'].map((cat) => (
                        <button key={cat} onClick={() => setSearchTerm(cat === 'الكل' ? '' : cat)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${ (cat === 'الكل' && searchTerm === '') || searchTerm === cat ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600' }`}> {cat === 'الكل' ? 'الكل' : `تصنيف ${cat}`} </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-right border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">الوحدة</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">النوع</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">المساحة</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">العميل</th>
                          <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">السعر المحدث</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {data.flatMap(b => b.units)
                          .filter(u => !searchTerm || u.category === searchTerm || u.id.includes(searchTerm))
                          .slice(0, 50).map(unit => (
                          <tr key={unit.id} className="hover:bg-slate-50/50 transition-colors group cursor-pointer" onClick={() => openUnitModal(unit)}>
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
                                        updateUnitPrice(unit.id, val);
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="p-4 border-t border-slate-50 text-center bg-slate-50/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic flex items-center justify-center gap-2">
                       <Save size={12} /> التعديلات تحفظ تلقائياً في ذاكرة المتصفح الحالية
                    </p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`h-full flex flex-col md:flex-row overflow-visible min-h-0 min-w-0 ${isFullscreen ? 'p-0 gap-0' : 'p-6 gap-6'}`}>
                <div className={`flex-1 min-w-0 bg-white ${isFullscreen ? 'rounded-0' : 'rounded-[40px] border border-slate-200 shadow-2xl'} overflow-visible relative flex flex-col min-h-0`}>
                  <div className={`p-6 border-b border-slate-100 flex justify-between items-center bg-white/80 backdrop-blur-md z-10 ${isFullscreen ? 'sticky top-0' : ''}`}>
                    <div>
                      <h3 className="font-black text-slate-800 text-lg">مخطط الزون الأول</h3>
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
                          فتح إجراءات الوحدة
                        </button>
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-500 space-y-2 px-2">
                        <MapIcon size={28} className="mx-auto opacity-25" />
                        <p className="text-xs font-bold leading-relaxed">
                          حرّك المؤشر فوق أي قطعة لعرض التفاصيل، أو انقر القطعة لفتح إجراءات الوحدة.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-900 rounded-[32px] p-6 text-white shadow-2xl relative overflow-hidden grow flex flex-col">
                    <Building2 className="absolute -bottom-6 -left-6 opacity-10" size={120} />
                    <h4 className="text-lg font-black mb-4">ملخص الزون</h4>
                    <div className="space-y-4 relative z-10 flex-1">
                      <div className="flex justify-between text-xs font-bold opacity-60"><span>نسبة المبيع الكلية</span><span>{stats.percentage}%</span></div>
                      <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${stats.percentage}%` }} className="h-full bg-primary shadow-[0_0_15px_rgba(29,49,94,0.5)]" />
                      </div>
                      <div className="pt-4 grid grid-cols-1 gap-4">
                        <div className="flex items-end gap-3">
                          <p className="text-4xl font-black">{stats.sold}</p>
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
                  selectedUnit.status === UnitStatus.SOLD ? 'bg-primary/10 text-primary' : 
                  selectedUnit.status === UnitStatus.RESERVED ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'}`}>
                  {selectedUnit.status === UnitStatus.SOLD ? 'محجوزة نهائياً' : 
                   selectedUnit.status === UnitStatus.RESERVED ? 'حجز مبدئي' : 
                   'متاحة للبيع'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 py-4 border-y border-slate-100">
                <DetailRow label="كود العقار" value={selectedUnit.id} />
                <DetailRow label="التصنيف" value={`تصنيف ${selectedUnit.category || 'N/A'}`} />
                <DetailRow label="النوع" value={selectedUnit.unitType || 'عادي'} />
                <DetailRow label="المساحة" value={`${selectedUnit.area || 200} م²`} />
                <DetailRow label="الحالة" value={selectedUnit.status === UnitStatus.SOLD ? 'محجوز نهائياً' : selectedUnit.status === UnitStatus.RESERVED ? 'حجز مبدئي' : 'متاح'} />
                <div className="space-y-1 relative group">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">السعر</p>
                  {isEditingPrice ? (
                    <div className="flex items-center gap-2 mt-1">
                      <input 
                        type="number"
                        className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 font-black text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary/20"
                        value={tempPrice}
                        onChange={(e) => setTempPrice(e.target.value)}
                        autoFocus
                      />
                      <button 
                        onClick={() => {
                          const val = Number(tempPrice);
                          if (!isNaN(val)) {
                            updateUnitPrice(selectedUnit.id, val);
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
                        {selectedUnit.price?.toLocaleString()} <span className="text-[10px] opacity-40">IQD</span>
                      </p>
                      {currentUser === UserRole.ADMIN && (
                        <button 
                          onClick={() => {
                            setTempPrice(selectedUnit.price || 0);
                            setIsEditingPrice(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-primary hover:bg-primary/10 rounded-md text-[10px] font-bold"
                        >تعديل</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedUnit.status === UnitStatus.AVAILABLE ? (
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
              ) : (
                <div className="space-y-4 bg-primary/10 p-6 rounded-3xl border border-primary/20">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-primary uppercase tracking-widest">اسم الحاجز</span>
                    <span className="text-lg font-black text-primary">{selectedUnit.customerName || 'غير محدد'}</span>
                  </div>
                  {selectedUnit.status === UnitStatus.RESERVED && selectedUnit.reservedUntil && (
                     <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">ينتهي الحجز في</span>
                        <span className="text-sm font-bold text-amber-700">{new Date(selectedUnit.reservedUntil).toLocaleString('ar-IQ')}</span>
                     </div>
                  )}
                  {selectedUnit.note && (
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-primary uppercase tracking-widest">الملاحظات</span>
                      <p className="text-sm font-medium text-primary leading-relaxed">{selectedUnit.note}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 mt-2">
                {selectedUnit.status === UnitStatus.AVAILABLE ? (
                  <div className="flex gap-3">
                    <button 
                      onClick={() => { 
                        handleBooking(selectedUnit.id, UnitStatus.SOLD, bookingName, bookingNote);
                        setSelectedUnit(null); 
                      }} 
                      className="flex-1 py-5 rounded-3xl bg-primary text-white font-black text-lg shadow-xl shadow-primary/20 hover:bg-primary transition-all"
                    >تأكيد الحجز النهائي</button>
                    <button 
                      onClick={() => { 
                        handleBooking(selectedUnit.id, UnitStatus.RESERVED, bookingName, bookingNote, reservationDuration);
                        setSelectedUnit(null); 
                      }} 
                      className="flex-1 py-5 rounded-3xl bg-amber-500 text-white font-black text-lg shadow-xl shadow-amber-200 hover:bg-amber-600 transition-all"
                    >حجز مبدئي</button>
                  </div>
                ) : (
                  <button 
                    onClick={() => { 
                      handleBooking(selectedUnit.id, UnitStatus.AVAILABLE);
                      setSelectedUnit(null); 
                    }} 
                    className="w-full py-5 rounded-3xl bg-slate-100 text-slate-700 font-black text-lg hover:bg-slate-200 transition-all"
                  >إلغاء الحجز</button>
                )}
                <button 
                  onClick={() => {
                    setSelectedUnit(null);
                    setBookingName('');
                    setBookingNote('');
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

      <AnimatePresence>
        {isAddUserModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-white w-full max-w-md rounded-[40px] p-10 shadow-2xl flex flex-col gap-6">
              <h3 className="text-3xl font-black text-slate-900">إضافة موظف مبيعات</h3>
              <div className="space-y-4 text-right">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">الاسم الكامل</label>
                  <input 
                    type="text" 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="اسم المندوب..."
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">البريد الإلكتروني</label>
                  <input 
                    type="email" 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="email@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">الدور الوظيفي</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setNewUserRole(UserRole.SALES)}
                      className={`py-3 rounded-2xl font-black text-xs border-2 transition-all ${newUserRole === UserRole.SALES ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-400'}`}
                    >مندوب مبيعات</button>
                    <button 
                      onClick={() => setNewUserRole(UserRole.ADMIN)}
                      className={`py-3 rounded-2xl font-black text-xs border-2 transition-all ${newUserRole === UserRole.ADMIN ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 text-slate-400'}`}
                    >مدير مبيعات</button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={handleAddUser}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-primary transition-colors"
                >إرسال دعوة</button>
                <button 
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-colors"
                >إلغاء</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
      unit.status === UnitStatus.SOLD ? 'border-primary bg-primary text-white shadow-primary/20' : 
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
