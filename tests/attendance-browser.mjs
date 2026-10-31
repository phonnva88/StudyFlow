// Standalone regression of real RoomClient/Studio/timers. Only LiveKit transport
// and HTTP services are fixtures; Redis/API behavior is tested separately.
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const id='a'.repeat(32),actor='participant-11111111-1111-4111-8111-111111111111',peer='participant-22222222-2222-4222-8222-222222222222';
const actual=root+'node_modules/@livekit/components-react/dist/index.mjs';
const bundled=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RoomClient}from'./src/components/room-client';createRoot(document.getElementById('root')).render(<React.StrictMode><RoomClient id="${id}"/></React.StrictMode>);`,loader:'tsx',resolveDir:root},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'transport-fixture',setup(b){b.onResolve({filter:/^@livekit\/components-react$/},()=>({path:'fixture',namespace:'transport'}));b.onLoad({filter:/.*/,namespace:'transport'},()=>({resolveDir:root,loader:'tsx',contents:`import React,{useState}from'react';import{Room,RemoteParticipant,ConnectionState}from'livekit-client';import{RoomContext}from'${actual}';export*from'${actual}';export function LiveKitRoom({children}){const[room]=useState(()=>{const r=new Room();r.state=ConnectionState.Connected;r.localParticipant.identity='${actor}';r.localParticipant.name='Ada';const peer=new RemoteParticipant(r.engine.client,'PA_bob','${peer}','Bob');r.remoteParticipants.set(peer.identity,peer);return r});return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>}` }));}}]});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',headless:true});
try {
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
let joinedAt=Date.now()-15000,closed=false,joins=0,timeShift=0;const requests=[];
await page.route('http://attendance.test/**',async route=>{
 const path=new URL(route.request().url()).pathname;
 if(path==='/fixture.js')return route.fulfill({contentType:'application/javascript',body:bundled.outputFiles[0].text});
 if(path.endsWith('/token')){const body=route.request().postDataJSON();requests.push(body);joins++;if(closed){joinedAt=Date.now();closed=false;}return route.fulfill({json:{token:'fixture',serverUrl:'wss://fixture.test',isHost:false,musicSession:'signed-fixture'}});}
 if(path.endsWith('/attendance/leave')){closed=true;return route.fulfill({json:{ok:true}});}
 if(path.endsWith('/attendance')) return route.fulfill({json:{serverNow:Date.now()+timeShift,participants:[{participantId:actor,visitId:'visit',joinedAt,connectedSince:joinedAt,disconnectedAt:0,accumulatedMs:0,status:'CONNECTED'},{participantId:peer,visitId:'peer',joinedAt:joinedAt-20000,connectedSince:joinedAt-20000,disconnectedAt:0,accumulatedMs:0,status:'CONNECTED'}]}});
 if(path.endsWith('/space'))return route.fulfill({json:{players:[{identity:actor,name:'Ada',x:-4,z:-1.4,yaw:0,seat:0,updatedAt:Date.now()}],serverNow:Date.now(),version:1}});
 if(path.endsWith('/tracks'))return route.fulfill({json:{tracks:[]}});
 if(path.includes('/music'))return route.fulfill({json:{current:null,queue:[],status:'IDLE',version:0,positionSeconds:0,startedAt:null,serverNow:Date.now()}});
 if(path.endsWith(`/rooms/${id}`))return route.fulfill({json:{id,title:'Study',hostName:'Ada',state:'LIVE',expiresAt:Date.now()+3600000,isHost:false}});
 return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/fixture.js"></script>'});
});
await page.goto('http://attendance.test/');await page.getByLabel('Your nickname',{exact:true}).fill('Ada');await page.getByRole('button',{name:'Join study room'}).click();
const timer=page.getByLabel('Room attendance',{exact:true}).first();try{await expect(timer).toHaveText(/00:00:1[5-9]/);}catch(error){console.log('Browser errors:',errors);console.log(await page.locator('body').innerText());throw error;}
const before=joinedAt;await page.reload();await expect(timer).toHaveText(/00:00:[12]\d/);assert.equal(joinedAt,before);assert.equal(requests.at(-1).resumeSession,'signed-fixture');assert.equal(joins,2);
await page.getByRole('button',{name:'First-person view',exact:true}).click();await expect(page.getByLabel('Room attendance',{exact:true}).last()).toHaveText(/00:00:[34]\d/);
await page.getByRole('button',{name:'Grid view',exact:true}).click();await page.getByRole('button',{name:'Leave',exact:true}).click();await expect(page.getByRole('button',{name:'Join study room'})).toBeVisible();
await page.getByLabel('Your nickname',{exact:true}).fill('Ada');await page.getByRole('button',{name:'Join study room'}).click();await expect(timer).toHaveText(/00:00:0\d/);assert.equal(requests.at(-1).resumeSession,undefined);
timeShift=120000;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(timer).toHaveText(/00:02:0\d/);
assert.deepEqual(errors,[]);console.log('Attendance browser: independent timers, automatic refresh resume, view switching, explicit leave/new visit passed.');
}finally{await browser.close();}
