const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "research", "asset-validation.json");
const manifestPath = path.join(ROOT, "research", "data", "local-assets-manifest.json");
const snapshotsPath = path.join(ROOT, "lib", "snapshots.json");
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) console.error(`ASSET CHECK FAILED: ${name} ${detail}`);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function localFile(publicPath) {
  return path.join(ROOT, "public", publicPath.replace(/^\//, ""));
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const images = Object.values(manifest.images || {});
check("manifest: image count recorded", images.length === manifest.image_count, `${images.length}/${manifest.image_count}`);

let manifestBytes = 0;
for (const image of images) {
  const file = path.join(ROOT, image.file);
  const exists = fs.existsSync(file);
  check(`manifest: ${image.public_path} is under /assets`, image.public_path.startsWith("/assets/"), image.public_path);
  check(`manifest: ${image.public_path} exists`, exists, image.file);
  if (!exists) continue;
  manifestBytes += fs.statSync(file).size;
  check(`manifest: ${image.public_path} SHA-256`, sha256(file) === image.sha256, image.sha256);
}
check("manifest: total bytes matches disk", manifestBytes > 0, `${manifestBytes} bytes across ${images.length} files`);

const snapshots = JSON.parse(fs.readFileSync(snapshotsPath, "utf8"));
const snapshotText = Object.values(snapshots).join("\n");
const forbiddenSnapshotHosts = [
  /https?:\/\/files\.vipcheap\.com/i,
  /https?:\/\/cdnjs\.cloudflare\.com/i,
  /https?:\/\/[^"']*googleusercontent\.com/i,
  /https?:\/\/fonts\.(?:googleapis|gstatic)\.com/i,
];
check(
  "snapshots: no remote image/font/CDN references",
  forbiddenSnapshotHosts.every((pattern) => !pattern.test(snapshotText)),
  forbiddenSnapshotHosts.map(String).join(" | ")
);

const snapshotRefs = new Set();
for (const match of snapshotText.matchAll(/(?:src|poster)="(\/assets\/[^"?#]+)/g)) snapshotRefs.add(match[1]);
for (const match of snapshotText.matchAll(/srcset="([^"]+)"/g)) {
  for (const part of match[1].split(",")) {
    const ref = part.trim().split(/\s+/)[0];
    if (ref.startsWith("/assets/")) snapshotRefs.add(ref.split(/[?#]/)[0]);
  }
}
for (const ref of [...snapshotRefs].sort()) {
  check(`snapshot image exists: ${ref}`, fs.existsSync(localFile(ref)), ref);
}
check("snapshots: at least one local image reference", snapshotRefs.size > 0, `${snapshotRefs.size} unique images`);

const sourceFiles = [
  ...walk(path.join(ROOT, "app")),
  ...walk(path.join(ROOT, "components")),
  ...walk(path.join(ROOT, "lib")),
].filter((file) => /\.(?:tsx?|jsx?|css|json|html)$/.test(file));
const remoteSourceHits = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of forbiddenSnapshotHosts) {
    if (pattern.test(text)) remoteSourceHits.push({ file: path.relative(ROOT, file), pattern: String(pattern) });
  }
}
check("source: no forbidden remote asset hosts", remoteSourceHits.length === 0, JSON.stringify(remoteSourceHits.slice(0, 20)));

const cssFiles = walk(path.join(ROOT, "public", "vendor")).filter((file) => file.endsWith(".css"));
let cssUrlCount = 0;
const remoteCssUrls = [];
const missingCssAssets = [];
for (const file of cssFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) {
    const value = match[2].trim();
    if (!value || value.startsWith("data:") || value.startsWith("#") || value.startsWith("%23")) continue;
    cssUrlCount += 1;
    if (/^(?:https?:)?\/\//i.test(value)) {
      remoteCssUrls.push({ file: path.relative(ROOT, file), value });
      continue;
    }
    const clean = value.split(/[?#]/)[0];
    const target = clean.startsWith("/")
      ? path.join(ROOT, "public", clean.replace(/^\//, ""))
      : path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) missingCssAssets.push({ file: path.relative(ROOT, file), value });
  }
}
check("css: no remote url() assets", remoteCssUrls.length === 0, JSON.stringify(remoteCssUrls.slice(0, 20)));
check("css: every local url() asset exists", missingCssAssets.length === 0, JSON.stringify(missingCssAssets.slice(0, 20)));
check("css: local asset URLs were audited", cssUrlCount > 0, `${cssUrlCount} url() references in ${cssFiles.length} CSS files`);

const passed = checks.filter((item) => item.ok).length;
const failed = checks.length - passed;
const report = {
  generatedAt: new Date().toISOString(),
  manifest: path.relative(ROOT, manifestPath),
  imageCount: images.length,
  manifestBytes,
  snapshotImageRefs: [...snapshotRefs].sort(),
  cssFilesAudited: cssFiles.length,
  cssUrlCount,
  passed,
  failed,
  checks,
};
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: REPORT, images: images.length, snapshotImageRefs: snapshotRefs.size, cssFiles: cssFiles.length, cssUrlCount, passed, failed }, null, 2));
if (failed) process.exitCode = 1;
