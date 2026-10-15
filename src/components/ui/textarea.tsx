"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { ajusterHauteur, useHauteurAuto } from "@/lib/hauteur-auto"

/**
 * Zone de texte à hauteur automatique.
 *
 * Elle s'étire avec le contenu et ne défile jamais à l'intérieur : on voit
 * toujours tout ce qu'on a écrit. Voir lib/hauteur-auto pour le pourquoi et
 * les trois cas particuliers.
 */
function Textarea({ className, onChange, ref, ...props }: React.ComponentProps<"textarea">) {
  const interne = React.useRef<HTMLTextAreaElement | null>(null);
  /* Le parent peut vouloir sa propre référence : on sert les deux. */
  const poser = React.useCallback((el: HTMLTextAreaElement | null) => {
    interne.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el;
  }, [ref]);

  useHauteurAuto(interne, props.value);

  return (
    <textarea
      data-slot="textarea"
      ref={poser}
      onChange={(e) => {
        /* Avant même que React ne re-rende : la frappe reste fluide, y
           compris sur un champ non contrôlé. */
        ajusterHauteur(e.currentTarget);
        onChange?.(e);
      }}
      className={cn(
        "flex field-sizing-content min-h-16 w-full resize-none overflow-hidden rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
