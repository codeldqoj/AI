import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const packageRoot=process.argv[2];
if(!packageRoot)throw Error('Usage: node scripts/check-university-math.mjs /path/to/mathjax-qa');
const require=createRequire(path.resolve(packageRoot,'package.json'));
const {mathjax}=require('mathjax-full/js/mathjax.js');const {TeX}=require('mathjax-full/js/input/tex.js');const {SVG}=require('mathjax-full/js/output/svg.js');const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');const {AllPackages}=require('mathjax-full/js/input/tex/AllPackages.js');
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);const doc=mathjax.document('',{InputJax:new TeX({packages:AllPackages}),OutputJax:new SVG({fontCache:'none'})});
const errors=[];let count=0;const unique=new Set();
function walk(value,location){if(typeof value==='string'){
 const formulas=value.match(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*?\$/g)||[];
 const remainder=value.replace(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$])*?\$/g,'');if(remainder.includes('$'))errors.push({location,error:'Unbalanced dollar delimiter'});
 for(const token of formulas){const text=token.startsWith('$$')?token.slice(2,-2):token.slice(1,-1);if(unique.has(text))continue;unique.add(text);count++;
  try{const output=adaptor.outerHTML(doc.convert(text,{display:token.startsWith('$$')}));if(output.includes('data-mml-node="merror"'))errors.push({location,text,error:output.match(/data-mjx-error="([^"]+)/)?.[1]||'merror'});}catch(error){errors.push({location,text,error:error.message});}}
 }else if(Array.isArray(value))value.forEach((item,i)=>walk(item,location+'.'+i));else if(value&&typeof value==='object')Object.entries(value).forEach(([key,item])=>walk(item,location+'.'+key));}
for(const file of fs.readdirSync(new URL('../data/university-materials/',import.meta.url)).filter(x=>x.endsWith('.json')&&x!=='sources.json'))walk(JSON.parse(fs.readFileSync(new URL('../data/university-materials/'+file,import.meta.url),'utf8')),file);
console.log(JSON.stringify({uniqueFormulas:count,errors},null,2));if(errors.length)process.exitCode=1;
