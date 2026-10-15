import {readFile,writeFile} from 'node:fs/promises';
// Run only in the publication checkout. The Node preview keeps its full API mode.
const file='dist/index.html';let html=await readFile(file,'utf8');
if(!html.includes('name="app-runtime"'))html=html.replace('<head>','<head><meta name="app-runtime" content="static">');
await writeFile(file,html);
const path='dist/sw.js';let worker=await readFile(path,'utf8');
worker=worker.replace(/const CACHE='[^']+'/,"const CACHE='lang-nghe-shell-v29-static-1'");await writeFile(path,worker);
console.log('Static publication prepared: device library and YouTube playback; server features clearly marked unavailable.');
