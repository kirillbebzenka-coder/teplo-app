import assert from 'node:assert/strict';
import {preparationMinutes} from '../pilot-buyer-dispatch.js';
for(const input of ['',null,undefined,' ','00','-1','181','1.5','NaN'])assert.throws(()=>preparationMinutes(input),/Укажи время/);
for(const n of [0,10,15,20,30,45,60,90,120,180])assert.equal(preparationMinutes(String(n)),n);
console.log('PASS: kitchen time must be explicitly chosen; zero is valid, empty/fractional/out-of-range input is rejected.');
