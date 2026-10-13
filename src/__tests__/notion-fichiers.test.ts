import { describe, it, expect } from "vitest";
import { estFichierNotion, descripteurFichier, urlDuDescripteur } from "@/lib/notion-fichiers";

const NOTION_S3 = "https://prod-files-secure.s3.us-west-2.amazonaws.com/d58b59d4-2050-4f22-8856-012f149cc7a2/abc/IMG_8935.jpeg?X-Amz-Expires=3600";
const CLOUDINARY = "https://res.cloudinary.com/tm/image/upload/v1/tm-rapport/x/carton-1.jpg";

describe("estFichierNotion", () => {
  it("reconnaît le stockage S3 de Notion", () => {
    expect(estFichierNotion(NOTION_S3)).toBe(true);
  });

  it("reconnaît les anciens domaines notion-static", () => {
    expect(estFichierNotion("https://s3.us-west-2.amazonaws.com/secure.notion-static.com/x/y.png")).toBe(true);
    expect(estFichierNotion("https://prod-files.notion-static.com/x/y.png")).toBe(true);
  });

  it("reconnaît file.notion.so", () => {
    expect(estFichierNotion("https://file.notion.so/f/f/abc/photo.jpg")).toBe(true);
  });

  it("laisse Cloudinary dehors — c'est là que vivent nos photos", () => {
    expect(estFichierNotion(CLOUDINARY)).toBe(false);
  });

  it("ne se laisse pas tromper par un nom de fichier", () => {
    /* Reconnaître par un morceau de chaîne ferait passer celui-ci pour un
       fichier Notion, et Notion refuserait alors de le reprendre. */
    expect(estFichierNotion("https://res.cloudinary.com/tm/notion-static.com.jpg")).toBe(false);
  });

  it("supporte une adresse vide ou illisible", () => {
    expect(estFichierNotion("")).toBe(false);
    expect(estFichierNotion("pas une adresse")).toBe(false);
  });
});

describe("descripteurFichier", () => {
  it("rend un fichier Notion sous le type « file »", () => {
    const d = descripteurFichier("IMG_8935.jpeg", NOTION_S3);
    expect(d.type).toBe("file");
    expect(urlDuDescripteur(d)).toBe(NOTION_S3);
  });

  it("rend une photo Cloudinary sous le type « external »", () => {
    const d = descripteurFichier("carton-1.jpg", CLOUDINARY);
    expect(d.type).toBe("external");
    expect(urlDuDescripteur(d)).toBe(CLOUDINARY);
  });

  it("tronque le nom à cent caractères — la limite de Notion", () => {
    expect(descripteurFichier("a".repeat(250), CLOUDINARY).name).toHaveLength(100);
  });

  it("ne laisse jamais un nom vide : Notion le refuserait", () => {
    expect(descripteurFichier("", CLOUDINARY).name).toBe("fichier");
  });
});
