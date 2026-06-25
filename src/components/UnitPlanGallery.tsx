import React, { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Maximize2, X } from 'lucide-react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'

type Props = {
  images: string[]
}

export function UnitPlanGallery({ images }: Props) {
  const [visibleImages, setVisibleImages] = useState<string[]>(images)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    setVisibleImages(images)
    setLightboxIndex(null)
  }, [images])

  const handleThumbError = useCallback((src: string) => {
    setVisibleImages((prev) => prev.filter((url) => url !== src))
  }, [])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])

  const goPrev = useCallback(() => {
    setLightboxIndex((i) => (i == null ? null : (i - 1 + visibleImages.length) % visibleImages.length))
  }, [visibleImages.length])

  const goNext = useCallback(() => {
    setLightboxIndex((i) => (i == null ? null : (i + 1) % visibleImages.length))
  }, [visibleImages.length])

  useEffect(() => {
    if (lightboxIndex == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox()
      if (e.key === 'ArrowRight') goPrev()
      if (e.key === 'ArrowLeft') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, closeLightbox, goPrev, goNext])

  if (visibleImages.length === 0) return null

  return (
    <>
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
          مخطط الوحدة
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {visibleImages.map((src, index) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightboxIndex(index)}
              className="group relative shrink-0 w-[calc(33.333%-0.35rem)] min-w-[88px] aspect-[4/3] rounded-2xl overflow-hidden border-2 border-slate-100 hover:border-primary/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <img
                src={src}
                alt={`مخطط الوحدة ${index + 1}`}
                className="w-full h-full object-cover"
                onError={() => handleThumbError(src)}
              />
              <span className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/20 transition-colors flex items-center justify-center">
                <Maximize2
                  size={18}
                  className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md"
                />
              </span>
            </button>
          ))}
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {lightboxIndex != null && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-label="معرض مخطط الوحدة"
              >
                <button
                  type="button"
                  className="absolute inset-0 bg-slate-900/85 backdrop-blur-sm"
                  onClick={closeLightbox}
                  aria-label="إغلاق"
                />
                <div className="relative z-10 w-full max-w-4xl flex flex-col items-center gap-4">
                  <button
                    type="button"
                    onClick={closeLightbox}
                    className="absolute -top-2 left-0 z-20 p-2 rounded-full bg-slate-900/80 text-white shadow-lg ring-2 ring-white/40 backdrop-blur-sm hover:bg-slate-900 transition-colors"
                    aria-label="إغلاق"
                  >
                    <X size={22} />
                  </button>

                  <p className="text-white/80 text-sm font-bold tabular-nums">
                    {lightboxIndex + 1} / {visibleImages.length}
                  </p>

                  <div className="relative w-full h-[min(70vh,520px)] rounded-2xl overflow-hidden bg-slate-950/50">
                    <TransformWrapper
                      key={visibleImages[lightboxIndex]}
                      initialScale={1}
                      minScale={1}
                      maxScale={4}
                      centerOnInit
                      doubleClick={{ mode: 'zoomIn', step: 0.7 }}
                      pinch={{ step: 5 }}
                    >
                      <TransformComponent
                        wrapperClass="!w-full !h-full"
                        contentClass="!w-full !h-full flex items-center justify-center"
                      >
                        <img
                          src={visibleImages[lightboxIndex]}
                          alt={`مخطط الوحدة ${lightboxIndex + 1}`}
                          className="max-w-full max-h-[min(70vh,520px)] object-contain select-none"
                          draggable={false}
                        />
                      </TransformComponent>
                    </TransformWrapper>

                    {visibleImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={goNext}
                          className="absolute top-1/2 -translate-y-1/2 right-3 z-20 p-2.5 rounded-full bg-slate-900/80 text-white shadow-lg ring-2 ring-white/40 backdrop-blur-sm hover:bg-slate-900 transition-colors"
                          aria-label="التالي"
                        >
                          <ChevronRight size={24} strokeWidth={2.5} />
                        </button>
                        <button
                          type="button"
                          onClick={goPrev}
                          className="absolute top-1/2 -translate-y-1/2 left-3 z-20 p-2.5 rounded-full bg-slate-900/80 text-white shadow-lg ring-2 ring-white/40 backdrop-blur-sm hover:bg-slate-900 transition-colors"
                          aria-label="السابق"
                        >
                          <ChevronLeft size={24} strokeWidth={2.5} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
