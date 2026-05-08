import React from 'react'

export function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-20 rounded-2xl bg-white/95 shadow-xl border border-slate-200/80 backdrop-blur-md px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Status</p>
      <div className="flex flex-col gap-2 text-xs font-semibold text-slate-800">
        <div className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-sm bg-green-300 border border-green-800" />
          Available
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-sm bg-yellow-300 border border-yellow-700" />
          Reserved
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-sm bg-slate-400 border border-slate-600" />
          Sold
        </div>
      </div>
    </div>
  )
}
