// Bind this project to the private CathSim workbook. No access keys belong in GitHub.
function setup() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const headers={Accounts:['code','role','allowed_codes','secret_hash','enabled'],Attempts:['id','participant_code','lesson','correct','seconds','mode','timestamp'],StepEvents:['id','participant_code','topic','step_index','trigger','seconds','timestamp'],Observations:['participant_code','lesson','observed_at','assessor_code','result','catheter_days','confirmed_cauti']};
  Object.keys(headers).forEach(name=>{const s=ss.getSheetByName(name)||ss.insertSheet(name);if(!s.getLastRow())s.appendRow(headers[name]);s.setFrozenRows(1);});
  PropertiesService.getScriptProperties().setProperty('SHEET_ID',ss.getId());
}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
// Run ONLY in the owner editor; returns a 256-bit-like random key to give privately.
function issueAccount(code,role,allowedCodes){
  if(!/^[A-Z0-9-]{6,32}$/.test(code)||!['patient','caregiver'].includes(role))throw Error('Invalid account');
  const s=book_().getSheetByName('Accounts');if(s.getDataRange().getValues().slice(1).some(r=>r[0]===code))throw Error('Account exists');
  const access=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  s.appendRow([code,role,role==='patient'?code:allowedCodes.join(','),digest_(code+':'+access),true]);return {code:code,access:access};
}
function book_(){return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));}
function rows_(name){return book_().getSheetByName(name).getDataRange().getValues().slice(1);}
function account_(code){const a=rows_('Accounts').find(r=>r[0]===code&&r[4]===true);if(!a)throw Error('Access denied');return {code:a[0],role:a[1],allowed:String(a[2]).split(','),hash:a[3]};}
function reports_(a){return rows_('Attempts').filter(r=>a.allowed.includes(r[1])).slice(-500).map(r=>({id:r[0],code:r[1],lesson:r[2],correct:r[3]===true,seconds:r[4],mode:r[5],time:r[6]}));}
function events_(a){const s=book_().getSheetByName('StepEvents');if(!s)return [];return s.getDataRange().getValues().slice(1).filter(r=>a.allowed.includes(r[1])).slice(-1000).map(r=>({id:r[0],code:r[1],topic:r[2],step:r[3],trigger:r[4],seconds:r[5],time:r[6]}));}
function doPost(e){
  try{
    if(!e.postData||e.postData.contents.length>6000)throw Error('Invalid request');
    const b=JSON.parse(e.postData.contents),cache=CacheService.getScriptCache();let a;
    if(b.action==='login'){
      if(typeof b.code!=='string'||typeof b.access!=='string')throw Error('Access denied');
      const limit='login:'+digest_(b.code);const tries=Number(cache.get(limit)||0);if(tries>=10)throw Error('Try again later');cache.put(limit,String(tries+1),900);
      a=account_(b.code);if(a.hash!==digest_(b.code+':'+b.access))throw Error('Access denied');cache.remove(limit);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),a.code,3600);
      return out_({ok:true,token:token,role:a.role,attempts:a.role==='caregiver'?reports_(a):[]});
    }
    if(typeof b.token!=='string'||b.token.length>100)throw Error('Session expired');const code=cache.get('session:'+digest_(b.token));if(!code)throw Error('Session expired');a=account_(code);
    if(b.action==='report')return out_({ok:true,attempts:reports_(a),events:events_(a)});
    if(b.action==='progress'){
      if(a.role!=='patient')throw Error('Access denied');
      const t=b.event,limits={hands:3,position:4,tube:3,secure:3,drain:5,change:5,hygiene:5,water:3,followup:2,trouble:3};
      if(!t||!/^[a-f0-9-]{36}$/.test(t.id)||!Object.prototype.hasOwnProperty.call(limits,t.topic)||!Number.isInteger(t.step)||t.step<0||t.step>=limits[t.topic]||!['confirmed','auto'].includes(t.trigger)||!Number.isFinite(t.seconds)||t.seconds<0||t.seconds>86400)throw Error('Invalid progress');
      const lock=LockService.getScriptLock();lock.waitLock(10000);
      try{let s=book_().getSheetByName('StepEvents');if(!s){s=book_().insertSheet('StepEvents');s.appendRow(['id','participant_code','topic','step_index','trigger','seconds','timestamp']);s.setFrozenRows(1);}if(!s.getDataRange().getValues().slice(1).some(r=>r[0]===t.id))s.appendRow([t.id,a.code,t.topic,t.step,t.trigger,t.seconds,new Date().toISOString()]);}finally{lock.releaseLock();}
      return out_({ok:true});
    }
    if(b.action!=='record'||a.role!=='patient')throw Error('Access denied');
    const t=b.attempt,ids=['hands','position','drain','hygiene','water','followup','trouble'];
    if(!t||!/^[a-f0-9-]{36}$/.test(t.id)||!ids.includes(t.lesson)||typeof t.correct!=='boolean'||!Number.isFinite(t.seconds)||t.seconds<0||t.seconds>86400||!['learn','practice','challenge'].includes(t.mode))throw Error('Invalid attempt');
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try{const s=book_().getSheetByName('Attempts');if(!rows_('Attempts').some(r=>r[0]===t.id))s.appendRow([t.id,a.code,t.lesson,t.correct,t.seconds,t.mode,new Date().toISOString()]);}finally{lock.releaseLock();}
    return out_({ok:true});
  }catch(err){return out_({ok:false,error:'Access denied or request invalid. Check account, key and session.'});}
}
function out_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
