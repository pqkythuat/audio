import dictionary from './ipa-data.js?v=7';
const cache=new Map();
export function toIPA(text){if(cache.has(text))return cache.get(text);const missing=new Set();const clean=String(text).replace(/\[[^\]]*\]/g,'').replace(/>>/g,'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&');
const ipa=clean.replace(/\p{L}+(?:['’]\p{L}+)*/gu,word=>{const key=word.toLowerCase().replace(/’/g,"'");if(Object.hasOwn(dictionary,key))return dictionary[key];missing.add(word);return `⟨${word}⟩`;}).replace(/[ \t]+/g,' ').trim();const result={text:ipa,missing:[...missing]};if(cache.size>5000)cache.clear();cache.set(text,result);return result;}
