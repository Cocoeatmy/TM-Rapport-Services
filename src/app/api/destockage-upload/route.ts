import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { verifyToken } from "@/lib/auth";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload d'une photo de cabine ou d'un PDF de mesures pour le module Déstockage.
 * Retourne { url, name } — les URLs Cloudinary sont permanentes.
 *
 * POST /api/destockage-upload
 *   FormData: file (File), type ("photo" | "pdf")
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "photo";

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const isPdf = type === "pdf";

    const result = await cloudinary.uploader.upload(base64, {
      folder: `tm-rapport/destockage/${type}`,
      resource_type: isPdf ? "raw" : "image",
      ...(isPdf
        ? {}
        : {
            transformation: [
              { width: 1400, crop: "limit" },
              { quality: "auto:good" },
              { fetch_format: "jpg" },
            ],
          }),
    });

    return NextResponse.json({ url: result.secure_url, name: file.name });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erreur upload";
    console.error("Destockage upload error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
