"use client";

import * as React from "react";
import { ajusterHauteur, useHauteurAuto } from "@/lib/hauteur-auto";

/**
 * Une zone de texte qui grandit avec son contenu, sans imposer d'apparence.
 *
 * Le composant `ui/textarea` porte un style complet ; beaucoup d'endroits de
 * l'app ont le leur et écrivaient donc un `<textarea>` brut. Ils héritaient
 * aussi de la hauteur fixe et de son défilement intérieur. Celui-ci se
 * substitue au `<textarea>` brut : mêmes attributs, mêmes classes, et la
 * hauteur en plus. Voir lib/hauteur-auto.
 */
export function ZoneTexte({ onChange, ref, ...props }: React.ComponentProps<"textarea">) {
  const interne = React.useRef<HTMLTextAreaElement | null>(null);
  const poser = React.useCallback((el: HTMLTextAreaElement | null) => {
    interne.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el;
  }, [ref]);

  useHauteurAuto(interne, props.value);

  return (
    <textarea
      ref={poser}
      onChange={(e) => {
        ajusterHauteur(e.currentTarget);
        onChange?.(e);
      }}
      {...props}
    />
  );
}
