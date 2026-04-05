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
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center">
      <div className="w-full max-w-sm px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-white">
            <ScanLine className="w-5 h-5" />
            <span className="font-medium">Scanner QR Code</span>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
        <div id="qr-reader" className="rounded-2xl overflow-hidden" />
        {error && (
          <p className="text-red-400 text-sm text-center mt-4">{error}</p>
        )}
        <p className="text-white/60 text-xs text-center mt-4">
          Pointez la caméra vers le QR code de la cabine
        </p>
      </div>
    </div>
  );
}
