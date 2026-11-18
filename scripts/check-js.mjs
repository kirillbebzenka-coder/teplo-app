import {readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const temp=mkdtempSync(join(tmpdir(),'teplo-check-'));let count=0,failed=false;
function check(path,label=path){const r=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});count++;if(r.status!==0){failed=true;console.error(label+'\n'+r.stderr)}}
function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','.temp'].includes(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())visit(path);else if(/\.(js|mjs)$/.test(path))check(path);else if(/\.html$/.test(path)){const html=readFileSync(path,'utf8');let index=0;for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(/\bsrc=/.test(match[1])||!/\S/.test(match[2])||/type=["']application\/(ld\+)?json/.test(match[1]))continue;const target=join(temp,(count++)+'-'+index+++'.mjs');writeFileSync(target,match[2]);check(target,path+' inline script')}}}}
try{visit('.')}finally{rmSync(temp,{recursive:true,force:true})}
if(failed)process.exit(1);console.log('PASS: JavaScript files and inline HTML scripts ('+count+' checks).');
