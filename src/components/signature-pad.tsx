"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Eraser, Check } from "lucide-react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  existingSignature?: string;
  label?: string;
}

export function SignaturePad({ onSave, existingSignature, label = "Signature du client" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(!!existingSignature);
  const [saved, setSaved] = useState(!!existingSignature);
  const [ready, setReady] = useState(false);

  // Si la signature change après le mount (chargement asynchrone depuis
  // Notion ou polling collaboratif), on aligne les états internes pour
  // que l'UI reflète qu'une signature existe (pas de placeholder, pas
  // de bouton "Valider"). Indispensable : sans ça, après navigation le
  // canvas affiche bien la signature mais l'overlay "Signez ici" reste.
  useEffect(() => {
    if (existingSignature) {
      setHasSignature(true);
      setSaved(true);
    }
  }, [existingSignature]);

  // Initialize canvas with correct dimensions
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return; // Not visible yet

    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = 160 * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = "160px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#1e3a5f";

    // Restore existing signature.
    //
    // ⚠️ Important : on charge l'image avec crossOrigin="anonymous"
    // AVANT de poser src. Sans ça, dessiner une image cross-origin
    // (URL Cloudinary) dans le canvas le marque comme "tainted" :
    // toute tentative ultérieure de canvas.toDataURL() échoue avec
    // une SecurityError silencieuse → après "Effacer" + re-signature,
    // l'appui sur "Valider" ne déclenchait plus rien (onSave jamais
    // appelé) et la signature ne se sauvegardait pas.
    // Cloudinary sert correctement les en-têtes CORS, donc l'image
    // se charge sans souci en mode anonymous.
    if (existingSignature) {
      const img = new Image();
      // Pour les data: URLs (signature fraîchement validée pas encore
      // uploadée), pas besoin de CORS. Pour les URLs http(s), oui.
      if (!existingSignature.startsWith("data:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        try {
          ctx.drawImage(img, 0, 0, rect.width, 160);
        } catch {
          // Si jamais l'image n'est pas chargeable en CORS, on tombe
          // dans ce catch — on ne dessine rien plutôt que de tainter
          // le canvas. L'utilisateur peut quand même re-signer.
        }
      };
      img.onerror = () => {
        // Image distante inaccessible (réseau / CORS) — on ne fait
        // rien. Le canvas reste vide mais reste utilisable.
      };
      img.src = existingSignature;
    }

    setReady(true);
  }, [existingSignature]);

  useEffect(() => {
    // Tentative immédiate (cas nominal — container déjà visible)
    let raf = requestAnimationFrame(() => initCanvas());

    // Fallback ResizeObserver : si le conteneur est dans un layout
    // encore invisible (width=0) au moment du RAF, initCanvas() retourne
    // sans setReady(true) → les events de dessin ne sont jamais attachés.
    // Le ResizeObserver re-déclenche initCanvas() dès que le conteneur
    // acquiert une largeur non nulle (ex: carte révélée par scroll).
    const container = containerRef.current;
    let ro: ResizeObserver | undefined;
    if (container && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if ((entry.contentRect?.width ?? 0) > 0) {
            initCanvas();
          }
        }
      });
      ro.observe(container);
    }

    const handleResize = () => initCanvas();
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [initCanvas]);

  const getPos = (e: TouchEvent | MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    if ("clientX" in e) {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
    return null;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ready) return;

    const getCtx = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // Réapplique les styles car ils peuvent être perdus si le canvas
      // a été redimensionné (canvas.width= reset tout le contexte).
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#1e3a5f";
      return ctx;
    };

    const handleStart = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      const ctx = getCtx();
      if (!ctx) return;
      const pos = getPos(e);
      if (!pos) return;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      drawingRef.current = true;
      setHasSignature(true);
      setSaved(false);
    };

    const handleMove = (e: TouchEvent | MouseEvent) => {
      e.preventDefault();
      if (!drawingRef.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const pos = getPos(e);
      if (!pos) return;
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };

    const handleEnd = () => {
      drawingRef.current = false;
    };

    // Use native event listeners with { passive: false } for touch
    canvas.addEventListener("mousedown", handleStart);
    canvas.addEventListener("mousemove", handleMove);
    canvas.addEventListener("mouseup", handleEnd);
    canvas.addEventListener("mouseleave", handleEnd);
    canvas.addEventListener("touchstart", handleStart, { passive: false });
    canvas.addEventListener("touchmove", handleMove, { passive: false });
    canvas.addEventListener("touchend", handleEnd);
    canvas.addEventListener("touchcancel", handleEnd);

    return () => {
      canvas.removeEventListener("mousedown", handleStart);
      canvas.removeEventListener("mousemove", handleMove);
      canvas.removeEventListener("mouseup", handleEnd);
      canvas.removeEventListener("mouseleave", handleEnd);
      canvas.removeEventListener("touchstart", handleStart);
      canvas.removeEventListener("touchmove", handleMove);
      canvas.removeEventListener("touchend", handleEnd);
      canvas.removeEventListener("touchcancel", handleEnd);
    };
  }, [ready]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
    setSaved(false);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL("image/png");
      onSave(dataUrl);
      setSaved(true);
    } catch (err) {
      // Si toDataURL throw (canvas tainted par une image cross-origin
      // ancienne, par exemple), on log et on remet hasSignature/saved
      // à false pour que l'utilisateur puisse re-effacer et re-signer
      // proprement avec un canvas propre.
      console.error("[signature] toDataURL error:", err);
      setSaved(false);
      setHasSignature(false);
      // Force un reset visuel du canvas
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      }
    }
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">{label}</label>
      <div ref={containerRef} className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
        <canvas
          ref={canvasRef}
          className="block touch-none"
          style={{ height: 160, width: "100%" }}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 dark:text-gray-600 text-sm">Signez ici</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <Eraser className="w-3.5 h-3.5" />
          Effacer
        </button>
        {hasSignature && !saved && (
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-1.5 text-xs text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
          >
            <Check className="w-3.5 h-3.5" />
            Valider la signature
          </button>
        )}
        {saved && (
          <span className="flex items-center gap-1.5 text-xs text-green-600 px-3 py-1.5">
            <Check className="w-3.5 h-3.5" />
            Signature enregistrée
          </span>
        )}
      </div>
    </div>
  );
}
