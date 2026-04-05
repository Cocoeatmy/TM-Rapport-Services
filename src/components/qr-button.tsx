"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine } from "lucide-react";
import { QRScanner } from "./qr-scanner";
import { toast } from "sonner";

export function QRButton() {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);

  const handleScan = async (result: string) => {
    setShowScanner(false);

    // Si c'est un OFR TM (ex: TM-2600219)
    if (result.match(/^TM-\d+$/i)) {
      toast.info(`Recherche du projet ${result}...`);
      try {
        const res = await fetch("/api/projects");
        const projects = await res.json();
        if (Array.isArray(projects)) {
          const found = projects.find((p: any) =>
            p.ofrTM.toLowerCase() === result.toLowerCase()
          );
          if (found) {
            router.push(`/projet/${found.id}?mode=cmd`);
            return;
          }
        }
      } catch {}
      toast.error(`Projet ${result} introuvable`);
      return;
    }

    // Si c'est une URL de l'app
    if (result.includes("/projet/")) {
      router.push(result);
      return;
    }

    // Si c'est un ID Notion
    if (result.match(/^[a-f0-9-]{36}$/)) {
      router.push(`/projet/${result}?mode=cmd`);
      return;
    }

    // Recherche par texte
    toast.info(`Recherche: ${result}`);
    router.push(`/?search=${encodeURIComponent(result)}`);
  };

  return (
    <>
      <button
        onClick={() => setShowScanner(true)}
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-colors"
      >
        <ScanLine className="w-4 h-4" />
      </button>
      {showScanner && (
        <QRScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}
    </>
  );
}
