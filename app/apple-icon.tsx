import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

// Renders the brand mark at 180x180 for iOS Add-to-Home-Screen. iOS does not
// honour SVG manifest icons, so this is generated as PNG via next/og.
// Geometry mirrors app/icon.svg (24x24 viewBox scaled by 7.5).
export default function AppleIcon() {
  const stemTop = 27
  const stemHeight = 126
  const stemWidth = 21

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          background: "#0a0a1a",
          display: "flex",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 42,
            top: stemTop,
            width: stemWidth,
            height: stemHeight,
            background: "#00ff88",
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 117,
            top: stemTop,
            width: stemWidth,
            height: stemHeight,
            background: "#00ff88",
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 63,
            top: 78,
            width: 24,
            height: 24,
            background: "#00ff88",
            borderRadius: 999,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 93,
            top: 78,
            width: 24,
            height: 24,
            background: "#00ff88",
            borderRadius: 999,
          }}
        />
      </div>
    ),
    size,
  )
}
