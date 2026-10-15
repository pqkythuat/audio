import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {extname} from 'node:path';
import {build} from 'esbuild';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
const assets={};
for(const item of await readdir('dist',{withFileTypes:true}))if(item.isFile()){
 let body=await readFile('dist/'+item.name,'utf8');if(item.name==='index.html')body=body.replace('<meta name="app-runtime" content="static">','');assets[item.name]={body,type:types[extname(item.name)]||'text/plain; charset=utf-8'};
}
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,plugins:[{name:'site-assets',setup(builder){builder.onResolve({filter:/^#site-assets$/},()=>({path:'assets',namespace:'site-assets'}));builder.onLoad({filter:/.*/,namespace:'site-assets'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json','utf8'));
console.log('Cloud Worker built with Google authentication, persistent accounts and shared library.');
