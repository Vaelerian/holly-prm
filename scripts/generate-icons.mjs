// Rasterise app/icon.svg into PNGs needed by iOS Add-to-Home-Screen and the
// PWA manifest fallbacks. Runs as `prebuild` so the PNGs always match the
// current SVG.
//
// Targets:
//   app/apple-icon.png        180x180  iOS apple-touch-icon
//   public/icons/icon-192.png 192x192  PWA manifest fallback
//   public/icons/icon-512.png 512x512  PWA manifest fallback (and maskable)

import sharp from "sharp"
import { mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")
const BG = "#0a0a1a"

const sourceSvg = readFileSync(join(repoRoot, "app/icon.svg"), "utf-8")

// app/icon.svg is transparent. Inject a solid background so the rasterised
// PNG looks correct on the iOS home screen and on Android device launchers
// that do not assume any backdrop.
const wrappedSvg = sourceSvg.replace(
  /<svg([^>]*)>/,
  `<svg$1><rect width="100%" height="100%" fill="${BG}"/>`,
)

const targets = [
  { path: "app/apple-icon.png", size: 180 },
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
]

for (const { path, size } of targets) {
  const out = join(repoRoot, path)
  mkdirSync(dirname(out), { recursive: true })
  await sharp(Buffer.from(wrappedSvg))
    .resize(size, size, { fit: "contain", background: BG })
    .png()
    .toFile(out)
  console.log(`generated ${path} (${size}x${size})`)
}
