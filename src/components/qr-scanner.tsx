"use client";

import { useEffect, useRef, useState } from "react";
import { X, ScanLine } from "lucide-react";

interface QRScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
}

export function QRScanner({ onScan, onClose }: QRScannerProps) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let scanner: any = null;

    import("html5-qrcode").then(({ Html5Qrcode }) => {
      scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;

      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text: string) => {
          scanner.stop().then(() => {
            onScan(text);
          });
        },
        () => {} // ignore errors during scanning
      ).catch((err: any) => {
        setError("Impossible d'accéder à la caméra");
        console.error(err);
      });
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
      {/* Close button - always on top */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => {
            if (scannerRef.current) scannerRef.current.stop().catch(() => {});
            onClose();
          }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold active:scale-95 transition-transform shadow-lg"
        >
          <X className="w-4 h-4" />
          Fermer
        </button>
      </div>

      {/* Title - top */}
      <div className="absolute top-5 left-4 flex items-center gap-2 text-white z-10">
        <ScanLine className="w-5 h-5" />
        <span className="font-medium text-sm">Scanner QR Code</span>
      </div>

      {/* Scanner area - centered */}
      <div
        id="qr-reader"
        className="w-[85vw] h-[85vw] max-w-[400px] max-h-[400px] rounded-2xl overflow-hidden"
        style={{ position: "relative" }}
      />

      {/* Info text - bottom */}
      <div className="absolute bottom-8 left-0 right-0 text-center px-4">
        {error && (
          <p className="text-red-400 text-sm mb-2">{error}</p>
        )}
        <p className="text-white/60 text-xs">
          Pointez la caméra vers le QR code de la cabine
        </p>
      </div>
    </div>
  );
}
