import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FlowSessions,flowSignature} from '../src/domain/flowSession';
import {ScenarioSessions} from '../src/domain/scenarioSession';
import {validateGraph} from '../src/domain/nodeCapabilities';
import {GraphEngine} from '../src/utils/GraphEngine';
import {VehicleWorld} from '../src/domain/vehicleWorld';
import {durableTurn,executionKey,type ExecutionStorage,type ExecutionRecord,type DurableSnapshot} from '../src/domain/durableFlow';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,sourceHandle});
const graph=()=>({nodes:[n('i','input',{flowVersion:2}),n('init','state',{values:{count:0}}),n('w','wait',{eventName:'message',repeat:true,prompt:'继续输入'}),n('endCheck','logic',{condition:"input.text==='收尾'"}),n('count','state',{increments:{count:1}}),n('light','car_control',{executionMode:'hmi_mock',action:'ambient_light.set',color:'#abcdef',brightness:80}),n('restore','car_control',{executionMode:'hmi_mock',action:'ambient_light.restore'}),n('end','output',{responseText:'结束{{state.count}}'})],edges:[e('i','init'),e('init','w'),e('w','endCheck'),e('endCheck','count','false'),e('count','light'),e('light','w'),e('endCheck','restore','true'),e('restore','end')]});
class MemoryStorage implements ExecutionStorage{
 record:ExecutionRecord={revision:0,phase:'empty'};token='';failFinish=false;failRenew=false;
 async read(){return structuredClone(this.record);}
 async begin(revision:number,_restart:boolean){if(revision!==this.record.revision||this.record.phase==='running')throw Error('conflict');this.record={...this.record,revision:revision+1,phase:'running'};this.token=String(revision);return{revision:revision+1,token:this.token};}
 async renew(){if(this.failRenew)throw Error('lease lost');}
 async finish(lease:any,payload:DurableSnapshot){if(this.failFinish)throw Error('disk unavailable');assert.equal(lease.revision,this.record.revision);this.record={revision:lease.revision+1,phase:'ready',payload:JSON.parse(JSON.stringify(payload))};}
}
function runtime(){
 const world=new VehicleWorld(),sessions=new ScenarioSessions();let message='';const actions:any[]=[];
 const callbacks:any={updateNodeStatus(){},updateKernel(){},updateMemory(){},updateSafety(){},updateMiddleware(){},log(){},getSimulatorState:()=>({car:world.getSnapshot().car}),updateSimulatorState:(c:string,k:string,v:string)=>{if(c==='hmi'&&k==='message')message=v;},executeHmiControl:world.executeHmiControl,executeAmbientLight:(request:any)=>{actions.push(request);return world.setAmbientLight(request);},restoreAmbientLight:()=>{actions.push('restore');return world.restoreAmbientLight();}};
 return {world,sessions,actions,message:()=>message,callbacks,snapshotSimulator:()=>({world:world.exportCheckpoint(),message}),prepareSimulator:(value:any)=>{const check=new VehicleWorld();check.restoreCheckpoint(value.world);if(typeof value.message!=='string')throw Error('invalid message');return()=>{world.restoreCheckpoint(check.exportCheckpoint());message=value.message;};}};
}
async function turn(store:MemoryStorage,input:unknown,eventId:string,r=runtime(),g=graph()){
 assert.deepEqual(validateGraph(g.nodes,g.edges).filter(x=>x.severity==='error'),[]);
 const result=await durableTurn({storage:store,nodes:g.nodes,edges:g.edges,sessions:r.sessions,input,snapshotSimulator:r.snapshotSimulator,prepareSimulator:r.prepareSimulator,run:signal=>new GraphEngine(g.nodes,g.edges,r.callbacks,r.sessions).run(input,{eventId,signal})});
 return{...r,result};
}
test('new runtime each turn restores loops, deduplication, HMI and original ambient baseline',async()=>{
 const store=new MemoryStorage(),first=runtime();first.world.executeHmiControl({control:'lights.color',value:'#123456'});first.world.executeHmiControl({control:'lights.brightness',value:17});
 await turn(store,'开始','start',first);
 let r=await turn(store,'好奇','one');assert.equal(r.sessions.flow.snapshot()!.state.count,1);assert.equal(r.actions.length,1);
 r=await turn(store,'好奇','one');assert.equal(r.sessions.flow.snapshot()!.state.count,1);assert.equal(r.actions.length,0);assert.equal((r.result.finalOutput as any).duplicate,true);assert.match(r.message(),/继续/);
 r=await turn(store,'平静','two');assert.equal(r.sessions.flow.snapshot()!.state.count,2);
 r=await turn(store,'收尾','end');assert.equal(r.result.status,'completed');assert.equal(r.actions.length,1);assert.deepEqual(r.world.getSnapshot().car.lights,{ambientColor:'#123456',brightness:17});assert.equal(r.message(),'结束2');
});
test('pause, resume, explicit restart and separate project stores survive restoration',async()=>{
 const a=new MemoryStorage(),b=new MemoryStorage();await turn(a,'开始','start');await turn(a,'a','one');
 let r=await turn(a,{$event:{control:'pause'}},'pause');assert.equal(r.result.status,'paused');
 r=await turn(a,'ignored','ignored');assert.equal(r.sessions.flow.snapshot()!.state.count,1);
 r=await turn(a,{$event:{control:'resume'}},'resume');assert.equal(r.result.status,'waiting');
 r=await turn(b,'开始','start');assert.equal(r.sessions.flow.snapshot()!.state.count,0);
 r=await turn(a,{$event:{control:'restart'}},'restart');assert.equal(r.sessions.flow.snapshot()!.state.count,0);
});
test('changed edge identities or graph configuration reject old snapshots without actions',async()=>{
 const store=new MemoryStorage();await turn(store,'开始','start');const g=graph();g.edges[0].id='replaced';
 await assert.rejects(turn(store,'a','next',runtime(),g),/不一致/);assert.equal(store.record.phase,'ready');
 g.edges=graph().edges;g.nodes[0].data.eventBudget=5;await assert.rejects(turn(store,'a','next',runtime(),g),/不一致/);
});
test('unknown node, corrupt status or incomplete vehicle data is rejected before replacing live state',async()=>{
 const store=new MemoryStorage();await turn(store,'开始','start');const saved=store.record.payload!;const g=graph();
 for(const modify of [(c:any)=>c.nodes.unknown='success',(c:any)=>c.status='running',(c:any)=>c.repeatCounts.w=-1,(c:any)=>c.waiting=['init']]){
  const corrupt=structuredClone(saved.flow);modify(corrupt);assert.throws(()=>new FlowSessions().restore(corrupt,g.nodes,g.edges));
 }
 const world=new VehicleWorld(),before=world.exportCheckpoint(),bad=structuredClone(before);delete(bad.snapshot.car as any).ac;
 assert.throws(()=>world.restoreCheckpoint(bad));assert.deepEqual(world.exportCheckpoint(),before);
});
test('lost completion response prevents further execution and never replays committed physical callback',async()=>{
 const store=new MemoryStorage();await turn(store,'开始','start');store.failFinish=true;const r=runtime();
 await assert.rejects(turn(store,'a','one',r),/disk unavailable/);assert.equal(r.actions.length,1);assert.equal(store.record.phase,'running');
 const next=runtime();await assert.rejects(turn(store,'a','one',next),/不能自动重放/);assert.equal(next.actions.length,0);
});
test('concurrent tabs cannot both run the same saved checkpoint',async()=>{
 const store=new MemoryStorage();await turn(store,'开始','start');const a=runtime(),b=runtime();
 const results=await Promise.allSettled([turn(store,'a','a',a),turn(store,'b','b',b)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(a.actions.length+b.actions.length,1);
});
test('lease renewal failure aborts execution and leaves ambiguous turn fenced',async()=>{
 const store=new MemoryStorage();store.failRenew=true;const r=runtime(),g=graph();let aborted=false;
 await assert.rejects(durableTurn({storage:store,...g,sessions:r.sessions,input:'start',snapshotSimulator:r.snapshotSimulator,prepareSimulator:r.prepareSimulator,heartbeatMs:5,
 run:signal=>new Promise((_,reject)=>{signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});})}),/lease lost/);
 assert.equal(aborted,true);assert.equal(store.record.phase,'running');
});
test('stable namespace and graph signatures ignore display-only changes',async()=>{
 const values=new Map<string,string>();const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 assert.equal(await executionKey('A',storage),await executionKey('A',storage));assert.notEqual(await executionKey('A',storage),await executionKey('B',storage));
 const g=graph(),before=flowSignature(g.nodes,g.edges);g.nodes[0].position.x=100;g.nodes[0].data.status='success';assert.equal(flowSignature(g.nodes,g.edges),before);
});
test('an already loaded revision preserves manual HMI edits between turns',async()=>{
 const store=new MemoryStorage(),r=runtime(),g=graph(),cursor:{revision?:number}={};
 const run=(input:unknown,id:string)=>durableTurn({storage:store,...g,sessions:r.sessions,cursor,input,snapshotSimulator:r.snapshotSimulator,prepareSimulator:r.prepareSimulator,run:signal=>new GraphEngine(g.nodes,g.edges,r.callbacks,r.sessions).run(input,{eventId:id,signal})});
 await run('开始','start');r.world.executeHmiControl({control:'lights.color',value:'#fedcba'});r.world.executeHmiControl({control:'lights.brightness',value:23});
 await run('a','one');await run('收尾','end');assert.deepEqual(r.world.getSnapshot().car.lights,{ambientColor:'#fedcba',brightness:23});
});
test('editing a live graph fails before claiming a lease, so restart remains immediately available',async()=>{
 const store=new MemoryStorage(),r=runtime(),g=graph(),cursor:{revision?:number}={};
 const run=(input:unknown,id:string)=>durableTurn({storage:store,...g,sessions:r.sessions,cursor,input,snapshotSimulator:r.snapshotSimulator,prepareSimulator:r.prepareSimulator,run:signal=>new GraphEngine(g.nodes,g.edges,r.callbacks,r.sessions).run(input,{eventId:id,signal})});
 await run('开始','start');const revision=store.record.revision;g.nodes.find(n=>n.id==='w')!.data.prompt='新提示';
 await assert.rejects(run('a','one'),/不一致/);assert.equal(store.record.phase,'ready');assert.equal(store.record.revision,revision);
 await run({$event:{control:'restart'}},'restart');assert.equal(r.message(),'新提示');
});

test('brand migration preserves browser identity and existing execution key',async()=>{
 const values=new Map([['cyberedge.execution-browser.v1','existing-browser']]);
 const storage={getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 const first=await executionKey('saved-project',storage);
 const expected=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['existing-browser','saved-project'])));
 assert.equal(first,Array.from(new Uint8Array(expected),n=>n.toString(16).padStart(2,'0')).join(''));
 assert.equal(values.get('oakegde.execution-browser.v1'),'existing-browser');
 values.set('cyberedge.execution-browser.v1','stale-browser');
 assert.equal(await executionKey('saved-project',storage),first);
});
