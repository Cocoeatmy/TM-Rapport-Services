"use client";

import { useEffect } from "react";
import { installerAppApple } from "@/lib/app-apple";

/**
 * Installe le pont vers l'application Apple quand le site y tourne.
 * N'affiche rien, et ne fait rien dans un navigateur.
 */
export function PontApple() {
  useEffect(() => { installerAppApple(); }, []);
  return null;
}
