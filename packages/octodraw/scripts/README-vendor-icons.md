# Vendor icon packs

Official cloud icons are imported into `icons/vendor/<provider>/<eraser-name>.svg`
(named with Eraser's icon names so `[icon: aws-ec2]` etc. keep working), then
bundled with `pnpm icons:vendor` into `src/icons/generated-vendor.ts`. Vendor
icons win over Eraser's artwork. Each provider folder has a `SOURCE.md`.

| Provider | Download | Import |
|---|---|---|
| AWS | https://aws.amazon.com/architecture/icons/ (Asset/Icon package zip) | unzip, then `node scripts/import-aws-icons.mjs <dir>` |
| Google Cloud | https://cloud.google.com/icons (core product + category icon zips) | unzip both into one dir, then `node scripts/import-gcp-icons.mjs <dir>` |
| Azure | https://learn.microsoft.com/azure/architecture/icons/ (Azure_Public_Service_Icons zip) | unzip, then `node scripts/import-azure-icons.mjs <dir>` |
| Oracle (OCI) | OCI Architecture Diagram Toolkit, draw.io version | `node scripts/export-drawio-library.mjs "OCI Library.xml" <svgdir>` then `node scripts/import-oci-icons.mjs <svgdir>` |

Treat downloaded archives as untrusted: extract them outside the repo. The
bundler (`scripts/svg-inline.mjs`) strips scripts, event handlers, external
references and titles from every SVG.

Not imported yet: Cisco (only JPG/Visio/PDF
formats were available; Eraser's cisco-* artwork is used meanwhile).
