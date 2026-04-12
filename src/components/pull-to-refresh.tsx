"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export function PullToRefresh() {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const threshold = 80;

  useEffect(() => {
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      // Only activate when scrolled to top
      if (window.scrollY > 5) return;
      startY.current = e.touches[0].clientY;
      active = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0 && window.scrollY <= 0) {
        setPulling(true);
        setPullDistance(Math.min(diff * 0.4, 120));
      }
    };

    const onTouchEnd = () => {
      if (!active || !pulling) { active = false; return; }
      active = false;
      if (pullDistance >= threshold) {
        setRefreshing(true);
        setPullDistance(50);
        // Simple page reload
        setTimeout(() => {
          window.location.reload();
        }, 300);
      } else {
        setPulling(false);
        setPullDistance(0);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pulling, pullDistance, refreshing]);

  if (!pulling && !refreshing) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[60] flex items-center justify-center transition-transform duration-200"
      style={{ top: 0, transform: `translateY(${pullDistance - 40}px)` }}
    >
      <div className={`w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center border border-gray-200 dark:border-gray-700 ${refreshing ? "" : ""}`}>
        <RefreshCw
          className={`w-5 h-5 text-blue-500 transition-transform duration-200 ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${pullDistance * 3}deg)` }}
        />
      </div>
    </div>
  );
}
