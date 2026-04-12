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
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/90 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <ScanLine className="w-5 h-5" />
          <span className="font-medium text-sm">Scanner QR Code</span>
        </div>
        <button
          onClick={() => {
            if (scannerRef.current) scannerRef.current.stop().catch(() => {});
            onClose();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-500 text-white text-sm font-medium active:scale-95 transition-transform"
        >
          <X className="w-4 h-4" />
          Fermer
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-sm px-4">
          <div id="qr-reader" className="rounded-2xl overflow-hidden [&>video]:!w-full [&>video]:!h-auto [&>video]:!object-cover" style={{ maxHeight: "60vh" }} />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 bg-black/90 shrink-0 text-center">
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
