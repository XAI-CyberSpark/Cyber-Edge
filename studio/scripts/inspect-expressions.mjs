// Read-only backend inspect bridge: use the production parser, never evaluate expressions.
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parseExpressionAt} from 'acorn';
const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/domain/expression.ts',import.meta.url))],bundle:true,platform:'node',format:'esm',write:false});
const {validateExpression}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const {expressions,nodeIds}=JSON.parse(readFileSync(0,'utf8'));
function outputReferences(node, shadowed=new Set()) {
  if (!node || typeof node!=='object') return;
  if (node.type==='ArrowFunctionExpression') {
    outputReferences(node.body,new Set([...shadowed,...node.params.map(p=>p.name)]));return;
  }
  if(node.type==='MemberExpression' && node.object.type==='Identifier' && ['input','value'].includes(node.object.name) && !shadowed.has(node.object.name)) {
    const id=node.computed ? (node.property.type==='Literal' ? node.property.value : null) : node.property.name;
    if (typeof id==='string' && !nodeIds.includes(id)) throw Error(`outputs引用的执行节点不存在：${id}`);
  }
  for(const [key,value] of Object.entries(node)) {
    if(key==='property' && !node.computed) continue;
    if(Array.isArray(value))value.forEach(v=>outputReferences(v,shadowed));
    else if(value && typeof value==='object')outputReferences(value,shadowed);
  }
}
const errors=[];
for (const item of expressions) {
  try {
    validateExpression(item.code);
    if(item.outputRoot)outputReferences(parseExpressionAt(item.code.replace(/^\s*return\s+/,'').trim(),0,{ecmaVersion:2022}));
  } catch(error) {
    errors.push({path:item.path,actual:item.actual,error:error.message});
  }
}
process.stdout.write(JSON.stringify(errors));
