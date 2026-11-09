// Bind this project to the private CathSim workbook. Patient HN and full names are stored ONLY in CS_HN_Directory (ConfidentialIdentity) for Admin and never exposed to patients.
function setup() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const headers={
    Accounts:['code','role','allowed_codes','secret_hash','enabled','username'],
    PatientSummary:['cs_id','username','last_learned_at','topics_learned','confirmed_steps','total_steps','score_percent','pass_status_80','learned_topics_list','completions_summary','total_completions'],
    StepEvents:['id','participant_code','topic','step_index','trigger','seconds','timestamp','mode','actions'],
    CS_HN_Directory:['cs_id','hn','full_name','updated_at','confidential_policy'],
    ConfidentialIdentity:['cs_id','hn','full_name','updated_at','confidential_policy']
  };
  Object.keys(headers).forEach(name=>{const s=ss.getSheetByName(name)||ss.insertSheet(name);if(!s.getLastRow())s.appendRow(headers[name]);s.setFrozenRows(1);});
  PropertiesService.getScriptProperties().setProperty('SHEET_ID',ss.getId());
}
function cleanupUnusedSheets() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const keep=['Accounts','PatientSummary','StepEvents','CS_HN_Directory','ConfidentialIdentity'];
  ss.getSheets().forEach(sh=>{
    if(!keep.includes(sh.getName())&&ss.getSheets().length>1){
      ss.deleteSheet(sh);
    }
  });
}
function digest_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,s).map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');}
function issueAccount(code,role,allowedCodes,customPin){
  if(!/^(CS-[A-Z0-9]{1,28}|[A-Z0-9-]{4,32})$/.test(code)||!['patient','caregiver','admin'].includes(role))throw Error('Invalid account');
  const s=book_().getSheetByName('Accounts');if(s.getDataRange().getValues().slice(1).some(r=>r[0]===code))throw Error('Account exists');
  const access=customPin?String(customPin):(Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  s.appendRow([code,role,role==='patient'?code:allowedCodes.join(','),digest_(code+':'+access),true,code]);return {code:code,access:access};
}
function book_(){return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));}
function rows_(name){const sh=book_().getSheetByName(name);return sh?sh.getDataRange().getValues().slice(1):[];}
function nextCsId_(){
  let max=0;
  rows_('Accounts').forEach(r=>{
    const m=/^CS-(\d+)$/.exec(String(r[0]||'').trim().toUpperCase());
    if(m){const n=Number(m[1]);if(Number.isFinite(n)&&n>max)max=n;}
  });
  return 'CS-'+(max+1);
}
function account_(code){
  if(code==='ADMIN')return {code:'ADMIN',role:'admin',allowed:['*'],hash:'',username:'Admin'};
  const a=rows_('Accounts').find(r=>r[0]===code&&r[4]===true);
  if(!a)throw Error('Access denied');
  return {code:a[0],role:a[1],allowed:String(a[2]).split(','),hash:a[3],username:a[5]||a[0]};
}
function canRead_(a,code){return a.role==='admin'&&(a.allowed.includes('*')||a.allowed.includes(code));}
function reports_(a){return rows_('Attempts').filter(r=>canRead_(a,r[1])).slice(-500).map(r=>({id:r[0],code:r[1],lesson:r[2],correct:r[3]===true,seconds:r[4],mode:r[5],time:r[6]}));}
function events_(a,csFilter){const s=book_().getSheetByName('StepEvents');if(!s)return [];return s.getDataRange().getValues().slice(1).filter(r=>canRead_(a,r[1])&&(!csFilter||r[1]===csFilter)).slice(-2000).map(r=>({id:r[0],code:r[1],topic:r[2],step:r[3],trigger:r[4],seconds:r[5],time:r[6],mode:r[7]||'learn',actions:r[8]?JSON.parse(r[8]):[]}));}
function patientEvents_(code){const s=book_().getSheetByName('StepEvents');if(!s)return [];return s.getDataRange().getValues().slice(1).filter(r=>r[1]===code).slice(-500).map(r=>({id:r[0],code:r[1],topic:r[2],step:r[3],trigger:r[4],seconds:r[5],time:r[6],mode:r[7]||'learn',actions:r[8]?JSON.parse(r[8]):[]}));}
function confidentialLinks_(a){
  if(!a||a.role!=='admin')return [];
  const book=book_();
  const s=book.getSheetByName('CS_HN_Directory')||book.getSheetByName('ConfidentialIdentity');
  if(!s||!s.getDataRange)return [];
  const vals=s.getDataRange().getValues();
  if(!Array.isArray(vals))return [];
  return vals.slice(1).filter(r=>r[0]&&canRead_(a,String(r[0]))).map(r=>({
    csId:String(r[0]).trim().toUpperCase(),
    hn:String(r[1]||'').trim(),
    fullName:String(r[2]||'').trim(),
    updatedAt:String(r[3]||'').trim()
  }));
}
function updatePatientSummary_(code){
  try{
    const book=book_();if(!book||!book.insertSheet)return;
    const limits={hands:3,hygiene:5,position:4,tube:3,secure:3,drain:5,change:5,followup:2,water:3,trouble:3};
    const totalSteps=36;
    const evs=patientEvents_(code);
    const acc=rows_('Accounts').find(r=>r[0]===code);
    const uname=acc&&acc[5]?String(acc[5]):code;
    const confirmedMap={},topicsSet={},completedMap={};
    let lastTime='';
    evs.forEach(e=>{
      if(limits[e.topic]&&e.step>=0&&e.step<limits[e.topic]){
        topicsSet[e.topic]=true;
        if(e.trigger==='confirmed')confirmedMap[e.topic+':'+e.step]=true;
        if(e.step===limits[e.topic]-1){
          completedMap[e.topic]=(completedMap[e.topic]||0)+1;
        }
        if(!lastTime||String(e.time)>lastTime)lastTime=String(e.time);
      }
    });
    const confirmedCount=Object.keys(confirmedMap).length;
    const topicsList=Object.keys(topicsSet);
    const totalCompletions=Object.values(completedMap).reduce((a,b)=>a+b,0);
    const scorePercent=Math.round((confirmedCount/totalSteps)*100);
    const passStatus=scorePercent>=80?'PASS (>=80%)':'NEEDS_PRACTICE (<80%)';
    const completionsSummary=Object.entries(completedMap).map(([t,c])=>t+':'+c+'ครั้ง').join(', ')||(topicsList.length>0?'กำลังเรียน':'ยังไม่เคยเรียน');
    let sh=book.getSheetByName('PatientSummary');
    if(!sh){sh=book.insertSheet('PatientSummary');sh.appendRow(['cs_id','username','last_learned_at','topics_learned','confirmed_steps','total_steps','score_percent','pass_status_80','learned_topics_list','completions_summary','total_completions']);if(sh.setFrozenRows)sh.setFrozenRows(1);}
    const allRows=sh.getDataRange().getValues();
    for(let i=allRows.length-1;i>0;i--){if(allRows[i][0]===code&&sh.deleteRow)sh.deleteRow(i+1);}
    sh.appendRow([code,uname,lastTime||new Date().toISOString(),topicsList.length+'/10',confirmedCount,totalSteps,scorePercent+'%',passStatus,topicsList.join(', '),completionsSummary,totalCompletions]);
  }catch(_){}
}
function doPost(e){
  try{
    if(!e.postData||e.postData.contents.length>12000)throw Error('Invalid request');
    const b=JSON.parse(e.postData.contents),cache=CacheService.getScriptCache();let a;
    if(b.action==='login'){
      if(typeof b.code!=='string'||typeof b.access!=='string')throw Error('Access denied');
      const isAdminAttempt=b.code.startsWith('AD-');
      const maxWrong=isAdminAttempt?2:10;
      const limit='login:'+digest_(b.code);const tries=Number(cache.get(limit)||0);
      if(tries>maxWrong)throw Error('Locked for 15 minutes');
      a=account_(b.code);
      if(a.hash!==digest_(b.code+':'+b.access)){
        cache.put(limit,String(tries+1),900);
        throw Error('Access denied');
      }
      cache.remove(limit);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),a.code,3600);
      return out_({ok:true,token:token,role:a.role,code:a.code,attempts:a.role==='admin'?reports_(a):[],events:a.role==='patient'?patientEvents_(a.code):[],confidentialLinks:a.role==='admin'?confidentialLinks_(a):[]});
    }
    if(b.action==='patientRegister'){
      const uname=String(b.username||'').trim(),pin=String(b.access||'').trim();
      if(uname.length<2||uname.length>40||!/^\d{6}$/.test(pin))throw Error('ชื่อบัญชีต้องอย่างน้อย 2 ตัวอักษร และ PIN ต้องเป็นตัวเลข 6 หลัก');
      const accSheet=book_().getSheetByName('Accounts');
      const existingByUname=rows_('Accounts').find(r=>String(r[5]||'').toLowerCase()===uname.toLowerCase()||String(r[0]||'').toLowerCase()===uname.toLowerCase());
      if(existingByUname)throw Error('ชื่อบัญชีนี้มีผู้ใช้งานแล้ว');
      const assignedCode=nextCsId_();
      accSheet.appendRow([assignedCode,'patient',assignedCode,digest_(assignedCode+':'+pin),true,uname]);
      updatePatientSummary_(assignedCode);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),assignedCode,3600);
      return out_({ok:true,token:token,role:'patient',code:assignedCode,username:uname,events:[]});
    }
    if(b.action==='patientLogin'){
      if(typeof b.code!=='string'||typeof b.access!=='string')throw Error('Access denied');
      const rawIdentifier=b.code.trim(),pin=b.access.trim();
      if(!rawIdentifier||!/^\d{6}$/.test(pin))throw Error('PIN ต้องเป็นตัวเลข 6 หลัก');
      const limit='login:'+digest_(rawIdentifier.toUpperCase());const tries=Number(cache.get(limit)||0);if(tries>=10)throw Error('Try again later');cache.put(limit,String(tries+1),900);
      const accSheet=book_().getSheetByName('Accounts');
      const allAcc=rows_('Accounts');
      let upperId=rawIdentifier.toUpperCase();
      if(/^\d+$/.test(upperId)) upperId='CS-'+upperId;
      if(/^CS\d+$/.test(upperId)) upperId='CS-'+upperId.slice(2);
      let existing=allAcc.find(r=>String(r[0]||'').toUpperCase()===upperId||(r[5]&&String(r[5]).toLowerCase()===rawIdentifier.toLowerCase()));
      if(!existing){
        throw Error('ไม่พบบัญชีผู้ใช้หรือรหัส CS นี้ในระบบ กรุณาสมัครบัญชีก่อนค่ะ');
      }
      let resolvedCode=String(existing[0]);
      let resolvedUser=existing[5]?String(existing[5]):rawIdentifier;
      if(existing[4]!==true||existing[3]!==digest_(resolvedCode+':'+pin)){
        throw Error('รหัส PIN ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้งค่ะ');
      }
      cache.remove(limit);
      const token=Utilities.getUuid()+Utilities.getUuid();cache.put('session:'+digest_(token),resolvedCode,3600);
      return out_({ok:true,token:token,role:'patient',code:resolvedCode,username:resolvedUser,events:patientEvents_(resolvedCode)});
    }
    if(b.action==='adminLogin'){
      const pwd=String(b.access||'').trim();
      if(pwd.toLowerCase()!=='dmknj')throw Error('รหัสผ่าน Admin ไม่ถูกต้อง');
      const token=Utilities.getUuid()+Utilities.getUuid();
      cache.put('session:'+digest_(token),'ADMIN',7200);
      return out_({ok:true,token:token,role:'admin',code:'ADMIN',confidentialLinks:confidentialLinks_({role:'admin',allowed:['*']})});
    }
    if(b.action==='linkPatientIdentity'){
      const key=String(b.adminKey||b.access||b.token||'').trim();
      let isAuth=(key.toLowerCase()==='dmknj'||key==='local-admin-dmknj');
      if(!isAuth&&b.token){
        const c=cache.get('session:'+digest_(b.token));
        if(c){try{const acc=account_(c);if(acc&&acc.role==='admin')isAuth=true;}catch(_){}}
      }
      if(!isAuth)throw Error('Access denied (Admin credentials required)');
      const targetCs=String(b.csId||'').trim().toUpperCase();
      const hn=String(b.hn||'').trim();
      const fullName=String(b.fullName||'').trim();
      if(!/^CS-[A-Z0-9]{1,28}$/.test(targetCs)||!hn||!fullName||hn.length>60||fullName.length>120)throw Error('Invalid link data');
      const book=book_();
      const targetSheets=['CS_HN_Directory','ConfidentialIdentity'];
      targetSheets.forEach(name=>{
        let sh=book.getSheetByName(name);
        if(!sh&&book.insertSheet){
          sh=book.insertSheet(name);
          sh.appendRow(['cs_id','hn','full_name','updated_at','confidential_policy']);
          if(sh.setFrozenRows)sh.setFrozenRows(1);
        }
        if(sh){
          const all=sh.getDataRange().getValues();
          for(let i=all.length-1;i>0;i--){
            if(String(all[i][0]||'').trim().toUpperCase()===targetCs&&sh.deleteRow)sh.deleteRow(i+1);
          }
          sh.appendRow([targetCs,hn,fullName,new Date().toISOString(),'CONFIDENTIAL_ADMIN_ONLY_DO_NOT_PUBLISH']);
        }
      });
      return out_({ok:true,csId:targetCs,confidentialLinks:confidentialLinks_({role:'admin',allowed:['*']})});
    }
    if(typeof b.token!=='string'||b.token.length>100)throw Error('Session expired');const code=cache.get('session:'+digest_(b.token));if(!code)throw Error('Session expired');a=account_(code);
    if(b.action==='report'){
      if(a.role!=='admin')throw Error('Access denied');
      const csFilter=typeof b.csId==='string'&&b.csId.trim()?b.csId.trim().toUpperCase():'';
      return out_({ok:true,attempts:reports_(a),events:events_(a,csFilter),confidentialLinks:confidentialLinks_(a)});
    }
    if(b.action==='registerPatient'){
      if(a.role!=='admin')throw Error('Access denied');
      const pCode=String(b.csId||'').trim().toUpperCase(),pPin=String(b.pin||'').trim(),pUser=String(b.username||pCode).trim();
      if(!/^CS-[A-Z0-9]{1,28}$/.test(pCode)||!/^\d{6}$/.test(pPin))throw Error('PIN ต้องเป็นตัวเลข 6 หลัก');
      const accSheet=book_().getSheetByName('Accounts');
      const allAcc=accSheet.getDataRange().getValues();
      for(let i=allAcc.length-1;i>0;i--){if(allAcc[i][0]===pCode&&accSheet.deleteRow)accSheet.deleteRow(i+1);}
      accSheet.appendRow([pCode,'patient',pCode,digest_(pCode+':'+pPin),true,pUser]);
      return out_({ok:true,code:pCode,username:pUser});
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
  }catch(err){return out_({ok:false,error:err&&err.message?err.message:'Access denied or request invalid.'});}
}
function doGet(e){
  try{
    if(e&&e.parameter&&e.parameter.action==='linkPatientIdentity'){
      const key=String(e.parameter.adminKey||e.parameter.access||'').trim();
      if(key.toLowerCase()!=='dmknj')throw Error('Access denied');
      const targetCs=String(e.parameter.csId||'').trim().toUpperCase();
      const hn=String(e.parameter.hn||'').trim();
      const fullName=String(e.parameter.fullName||'').trim();
      if(!/^CS-[A-Z0-9]{1,28}$/.test(targetCs)||!hn||!fullName)throw Error('Invalid link data');
      const book=book_();
      const targetSheets=['CS_HN_Directory','ConfidentialIdentity'];
      targetSheets.forEach(name=>{
        let sh=book.getSheetByName(name);
        if(!sh&&book.insertSheet){
          sh=book.insertSheet(name);
          sh.appendRow(['cs_id','hn','full_name','updated_at','confidential_policy']);
          if(sh.setFrozenRows)sh.setFrozenRows(1);
        }
        if(sh){
          const all=sh.getDataRange().getValues();
          for(let i=all.length-1;i>0;i--){
            if(String(all[i][0]||'').trim().toUpperCase()===targetCs&&sh.deleteRow)sh.deleteRow(i+1);
          }
          sh.appendRow([targetCs,hn,fullName,new Date().toISOString(),'CONFIDENTIAL_ADMIN_ONLY_DO_NOT_PUBLISH']);
        }
      });
      return out_({ok:true,csId:targetCs,method:'GET'});
    }
    return out_({ok:true,status:'CathSim 360 backend service is running'});
  }catch(err){
    return out_({ok:false,error:err&&err.message?err.message:'Invalid request'});
  }
}
function out_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
