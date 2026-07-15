import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: 192, height: 192,
        background: "#0d0c0a",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 40,
      }}>
        <div style={{
          width: 120, height: 120,
          background: "linear-gradient(135deg, #e8c96a, #c9a227)",
          borderRadius: 28,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontSize: 72, fontWeight: 900, color: "#0d0c0a", fontFamily: "serif" }}>L</span>
        </div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
