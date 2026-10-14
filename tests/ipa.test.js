import test from 'node:test';
import assert from 'node:assert/strict';
import {arpabetToIPA} from '../scripts/arpabet.js';
import {toIPA} from '../dist/ipa.js';
test('ARPAbet converts vowels, consonants and stress placement',()=>{assert.equal(arpabetToIPA('HH AH0 L OW1'),'həˈloʊ');assert.equal(arpabetToIPA('B UW1 D AH0'),'ˈbudə');assert.equal(arpabetToIPA('IH0 N D EH1 V ER0'),'ɪnˈdɛvɚ');assert.equal(arpabetToIPA('TH AH1 S'),'θʌs');});
test('IPA supports case, contractions and preserves punctuation',()=>{const result=toIPA('Thus have I heard.');assert.equal(result.missing.length,0);assert.ok(result.text.includes('ðʌs'));assert.ok(result.text.endsWith('.'));assert.equal(toIPA("don't").missing.length,0);assert.equal(toIPA('don’t').text,toIPA("don't").text);});
test('IPA excludes subtitle audio annotations',()=>{const result=toIPA('>> [music] Hello [singing and music] world.');assert.equal(result.missing.length,0);assert.ok(!result.text.includes('music'));assert.ok(!result.text.includes('['));});
test('unknown terms remain visibly marked without fabricated IPA',()=>{const result=toIPA('zzunknownwordzz');assert.equal(result.text,'⟨zzunknownwordzz⟩');assert.deepEqual(result.missing,['zzunknownwordzz']);});
