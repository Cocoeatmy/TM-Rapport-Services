import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { notion } from "@/lib/notion";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const category = formData.get("category") as string;
    const projectId = formData.get("projectId") as string;
    const notionField = formData.get("notionField") as string;
    console.log("Upload request:", { category, projectId, notionField, fileCount: files.length });

    if (!files.length) {
      return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    }

    const uploaded: { name: string; url: string }[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

      const result = await cloudinary.uploader.upload(base64, {
        folder: `tm-rapport/${projectId}/${category}`,
        resource_type: "image",
        transformation: [
          { width: 1200, crop: "limit" },
          { quality: "auto:good" },
          { fetch_format: "jpg" },
        ],
      });

      uploaded.push({
        name: file.name,
        url: result.secure_url,
      });
    }

    // Sauvegarder les URLs dans Notion si un champ est spécifié
    console.log("Upload done, saving to Notion:", { notionField, uploadedCount: uploaded.length });
    if (notionField && projectId) {
      // Récupérer les photos existantes dans Notion
      const page = await notion.pages.retrieve({ page_id: projectId }) as any;
      const existingFiles = page.properties[notionField]?.files || [];

      const allFiles = [
        ...existingFiles.map((f: any) => ({
          type: "external" as const,
          name: f.name || "photo",
          external: { url: f.type === "external" ? f.external?.url : f.file?.url },
        })),
        ...uploaded.map((f) => ({
          type: "external" as const,
          name: f.name,
          external: { url: f.url },
        })),
      ];

      await notion.pages.update({
        page_id: projectId,
        properties: {
          [notionField]: { files: allFiles },
        },
      });
    }

    return NextResponse.json({ files: uploaded });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur upload" },
      { status: 500 }
    );
  }
}
