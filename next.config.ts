import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Embarque les logos fournisseurs dans la fonction serverless de la route
  // Fiche (lecture disque + base64 dans le PDF) — sinon absents sur Vercel.
  // NB : la clé est un glob picomatch → « [id] » serait une classe de caractères,
  // on utilise donc le joker « * » pour matcher le segment dynamique.
  outputFileTracingIncludes: {
    "/api/fiche/*": ["public/logos/fournisseurs/**/*"],
  },
  allowedDevOrigins: ["192.168.1.119", "192.168.31.145"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
