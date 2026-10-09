import { createInterface } from 'node:readline';
import { executeScenario } from '../src/domain/scenarioExecution';
const lines = createInterface({input:process.stdin});
const pending = new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
let sequence=0, started=false;
const send=(v:any)=>process.stdout.write(JSON.stringify(v)+'\n');
const request=(type:string,body:any)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});send({type,id,body});});
lines.on('line', line => {
  try {
    const item=JSON.parse(line);
    if (!started) {
      started=true;
      void executeScenario(item.project,item.plan,{inference:body=>request('inference',body),mcp:body=>request('mcp',body)}).then(result=>{send({type:'result',result});lines.close();process.exitCode=0;process.stdin.destroy();});
    } else {
      const waiter=pending.get(item.id);if(!waiter)throw Error('Unknown response');pending.delete(item.id);
      if(item.error)waiter.reject(Error(String(item.error)));else waiter.resolve(item.result);
    }
  } catch { send({type:'error',error:'试跑协议无效'});process.exitCode=1;lines.close();process.stdin.destroy(); }
});
lines.on('close',()=>{for(const w of pending.values())w.reject(Error('试跑已取消'));pending.clear();});
