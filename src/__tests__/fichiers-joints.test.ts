/**
 * Fichiers joints : on reconnaît partout un document (PDF, Word…), une
 * vidéo et une image — pour ne jamais passer un PDF à une balise <img>.
 */
import { describe, it, expect } from "vitest";
import { estDocumentUrl, estVideoUrl, etiquetteDocument, iconeDocument, nomDuFichier, extensionDe } from "@/lib/fichiers-joints";
import { thumbnailUrl, fullUrl } from "@/lib/image-url";

const PHOTO = "https://res.cloudinary.com/c/image/upload/v1/tm-rapport/p/livraisons/abc.jpg";
const PDF_RAW = "https://res.cloudinary.com/c/raw/upload/v1/tm-rapport/p/livraisons/Bon_de_livraison.pdf";
const DOCX_RAW = "https://res.cloudinary.com/c/raw/upload/v1/tm-rapport/p/docs/Offre.docx";
const VIDEO = "https://res.cloudinary.com/c/video/upload/v1/tm-rapport/p/sav/defaut.mov";
const NOTION_PDF = "https://prod-files-secure.s3.us-west-2.amazonaws.com/x/y/Facture.pdf?X-Amz-Signature=abc";

describe("nature d'un fichier", () => {
  it("documents : Cloudinary « raw », ou extension de document ailleurs", () => {
    expect(estDocumentUrl(PDF_RAW)).toBe(true);
    expect(estDocumentUrl(DOCX_RAW)).toBe(true);
    expect(estDocumentUrl(NOTION_PDF)).toBe(true);
    expect(estDocumentUrl("https://res.cloudinary.com/c/image/upload/v1/x/scan.pdf")).toBe(true);
  });
  it("photos et vidéos ne sont pas des documents", () => {
    expect(estDocumentUrl(PHOTO)).toBe(false);
    expect(estDocumentUrl(VIDEO)).toBe(false);
    expect(estDocumentUrl("https://c.test/sans-extension")).toBe(false);
    expect(estDocumentUrl("blob:https://app/123")).toBe(false);
    expect(estDocumentUrl("")).toBe(false);
    expect(estVideoUrl(VIDEO)).toBe(true);
  });
  it("nom, extension, étiquette", () => {
    expect(nomDuFichier(PDF_RAW)).toBe("Bon_de_livraison.pdf");
    expect(extensionDe(NOTION_PDF)).toBe("pdf");
    expect(etiquetteDocument(PDF_RAW)).toBe("PDF");
    expect(etiquetteDocument(DOCX_RAW)).toBe("DOC");
    expect(etiquetteDocument("x/Tableau.xlsx")).toBe("XLS");
  });
});

describe("vignettes de l'app", () => {
  it("un document : une icône (jamais l'adresse du PDF dans une <img>)", () => {
    expect(thumbnailUrl(PDF_RAW)).toBe(iconeDocument(PDF_RAW));
    expect(thumbnailUrl(PDF_RAW).startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(thumbnailUrl(PDF_RAW))).toContain(">PDF<");
    expect(fullUrl(NOTION_PDF).startsWith("data:image/svg+xml")).toBe(true);
  });
  it("une vidéo : sa première image, en JPG", () => {
    const t = thumbnailUrl(VIDEO, 300);
    expect(t).toContain("/video/upload/so_0,");
    expect(t).toContain("w_300");
    expect(t.endsWith("/v1/tm-rapport/p/sav/defaut.jpg")).toBe(true);
  });
  it("une photo : inchangé (optimisation Cloudinary habituelle)", () => {
    expect(thumbnailUrl(PHOTO, 300)).toContain("/image/upload/f_auto,q_auto,dpr_auto,w_300,c_fill,ar_1:1/v1/");
  });
});
