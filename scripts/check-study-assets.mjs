import fs from 'node:fs';
const root='dist';const files=fs.readdirSync(root).filter(f=>f.endsWith('.js'));
let errors=0;for(const file of files){const source=fs.readFileSync(root+'/'+file,'utf8');for(const match of source.matchAll(/(?:from\s*|import\s*\()\s*['"]\.\/([^'"]+)['"]/g)){const target=match[1].split('?')[0];if(!fs.existsSync(root+'/'+target)){console.error(file+' missing '+target);errors++;}}}
if(errors)process.exit(1);console.log('All frontend module references exist.');
