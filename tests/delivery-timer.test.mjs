import assert from 'node:assert/strict';
import {ServerClock,detectedZone,timerState,formatRemaining,DELIVERY_AREAS,DELIVERY_ZONES} from '../delivery-policy.js';
import {attentionReasons} from '../dispatcher-attention.js';
const now=Date.parse('2026-11-19T16:00:00Z'),iso=n=>new Date(n).toISOString();
let monotonic=100;const clock=new ServerClock(()=>monotonic);assert.ok(Number.isNaN(clock.now()));clock.set(iso(now),0,100);assert.equal(clock.now(),now+50);monotonic+=65000;assert.equal(clock.now(),now+65050,'elapsed time uses monotonic clock, not device wall time');assert.throws(()=>clock.set('invalid'));
assert.equal(detectedZone('Теплодар, Дачи, кооператив Сад'),'dachi');assert.equal(detectedZone('Теплодар, Широкая Балка, 1'),'nearby');assert.equal(detectedZone('Мирне, вул. Центральна'),'nearby');assert.equal(detectedZone('Теплодар, Дачная улица'),'local');assert.equal(detectedZone('улица Центральная, 1'),null);assert.equal(detectedZone('Пром, корпус 1'),'nearby');
for(const [area,policy] of Object.entries(DELIVERY_AREAS))assert.ok(DELIVERY_ZONES[policy.zone],area);
const job={status:'picked_up',delivery_zone:'local',delivery_minutes:20,picked_up_at:iso(now-60000),delivery_due_at:iso(now+19*60000)};
assert.equal(timerState(job,now).value,'19:00');assert.equal(timerState({...job,delivery_due_at:iso(now+4*60000)},now).kind,'warning');assert.equal(timerState({...job,delivery_due_at:iso(now-90000)},now).value,'01:30');assert.equal(timerState({...job,delivery_due_at:iso(now-90000)},now).kind,'late');
assert.equal(timerState({...job,status:'accepted',ready_at:iso(now+600000)},now).value,'10:00');
assert.equal(timerState({...job,status:'assigned',delivery_due_at:null},now).value,'20 мин');
assert.equal(timerState({status:'accepted'},now).kind,'unknown');
assert.equal(timerState({...job,status:'delivered',delivered_at:iso(now+21*60000)},now+999999999).title,'Вручён с задержкой');
const endedSlot={id:'slot',slot_start:iso(now-3600000),slot_end:iso(now-1000)};
assert.deepEqual(attentionReasons({...job,slot_id:'slot'},[endedSlot],[],now),[],'pickup slot ending is not a late delivery');
assert.ok(attentionReasons({...job,slot_id:'slot',delivery_due_at:iso(now-1)},[endedSlot],[],now).some(x=>x.includes('Срок доставки истёк')));
console.log('PASS: three zones, safe address recognition, server/monotonic clock, prep vs transport, warning/overdue, frozen completion, dispatcher deadline and slot distinction.');

// Production incident: a Nov 18 test was accepted on Nov 21. Do not show 3699:57
// as a delivery countdown, reset its preparation time, or change the pickup deadline.
const acceptedAt=Date.parse('2026-11-21T12:02:09.157Z');
const oldOrder={status:'accepted',delivery_zone:'local',delivery_minutes:20,ready_at:'2026-11-18T22:22:24.412Z'};
const oldTimer=timerState(oldOrder,acceptedAt);
assert.equal(oldTimer.value,'2 д 13 ч');assert.equal(oldTimer.kind,'warning');assert.equal(oldTimer.title,'Плановая готовность прошла');
assert.match(oldTimer.caption,/19.11/);assert.match(oldTimer.caption,/20 мин.*после забора/);
assert.equal(formatRemaining(3600000),'1 ч 00 мин');assert.equal(formatRemaining(86399000),'23 ч 59 мин');assert.equal(formatRemaining(86400000),'1 д 0 ч');
assert.equal(timerState({...oldOrder,status:'picked_up',delivery_due_at:'2026-11-21T12:22:28.900Z'},Date.parse('2026-11-21T12:02:28.900Z')).value,'20:00');
assert.match(timerState({...oldOrder,status:'assigned'},acceptedAt).caption,/после подтверждения забора/);
assert.equal(timerState({...job,delivery_due_at:iso(now+86400000)},now).value,'1 д 0 ч');
console.log('PASS: old-order incident, readable hours/days, Kyiv preparation date and unchanged pickup countdown.');
