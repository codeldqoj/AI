import { timingSafeEqual } from 'node:crypto';
import { getDb } from '../lib/db.js';
import { processRagJobs } from '../lib/rag-store.js';

// Scheduled worker: queue only, no body-controlled commands or database access.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ success: false });
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ success: false, error: 'RAG worker chưa được cấu hình' });
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(req.headers.authorization || '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ success: false });
  try {
    const db = await getDb(); const results = [];
    for (let index = 0; index < 8; index++) {
      const batch = await processRagJobs(db, 3); results.push(...batch.results);
      if (batch.results.length < 3) break;
    }
    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('[RAG WORKER]', error.message);
    return res.status(503).json({ success: false, error: 'Không xử lý được hàng đợi' });
  }
}
