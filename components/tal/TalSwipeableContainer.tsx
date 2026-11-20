// components/tal/TalSwipeableContainer.tsx — porting src/components/tal/TalSwipeableContainer.tsx backup.
// Adaptasi WOORK: 'motion/react' -> 'framer-motion'.
'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TalSwipeableContainerProps {
  activeKey: string;
  onSwipeLeft: () => void; // Swipe ke kiri -> Konten bergerak ke kiri (Next)
  onSwipeRight: () => void; // Swipe ke kanan -> Konten bergerak ke kanan (Prev)
  children: React.ReactNode;
  threshold?: number;
}

// Variants untuk transisi push natural ala native smartphone
const pushVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 120 : direction < 0 ? -120 : 0,
    opacity: 0.4,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -120 : direction < 0 ? 120 : 0,
    opacity: 0,
  }),
};

export const TalSwipeableContainer: React.FC<TalSwipeableContainerProps> = ({
  activeKey,
  onSwipeLeft,
  onSwipeRight,
  children,
  threshold = 45
}) => {
  // direction: 1 = bergerak ke kiri (next), -1 = bergerak ke kanan (prev), 0 = initial
  const [direction, setDirection] = useState<number>(0);

  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isHorizontal = useRef<boolean | null>(null);

  // Touch Handlers (zero React re-renders during touchmove)
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

    // Detect horizontal swipe intention
    if (isHorizontal.current === null) {
      if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
        if (Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
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
      if (deltaX < -threshold) {
        // Swipe ke Kiri: Next
        setDirection(1);
        onSwipeLeft();
      } else if (deltaX > threshold) {
        // Swipe ke Kanan: Prev
        setDirection(-1);
        onSwipeRight();
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
      className="relative w-full min-h-[calc(100vh-280px)] flex flex-col flex-1 touch-pan-y select-none overflow-x-hidden"
    >
      <AnimatePresence custom={direction} mode="popLayout" initial={false}>
        <motion.div
          key={activeKey}
          custom={direction}
          variants={pushVariants}
          initial={direction !== 0 ? "enter" : false}
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 450, damping: 35, mass: 0.5 },
            opacity: { duration: 0.12 }
          }}
          className="w-full flex-1 flex flex-col will-change-transform"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TalSwipeableContainer;
