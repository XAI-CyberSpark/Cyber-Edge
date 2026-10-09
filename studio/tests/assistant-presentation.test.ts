import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAssistantPresentation as select, withoutFailedImage, listPage} from '../src/domain/assistantPresentation';
import {parseAssistantPlan, executeAssistantPlan} from '../src/domain/cockpitAssistant';
import {VehicleWorld} from '../src/domain/vehicleWorld';
const reply={kind:'reply',text:'本次返回的说明'} as const;
const source={kind:'knowledge',id:'test-record-1'};
const media={version:1,kind:'image',source,image:{url:'/test/diagram.png',alt:'测试说明图'}};
const list={version:1,kind:'list',source,items:Array.from({length:7},(_,i)=>({id:String(i),title:`测试记录 ${i}`,detail:`记录 ${i} 的详情`}))};

test('Explicit validated plan selects confirmation or text without keyword guessing',()=>{
  assert.equal(select({kind:'reply',text:'图片、列表、执行空调和车窗'}).kind,'text');
  assert.equal(select({kind:'clarify',text:'哪一个？'},media).kind,'text');
  for (const plan of [{kind:'climate',temperature:23,on:true},{kind:'windows',targets:{rr:0}}] as const) assert.equal(select(plan,media).kind,'confirmation');
  const raw=parseAssistantPlan(JSON.stringify({...reply,presentation:media}));
  assert.equal(select(raw).kind,'text');
});
test('Only separately sourced, versioned media envelopes select images',()=>{
  assert.equal(select(reply,media).kind,'image');
  for(const bad of [null,{}, {...media,version:2},{...media,source:null},{...media,source:{kind:'model',id:'x'}},{...media,image:{url:'/x',alt:''}}]) assert.equal(select(reply,bad).kind,'text');
});
test('Unsafe and malformed image addresses fall back to the same real text',()=>{
  for(const url of ['javascript:alert(1)','data:image/svg+xml,test','//example.com/x','/\\example.com/x','https://user:pass@example.com/x','file:///x','https://x/ bad','']) {
    const panel=select(reply,{...media,image:{url,alt:'测试'}});assert.equal(panel.kind,'text');assert.equal(panel.text,reply.text);
  }
  assert.equal(select(reply,{...media,image:{url:'https://example.com/image.png',alt:'测试'}}).kind,'image');
});
test('Missing and failed images preserve text; only the failed list thumbnail is removed',()=>{
  assert.equal(select(reply,{...media,image:undefined}).kind,'text');
  const panel=select(reply,media);assert.equal(withoutFailedImage(panel).kind,'text');
  const items=[{id:'a',title:'A',image:media.image},{id:'b',title:'B',image:media.image}];
  const result=withoutFailedImage(select(reply,{...list,items}),'a');
  assert.equal(result.kind,'list');if(result.kind==='list'){assert.equal(result.items[0].image,undefined);assert.ok(result.items[1].image);}
});
test('Multiple real records paginate locally; detail is data and does not execute actions',()=>{
  const panel=select(reply,list);assert.equal(panel.kind,'list');
  if(panel.kind==='list') {assert.equal(listPage(panel).items.length,3);assert.equal(listPage(panel).hasMore,true);assert.equal(listPage(panel,100).items.length,7);assert.equal(listPage(panel,100).hasMore,false);assert.equal(listPage(panel,NaN).items.length,3);assert.equal(panel.items[0].detail,'记录 0 的详情');}
});
test('Invalid lists, duplicate IDs, unknown actions and empty data cannot become success cards',()=>{
  for(const items of [[],[{id:'a',title:'A'},{id:'a',title:'B'}],[{id:'a',title:''}],[{id:'a',title:'A',action:{kind:'navigate'}}],[{id:'a',title:'A',href:'https://example.com'}],Array(101).fill({id:'x',title:'X'})]) assert.equal(select(reply,{...list,items}).kind,'text');
});
test('Long returned text is retained without creating image or list content',()=>{
  const text='实际文本'.repeat(1000);const panel=select({kind:'reply',text});assert.equal(panel.text,text);assert.equal(panel.kind,'text');
});
test('Choosing a confirmation does nothing; a later executor failure stays a failure',async()=>{
  const world=new VehicleWorld();world.setCar(car=>({...car,windows:{...car.windows,rr:100}}));world.setFault('rr');
  const before=structuredClone(world.getSnapshot());
  const panel=select({kind:'windows',targets:{rr:0}});assert.deepEqual(world.getSnapshot(),before);
  assert.equal(panel.kind,'confirmation');if(panel.kind==='confirmation'){const result=await executeAssistantPlan(panel.plan,world);assert.equal(result.success,false);assert.equal(world.getSnapshot().car.windows.rr,100);}
});
