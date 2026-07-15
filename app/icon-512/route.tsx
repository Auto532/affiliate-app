import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: 512, height: 512,
        background: "#0d0c0a",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 110,
      }}>
        <div style={{
          width: 320, height: 320,
          background: "linear-gradient(135deg, #e8c96a, #c9a227)",
          borderRadius: 72,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 196, fontWeight: 900, color: "#0d0c0a", fontFamily: "serif" }}>L</span>
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
