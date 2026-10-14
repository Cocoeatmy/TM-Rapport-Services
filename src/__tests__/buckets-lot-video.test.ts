import { describe, it, expect } from "vitest";
import {
  BUCKET_ORDER, BUCKET_LABEL, BUCKET_NOTION_FIELD, bucketFilePrefix,
  detectBucket, filterByBucket, defaultBucketForField,
  missingRequiredPhotos, minimumRequis,
} from "@/lib/photo-buckets";

const MONO = { multiCabine: false, nbCabines: 1 };

describe("numéro de lot et vidéo de montage", () => {
  it("écrivent chacun dans LEUR colonne Notion", () => {
    expect(BUCKET_NOTION_FIELD.NUMERO_LOT).toBe("photosNumeroLot");
    expect(BUCKET_NOTION_FIELD.VIDEO_MONTAGE).toBe("videosMontage");
  });

  it("s'affichent au rang demandé : le lot en tête, la vidéo après la garantie", () => {
    expect(BUCKET_ORDER[0]).toBe("NUMERO_LOT");
    expect(BUCKET_ORDER.indexOf("VIDEO_MONTAGE")).toBe(BUCKET_ORDER.indexOf("GARANTIE") + 1);
  });

  it("portent les libellés attendus", () => {
    expect(BUCKET_LABEL.NUMERO_LOT).toBe("Photos numéro de Lot");
    expect(BUCKET_LABEL.VIDEO_MONTAGE).toBe("Vidéo Montage");
  });

  /* Nom de fichier tel que PhotoUpload le construit : « prefixe.index.ts.ext ». */
  const fichier = (bucket: "NUMERO_LOT" | "VIDEO_MONTAGE", cab: number, i = 1) =>
    ({ name: `${bucketFilePrefix(bucket, cab)}.${i}.1760000000000.jpg` });

  it("rattachent le fichier à SA cabine par le préfixe du nom", () => {
    /* C'est tout l'intérêt sur un immeuble : savoir de quel appartement
       vient la photo du numéro de porte. */
    expect(bucketFilePrefix("NUMERO_LOT", 3)).toContain("Cab3");
    expect(detectBucket(fichier("NUMERO_LOT", 3).name, "NUMERO_LOT")).toBe("NUMERO_LOT");
  });

  it("ne mélangent pas deux lots", () => {
    const liste = [fichier("NUMERO_LOT", 1), fichier("NUMERO_LOT", 2)];
    expect(filterByBucket(liste, "NUMERO_LOT", 1)).toEqual([liste[0]]);
    expect(filterByBucket(liste, "NUMERO_LOT", 2)).toEqual([liste[1]]);
  });

  it("ne confondent pas une vidéo avec une photo de lot", () => {
    const liste = [fichier("NUMERO_LOT", 1), fichier("VIDEO_MONTAGE", 1)];
    expect(filterByBucket(liste, "NUMERO_LOT", 1)).toEqual([liste[0]]);
    expect(filterByBucket(liste, "VIDEO_MONTAGE", 1)).toEqual([liste[1]]);
  });

  it("un fichier sans préfixe reste dans sa colonne d'origine", () => {
    expect(defaultBucketForField("photosNumeroLot")).toBe("NUMERO_LOT");
    expect(defaultBucketForField("videosMontage")).toBe("VIDEO_MONTAGE");
  });

  it("n'ajoutent AUCUNE exigence à l'envoi du rapport", () => {
    /* Elles s'ajoutent, elles ne conditionnent rien : un rapport doit
       pouvoir partir sans vidéo et sans numéro de lot. */
    const vide = {};
    expect(missingRequiredPhotos(vide, MONO).some((m) => /lot|vid/i.test(JSON.stringify(m)))).toBe(false);
    expect(minimumRequis(["NUMERO_LOT"])).toBe(0);
    expect(minimumRequis(["VIDEO_MONTAGE"])).toBe(0);
  });
});
