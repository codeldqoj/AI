import { createHash } from 'node:crypto';
import { mathText } from './rag-core.js';

// Presentation equivalence only. Never simplify equations or rename variables.
export function normalizedStatement(value='') {
  let raw=String(value).normalize('NFC')
    .replace(/<\/?(?:p|div|li|h[1-6])\b[^>]*>|<br\s*\/?>/gi,'\n')
    .replace(/\\tag\{\d+\}/g,'')
    .replace(/(\$\$|\\\])\s*\(\d+\)(?=\s*(?:\n|$|<))/g,'$1');
  const original=raw;
  const math=[];
  raw=raw.replace(/\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\\)\$(?!\$)(?:\\.|[^$])*?\$/g,token=>{
    const clean=mathText(token).replace(/\\(?:left|right|displaystyle)\b/g,'')
      .replace(/\\(?:qquad|quad)\s*\(\d+\)\s*$/g,'')
      .replace(/\\(?:qquad|quad|enspace|thinspace)\b|\\[,;!]/g,'')
      .replace(/\\neq\b|≠/g,'\\ne').replace(/\\leq\b|≤/g,'\\le').replace(/\\geq\b|≥/g,'\\ge')
      .replace(/ℝ|\\mathbb\s*R\b/g,'\\mathbb{R}').replace(/ℕ|\\mathbb\s*N\b/g,'\\mathbb{N}')
      .replace(/\\to\b|→/g,'\\rightarrow').replace(/([_^])\{([a-zA-Z0-9*])\}/g,'$1$2')
      .replace(/(?<=[\w})\]])[.,;]\s*$/,'').replace(/\s+/g,'');
    math.push(clean);return ` @M${math.length-1}@ `;
  });
  raw=raw.replace(/^\s*(?:[a-z]\)|\d+[.)]|\([ivx]+\))\s+/gim,'');
  // A factual primality note adds no hypothesis when the number is already
  // present and primality is checked, not inferred from OCR text.
  raw=raw.replace(/\(?Cho biết (\d+) là một số nguyên tố\)?\.?/gi,(note,digits)=>{
    const n=Number(digits);if(n<2||n>1000000||!Number.isSafeInteger(n))return note;
    for(let d=2;d*d<=n;d++)if(n%d===0)return note;
    return original.replace(note,'').includes(digits)?'':note;
  });
  return mathText(raw).replace(/\bChứng minh rằng\b/gi,'Chứng minh')
    .replace(/(?<!\d)[.,;:]|[.,;:](?!\d)|\s+/g,' ').replace(/\s+/g,' ').trim()
    .replace(/@M(\d+)@/g,(_,i)=>`⟦${math[Number(i)]}⟧`);
}
export const statementFingerprint=value=>createHash('sha256').update(normalizedStatement(value)).digest('hex');

// A broad-topic match is only a method reference, never an EXACT answer.
// Require identical numeric constants and substantial shared formula structure.
export function functionalMethodMatch(query,candidate) {
  const a=normalizedStatement(query),b=normalizedStatement(candidate);
  const qualifiers=text=>{const plain=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return [/khac hang|non.?constant/,/lien tuc|continuous/,/don anh|injective/,/toan anh|surjective/].map(re=>re.test(plain)).join(',');};
  if(qualifiers(a)!==qualifiers(b))return false;
  const formulas=text=>[...text.matchAll(/⟦([^⟧]+)⟧/g)].map(m=>m[1]).join(' ');
  const qa=formulas(a),cb=formulas(b);
  if(qa.length<35||cb.length<35||!qa.includes('=')||!cb.includes('='))return false;
  const numbers=text=>[...new Set(text.match(/\d+/g)||[])].sort().join(',');
  if(numbers(qa)!==numbers(cb))return false;
  const domains=text=>[...new Set(text.match(/\\mathbb\{[A-Z]\}(?:\^\*)?/g)||[])].sort().join(',');
  if(!domains(qa)||domains(qa)!==domains(cb))return false;
  // A relation change is not a harmless presentation variation.
  const relations=text=>(text.match(/\\(?:ne|le|ge|notin|in)\b|[=<>]/g)||[]).sort().join(',');
  if(relations(qa)!==relations(cb))return false;
  const grams=text=>new Set(Array.from({length:Math.max(0,text.length-3)},(_,i)=>text.slice(i,i+4)));
  const x=grams(qa),y=grams(cb);const overlap=[...x].filter(g=>y.has(g)).length;
  return overlap/Math.max(x.size,y.size)>=0.8;
}
