/** Run from studio: node scripts/audit-typography.mjs [--write]. */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import postcss from 'postcss';
const root=path.resolve('src'), rows=[], violations=[], files=[];
function walk(dir){for(const f of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,f.name);if(f.isDirectory()){if(f.name!=='vendor')walk(p);}else if(/\.(tsx|css)$/.test(p))files.push(p);}}
walk(root);
const norm=s=>s.replace(/\s+/g,' ').trim();
for(const file of files.sort()){
 const source=fs.readFileSync(file,'utf8'),rel=path.relative(path.resolve('..'),file);
 if(file.endsWith('.css')){postcss.parse(source).walkDecls('font-size',d=>{
  rows.push({file:rel,line:d.source.start.line,kind:'css-size',element:d.parent.selector,role:d.value,content:''});
  if(!/^(var\(|inherit$)/.test(d.value))violations.push(`${rel}:${d.source.start.line}: literal CSS font-size ${d.value}`);
 });continue;}
 const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function visit(n,inherited='body (inherited)',scope=''){
  if(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n)){
   const el=ts.isJsxElement(n)?n.openingElement:n,tag=el.tagName.getText(ast),attrs=el.attributes.properties.filter(ts.isJsxAttribute);
   const classes=attrs.find(a=>a.name.getText(ast)==='className')?.initializer?.getText(ast)||'';
   const roles=[...classes.matchAll(/\btype-(hmi-title|hmi-body|hmi-label|hmi-caption|item-title|page|panel|section|body|label|caption|tag|code|metric)\b/g)].map(m=>m[1]);
   const defaults={Button:'label',Input:'label',Textarea:'body',Label:'label',Badge:'tag',CardTitle:'item-title',CardDescription:'body',DialogTitle:'panel',DialogDescription:'body',SheetTitle:'panel',SheetDescription:'body',SelectTrigger:'label',TabsTrigger:'label',TooltipContent:'caption',ToastTitle:'section',ToastDescription:'body'};
   const fontAttr=attrs.find(a=>a.name.getText(ast)==='fontSize');
   const role=fontAttr?`scene/SVG: ${fontAttr.initializer?.getText(ast)}`:roles.join(' | ')||defaults[tag]||inherited;
   const nextScope=classes?norm(classes):scope;
   if(/\b(?:[a-z]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(?:px|rem|em)\])(?=[\s"'`]|$)/.test(classes))violations.push(`${rel}:${ast.getLineAndCharacterOfPosition(el.getStart()).line+1}: raw size utility`);
   if(fontAttr&&/^(?:"[\d.]+"|\{[\d.]+\})$/.test(fontAttr.initializer?.getText(ast)||''))violations.push(`${rel}: literal SVG/scene fontSize`);
   for(const a of attrs)if(['placeholder','title','aria-label','alt'].includes(a.name.getText(ast)))rows.push({file:rel,line:ast.getLineAndCharacterOfPosition(a.getStart()).line+1,kind:a.name.getText(ast),element:tag,role:a.name.getText(ast)==='placeholder'?role:'accessible/help text',content:norm(a.initializer?.getText(ast)||''),classContext:nextScope});
   if(ts.isJsxElement(n))for(const c of n.children){
    if((ts.isJsxText(c)&&norm(c.text))||(ts.isJsxExpression(c)&&c.expression)){
     const value=ts.isJsxText(c)?c.text:c.expression.getText(ast);
     if(!/<[A-Za-z]/.test(value))rows.push({file:rel,line:ast.getLineAndCharacterOfPosition(c.getStart()).line+1,kind:ts.isJsxText(c)?'text':'dynamic-slot',element:tag,role,content:norm(value).slice(0,220),classContext:nextScope});
    }
    visit(c,role,nextScope);
   }
   return;
  }
  ts.forEachChild(n,c=>visit(c,inherited,scope));
 }
 visit(ast);
}
const out={note:'Static source inventory. Roles record JSX/default/inheritance; classContext and css-size rows resolve scoped CSS overrides. Dynamic slots are not a copy database or proof of visual coverage. SVG/3D use physical units. Accessible attributes have no independent visible font size.',files:files.length,entries:rows.length,rows};
if(process.argv.includes('--write')){const dest=path.resolve('../docs/product/TYPOGRAPHY_INVENTORY.json');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(out,null,2)+'\n');}
console.log(JSON.stringify({files:files.length,entries:rows.length,violations},null,2));
if(violations.length)process.exitCode=1;
