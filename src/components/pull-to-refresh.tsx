"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

export function PullToRefresh() {
  const [visible, setVisible] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isActive = useRef(false);
  const threshold = 100;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (window.scrollY > 0 || refreshing) return;
    startY.current = e.touches[0].clientY;
    isActive.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isActive.current || refreshing) return;
    const diff = e.touches[0].clientY - startY.current;
    if (diff > 10 && window.scrollY <= 0) {
      const d = Math.min(diff * 0.5, 150);
      setDistance(d);
      setPulling(true);
      setVisible(true);
    } else if (diff <= 0) {
      isActive.current = false;
      setPulling(false);
      setVisible(false);
      setDistance(0);
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isActive.current || !pulling) {
      isActive.current = false;
      return;
    }
    isActive.current = false;

    if (distance >= threshold) {
      setRefreshing(true);
      setDistance(60);
      setPulling(false);
      setTimeout(() => {
        window.location.reload();
      }, 400);
    } else {
      setPulling(false);
      setVisible(false);
      setDistance(0);
    }
  }, [pulling, distance]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  if (!visible) return null;

  const ready = distance >= threshold;

  return (
    <div
      className="fixed left-1/2 z-[100] transition-all duration-200"
      style={{
        top: `${Math.max(distance - 50, 10)}px`,
        transform: "translateX(-50%)",
      }}
    >
      <div className={`w-11 h-11 rounded-full shadow-xl flex items-center justify-center transition-colors duration-200 ${
        refreshing ? "bg-blue-500" : ready ? "bg-green-500" : "bg-white dark:bg-slate-800"
      } border-2 ${refreshing ? "border-blue-400" : ready ? "border-green-400" : "border-gray-200 dark:border-gray-600"}`}>
        <RefreshCw
          className={`w-5 h-5 transition-all duration-200 ${
            refreshing ? "text-white animate-spin" : ready ? "text-white" : "text-gray-400"
          }`}
          style={!refreshing ? { transform: `rotate(${distance * 2.5}deg)` } : undefined}
        />
      </div>
    </div>
  );
}
