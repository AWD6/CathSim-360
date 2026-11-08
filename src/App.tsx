import {useEffect, useReducer, useRef, useState} from 'react';
import {Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, ClipboardList, Droplets, Expand, Home, Layers3, Menu, MousePointer2, Play, RotateCcw, ShieldCheck, Sparkles, Target, Trash2, Trophy, Volume2, X} from 'lucide-react';
import Scene from './Scene';
import {coverage, initialState, readReports, reportKey, transition, type Mission, type Mode, type Report} from './engine';
import {clinicalSource} from './clinical';
import {CatheterLogo} from './Portal';

const missions={position:{title:'จัดตำแหน่งถุงปัสสาวะ',en:'Bag positioning',number:'01',icon:Layers3,description:'สำรวจอุปกรณ์และทดลองขยับถุงในฉาก 3 มิติ'},drain:{title:'เทปัสสาวะ',en:'Emptying the drainage bag',number:'02',icon:Droplets,description:'ทดลองภาชนะ วาล์ว และการไหลในสถานการณ์จำลอง'}};
const modes:{id:Mode;title:string;label:string;icon:typeof Play}[]=[{id:'learn',title:'CathLearn',label:'ดูการสาธิต',icon:Play},{id:'practice',title:'CathPractice',label:'ฝึกพร้อมคำแนะนำ',icon:MousePointer2},{id:'challenge',title:'CathChallenge',label:'ทดลองแบบไม่มีคำใบ้',icon:Trophy}];
export default function App(){
 const [state,dispatch]=useReducer(transition,undefined,initialState);
 const [mission,setMission]=useState<Mission>('position');
 const [mode,setMode]=useState<Mode>('practice');
 const [page,setPage]=useState<'sim'|'report'>('sim');
 const [reports,setReports]=useState<Report[]>(readReports);
 const [cameraKey,setCameraKey]=useState(0);
 const [help,setHelp]=useState(false);const [menu,setMenu]=useState(false);
 const [playing,setPlaying]=useState(false);const [demoStep,setDemoStep]=useState(0);
 const [notice,setNotice]=useState('');const [storageWarning,setStorageWarning]=useState(false);
 const sceneRef=useRef<HTMLDivElement>(null);
 const current=missions[mission]; const percent=coverage(state,mission);
 useEffect(()=>{setPlaying(false);setDemoStep(0);dispatch({type:'reset'});if('speechSynthesis' in window)window.speechSynthesis.cancel();},[mission,mode]);
 useEffect(()=>{if(!playing)return;const timer=setInterval(()=>setDemoStep(s=>s+1),1600);return()=>clearInterval(timer);},[playing]);
 useEffect(()=>{
   if(!playing)return;
   if(mission==='position'){
    if(demoStep===1)dispatch({type:'select-bag'});
    if(demoStep===2)dispatch({type:'height',value:1.45});
    if(demoStep===3)dispatch({type:'height',value:.85});
    if(demoStep>=4)setPlaying(false);
   }else{
    if(demoStep===1)dispatch({type:'select-bag'});
    if(demoStep===2)dispatch({type:'container'});
    if(demoStep===3)dispatch({type:'tap'});
    if(demoStep===7)dispatch({type:'tap'});
    if(demoStep>=8)setPlaying(false);
   }
 },[demoStep,playing,mission]);
 useEffect(()=>()=>{if('speechSynthesis' in window)window.speechSynthesis.cancel();},[]);
 const reset=()=>{setPlaying(false);setDemoStep(0);dispatch({type:'reset'});setNotice('เริ่มสถานการณ์ใหม่แล้ว');};
 const save=()=>{
   const report:Report={id:crypto.randomUUID(),mission,mode,coverage:percent,interactions:state.actions.length,createdAt:new Date().toISOString(),clinicalScore:null,sourceStatus:'awaiting-source'};
   const next=[...reports,report].slice(-100);setReports(next);
   try{localStorage.setItem(reportKey,JSON.stringify(next));setNotice('บันทึกผลการทดลองในอุปกรณ์นี้แล้ว');}catch{setStorageWarning(true);setNotice('บันทึกได้เฉพาะรอบนี้ เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล');}
   setPage('report');
 };
 const speak=()=>{if(!('speechSynthesis' in window)){setNotice('อุปกรณ์นี้ไม่รองรับเสียงบรรยาย');return;}window.speechSynthesis.cancel();const speech=new SpeechSynthesisUtterance('สวัสดีค่ะ ดิฉันพยาบาลแคธ ยินดีต้อนรับสู่พื้นที่ทดลองสามมิติ ขณะนี้กำลังรอคู่มือที่ได้รับอนุมัติ จึงยังไม่มีคำแนะนำหรือการประเมินทางคลินิก');speech.lang='th-TH';speech.rate=.9;window.speechSynthesis.speak(speech);};
 const download=()=>{const blob=new Blob([JSON.stringify({app:'CathSim 360',version:1,containsPersonalData:false,reports},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='cathsim-anonymous-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <div className="app-shell">
  <aside className={`sidebar ${menu?'mobile-open':''}`}>
   <a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('sim');}}><span className="brand-mark"><CatheterLogo/></span><span>CathSim <b>360</b><small>CARE THROUGH EXPERIENCE</small></span></a>
   <button className="mobile-close icon-btn" aria-label="ปิดเมนู" onClick={()=>setMenu(false)}><X/></button>
   <div className="sidebar-label">พื้นที่การเรียนรู้</div>
   <button className={`side-link ${page==='sim'?'active':''}`} onClick={()=>{setPage('sim');setMenu(false);}}><Home size={19}/>ห้องฝึกเสมือนจริง<span className="active-dot"/></button>
   <button className={`side-link ${page==='report'?'active':''}`} onClick={()=>{setPage('report');setMenu(false);}}><ClipboardList size={19}/>CathReport <span className="count">{reports.length}</span></button>
   <div className="sidebar-label second">เส้นทางการเรียนรู้</div>
   {modes.map((m,i)=><button key={m.id} className={`path-link ${mode===m.id&&page==='sim'?'selected':''}`} onClick={()=>{setMode(m.id);setPage('sim');setMenu(false);}}><span className="path-number">0{i+1}</span><span>{m.title}<small>{m.label}</small></span>{mode===m.id&&page==='sim'&&<ChevronRight size={15}/>}</button>)}
   <div className="sidebar-bottom"><div className="mini-guide"><span>✦</span><strong>ทีละก้าว อย่างมั่นใจ</strong><p>พื้นที่ทดลอง เรียนรู้ และเตรียมพร้อมสำหรับการดูแลที่บ้าน</p></div><div className="privacy"><ShieldCheck size={16}/> ไม่เก็บข้อมูลระบุตัวผู้ป่วย</div><small className="version">CathSim 360 · Prototype v0.1</small></div>
  </aside>
  <div className="main-wrap">
   <header className="topbar"><div><button className="icon-btn mobile-menu" aria-label="เปิดเมนู" onClick={()=>setMenu(true)}><Menu/></button><span className="breadcrumb">พื้นที่การเรียนรู้ <ChevronRight size={13}/> <b>{page==='sim'?'ห้องฝึกเสมือนจริง':'CathReport'}</b></span></div><div className="top-right"><span className="prototype">conceived, designed and Brought to Life by RN.Patipon Wiyo</span><button className="icon-btn" aria-label="วิธีใช้งาน" onClick={()=>setHelp(true)}><CircleHelp size={20}/></button><span className="user-avatar">C</span></div></header>
   <main>
    <div className="page-heading"><div><div className="eyebrow">{page==='sim'?'YOUR HOME, YOUR CONFIDENCE':'YOUR LEARNING JOURNEY'}</div><h1>{page==='sim'?'ฝึกดูแล เริ่มที่ความมั่นใจ':'บันทึกการทดลองของคุณ'}<span className="heading-dot">.</span></h1><p>{page==='sim'?'เรียนรู้ผ่านประสบการณ์ในบ้านจำลอง กับ พยาบาลแคธ ผู้ช่วยของคุณ':'ทบทวนการใช้งาน เก็บเฉพาะผลการทดลองในอุปกรณ์นี้'}</p></div><div className="heading-tag"><span className="tiny-house"><Home size={18}/></span> Home care simulation</div></div>
    {page==='sim'?<>
     <div className="mode-tabs" role="tablist" aria-label="โหมดการเรียนรู้">{modes.map(m=><button role="tab" aria-selected={mode===m.id} key={m.id} className={mode===m.id?'chosen':''} onClick={()=>setMode(m.id)}><m.icon size={18}/><strong>{m.title}</strong><span>{m.label}</span></button>)}</div>
     <div className="workspace-grid"><section className="simulation-card">
      <div className="scene-header"><div><span className="live-dot"/> ห้องนอนจำลอง <span className="scene-divider">/</span><small>ภารกิจ {current.number}</small></div><span className="scene-badge">INTERACTIVE 3D</span></div>
      <div className="scene" ref={sceneRef}>
       <Scene state={state} mission={mission} dispatch={dispatch} cameraKey={cameraKey} demo={mode==='learn'}/>
       <div className="scene-label"><span className="room-icon"><Home size={16}/></span><div>บ้านจำลอง<small>พื้นที่ทดสอบอุปกรณ์ 3 มิติ</small></div></div>
       <div className="scene-tools"><button className="icon-btn" aria-label="คืนมุมกล้อง" onClick={()=>setCameraKey(k=>k+1)}><RotateCcw size={17}/></button><button className="icon-btn" aria-label="ขยายฉากเต็มจอ" onClick={()=>{if(sceneRef.current?.requestFullscreen)sceneRef.current.requestFullscreen().catch(()=>setNotice('เบราว์เซอร์นี้ไม่อนุญาตให้ขยายเต็มจอ'));else setNotice('เบราว์เซอร์นี้ไม่รองรับเต็มจอ');}}><Expand size={17}/></button></div>
       <div className="orbit-hint"><MousePointer2 size={14}/> ลากเพื่อหมุน · เลื่อนเพื่อซูม · แตะอุปกรณ์เพื่อเลือก</div>
       <div className="scene-caption">ฉากจำลองสำหรับทดสอบระบบ • ไม่ใช่คำแนะนำทางคลินิก</div>
      </div>
      <div className="scene-footer"><div className="scene-status"><span className="status-ring"/> {playing?'กำลังสาธิตกลไกจำลอง':mode==='challenge'?'ทดลองโดยไม่มีคำใบ้':'พร้อมให้คุณสำรวจ'}<small>รองรับเมาส์และหน้าจอสัมผัส</small></div><button className="text-btn" onClick={reset}><RotateCcw size={15}/> เริ่มใหม่</button></div>
     </section>
     <aside className="mission-panel">
      <div className="panel-overline">ภารกิจที่กำลังทดลอง <span>0{mission==='position'?1:2} / 02</span></div>
      <div className="mission-symbol"><current.icon size={24}/></div><h2>{current.title}</h2><p className="mission-en">{current.en}</p><p className="mission-description">{current.description}</p>
      <div className="mission-controls">
       {mode==='learn'?<><div className="control-note"><Play size={17}/><span>สาธิตการทำงานของฉากเท่านั้น<br/>ลำดับการดูแลจริงรอตรวจจากคู่มือ</span></div><button className="primary wide" onClick={()=>{dispatch({type:'reset'});setDemoStep(0);setPlaying(true);}} disabled={playing}><Play size={17}/>{playing?'กำลังสาธิต…':'ดูสาธิตการโต้ตอบ'}</button></>:<>
        {mode==='practice'&&<div className="control-note"><MousePointer2 size={17}/><span>{mission==='position'?'แตะถุงในฉาก หรือใช้ปุ่มเลือก แล้วทดลองเลื่อนตำแหน่ง':'แตะภาชนะและวาล์วในฉาก หรือใช้ปุ่มด้านล่างเพื่อทดลองกลไก'}</span></div>}
        <button className={`control-button ${state.selected?'is-on':''}`} onClick={()=>dispatch({type:'select-bag'})}><MousePointer2 size={17}/>{state.selected?'เลือกถุงแล้ว':'เลือกถุงในฉาก'}{state.selected&&<Check size={16}/>}</button>
        {mission==='position'?<div className="height-control"><label htmlFor="height">ตำแหน่งแนวตั้ง <span>{state.height.toFixed(2)} หน่วยฉาก</span></label><input id="height" aria-label="ตำแหน่งแนวตั้งของถุง" type="range" min="0.45" max="1.8" step="0.05" value={state.height} onChange={e=>dispatch({type:'height',value:Number(e.target.value)})}/><div className="range-labels"><span>ต่ำ</span><span>สูง</span></div><div className="adjust-buttons"><button onClick={()=>dispatch({type:'height',value:state.height-.1})}>− ลดระดับ</button><button onClick={()=>dispatch({type:'height',value:state.height+.1})}>+ เพิ่มระดับ</button></div></div>:<><button className={`control-button ${state.container?'is-on':''}`} onClick={()=>dispatch({type:'container'})}><Droplets size={17}/>{state.container?'ย้ายภาชนะกลับ':'ย้ายภาชนะใต้จุดไหล'}</button><button className={`control-button ${state.tap?'is-on':''}`} onClick={()=>dispatch({type:'tap'})}><Activity size={17}/>{state.tap?'ปิดวาล์วจำลอง':'เปิดวาล์วจำลอง'}</button><div className="fluid-meter"><span>ของเหลวในฉาก</span><strong>{Math.round(state.fluid/.8*100)}%</strong><div><i style={{width:`${state.fluid/.8*100}%`}}/></div></div></>}
       </>}
      </div>
      <div className="coverage"><div><span>การลองใช้ปุ่มของภารกิจ</span><strong>{percent}%</strong></div><div className="progress"><i style={{width:`${percent}%`}}/></div><small>ความครอบคลุมการโต้ตอบ · ไม่ใช่คะแนนทักษะ</small></div>
      <button className="primary wide" onClick={save}><ClipboardList size={17}/> บันทึกการทดลอง <ArrowRight size={17}/></button>
      <div className="assessment-note"><ShieldCheck size={13}/> การประเมินทางคลินิกยังไม่เปิดใช้งาน</div>
     </aside></div>
     <div className="below-grid"><section className="missions-section"><div className="section-heading"><h3>เลือกภารกิจของคุณ</h3><span>2 สถานการณ์จำลอง</span></div><div className="mission-list">{(Object.keys(missions) as Mission[]).map(key=>{const m=missions[key];return <button key={key} className={`mission-choice ${mission===key?'current':''}`} onClick={()=>setMission(key)}><span className="choice-icon"><m.icon size={23}/></span><span className="choice-text"><small>MISSION {m.number}</small><strong>{m.title}</strong><span>ทดสอบการโต้ตอบ 3D</span></span><span className="choice-arrow">{mission===key?<Check size={17}/>:<ArrowRight size={17}/>}</span></button>;})}</div></section>
     <section className="guide-card"><div className="guide-avatar">✚<span/></div><div className="guide-copy"><div><strong>พยาบาลแคธ</strong><span>ผู้ช่วยในโลกจำลอง</span></div><p>{mode==='challenge'?'ลองสำรวจด้วยตัวเองได้เลยค่ะ ระบบจะบันทึกเฉพาะการทดลอง ไม่ตัดสินทักษะการดูแล': 'สวัสดีค่ะ ดิฉันพยาบาลแคธ ค่อย ๆ สำรวจฉากไปด้วยกัน คุณหมุนมุมมองและลองใช้อุปกรณ์ได้ตามต้องการ'}</p><button onClick={speak}><Volume2 size={15}/> ฟังเสียงต้อนรับ</button></div></section></div>
    </>:<section className="reports-card"><div className="report-heading"><div><h2>CathReport</h2><p>บันทึกการทดสอบระบบ ไม่ใช้ประเมินทักษะหรือความปลอดภัยในการดูแล</p></div><button className="secondary" onClick={download} disabled={!reports.length}><ArrowDownToLine size={16}/> ส่งออก JSON</button></div><div className="report-stats"><div><strong>{reports.length}</strong><span>รอบที่บันทึก</span></div><div><strong>{new Set(reports.map(r=>r.mission)).size} / 2</strong><span>ภารกิจที่ทดลอง</span></div><div><strong>—</strong><span>คะแนนทางคลินิก (ยังไม่เปิด)</span></div></div>{storageWarning&&<p role="alert">เก็บข้อมูลถาวรไม่ได้ ผลนี้จะหายเมื่อปิดหน้า</p>}{reports.length?<div className="report-table-wrap"><table><thead><tr><th>ภารกิจ</th><th>โหมด</th><th>การลองใช้ปุ่ม</th><th>เวลา</th></tr></thead><tbody>{[...reports].reverse().map(r=><tr key={r.id}><td>{missions[r.mission].title}<small>{r.interactions} การโต้ตอบ</small></td><td>{modes.find(m=>m.id===r.mode)?.title}</td><td>{r.coverage}%<small>ไม่ใช่คะแนนทักษะ</small></td><td>{new Date(r.createdAt).toLocaleString('th-TH')}</td></tr>)}</tbody></table></div>:<div className="empty-report"><ClipboardList size={38}/><h3>เริ่มบันทึกประสบการณ์แรก</h3><p>ทดลองภารกิจ แล้วกด “บันทึกการทดลอง”</p><button className="primary" onClick={()=>setPage('sim')}>ไปห้องจำลอง <ArrowRight size={16}/></button></div>}<div className="report-bottom"><span><ShieldCheck size={15}/> ข้อมูลอยู่ในเบราว์เซอร์นี้ ไม่มีชื่อหรือข้อมูลผู้ป่วย</span><button className="text-btn danger" disabled={!reports.length} onClick={()=>{setReports([]);try{localStorage.removeItem(reportKey);}catch{setStorageWarning(true);}setNotice('ลบประวัติในอุปกรณ์นี้แล้ว');}}><Trash2 size={15}/> ลบประวัติทั้งหมด</button></div></section>}
    <footer className="page-footer"><span>CathSim 360 <b>•</b> Experience. Practice. Confidence.</span><span><ShieldCheck size={13}/> Anonymous by design</span></footer>
   </main>
  </div>
  {notice&&<div className="toast" role="status">{notice}<button aria-label="ปิดข้อความ" onClick={()=>setNotice('')}><X size={16}/></button></div>}
  {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><button className="modal-x icon-btn" autoFocus aria-label="ปิดรายละเอียด" onClick={()=>setHelp(false)}><X/></button><BookOpen size={30}/><h2 id="help-title">พื้นที่ทดสอบ CathSim 360</h2><p>ลากเมาส์หรือนิ้วเพื่อหมุนฉาก ใช้สองนิ้วหรือเลื่อนเมาส์เพื่อซูม แตะถุง ภาชนะ หรือวาล์วเพื่อโต้ตอบ ปุ่มด้านข้างใช้งานแทนการแตะวัตถุได้</p><h3>แหล่งข้อมูลทางคลินิก</h3><p>รอไฟล์ {clinicalSource.file} โดยเฉพาะบทที่ {clinicalSource.chapter} จากแชตเดิม จึงยังไม่มีการสอนลำดับการดูแลจริง เกณฑ์ผ่าน หรือคำตัดสินทางคลินิก</p><p>ภารกิจและการสาธิตปัจจุบันเป็นการทดสอบกลไกซอฟต์แวร์เท่านั้น เนื้อหาการดูแลจะเชื่อมจากข้อความต้นฉบับพร้อมเลขหน้า และแยกกิจกรรมสำหรับพยาบาลออกจากผู้ป่วย/ผู้ดูแล</p><button className="primary wide" onClick={()=>setHelp(false)}>เข้าใจแล้ว กลับไปทดลอง</button></section></div>}
 </div>;
}
