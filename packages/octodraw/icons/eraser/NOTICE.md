# Eraser icon artwork — temporary

These SVGs were downloaded on 2026-10-25 from Eraser's public asset bucket
(`storage.googleapis.com/eraser-public-assets/canvas-icons/`), the images used
on https://docs.eraser.io/icons. They are Eraser's artwork and include vendor
icons (AWS, Microsoft Azure, Google Cloud, Oracle, Cisco) and brand logos that
belong to their respective owners. No license to redistribute them has been
granted to octodraw.

They are a stand-in until licensed vendor icon packs are purchased. To replace
them, swap the files in this folder (keeping Eraser's names) and run
`pnpm --filter octodraw icons:eraser`, or supply the packs through the
`icons` (IconResolver) prop and set `iconSet="open"`.
