import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allows } from './education-access.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function filterAppShell(html, session) {
  return html.replace(/<!-- EDUCATION:([a-z_]+):START -->([\s\S]*?)<!-- EDUCATION:\1:END -->/g,
    (_, level, content) => allows(session, level) ? content : '');
}
export async function serveEducationPage(req, res, session) {
  const resource = req.query?.resource;
  if (!['app_shell', 'protected_asset', 'blocked_static'].includes(resource)) return false;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  if (resource === 'blocked_static') { res.status(404).end();return true; }
  if (!session) { res.setHeader('Location', '/login.html');res.status(302).end();return true; }
  if (resource === 'app_shell') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(filterAppShell(await readFile(path.join(root, 'index.html'), 'utf8'), session));
    return true;
  }
  if (!allows(session, 'upper_secondary')) { res.status(403).json({ success: false, error: 'Tài liệu thuộc cấp Trung học phổ thông' });return true; }
  const file = String(req.query?.file || '');
  const target = path.resolve(root, 'assets', file);
  const assetRoot = path.join(root, 'assets') + path.sep;
  if (!target.startsWith(assetRoot) || !/\.(pdf|jpg|jpeg|png|webp)$/i.test(target)) { res.status(404).end();return true; }
  try {
    const data = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.setHeader('Content-Type', ext === '.pdf' ? 'application/pdf' : ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(data);
  } catch { res.status(404).end(); }
  return true;
}
