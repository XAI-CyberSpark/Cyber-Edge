import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeScenario} from '../src/domain/scenarioExecution';
import {mcpNodeSpec, type McpCatalogEntry} from '../src/data/mcpCatalog';
import {validateGraph} from '../src/domain/nodeCapabilities';
const n=(id:string,type:string,data:any={})=>({id,type,data,position:{x:0,y:0}});
const e=(source:string,target:string,sourceHandle?:string)=>({id:source+target+(sourceHandle||''),source,target,sourceHandle});
const graph=()=>({nodes:[n('i','input',{flowVersion:2}),n('tool','tool',{tool_id:'mcp',serverId:'lab',toolName:'charging_status',arguments:{station:{$ref:'input.text'}}}),n('condition','logic',{condition:'input.data.available > 0'}),n('yes','output',{responseText:'可用{{outputs.tool.data.available}}个'}),n('no','output',{responseText:'暂无空位'}),n('error','output',{responseText:'查询失败：{{input.error.message}}'})],edges:[e('i','tool'),e('tool','condition'),e('condition','yes','true'),e('condition','no','false'),e('tool','error','error')]});
const result=(body:any,n=2)=>({source:'mcp',server_id:body.server_id,tool_name:body.tool_name,is_error:false,content:[{type:'text',text:'test result'}],data:{available:n},text:'test result'});
test('explicit typed MCP arguments reach adapter and actual values choose branches',async()=>{
 const requests:any[]=[];const r=await executeScenario(graph(),{cases:[{name:'available',steps:[{input:'north',assertions:[{path:['hmi','message'],op:'equals',value:'可用2个'}]}]},{name:'empty',steps:[{input:'south',assertions:[{path:['hmi','message'],op:'equals',value:'暂无空位'}]}]}]},{mcp:async body=>{requests.push(body);return result(body,body.arguments.station==='north'?2:0);}});
 assert.equal(r.status,'passed',JSON.stringify(r));assert.deepEqual(requests.map(x=>x.arguments),[{station:'north'},{station:'south'}]);assert.equal(r.tool_calls,2);
});
test('MCP failures take error branch and do not masquerade as successful business data',async()=>{
 const r=await executeScenario(graph(),{cases:[{name:'unavailable',steps:[{input:'north',status:'failed',assertions:[{path:['hmi','message'],op:'contains',value:'offline'},{path:['outputs','yes'],op:'not_exists'}]}]}]},{mcp:async()=>{throw Error('offline');}});
 assert.equal(r.status,'passed',JSON.stringify(r));
});
test('missing adapter and mismatched receipts fail explicitly',async()=>{
 const r=await executeScenario(graph(),{cases:[{name:'unbound',steps:[{input:'north',status:'failed',assertions:[{path:['run','status'],op:'equals',value:'failed'}]}]}]});assert.equal(r.status,'passed',JSON.stringify(r));
 const bad=await executeScenario(graph(),{cases:[{name:'wrong tool',steps:[{input:'north',status:'failed'}]}]},{mcp:async body=>({...result(body),tool_name:'other'})});assert.equal(bad.status,'passed');
});
test('node cannot provide URL, credentials or process instructions',()=>{
 for(const key of ['url','headers','command','apiKey','endpoint','env']){const g=graph();g.nodes[1].data[key]='bad';assert.ok(validateGraph(g.nodes,g.edges).some(x=>x.severity==='error'));}
});
test('JSON model output can bind MCP parameters without claiming a vehicle action',async()=>{
 const g=graph();g.nodes.splice(1,0,n('model','llm',{providerId:'anthropic',model:'fixture',outputFormat:'json',outputFields:{station:'string'}}));g.nodes.find(x=>x.id==='tool')!.data.arguments={station:{$ref:'input.data.station'}};g.edges.shift();g.edges.unshift(e('i','model'),e('model','tool'));
 const r=await executeScenario(g,{cases:[{name:'structured parameters',steps:[{input:'north please',assertions:[{path:['hmi','message'],op:'equals',value:'可用2个'}]}]}]},{inference:async()=>({choices:[{message:{content:'{"station":"north"}'}}]}),mcp:async body=>{assert.equal(body.arguments.station,'north');return result(body);}});assert.equal(r.status,'passed',JSON.stringify(r));
});

test('managed Fetch runs through the production graph and real backend', {skip: !process.env.OAKEGDE_TEST_MCP_MANAGED_URL}, async()=>{
 const endpoint=process.env.OAKEGDE_TEST_MCP_MANAGED_URL!;
 const actualFetch=globalThis.fetch;
 const g={nodes:[n('i','input',{flowVersion:2}),n('t','tool',{tool_id:'mcp',serverId:'catalog-fetch',toolName:'fetch',arguments:{url:{$ref:'input.text'},max_length:200}}),n('o','output')],edges:[e('i','t'),e('t','o')]};
 const r=await executeScenario(g,{cases:[{name:'real Fetch',steps:[{input:'https://example.com',assertions:[{path:['outputs','t','source'],op:'equals',value:'mcp'},{path:['outputs','t','text'],op:'contains',value:'Contents of https://example.com'},{path:['outputs','t','data'],op:'equals',value:null}]}]}]}, {mcp:async body=>{
   const response=await actualFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await response.json();if(!response.ok)throw Error(result.detail);return result;
 }});
 assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(r.tool_calls,1);assert.equal(r.model_calls,0);
});

test('managed multi-tool selection executes Time and routes invalid input to the error branch', {skip: !process.env.OAKEGDE_TEST_MCP_MANAGED_URL}, async()=>{
 const endpoint=process.env.OAKEGDE_TEST_MCP_MANAGED_URL!;
 const actualFetch=globalThis.fetch;
 const detailResponse=await actualFetch(endpoint.replace('/invoke','/detail?server_id=%40modelcontextprotocol%2Ftime'));
 assert.equal(detailResponse.ok,true);
 const item=await detailResponse.json() as McpCatalogEntry;
 const tool=item.installation!.tools.find(tool=>tool.name==='convert_time');
 assert.ok(tool);
 const spec=mcpNodeSpec(item,tool)!;
 const g={nodes:[n('i','input',{flowVersion:2}),n('t',spec.type,{...spec.data,arguments:{source_timezone:'Asia/Shanghai',time:{$ref:'input.text'},target_timezone:'UTC'}}),n('o','output'),n('error','output',{responseText:'换算失败：{{input.error.message}}'})],edges:[e('i','t'),e('t','o'),e('t','error','error')]};
 const r=await executeScenario(g,{cases:[
  {name:'real Time',steps:[{input:'09:30',assertions:[{path:['outputs','t','source'],op:'equals',value:'mcp'},{path:['outputs','t','text'],op:'contains',value:'01:30:00+00:00'}]}]},
  {name:'invalid Time',steps:[{input:'25:99',status:'failed',assertions:[{path:['hmi','message'],op:'contains',value:'换算失败'},{path:['outputs','o'],op:'not_exists'}]}]}
 ]},{mcp:async body=>{
  const response=await actualFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw Error(result.detail);return result;
 }});
 assert.equal(r.status,'passed',JSON.stringify(r));assert.equal(r.tool_calls,2);assert.equal(r.model_calls,0);
});
