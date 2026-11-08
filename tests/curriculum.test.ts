import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessons,sources} from '../src/curriculum.ts';
test('all topics have a complete question, valid answer and source mapping',()=>{assert.equal(new Set(lessons.map(l=>l.id)).size,7);for(const l of lessons){assert.ok(l.steps.length>=3);assert.ok(l.answer>=0&&l.answer<l.choices.length);for(const i of l.source)assert.ok(sources[i]?.url.startsWith('https://'));}});
test('confirmed local plan is three daily cleanings, not a six-hour night schedule',()=>{const s=lessons.find(l=>l.id==='hygiene')!.steps.join(' ');assert.ok(s.includes('วันละ 3 ครั้ง'));assert.ok(s.includes('เวลาตื่น'));assert.ok(!s.includes('ทุก 6 ชั่วโมง'));});
