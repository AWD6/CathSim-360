import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
function fixture(){
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const data:Record<string,unknown[][]>={Accounts:[['code','role','allowed_codes','secret_hash','enabled'],['CS-AAAAAA','patient','CS-AAAAAA',sha('CS-AAAAAA:keyA'),true],['CG-AAAAAA','caregiver','CS-AAAAAA',sha('CG-AAAAAA:keyC'),true]],Attempts:[['id','participant_code','lesson','correct','seconds','mode','timestamp'],[randomUUID(),'CS-BBBBBB','hands',true,8,'challenge','2026-11-08']]};
 const cache=new Map();const sheets={getSheetByName:(name:string)=>({getDataRange:()=>({getValues:()=>data[name]}),appendRow:(r:unknown[])=>data[name].push(r)})};
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},SpreadsheetApp:{openById:()=>sheets},CacheService:{getScriptCache:()=>({get:(k:string)=>cache.get(k),put:(k:string,v:string)=>cache.set(k,v),remove:(k:string)=>cache.delete(k)})},Utilities:{DigestAlgorithm:{SHA_256:1},computeDigest:(_:number,s:string)=>Array.from(createHash('sha256').update(s).digest()),getUuid:randomUUID},ContentService:{MimeType:{JSON:1},createTextOutput:(s:string)=>({setMimeType:()=>s})},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}});
 vm.runInContext(fs.readFileSync(new URL('../server/Code.gs',import.meta.url),'utf8'),ctx);
 return {data,call:(body:unknown)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}))};
}
test('service rejects invalid keys and missing sessions',()=>{const f=fixture();assert.equal(f.call({action:'login',code:'CS-AAAAAA',access:'wrong'}).ok,false);assert.equal(f.call({action:'report',token:'invalid'}).ok,false);});
test('caregiver sees only linked codes and cannot write attempts',()=>{const f=fixture();const x=f.call({action:'login',code:'CG-AAAAAA',access:'keyC'});assert.equal(x.ok,true);assert.equal(x.attempts.length,0);assert.equal(f.call({action:'record',token:x.token,attempt:{}}).ok,false);});
test('service binds records to session identity and deduplicates attempt IDs',()=>{const f=fixture();const x=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'});const body={action:'record',token:x.token,attempt:{id:randomUUID(),code:'CS-BBBBBB',lesson:'hands',correct:true,seconds:5,mode:'challenge'}};assert.equal(f.call(body).ok,true);assert.equal(f.call(body).ok,true);assert.equal(f.data.Attempts.length,3);assert.equal(f.data.Attempts[2][1],'CS-AAAAAA');});
test('revoked accounts lose cached-session access',()=>{const f=fixture();const x=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'});f.data.Accounts[1][4]=false;assert.equal(f.call({action:'report',token:x.token}).ok,false);});