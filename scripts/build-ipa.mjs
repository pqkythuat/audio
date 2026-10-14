import {dictionary} from 'cmu-pronouncing-dictionary';
import {arpabetToIPA} from './arpabet.js';
import {writeFileSync,readFileSync} from 'node:fs';
const data={};for(const [word,pronunciation]of Object.entries(dictionary)){if(/\(\d+\)$/.test(word))continue;const phones=pronunciation.split('#')[0].trim();if(!phones)continue;data[word]=arpabetToIPA(phones);}
writeFileSync('dist/ipa-data.js','// CMU Pronouncing Dictionary; see IPA-LICENSE.txt\nexport default '+JSON.stringify(data)+';\n');
writeFileSync('dist/IPA-LICENSE.txt','Pronunciation data derived from the Carnegie Mellon Pronouncing Dictionary.\nSource: https://github.com/cmusphinx/cmudict\nDistributed via cmu-pronouncing-dictionary v3.0.0.\n\n'+readFileSync('node_modules/cmu-pronouncing-dictionary/license','utf8'));
console.log('Built IPA entries: '+Object.keys(data).length);
