import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {topics,countdownTick,normalizeCsId,evaluatePatientProgress,type StepEvent} from '../src/guided.ts';
test('countdown waits for narration, pause and tab visibility',()=>{assert.equal(countdownTick(8,false,false,true),8);assert.equal(countdownTick(8,true,true,true),8);assert.equal(countdownTick(8,true,false,false),8);let n=8;for(let i=0;i<8;i++)n=countdownTick(n,true,false,true);assert.equal(n,0);assert.equal(countdownTick(n,true,false,true),0);});
test('demonstration covers required home-care topics in exact requested order',()=>{
  assert.deepEqual(topics.map(t=>t.id),['hands','hygiene','position','tube','secure','drain','followup','water','trouble']);
  for(const t of topics){assert.ok(t.steps.length>=2);for(const s of t.steps){assert.ok(s.text.length>20);assert.ok(s.shortText.length>10);assert.ok(s.cue);}}
});
test('every narration asset exists and has audio data',()=>{for(const id of ['welcome','complete',...topics.flatMap(t=>t.steps.flatMap((_,i)=>[`${t.id}-${i}`,`challenge-${t.id}-${i}`]))]){const p=new URL(`../public/media/${id}.mp3`,import.meta.url);assert.ok(fs.existsSync(p),id);assert.ok(fs.statSync(p).size>1000,id);}});
test('patient CS ID normalization and >= 80% self-completion pass criteria',()=>{
  assert.equal(normalizeCsId('1'),'CS-1');
  assert.equal(normalizeCsId('cs-2'),'CS-2');
  const allSteps:StepEvent[]=topics.flatMap(t=>t.steps.map((_,idx)=>({
    id:`ev-${t.id}-${idx}`,
    code:'CS-1',
    topic:t.id,
    step:idx,
    trigger:(idx===0&&t.id==='trouble'?'auto':'confirmed') as 'confirmed'|'auto',
    seconds:12,
    time:'2026-11-09T09:30:00.000Z',
    mode:'practice' as const
  })));
  const rep=evaluatePatientProgress(allSteps,'CS-1');
  assert.equal(rep.csId,'CS-1');
  assert.equal(rep.totalSteps,30);
  assert.equal(rep.confirmedSteps,29);
  assert.ok(rep.overallScorePercent>=80);
  assert.equal(rep.passed80,true);
});
