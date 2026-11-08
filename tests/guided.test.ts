import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {topics,countdownTick} from '../src/guided.ts';
test('countdown waits for narration, pause and tab visibility',()=>{assert.equal(countdownTick(8,false,false,true),8);assert.equal(countdownTick(8,true,true,true),8);assert.equal(countdownTick(8,true,false,false),8);let n=8;for(let i=0;i<8;i++)n=countdownTick(n,true,false,true);assert.equal(n,0);assert.equal(countdownTick(n,true,false,true),0);});
test('demonstration covers required home-care topics without depending on quiz answers',()=>{for(const id of ['position','tube','secure','change','hygiene','drain'])assert.ok(topics.some(t=>t.id===id));for(const t of topics){assert.ok(t.steps.length>=2);for(const s of t.steps){assert.ok(s.text.length>20);assert.ok(s.shortText.length>10);assert.ok(s.cue);}}});
test('every narration asset exists and has audio data',()=>{for(const id of ['welcome','complete',...topics.flatMap(t=>t.steps.flatMap((_,i)=>[`${t.id}-${i}`,`challenge-${t.id}-${i}`]))]){const p=new URL(`../public/media/${id}.mp3`,import.meta.url);assert.ok(fs.existsSync(p),id);assert.ok(fs.statSync(p).size>1000,id);}});
