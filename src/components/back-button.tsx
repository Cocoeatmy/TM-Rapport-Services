"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Retour"
      className="back-btn inline-flex items-center justify-center w-9 h-9 rounded-xl text-white/70 hover:text-white transition-colors"
    >
      <ArrowLeft className="w-5 h-5" />
    </button>
  );
}
