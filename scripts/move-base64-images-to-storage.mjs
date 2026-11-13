// One-off: move photos saved as base64 text in the database into the
// "store-images" storage bucket, and keep only their URL on the row.
//
//   products.image_url, profiles.avatar, profiles.store_banner_url
//
// Base64 text is downloaded with every query that reads the row, which made
// storefronts slow. New uploads already go to storage (src/lib/uploads.ts).
//
// Run with the project's service role key (Project Settings -> API Keys; never
// commit it or put it in a VITE_ variable):
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/move-base64-images-to-storage.mjs --backup ./image-backup.json [--dry-run]
//
// --backup is required: the original values are written there before any row
// changes, so they can be put back. If the optional "sharp" package can be
// imported, photos are also resized (longest side 1200px, or 512px for
// logos/avatars) and saved as WebP; otherwise they're uploaded as they are.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backupPath = args[args.indexOf('--backup') + 1];
const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;

if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
if (!args.includes('--backup') || !backupPath || backupPath.startsWith('--')) throw new Error('Pass --backup <file>');

const supabase = createClient(url, key, { auth: { persistSession: false } });
let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* optional */ }

const BUCKET = 'store-images';
const TARGETS = [
  { table: 'products', column: 'image_url', owner: 'vendor_id', kind: 'product', max: 1200 },
  { table: 'profiles', column: 'avatar', owner: 'id', kind: 'avatar', max: 512 },
  { table: 'profiles', column: 'store_banner_url', owner: 'id', kind: 'banner', max: 1600 },
];

const decode = (dataUrl) => {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const type = m[1] || 'application/octet-stream';
  const body = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
  return { type, body };
};

const extFor = (type) => ({ 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg' })[type];

// 1. Find every row with a data: URL and back them up before changing anything
const found = [];
for (const t of TARGETS) {
  const { data, error } = await supabase.from(t.table).select(`id, ${t.owner}, ${t.column}`).like(t.column, 'data:%');
  if (error) throw error;
  for (const row of data) found.push({ ...t, id: row.id, ownerId: row[t.owner], value: row[t.column] });
}
writeFileSync(backupPath, JSON.stringify(found.map(({ table, column, id, value }) => ({ table, column, id, value }))));
console.log(`${found.length} base64 photo(s) found; originals backed up to ${backupPath}`);

// 2. Upload each one and point the row at the file
let moved = 0;
for (const f of found) {
  const label = `${f.table}.${f.column} ${f.id}`;
  const decoded = decode(f.value);
  if (!decoded || !decoded.type.startsWith('image/')) { console.warn(`skip ${label}: not an image data URL`); continue; }

  let { type, body } = decoded;
  if (sharp) {
    try {
      body = await sharp(body).rotate().resize({ width: f.max, height: f.max, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      type = 'image/webp';
    } catch (e) { console.warn(`${label}: could not resize (${e.message}); uploading as is`); }
  }
  const ext = extFor(type);
  if (!ext) { console.warn(`skip ${label}: ${type} isn't allowed in the bucket`); continue; }
  if (!f.ownerId) { console.warn(`skip ${label}: no owner`); continue; }

  const path = `${f.ownerId}/${f.kind}-moved-${f.id}.${ext}`;
  const before = Math.round(f.value.length / 1024);
  if (dryRun) { console.log(`would move ${label} (${before} KB of text) -> ${path} (${Math.round(body.length / 1024)} KB file)`); continue; }

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type, cacheControl: '31536000', upsert: true });
  if (upErr) { console.error(`fail ${label}: ${upErr.message}`); continue; }
  const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  // Only if it's still base64 (not replaced by a new upload meanwhile)
  const { error: updErr, count } = await supabase.from(f.table)
    .update({ [f.column]: publicUrl }, { count: 'exact' })
    .eq('id', f.id).like(f.column, 'data:%');
  if (updErr) { console.error(`fail ${label}: ${updErr.message}`); continue; }
  if (!count) { console.warn(`skip ${label}: changed since it was read`); continue; }
  moved += 1;
  console.log(`moved ${label}: ${before} KB of text -> ${Math.round(body.length / 1024)} KB file`);
}
console.log(dryRun ? 'Dry run: nothing changed.' : `Done: ${moved} of ${found.length} moved.`);
