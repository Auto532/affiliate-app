import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             "Loatycard Partner",
    short_name:       "LC Partner",
    description:      "Loatycard Affiliate-Portal",
    start_url:        "/dashboard",
    display:          "standalone",
    background_color: "#0d0c0a",
    theme_color:      "#c9a227",
    orientation:      "portrait",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}
