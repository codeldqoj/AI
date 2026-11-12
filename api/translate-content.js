import { allows } from '../lib/education-access.js';
import crypto from 'node:crypto';
import { getDb } from '../lib/db.js';
import { getSession } from '../lib/session.js';
import { checkRateLimit, generateJson, generateWithOpenAIFallback, handleAiError, parseBody, prepare, text } from '../lib/ai.js';
import { generateOpenAIJson } from '../lib/openai.js';

const TRANSLATION_VERSION = 'vmo-math-en-v4';
const MAX_ITEMS = 18;
const MAX_ITEM_CHARS = 8_000;
const MAX_TOTAL_CHARS = 32_000;

const schema = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['id', 'text']
      }
    }
  },
  required: ['translations']
};

function sourceHash(value) {
  return crypto.createHash('sha256').update(`${TRANSLATION_VERSION}\n${value}`).digest('hex');
}

function mathTokens(value) {
  return String(value || '').match(/__VMO_MATH_\d+__/g) || [];
}

function preservesMath(source, translated) {
  const before = mathTokens(source).sort();
  const after = mathTokens(translated).sort();
  return before.length === after.length && before.every((token, index) => token === after[index]);
}

function hasUntranslatedVietnamese(value) {
  const output = String(value || '');
  return /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(output)
    || /\b(?:cho|chung minh|tim tat ca|tinh gioi han|thoa man|voi moi|suy ra|do do|gia su|bai toan|loi giai|cau hoi|ngay thu|nop bai|xem loi giai|thoi gian|tong diem)\b/i.test(output);
}

function validEnglishTranslation(source, translated) {
  return Boolean(translated)
    && preservesMath(source, translated)
    && !hasUntranslatedVietnamese(translated);
}

function normalizeItems(body) {
  const input = Array.isArray(body?.items) ? body.items.slice(0, MAX_ITEMS) : [];
  let total = 0;
  const result = [];

  for (const item of input) {
    const id = text(item?.id, 100);
    const source = text(item?.text, MAX_ITEM_CHARS);
    if (!id || !source || total + source.length > MAX_TOTAL_CHARS) continue;
    total += source.length;
    result.push({ id, source, hash: sourceHash(source) });
  }
  return result;
}

export default async function handler(req, res) {
  prepare(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const session = await getSession(req);
  if (!session) return res.status(401).json({ success: false, error: 'Vui lòng đăng nhập lại' });
  if (!allows(session, 'shared')) return res.status(403).json({ success: false, error: 'Tài khoản chưa được cấp quyền cấp học' });

  const body = parseBody(req);
  if (!body) return res.status(400).json({ success: false, error: 'JSON không hợp lệ' });
  const items = normalizeItems(body);
  const strict = body.strict === true;
  if (!items.length) return res.status(400).json({ success: false, error: 'Không có nội dung hợp lệ để dịch' });

  let db;
  let cachedDocs = [];
  try {
    db = await getDb();
    cachedDocs = await db.collection('i18n_translations')
      .find({ _id: { $in: items.map(item => item.hash) }, target: 'en', version: TRANSLATION_VERSION })
      .project({ translated: 1 })
      .toArray();
  } catch (error) {
    // MongoDB cache is an optimization. Translation must still work if the
    // cache is temporarily unavailable.
    console.warn('[i18n cache]', error?.message || error);
  }

  const cache = new Map(cachedDocs.map(doc => [String(doc._id), doc.translated]));
  const output = new Map();
  const missing = [];

  for (const item of items) {
    const cached = cache.get(item.hash);
    if (cached && validEnglishTranslation(item.source, cached)) output.set(item.id, cached);
    else missing.push(item);
  }

  if (missing.length) {
    if (!checkRateLimit(`translate:${session.username}`, 30)) {
      return res.status(429).json({ success: false, error: 'Bạn đang gửi yêu cầu dịch quá nhanh' });
    }

    const payload = missing.map(item => ({ id: item.id, text: item.source }));
    const strictInstructions = strict ? `
STRICT RETRY MODE:
- A previous translation attempt left Vietnamese words or Vietnamese diacritics in the output.
- Translate every non-mathematical Vietnamese word. The final text must contain no Vietnamese letters with diacritics.
- Transliterate every proper name and place name to ASCII. Never copy a Vietnamese sentence unchanged.
- Before returning JSON, silently verify every output is entirely English except immutable __VMO_MATH_n__ tokens.` : '';

    const prompt = `Translate every item in the JSON array below from Vietnamese into polished English.

Context: National Mathematical Olympiad (VMO/TST/IMO) training materials, problem statements, proofs, scoring rubrics, and application interface text.

Requirements:
1. Use standard, concise mathematical English. Prefer "Let", "Prove that", "Find all", "It follows that", "if and only if", and established Olympiad terminology.
2. Preserve years, numbering, punctuation structure, line breaks, Markdown, and emojis. Render every Vietnamese personal name, place name, and institution name without Vietnamese diacritics in its established English/ASCII form, for example Tran Hoang Kien, Da Nang, and Quang Nam.
3. Every token of the form __VMO_MATH_n__ represents an immutable mathematical formula. Copy each such token exactly once, unchanged and in the same logical position.
4. Do not add explanations, solve problems, or change mathematical meaning.
5. Return one translation for every id and no extra fields.
${strictInstructions}

INPUT:
${JSON.stringify(payload)}`;

    try {
      const systemInstruction = 'You are a meticulous bilingual mathematical editor for VMO/IMO materials. Translate only; preserve all formula placeholders exactly.';
      const translationStartedAt = Date.now();
      const result = await generateWithOpenAIFallback(
        () => generateJson({
          contents: prompt,
          schema,
          temperature: 0,
          systemInstruction
        }),
        geminiError => {
          console.warn('[i18n provider fallback]', { code: geminiError?.code || 'UNKNOWN', status: geminiError?.status || 0 });
          const timeoutMs = Math.min(60_000, 110_000 - (Date.now() - translationStartedAt) - 10_000);
          if (timeoutMs < 5_000) throw geminiError;
          return generateOpenAIJson({
            input: prompt,
            schema,
            model: process.env.OPENAI_TRANSLATION_MODEL || process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
            timeoutMs,
            maxOutputTokens: 16_000,
            reasoningEffort: 'low',
            systemInstruction
          });
        },
        { stage: 'translation' }
      );

      const translatedById = new Map(
        (Array.isArray(result.data?.translations) ? result.data.translations : [])
          .map(item => [String(item?.id || ''), String(item?.text || '')])
      );

      const writes = [];
      for (const item of missing) {
        const translated = translatedById.get(item.id);
        if (!validEnglishTranslation(item.source, translated)) continue;
        output.set(item.id, translated);
        if (db) {
          writes.push({
            updateOne: {
              filter: { _id: item.hash },
              update: {
                $set: {
                  source: item.source,
                  translated,
                  sourceLang: 'vi',
                  target: 'en',
                  version: TRANSLATION_VERSION,
                  model: result.model,
                  updatedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
              },
              upsert: true
            }
          });
        }
      }
      if (writes.length) {
        db.collection('i18n_translations').bulkWrite(writes, { ordered: false }).catch(error => {
          console.warn('[i18n cache write]', error?.message || error);
        });
      }
    } catch (error) {
      return handleAiError(res, error);
    }
  }

  return res.status(200).json({
    success: true,
    version: TRANSLATION_VERSION,
    translations: items
      .filter(item => output.has(item.id))
      .map(item => ({ id: item.id, text: output.get(item.id) }))
  });
}
