import { describe, it, expect } from "vitest";
import { dateDePriseDeVue, dateExifEnMs } from "@/lib/exif-photo";

/**
 * Lire la date de prise de vue dans la photo.
 *
 * « Je doute que la première photo ait été prise à 9 h 02, si c'est une
 * photo d'avant montage et que ce montage prend minimum 45 minutes. »
 * Micael avait raison : l'heure affichée était celle de l'ajout, pas du
 * cliché. La vraie date est dans le bloc EXIF — et notre compression la
 * détruisait avant qu'on puisse la lire.
 *
 * On fabrique ici de vrais en-têtes JPEG, octet par octet, dans les deux
 * boutismes : c'est la seule façon de prouver qu'on lit bien le format
 * et pas une invention commode.
 */

/** Construit un JPEG minimal portant un EXIF avec la date voulue. */
function jpegAvecDate(date: string, opts: { petitBoutiste?: boolean; dansSousIFD?: boolean } = {}) {
  const pb = opts.petitBoutiste ?? true;
  const dansSousIFD = opts.dansSousIFD ?? true;
  const texte = date.padEnd(20, "\0").slice(0, 20);

  /* Deux répertoires : IFD0 pointe vers le sous-répertoire EXIF, qui
     porte DateTimeOriginal — exactement ce que fait un appareil. */
  const tailleIFD = (n: number) => 2 + n * 12 + 4;
  const ifd0Entrees = dansSousIFD ? 1 : 1;
  const debutIFD0 = 8;
  const debutSous = debutIFD0 + tailleIFD(ifd0Entrees);
  const debutTexte = debutSous + (dansSousIFD ? tailleIFD(1) : 0);
  const tiffLong = debutTexte + texte.length;

  const tiff = new DataView(new ArrayBuffer(tiffLong));
  const u16 = (o: number, v: number) => tiff.setUint16(o, v, pb);
  const u32 = (o: number, v: number) => tiff.setUint32(o, v, pb);

  tiff.setUint16(0, pb ? 0x4949 : 0x4d4d);   // boutisme
  u16(2, 42);
  u32(4, debutIFD0);

  if (dansSousIFD) {
    u16(debutIFD0, 1);
    u16(debutIFD0 + 2, 0x8769); u16(debutIFD0 + 4, 4); u32(debutIFD0 + 6, 1); u32(debutIFD0 + 10, debutSous);
    u32(debutIFD0 + 2 + 12, 0);
    u16(debutSous, 1);
    u16(debutSous + 2, 0x9003); u16(debutSous + 4, 2); u32(debutSous + 6, texte.length); u32(debutSous + 10, debutTexte);
    u32(debutSous + 2 + 12, 0);
  } else {
    u16(debutIFD0, 1);
    u16(debutIFD0 + 2, 0x0132); u16(debutIFD0 + 4, 2); u32(debutIFD0 + 6, texte.length); u32(debutIFD0 + 10, debutTexte);
    u32(debutIFD0 + 2 + 12, 0);
  }
  for (let i = 0; i < texte.length; i++) tiff.setUint8(debutTexte + i, texte.charCodeAt(i));

  const app1Charge = 6 + tiffLong;             // « Exif\0\0 » + TIFF
  const total = 2 + 2 + 2 + app1Charge + 2;    // SOI + marqueur + taille + charge + SOS
  const out = new DataView(new ArrayBuffer(total));
  let p = 0;
  out.setUint16(p, 0xffd8); p += 2;            // SOI
  out.setUint16(p, 0xffe1); p += 2;            // APP1
  out.setUint16(p, 2 + app1Charge); p += 2;    // taille (big endian, toujours)
  for (const c of "Exif") { out.setUint8(p++, c.charCodeAt(0)); }
  out.setUint8(p++, 0); out.setUint8(p++, 0);
  new Uint8Array(out.buffer).set(new Uint8Array(tiff.buffer), p);
  p += tiffLong;
  out.setUint16(p, 0xffda);                    // SOS
  return out.buffer;
}

describe("dateExifEnMs", () => {
  it("lit le format EXIF « 2026:10:16 08:12:30 »", () => {
    const ms = dateExifEnMs("2026:10:16 08:12:30");
    const d = new Date(ms!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(12);
  });

  it("refuse ce qui n'est pas une date EXIF", () => {
    expect(dateExifEnMs("")).toBeNull();
    expect(dateExifEnMs("2026-10-16 08:12:30")).toBeNull();
    expect(dateExifEnMs("0000:00:00 00:00:00")).toBeNull();
  });
});

describe("dateDePriseDeVue", () => {
  it("lit DateTimeOriginal dans le sous-répertoire EXIF (petit-boutiste)", () => {
    const ms = dateDePriseDeVue(jpegAvecDate("2026:10:16 08:12:30"));
    expect(new Date(ms!).getHours()).toBe(8);
    expect(new Date(ms!).getMinutes()).toBe(12);
  });

  it("lit aussi en gros-boutiste — les deux existent sur le terrain", () => {
    const ms = dateDePriseDeVue(jpegAvecDate("2026:10:16 14:45:00", { petitBoutiste: false }));
    expect(new Date(ms!).getHours()).toBe(14);
    expect(new Date(ms!).getMinutes()).toBe(45);
  });

  it("se rabat sur la date du fichier quand il n'y a pas de sous-répertoire", () => {
    const ms = dateDePriseDeVue(jpegAvecDate("2026:10:16 07:30:00", { dansSousIFD: false }));
    expect(new Date(ms!).getHours()).toBe(7);
  });

  it("rend null sur un JPEG sans EXIF — c'est le cas NORMAL, pas une erreur", () => {
    const sans = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]);
    expect(dateDePriseDeVue(sans.buffer)).toBeNull();
  });

  it("rend null sur ce qui n'est pas un JPEG — un HEIC range autrement", () => {
    /* On préfère ne rien dire plutôt que de faire passer une heure
       d'ajout pour une heure de prise de vue. */
    const heic = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
    expect(dateDePriseDeVue(heic.buffer)).toBeNull();
    expect(dateDePriseDeVue(new Uint8Array([]).buffer)).toBeNull();
  });
});
