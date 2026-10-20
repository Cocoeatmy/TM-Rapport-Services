/**
 * Dans les rapports PDF : la case d'un DOCUMENT joint (PDF, Word, Excel…).
 *
 * Une zone « photos » peut désormais recevoir n'importe quel fichier. Le
 * moteur des PDF, lui, ne sait dessiner que des images : une adresse de
 * document à la place d'une photo donnait une case vide — ou un rapport qui
 * échoue. Le document devient une case nommée, cliquable, qui l'ouvre.
 */
import React from "react";
import { Link, View, Text } from "@react-pdf/renderer";
import { etiquetteDocument } from "./fichiers-joints";

export function CaseDocument({ url, largeur = 110, hauteur = 82, style }: { url: string; largeur?: number | string; hauteur?: number | string; style?: Record<string, unknown> }) {
  const etiquette = etiquetteDocument(url);
  const couleur = etiquette === "PDF" ? "#dc2626" : etiquette === "DOC" ? "#2563eb" : etiquette === "XLS" ? "#15803d" : "#475569";
  const fond = etiquette === "PDF" ? "#fef2f2" : etiquette === "DOC" ? "#eff6ff" : etiquette === "XLS" ? "#f0fdf4" : "#f8fafc";
  return (
    <Link src={url} style={{ width: largeur, height: hauteur, textDecoration: "none", ...(style || {}) }}>
      <View style={{ width: "100%", height: "100%", borderRadius: 4, borderWidth: 1, borderColor: couleur, backgroundColor: fond, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: couleur, fontSize: 14, fontFamily: "Helvetica-Bold" }}>{etiquette}</Text>
        <Text style={{ color: couleur, fontSize: 7, marginTop: 3 }}>cliquer pour ouvrir</Text>
      </View>
    </Link>
  );
}
