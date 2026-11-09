// Bind this project to the private CathSim workbook. No access keys or HN/patient names belong in GitHub or Google Sheets.
function setup() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const headers={
    Accounts:['code','role','allowed_codes','secret_hash','enabled'],
    Attempts:['id','participant_code','lesson','correct','seconds','mode','timestamp'],
    StepEvents:['id','participant_code','topic','step_index','trigger','seconds','timestamp','mode','actions'],
    PatientSummary:['cs_id','last_learned_at','topics_learned','confirmed_steps','total_steps','score_percent','pass_status_80','learned_topics_list'],
    Observations:['participant_code','lesson','observed_at','assessor_code','result','catheter_days','confirmed_cauti']
  };
  Object.keys(headers).forEach(name=>{const s=ss.getSheetByName(name)||ss.insertSheet(name);if(!s.getLastRow())s.appendRow(headers[name]);s.setFrozenRows(1);});
  PropertiesService.getScriptProperties().setProperty('SHEET_ID',ss.getId());
}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
// Run ONLY in the owner editor; returns a 256-bit-like random key or sets a custom PIN to give privately.
function issueAccount(code,role,allowedCodes,customPin){
  if(!/^(CS-[A-Z0-9]{1,28}|[A-Z0-9-]{4,32})$/.test(code)||!['patient','caregiver','admin'].includes(role))throw Error('Invalid account');
  const s=book_().getSheetByName('Accounts');if(s.getDataRange().getValues().slice(1).some(r=>r[0]===code))throw Error('Account exists');
  const access=customPin?String(customPin):(Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  s.appendRow([code,role,role==='patient'?code:allowedCodes.join(','),digest_(code+':'+access),true]);return {code:code,access:access};
}
function book_(){return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));}
function rows_(name){const sh=book_().getSheetByName(name);return sh?sh.getDataRange().getValues().slice(1):[];}
function account_(code){const a=rows_('Accounts').find(r=>r[0]===code&&r[4]===true);if(!a)throw Error('Access denied');return {code:a[0],role:a[1],allowed:String(a[2]).split(','),hash:a[3]};}
function canRead_(a,code){return a.role==='admin'&&(a.allowed.includes('*')||a.allowed.includes(code));}
function reports_(a){return rows_('Attempts').filter(r=>canRead_(a,r[1])).slice(-500).map(r=>({id:r[0],code:r[1],lesson:r[2],correct:r[3]===true,seconds:r[4],mode:r[5],time:r[6]}));}
function events_(a,csFilter){const s=book_().getSheetByName('StepEvents');if(!s)return [];return s.getDataRange().getValues().slice(1).filter(r=>canRead_(a,r[1])&&(!csFilter||r[1]===csFilter)).slice(-2000).map(r=>({id:r[0],code:r[1],topic:r[2],step:r[3],trigger:r[4],seconds:r[5],time:r[6],mode:r[7]||'learn',actions:r[8]?JSON.parse(r[8]):[]}));}
function patientEvents_(code){const s=book_().getSheetByName('StepEvents');if(!s)return [];return s.getDataRange().getValues().slice(1).filter(r=>r[1]===code).slice(-500).map(r=>({id:r[0],code:r[1],topic:r[2],step:r[3],trigger:r[4],seconds:r[5],time:r[6],mode:r[7]||'learn',actions:r[8]?JSON.parse(r[8]):[]}));}
function updatePatientSummary_(code){
  try{
    const book=book_();if(!book.insertSheet)return;
    const limits={hands:3,hygiene:5,position:4,tube:3,secure:3,drain:5,change:5,followup:2,water:3,trouble:3};
    const totalSteps=36;
    const evs=patientEvents_(code);
    const confirmedMap={},topicsSet={};
    let lastTime='';
    evs.forEach(e=>{
      if(limits[e.topic]&&e.step>=0&&e.step<limits[e.topic]){
        topicsSet[e.topic]=true;
        if(e.trigger==='confirmed')confirmedMap[e.topic+':'+e.step]=true;
        if(!lastTime||String(e.time)>lastTime)lastTime=String(e.time);
      }
    });
    const confirmedCount=Object.keys(confirmedMap).length;
    const topicsList=Object.keys(topicsSet);
    const scorePercent=Math.round((confirmedCount/totalSteps)*100);
    const passStatus=scorePercent>=80?'PASS (>=80%)':'NEEDS_PRACTICE (<80%)';
    let sh=book.getSheetByName('PatientSummary');
    if(!sh){sh=book.insertSheet('PatientSummary');sh.appendRow(['cs_id','last_learned_at','topics_learned','confirmed_steps','total_steps','score_percent','pass_status_80','learned_topics_list']);if(sh.setFrozenRows)sh.setFrozenRows(1);}
    const allRows=sh.getDataRange().getValues();
    for(let i=allRows.length-1;i>0;i--){if(allRows[i][0]===code&&sh.deleteRow)sh.deleteRow(i+1);}
    sh.appendRow([code,lastTime||new Date().toISOString(),topicsList.length+'/10',confirmedCount,totalSteps,scorePercent+'%',passStatus,topicsList.join(', ')]);
  }catch(_){}
}
function doPost(e){
  try{
    if(!e.postData||e.postData.contents.length>12000)throw Error('Invalid request');
    const b=JSON.parse(e.postData.contents),cache=CacheService.getScriptCache();let a;
    if(b.action==='login'){
      if(typeof b.code!=='string'||typeof b.access!=='string')throw Error('Access denied');
      const limit='login:'+digest_(b.code);const tries=Number(cache.get(limit)||0);if(tries>=10)throw Error('Try again later');cache.put(limit,String(tries+1),900);
      a=account_(b.code);if(a.hash!==digest_(b.code+':'+b.access))throw Error('Access denied');cache.remove(limit);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),a.code,3600);
      return out_({ok:true,token:token,role:a.role,code:a.code,attempts:a.role==='admin'?reports_(a):[],events:a.role==='patient'?patientEvents_(a.code):[]});
    }
    if(b.action==='patientLogin'){
      if(typeof b.code!=='string'||typeof b.access!=='string')throw Error('Access denied');
      const code=b.code.trim().toUpperCase(),pin=b.access.trim();
      if(!/^CS-[A-Z0-9]{1,28}$/.test(code)||pin.length<3||pin.length>64)throw Error('Invalid CS ID or PIN');
      const limit='login:'+digest_(code);const tries=Number(cache.get(limit)||0);if(tries>=10)throw Error('Try again later');cache.put(limit,String(tries+1),900);
      const accSheet=book_().getSheetByName('Accounts');
      const existing=rows_('Accounts').find(r=>r[0]===code);
      if(existing){
        if(existing[4]!==true||existing[3]!==digest_(code+':'+pin))throw Error('Access denied');
      }else{
        accSheet.appendRow([code,'patient',code,digest_(code+':'+pin),true]);
      }
      cache.remove(limit);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),code,3600);
      return out_({ok:true,token:token,role:'patient',code:code,events:patientEvents_(code)});
    }
    if(typeof b.token!=='string'||b.token.length>100)throw Error('Session expired');const code=cache.get('session:'+digest_(b.token));if(!code)throw Error('Session expired');a=account_(code);
    if(b.action==='report'){
      if(a.role!=='admin')throw Error('Access denied');
      const csFilter=typeof b.csId==='string'&&b.csId.trim()?b.csId.trim().toUpperCase():'';
      return out_({ok:true,attempts:reports_(a),events:events_(a,csFilter)});
    }
    if(b.action==='registerPatient'){
      if(a.role!=='admin')throw Error('Access denied');
      const pCode=String(b.csId||'').trim().toUpperCase(),pPin=String(b.pin||'').trim();
      if(!/^CS-[A-Z0-9]{1,28}$/.test(pCode)||pPin.length<3||pPin.length>64)throw Error('Invalid CS ID or PIN');
      const accSheet=book_().getSheetByName('Accounts');
      const allAcc=accSheet.getDataRange().getValues();
      for(let i=allAcc.length-1;i>0;i--){if(allAcc[i][0]===pCode&&accSheet.deleteRow)accSheet.deleteRow(i+1);}
      accSheet.appendRow([pCode,'patient',pCode,digest_(pCode+':'+pPin),true]);
      return out_({ok:true,code:pCode});
    }
    if(b.action==='deleteHistory'){if(a.role!=='admin')throw Error('Access denied');const lock=LockService.getScriptLock();lock.waitLock(10000);try{['Attempts','StepEvents'].forEach(name=>{const sh=book_().getSheetByName(name);if(!sh)return;const rows=sh.getDataRange().getValues();for(let i=rows.length-1;i>0;i--){if(a.allowed.includes('*')||a.allowed.includes(rows[i][1]))sh.deleteRow(i+1);}});}finally{lock.releaseLock();}return out_({ok:true});}
    if(b.action==='progress'){
      if(!['patient','caregiver'].includes(a.role))throw Error('Access denied');
      const t=b.event,limits={hands:3,hygiene:5,position:4,tube:3,secure:3,drain:5,change:5,followup:2,water:3,trouble:3};
      if(!t||!/^[a-f0-9-]{36}$/.test(t.id)||!Object.prototype.hasOwnProperty.call(limits,t.topic)||!Number.isInteger(t.step)||t.step<0||t.step>=limits[t.topic]||!['confirmed','auto'].includes(t.trigger)||!Number.isFinite(t.seconds)||t.seconds<0||t.seconds>86400)throw Error('Invalid progress');
      if(t.mode!==undefined&&!['learn','practice','challenge'].includes(t.mode))throw Error('Invalid mode');if(t.actions!==undefined&&(!Array.isArray(t.actions)||t.actions.length>80||t.actions.some(v=>typeof v!=='string'||v.length>200)))throw Error('Invalid actions');
      const lock=LockService.getScriptLock();lock.waitLock(10000);
      try{let s=book_().getSheetByName('StepEvents');if(!s){s=book_().insertSheet('StepEvents');s.appendRow(['id','participant_code','topic','step_index','trigger','seconds','timestamp','mode','actions']);s.setFrozenRows(1);}if(!s.getDataRange().getValues().slice(1).some(r=>r[0]===t.id))s.appendRow([t.id,a.code,t.topic,t.step,t.trigger,t.seconds,t.time||new Date().toISOString(),t.mode||'learn',JSON.stringify(t.actions||[])]);updatePatientSummary_(a.code);}finally{lock.releaseLock();}
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
