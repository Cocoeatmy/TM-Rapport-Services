import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

/**
 * Signature pour upload DIRECT client → Cloudinary.
 *
 * Pourquoi : faire transiter les photos par Vercel (ancienne route /api/upload)
 * était fragile sur réseau mobile (limite 4,5 Mo, requête lourde, écriture
 * Notion bloquante). En signant ici une upload directe, les octets vont
 * directement du téléphone à Cloudinary (robuste, sans limite Vercel), et le
 * secret API reste côté serveur. Le rattachement à Notion se fait ensuite via
 * /api/photos/attach (petit JSON, réessayable sans renvoyer les octets).
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const { projectId, category } = await request.json();
    if (!projectId || !category) {
      return NextResponse.json({ error: "projectId et category requis" }, { status: 400 });
    }
    const folder = `tm-rapport/${projectId}/${category}`;
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      process.env.CLOUDINARY_API_SECRET as string,
    );
    return NextResponse.json({
      signature,
      timestamp,
      folder,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    });
  } catch (error: any) {
    console.error("Cloudinary sign error:", error);
    return NextResponse.json({ error: error.message || "Erreur signature" }, { status: 500 });
  }
}
