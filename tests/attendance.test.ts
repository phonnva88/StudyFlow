import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {AccessToken} from 'livekit-server-sdk';
import {NextRequest} from 'next/server';
import {attendanceSeconds,formatAttendance,type Attendance} from '../src/lib/attendance';
import {attendanceScript,attendanceState} from '../src/lib/attendance-store';
import {attendanceEndpoint} from '../src/lib/attendance-api';
import {musicSession} from '../src/lib/music-session';
import {POST as tokenEndpoint} from '../src/app/api/rooms/[roomId]/token/route';
import {POST as webhookEndpoint} from '../src/app/api/livekit/webhook/route';

const id='c'.repeat(32),actor='participant-11111111-1111-4111-8111-111111111111',peer='participant-22222222-2222-4222-8222-222222222222';
test('attendance uses timestamps, pauses offline time, and formats hours without wrapping',()=>{
 const p:Attendance={participantId:actor,visitId:'visit',joinedAt:1000,connectedSince:1000,disconnectedAt:0,accumulatedMs:0,status:'CONNECTED'};
 assert.equal(formatAttendance(attendanceSeconds(p,3601000)),'01:00:00');
 assert.equal(attendanceSeconds({...p,status:'RECONNECTING',accumulatedMs:42000},999999),42);
 assert.equal(formatAttendance(360000),'100:00:00');
});
test('attendance requires a signed room session and webhooks require signatures',async()=>{
 Object.assign(process.env,{LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'test',LIVEKIT_API_SECRET:'test-secret-at-least-32-characters',UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test'});
 const req=new NextRequest(`http://localhost/api/rooms/${id}/attendance/leave`,{method:'POST',headers:{origin:'https://attacker.test'}});
 assert.equal((await attendanceEndpoint(req,id,'leave')).status,403);
 assert.equal((await webhookEndpoint(new NextRequest('http://localhost/api/livekit/webhook',{method:'POST',body:'{}'}))).status,401);
});
test('real Redis attendance: independent participants, duplicate/late events, refresh resume, explicit leave and authorization',{skip:process.env.STUDYFLOW_ATTENDANCE_REDIS_TEST!=='1'},async t=>{
 const exec=promisify(execFile);
 const command=async(...args:string[])=>JSON.parse((await exec('docker',['--host=unix:///var/run/docker.sock','exec','studyflow-attendance-test','redis-cli','--json',...args])).stdout);
 const base=Date.now(),roomKey=`studyflow:room:${id}`,key=`studyflow:attendance:${id}`;
 await command('SET',roomKey,JSON.stringify({id,state:'LIVE',hostName:'Ada',hostHash:'0'.repeat(64),expiresAt:base+3600000}));
 t.after(async()=>{await command('DEL',roomKey,key,`studyflow:attendance-seq:${id}`);});
 let now=base,sequence=0;
 const member=(identity:string,sid:string,joinedAt:number)=>({identity,sid,joinedAt});
 let members=[member(actor,'PA_one',base)];
 const update=async(mode='snapshot',who=actor,sid='',at=0,seq=++sequence)=>JSON.parse(await command('EVAL',`local native=redis; local redis={call=function(op,...) if op=='TIME' then return {'${Math.floor(now/1000)}','${(now%1000)*1000}'} end return native.call(op,...) end}\n${attendanceScript}`,'2',roomKey,key,JSON.stringify(members),String(seq),mode,who,`visit-${sequence}`,sid,String(at)));
 let s=await update();const visit=s.participants[0].visitId;
 now+=15000;members.push(member(peer,'PA_two',now));s=await update();
 assert.equal(attendanceSeconds(s.participants.find((p:Attendance)=>p.participantId===actor),now),15);
 assert.equal(attendanceSeconds(s.participants.find((p:Attendance)=>p.participantId===peer),now),0);
 await update();s=await update();assert.equal(s.participants[0].accumulatedMs,0);
 now+=5000;members=members.filter(p=>p.identity!==actor);await update('webhook-left',actor,'PA_one',now);
 now+=10000;members.push(member(actor,'PA_three',now));s=await update();
 let a=s.participants.find((p:Attendance)=>p.participantId===actor);
 assert.equal(a.visitId,visit);assert.equal(a.accumulatedMs,20000);
 await update('webhook-left',actor,'PA_one',now-10000); // Old SID cannot close new connection.
 s=await update();a=s.participants.find((p:Attendance)=>p.participantId===actor);assert.equal(a.status,'CONNECTED');
 now+=5000;members=members.filter(p=>p.identity!==actor);s=await update('webhook-left',actor,'PA_three',now);
 const before=s.participants.find((p:Attendance)=>p.participantId===actor).accumulatedMs;
 await update('webhook-left',actor,'PA_three',now);s=await update('snapshot',actor,'',0,1);
 assert.equal(s.participants.find((p:Attendance)=>p.participantId===actor).accumulatedMs,before);
 members.push(member(actor,'PA_three',base));s=await update();
 assert.equal(s.participants.find((p:Attendance)=>p.participantId===actor).status,'RECONNECTING');
 members=members.filter(p=>p.identity!==actor);
 now+=31000;await update();members.push(member(actor,'PA_four',now));s=await update();
 a=s.participants.find((p:Attendance)=>p.participantId===actor);assert.notEqual(a.visitId,visit);assert.equal(a.accumulatedMs,0);
 const restartAt=now;now+=5000;members=members.filter(p=>p.identity!==actor);await update();
 now+=1000;members.push(member(actor,'PA_five',now));await update();
 s=await update('webhook-left',actor,'PA_four',restartAt+5000);
 a=s.participants.find((p:Attendance)=>p.participantId===actor);assert.equal(a.status,'CONNECTED');assert.equal(a.accumulatedMs,5000);
 s=await update('webhook-left',actor,'PA_four',restartAt+5000);assert.equal(s.participants.find((p:Attendance)=>p.participantId===actor).accumulatedMs,5000);
 // Real SDK/route integration: room-scoped bearer, resume versus new join,
 // and repeated explicit leave while provider presence still lists the user.
 await command('DEL',key);
 const realMembers=[{identity:actor,sid:'PA_real',name:'Ada',joinedAt:String(Math.floor(base/1000))}];
 const removed:string[]=[];
 t.mock.method(globalThis,'fetch',async(url:string|URL|Request,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));
  if(String(url).includes('livekit.cloud')) {
   if(String(url).endsWith('/ListParticipants')) return Response.json({participants:realMembers});
   if(String(url).endsWith('/CreateRoom')) return Response.json({name:`studyflow-${id}`,maxParticipants:6});
   if(String(url).endsWith('/RemoveParticipant')) removed.push(body.identity);
   return Response.json({});
  }
  const execute=async(args:unknown[])=>({result:await command(...args.map(String))});
  return Response.json(Array.isArray(body[0])?await Promise.all(body.map(execute)):await execute(body));
 });
 const bearer=musicSession(id,actor,base+3600000);
 const request=(path:string,write=false,token=bearer,body?:unknown)=>new NextRequest(`http://localhost/api/rooms/${id}/${path}`,{method:write?'POST':'GET',headers:{authorization:`Bearer ${token}`,origin:'http://localhost','content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await attendanceEndpoint(request('attendance'),id)).status,200);
 assert.equal((await attendanceEndpoint(request('attendance',false,'bad'),id)).status,403);
 const outsider=musicSession(id,peer,base+3600000);
 assert.equal((await attendanceEndpoint(request('attendance',false,outsider),id)).status,403);
 const own=await (await attendanceEndpoint(request('attendance/me'),id,'me')).json();assert.equal(own.visit.participantId,actor);
 const eventBody=JSON.stringify({event:'participant_left',room:{name:`studyflow-${id}`},participant:{identity:actor,sid:'PA_real'},createdAt:String(Math.floor(Date.now()/1000)),id:'event-1'});
 const hookToken=new AccessToken('test','test-secret-at-least-32-characters');hookToken.sha256=createHash('sha256').update(eventBody).digest('base64');
 const signed=await hookToken.toJwt();
 for(let i=0;i<2;i++) assert.equal((await webhookEndpoint(new NextRequest('http://localhost/api/livekit/webhook',{method:'POST',headers:{authorization:signed},body:eventBody}))).status,200);
 assert.equal((await webhookEndpoint(new NextRequest('http://localhost/api/livekit/webhook',{method:'POST',headers:{authorization:signed},body:eventBody+' '}))).status,401);
 // A refresh returns with a new provider SID after the verified departure.
 realMembers[0].sid='PA_refreshed';
 const resumed=await tokenEndpoint(request('token',true,bearer,{nickname:'Ada',resumeSession:bearer}),{params:Promise.resolve({roomId:id})});
 assert.equal(resumed.status,200);assert.equal((await resumed.json()).musicSession,bearer);
 assert.equal((await attendanceEndpoint(request('attendance/leave',true,bearer,{participantId:peer}),id,'leave')).status,200);
 assert.deepEqual(removed,[actor]);
 assert.equal((await attendanceEndpoint(request('attendance/leave',true),id,'leave')).status,200);
 const next=await tokenEndpoint(request('token',true,bearer,{nickname:'Ada',resumeSession:bearer}),{params:Promise.resolve({roomId:id})});
 assert.equal(next.status,200);assert.notEqual((await next.json()).musicSession,bearer);
 assert.ok((await attendanceState(id)).snapshot.participants.find(p=>p.participantId===actor)?.status==='LEFT');
});
