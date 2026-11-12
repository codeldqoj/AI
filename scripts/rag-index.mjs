import { getDb } from '../lib/db.js';
import { setupRag, backfillSources, processRagJobs } from '../lib/rag-store.js';
const command = process.argv[2];
if (!['setup', 'backfill', 'process'].includes(command)) {
  console.error('Usage: node scripts/rag-index.mjs setup|backfill|process [cursor]'); process.exit(1);
}
try {
  const db = await getDb();
  const result = command === 'setup' ? await setupRag(db) : command === 'backfill'
    ? await backfillSources(db, 100, process.argv[3] || '') : await processRagJobs(db, 3);
  console.log(JSON.stringify(result, null, 2)); process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
