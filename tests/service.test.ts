import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
function fixture(){
 const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
 const data:Record<string,unknown[][]>={
  Accounts:[['code','role','allowed_codes','secret_hash','enabled','username'],['CS-AAAAAA','patient','CS-AAAAAA',sha('CS-AAAAAA:keyA'),true,'userA'],['CG-AAAAAA','caregiver','CS-AAAAAA',sha('CG-AAAAAA:keyC'),true,'userC']],
  Attempts:[['id','participant_code','lesson','correct','seconds','mode','timestamp'],[randomUUID(),'CS-BBBBBB','hands',true,8,'challenge','2026-11-08']],
  StepEvents:[['id','participant_code','topic','step_index','trigger','seconds','timestamp','mode','actions']],
  ConfidentialIdentity:[['cs_id','hn','full_name','updated_at','confidential_policy']],
  PatientSummary:[['cs_id','username','last_learned_at','topics_learned','confirmed_steps','total_steps','score_percent','pass_status_80','learned_topics_list']]
 };
 data.Accounts.push(['AD-AAAAAA','admin','CS-AAAAAA',sha('AD-AAAAAA:keyD'),true,'admin']);
 const cache=new Map();
 const sheets={
   getSheetByName:(name:string)=>data[name]?({getDataRange:()=>({getValues:()=>data[name]}),appendRow:(r:unknown[])=>data[name].push(r),deleteRow:(i:number)=>data[name].splice(i-1,1)}):null,
   insertSheet:(name:string)=>{data[name]=data[name]||[];return sheets.getSheetByName(name);}
 };
 const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},SpreadsheetApp:{openById:()=>sheets},CacheService:{getScriptCache:()=>({get:(k:string)=>cache.get(k),put:(k:string,v:string)=>cache.set(k,v),remove:(k:string)=>cache.delete(k)})},Utilities:{DigestAlgorithm:{SHA_256:1},computeDigest:(_:number,s:string)=>Array.from(createHash('sha256').update(s).digest()),getUuid:randomUUID},ContentService:{MimeType:{JSON:1},createTextOutput:(s:string)=>({setMimeType:()=>s})},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}});
 vm.runInContext(fs.readFileSync(new URL('../server/Code.gs',import.meta.url),'utf8'),ctx);
 return {data,call:(body:unknown)=>JSON.parse(ctx.doPost({postData:{contents:JSON.stringify(body)}}))};
}
test('service rejects invalid keys and missing sessions',()=>{const f=fixture();assert.equal(f.call({action:'login',code:'CS-AAAAAA',access:'wrong'}).ok,false);assert.equal(f.call({action:'report',token:'invalid'}).ok,false);});
test('caregiver sees only linked codes and cannot write attempts',()=>{const f=fixture();const x=f.call({action:'login',code:'CG-AAAAAA',access:'keyC'});assert.equal(x.ok,true);assert.equal(x.attempts.length,0);assert.equal(f.call({action:'record',token:x.token,attempt:{}}).ok,false);});
test('service binds records to session identity and deduplicates attempt IDs',()=>{const f=fixture();const x=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'});const body={action:'record',token:x.token,attempt:{id:randomUUID(),code:'CS-BBBBBB',lesson:'hands',correct:true,seconds:5,mode:'challenge'}};assert.equal(f.call(body).ok,true);assert.equal(f.call(body).ok,true);assert.equal(f.data.Attempts.length,3);assert.equal(f.data.Attempts[2][1],'CS-AAAAAA');});
test('revoked accounts lose cached-session access',()=>{const f=fixture();const x=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'});f.data.Accounts[1][4]=false;assert.equal(f.call({action:'report',token:x.token}).ok,false);});
test('guided progress records confirmed and auto as separate facts, with scoped reports',()=>{const f=fixture(),p=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'}),c=f.call({action:'login',code:'AD-AAAAAA',access:'keyD'});for(const trigger of ['confirmed','auto'])assert.equal(f.call({action:'progress',token:p.token,event:{id:randomUUID(),code:'CS-BBBBBB',topic:'change',step:2,trigger,seconds:18}}).ok,true);const report=f.call({action:'report',token:c.token});assert.equal(report.events.length,2);assert.deepEqual(report.events.map((e:any)=>e.trigger),['confirmed','auto']);assert.ok(report.events.every((e:any)=>e.code==='CS-AAAAAA'));assert.equal(f.call({action:'progress',token:c.token,event:{}}).ok,false);assert.equal(f.call({action:'progress',token:p.token,event:{id:randomUUID(),topic:'change',step:99,trigger:'auto',seconds:10}}).ok,false);});

test('only admin can report or delete; scoped deletion preserves other patients',()=>{const f=fixture(),p=f.call({action:'login',code:'CS-AAAAAA',access:'keyA'}),c=f.call({action:'login',code:'CG-AAAAAA',access:'keyC'}),a=f.call({action:'login',code:'AD-AAAAAA',access:'keyD'});for(const token of [p.token,c.token])for(const action of ['report','deleteHistory'])assert.equal(f.call({action,token}).ok,false);const event={id:randomUUID(),topic:'drain',step:2,trigger:'confirmed',seconds:10,mode:'practice',actions:['เปิดก๊อก']};assert.equal(f.call({action:'progress',token:p.token,event}).ok,true);assert.deepEqual(f.call({action:'report',token:a.token}).events[0].actions,['เปิดก๊อก']);assert.equal(f.call({action:'deleteHistory',token:a.token}).ok,true);assert.equal(f.data.StepEvents.length,1);assert.equal(f.data.Attempts.length,2);});

test('patientRegister and patientLogin with 6-digit PIN and cross-device support',()=>{
  const f=fixture();
  // PIN must be 6 digits
  assert.equal(f.call({action:'patientRegister',username:'somchai',access:'123'}).ok,false);
  // Register with 6-digit PIN
  const reg=f.call({action:'patientRegister',username:'somchai',access:'123456'});
  assert.equal(reg.ok,true);
  assert.equal(reg.code,'CS-1');
  assert.equal(reg.username,'somchai');

  // Duplicate username rejected
  assert.equal(f.call({action:'patientRegister',username:'somchai',access:'654321'}).ok,false);

  // Login by Username with 6-digit PIN
  const lUser=f.call({action:'patientLogin',code:'somchai',access:'123456'});
  assert.equal(lUser.ok,true);
  assert.equal(lUser.code,'CS-1');

  // Login by numeric CS-ID "1" with 6-digit PIN
  const lNum=f.call({action:'patientLogin',code:'1',access:'123456'});
  assert.equal(lNum.ok,true);
  assert.equal(lNum.code,'CS-1');

  // Login by full "CS-1" with 6-digit PIN
  const lFull=f.call({action:'patientLogin',code:'CS-1',access:'123456'});
  assert.equal(lFull.ok,true);
  assert.equal(lFull.code,'CS-1');

  // Wrong PIN rejected
  assert.equal(f.call({action:'patientLogin',code:'CS-1',access:'999999'}).ok,false);

  // Unregistered account rejected
  assert.equal(f.call({action:'patientLogin',code:'nonexistent',access:'123456'}).ok,false);

  // Record progress
  const ev={id:randomUUID(),topic:'hygiene',step:0,trigger:'confirmed',seconds:14,mode:'learn',actions:['ล้างด้วยสบู่อ่อน']};
  assert.equal(f.call({action:'progress',token:lFull.token,event:ev}).ok,true);
});
