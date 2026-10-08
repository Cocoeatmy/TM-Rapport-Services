import { describe, it, expect } from "vitest";
import { dateExifDepuisBuffer, parseDateExif } from "@/lib/exif-date";
import {
  arriveeAcceptable,
  departAcceptable,
  departApresPhoto,
  minutesDe,
  type HeurePhoto,
} from "@/lib/heure-photo";

/** Construit un JPEG minimal portant un EXIF DateTimeOriginal. */
function jpegAvecExif(valeur: string, bigEndian = false): ArrayBuffer {
  const ascii = valeur.padEnd(19, " ") + "\0"; // 20 octets
  const tiff = new DataView(new ArrayBuffer(44 + ascii.length));
  const le = !bigEndian;
  if (bigEndian) { tiff.setUint8(0, 0x4d); tiff.setUint8(1, 0x4d); }
  else { tiff.setUint8(0, 0x49); tiff.setUint8(1, 0x49); }
  tiff.setUint16(2, 0x002a, le);
  tiff.setUint32(4, 8, le);           // IFD0 à +8
  tiff.setUint16(8, 1, le);           // 1 entrée
  tiff.setUint16(10, 0x8769, le);     // pointeur Exif
  tiff.setUint16(12, 4, le);          // LONG
  tiff.setUint32(14, 1, le);
  tiff.setUint32(18, 26, le);         // bloc Exif à +26
  tiff.setUint32(22, 0, le);          // pas d'IFD1
  tiff.setUint16(26, 1, le);          // 1 entrée
  tiff.setUint16(28, 0x9003, le);     // DateTimeOriginal
  tiff.setUint16(30, 2, le);          // ASCII
  tiff.setUint32(32, ascii.length, le);
  tiff.setUint32(36, 44, le);         // valeur à +44
  tiff.setUint32(40, 0, le);
  for (let i = 0; i < ascii.length; i++) tiff.setUint8(44 + i, ascii.charCodeAt(i));

  const corps = new Uint8Array(tiff.buffer);
  const out = new Uint8Array(2 + 2 + 2 + 6 + corps.length + 2);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0xffd8);             // SOI
  v.setUint16(2, 0xffe1);             // APP1
  v.setUint16(4, 2 + 6 + corps.length);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6); // "Exif\0\0"
  out.set(corps, 12);
  v.setUint16(out.length - 2, 0xffd9); // EOI
  return out.buffer;
}

const exif = (jour: string, heure: string): HeurePhoto => ({ jour, heure, source: "exif" });
const envoi = (jour: string, heure: string): HeurePhoto => ({ jour, heure, source: "envoi" });

describe("lecture EXIF", () => {
  it("lit la date de prise de vue d'un JPEG (petit-boutiste)", () => {
    expect(dateExifDepuisBuffer(jpegAvecExif("2026:10:08 09:29:31"))).toEqual({
      jour: "2026-10-08",
      heure: "09:29",
    });
  });

  it("lit aussi un EXIF grand-boutiste", () => {
    expect(dateExifDepuisBuffer(jpegAvecExif("2026:07:02 17:45:00", true))).toEqual({
      jour: "2026-07-02",
      heure: "17:45",
    });
  });

  it("ne renvoie rien pour un fichier sans EXIF", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer;
    expect(dateExifDepuisBuffer(png)).toBeNull();
  });

  it("ignore une date EXIF vide (appareils qui écrivent des zéros)", () => {
    expect(parseDateExif("0000:00:00 00:00:00")).toBeNull();
  });
});

describe("heure acceptable", () => {
  it("accepte une photo du jour", () => {
    expect(arriveeAcceptable(exif("2026-10-08", "08:06"), "2026-10-08")).toBe(true);
  });

  it("refuse une photo prise un autre jour (c'est un autre passage)", () => {
    expect(arriveeAcceptable(exif("2026-10-07", "16:00"), "2026-10-08")).toBe(false);
    expect(departAcceptable(exif("2026-10-07", "16:00"), "08:00", "2026-10-08")).toBe(false);
  });

  it("accepte un EXIF tardif : la photo a été prise sur place, envoyée le soir", () => {
    expect(departAcceptable(exif("2026-10-08", "17:10"), "08:00", "2026-10-08")).toBe(true);
  });

  it("refuse l'heure d'un envoi différé le soir sans EXIF", () => {
    expect(departAcceptable(envoi("2026-10-08", "21:34"), "08:06", "2026-10-08")).toBe(false);
  });

  it("accepte l'heure d'envoi quand elle décrit une journée plausible", () => {
    expect(departAcceptable(envoi("2026-10-08", "16:30"), "08:00", "2026-10-08")).toBe(true);
  });
});

describe("heure de départ après photos de fin", () => {
  it("remplit un départ vide", () => {
    expect(departApresPhoto("", exif("2026-10-08", "09:29"), "08:06", "2026-10-08")).toBe("09:29");
  });

  it("corrige un départ égal à l'arrivée (chrono arrêté par erreur)", () => {
    expect(departApresPhoto("08:06", exif("2026-10-08", "09:29"), "08:06", "2026-10-08")).toBe("09:29");
  });

  it("corrige un départ antérieur à l'arrivée", () => {
    expect(departApresPhoto("07:50", exif("2026-10-08", "09:29"), "08:06", "2026-10-08")).toBe("09:29");
  });

  it("étend un départ déjà posé quand une photo sûre est plus tardive", () => {
    expect(departApresPhoto("09:00", exif("2026-10-08", "09:29"), "08:06", "2026-10-08")).toBe("09:29");
  });

  it("ne recule jamais une heure saisie à la main", () => {
    expect(departApresPhoto("11:30", exif("2026-10-08", "11:20"), "08:06", "2026-10-08")).toBeNull();
  });

  it("n'écrase pas un départ correct avec une heure d'envoi", () => {
    expect(departApresPhoto("11:30", envoi("2026-10-08", "21:34"), "08:06", "2026-10-08")).toBeNull();
  });

  it("n'écrit rien quand l'envoi différé rend l'heure invraisemblable", () => {
    expect(departApresPhoto("", envoi("2026-10-08", "22:10"), "08:06", "2026-10-08")).toBeNull();
  });

  it("lit les heures en minutes", () => {
    expect(minutesDe("09:29")).toBe(569);
    expect(minutesDe("")).toBe(-1);
  });
});
