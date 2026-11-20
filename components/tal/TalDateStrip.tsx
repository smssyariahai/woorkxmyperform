// components/tal/TalDateStrip.tsx — porting src/components/tal/TalDateStrip.tsx backup.
// Adaptasi WOORK: 'motion/react' -> 'framer-motion'; DayInfo dari lib/tal/date.
'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DayInfo } from '@/lib/tal/date';

interface TalDateStripProps {
  days: DayInfo[];
  selectedDateStr: string;
  onSelectDate: (dateStr: string) => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  taskCountsByDate?: Record<string, number>;
  cutiDates?: Set<string>;
  holidayMap?: Map<string, string>; // dateStr -> holidayTitle
}

const stripPushVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : direction < 0 ? '-100%' : 0,
    opacity: 0.8,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : direction < 0 ? '100%' : 0,
    opacity: 0.8,
  }),
};

export const TalDateStrip: React.FC<TalDateStripProps> = ({
  days,
  selectedDateStr,
  onSelectDate,
  onPrevWeek,
  onNextWeek,
  taskCountsByDate = {},
  cutiDates = new Set(),
  holidayMap = new Map()
}) => {
  const [direction, setDirection] = useState<number>(0);

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isHorizontal = useRef<boolean | null>(null);

  const weekKey = days.length > 0 ? days[0].dateStr : 'week_strip';

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      isHorizontal.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - startX.current;
    const deltaY = currentY - startY.current;

    if (isHorizontal.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
          isHorizontal.current = true;
        } else {
          isHorizontal.current = false;
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;

    const endTouch = e.changedTouches[0];
    if (endTouch && isHorizontal.current === true) {
      const deltaX = endTouch.clientX - startX.current;
      if (deltaX < -35) {
        // Swipe ke kiri -> Next week
        setDirection(1);
        onNextWeek?.();
      } else if (deltaX > 35) {
        // Swipe ke kanan -> Prev week
        setDirection(-1);
        onPrevWeek?.();
      }
    }

    startX.current = null;
    startY.current = null;
    isHorizontal.current = null;
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="bg-white rounded-xl border border-slate-200/80 p-1.5 sm:p-2 shadow-xs touch-pan-y select-none overflow-hidden"
    >
      <AnimatePresence custom={direction} mode="popLayout" initial={false}>
        <motion.div
          key={weekKey}
          custom={direction}
          variants={stripPushVariants}
          initial={direction !== 0 ? "enter" : false}
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 450, damping: 35, mass: 0.5 },
            opacity: { duration: 0.12 }
          }}
          className="grid grid-cols-7 gap-1 sm:gap-2 will-change-transform"
        >
          {days.map((day) => {
            const isSelected = day.dateStr === selectedDateStr;
            const isCuti = cutiDates.has(day.dateStr);
            const holidayTitle = holidayMap.get(day.dateStr);
            const isRedDay = day.isSunday || !!holidayTitle;

            // Determine border & background styles cleanly without Tailwind class collisions
            let cardStyle = '';
            if (day.isToday) {
              if (isSelected) {
                if (isRedDay) {
                  cardStyle = 'bg-rose-100 text-rose-950 shadow-md border-2 border-blue-600 ring-2 ring-white z-10 font-extrabold';
                } else if (isCuti) {
                  cardStyle = 'bg-amber-100 text-amber-950 shadow-md border-2 border-blue-600 ring-2 ring-white z-10 font-extrabold';
                } else {
                  cardStyle = 'bg-blue-600 text-white shadow-md border-2 border-blue-600 ring-2 ring-white z-10 font-extrabold';
                }
              } else if (isCuti) {
                cardStyle = 'bg-amber-50/90 hover:bg-amber-100 text-amber-950 border-2 border-blue-600 shadow-xs';
              } else if (isRedDay) {
                cardStyle = 'bg-rose-50/90 hover:bg-rose-100 text-rose-950 border-2 border-blue-600 shadow-xs';
              } else {
                cardStyle = 'bg-blue-50/60 hover:bg-blue-100/70 text-blue-950 border-2 border-blue-600 shadow-xs';
              }
            } else if (isSelected) {
              if (isRedDay) {
                cardStyle = 'bg-rose-100 hover:bg-rose-200/90 text-rose-950 shadow-md border-2 border-slate-900 ring-2 ring-white z-10 font-extrabold';
              } else if (isCuti) {
                cardStyle = 'bg-amber-100 hover:bg-amber-200/90 text-amber-950 shadow-md border-2 border-slate-900 ring-2 ring-white z-10 font-extrabold';
              } else {
                cardStyle = 'bg-slate-900 text-white shadow-sm border-2 border-slate-900 ring-2 ring-white z-10';
              }
            } else if (isCuti) {
              cardStyle = 'bg-amber-50/80 hover:bg-amber-100/90 text-amber-900 border border-amber-300/80';
            } else if (isRedDay) {
              cardStyle = 'bg-rose-50/70 hover:bg-rose-100/80 text-rose-900 border border-rose-200/70';
            } else {
              cardStyle = 'bg-slate-50/70 hover:bg-slate-100 text-slate-700 border border-transparent';
            }

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => onSelectDate(day.dateStr)}
                title={
                  holidayTitle
                    ? `Hari Libur: ${holidayTitle}`
                    : day.isSunday
                    ? 'Hari Minggu (Libur Mingguan)'
                    : isCuti
                    ? 'Hari Cuti'
                    : undefined
                }
                className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer relative ${cardStyle}`}
              >
                {/* Day Name (Red for Sunday or Holiday) */}
                <span
                  className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider ${
                    isRedDay
                      ? 'text-rose-600 font-extrabold'
                      : isCuti
                      ? 'text-amber-800 font-bold'
                      : isSelected
                      ? 'text-slate-200'
                      : 'text-slate-500'
                  }`}
                >
                  {day.dayName}
                </span>

                {/* Day Number (Red for Sunday or Holiday) */}
                <span
                  className={`text-sm sm:text-base font-extrabold leading-tight ${
                    isRedDay
                      ? 'text-rose-600'
                      : isCuti
                      ? 'text-slate-900'
                      : isSelected
                      ? 'text-white'
                      : 'text-slate-800'
                  }`}
                >
                  {day.dayNumber}
                </span>

                {/* Holiday or Cuti Badge */}
                {isCuti ? (
                  <span className={`text-[8px] font-bold px-1 rounded leading-none mt-0.5 ${
                    isSelected ? 'bg-amber-200 text-amber-950' : 'bg-amber-200 text-amber-900'
                  }`}>
                    Cuti
                  </span>
                ) : holidayTitle ? (
                  <span className={`text-[8px] font-bold px-1 rounded leading-none mt-0.5 truncate max-w-[48px] ${
                    isSelected ? 'bg-rose-200 text-rose-800' : 'bg-rose-100 text-rose-700'
                  }`}>
                    Libur
                  </span>
                ) : day.isSunday ? (
                  <span className={`text-[8px] font-bold px-1 rounded leading-none mt-0.5 ${
                    isSelected ? 'bg-rose-200 text-rose-800' : 'text-rose-400 opacity-60'
                  }`}>
                    Libur
                  </span>
                ) : null}
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TalDateStrip;
