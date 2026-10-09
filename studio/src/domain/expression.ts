/** Pure data expressions shared by authoring checks and every graph host.
 * Parse syntax without executing JavaScript. No globals, constructors, mutation,
 * arbitrary function calls or generated code enter the runtime.
 */
import { parseExpressionAt } from 'acorn';

const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const binary = new Set(['===','!==','==','!=','<','<=','>','>=','+','-','*','/','%','**']);
const methods = new Set(['includes','startsWith','endsWith','trim','toLowerCase','toUpperCase','split','some','every','filter','map']);
const builtins = new Set(['Number','String','Boolean']);
const objectMethods = new Set(['keys','values','entries']);
const cache = new Map<string, any>();
const fail = (message: string): never => { throw Error(message); };
function key(node: any): string | null {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal') return String(node.property.value);
  return null;
}
function validate(node: any, depth = 0, scope = new Set(['input','value','undefined'])): void {
  if (depth > 64) fail('表达式嵌套过深');
  const walk = (n: any) => validate(n, depth + 1, scope);
  switch (node.type) {
    case 'Literal': if (node.regex || node.bigint) fail('不支持正则或大整数'); return;
    case 'Identifier': if (forbidden.has(node.name)) fail('不可访问该字段'); if (!scope.has(node.name)) fail(`未知变量：${node.name}，请从input读取字段`); return;
    case 'ArrayExpression': if (node.elements.some((x: any) => !x)) fail('数组不能有空项'); node.elements.forEach(walk); return;
    case 'MemberExpression':
      if (key(node) && forbidden.has(key(node)!)) fail('不可访问原型字段');
      walk(node.object); if (node.computed) walk(node.property); return;
    case 'UnaryExpression': if (!['!','+','-','typeof'].includes(node.operator)) fail('不支持此一元操作'); walk(node.argument); return;
    case 'BinaryExpression': if (!binary.has(node.operator)) fail('不支持此比较或运算'); walk(node.left); walk(node.right); return;
    case 'LogicalExpression': if (!['&&','||','??'].includes(node.operator)) fail('不支持此逻辑操作'); walk(node.left); walk(node.right); return;
    case 'ConditionalExpression': walk(node.test); walk(node.consequent); walk(node.alternate); return;
    case 'ChainExpression': walk(node.expression); return;
    case 'ArrowFunctionExpression':
      if (node.async || node.params.length > 2 || node.params.some((x: any) => x.type !== 'Identifier' || forbidden.has(x.name))) fail('回调只支持值和索引参数');
      validate(node.body, depth + 1, new Set([...scope,...node.params.map((p:any)=>p.name)])); return;
    case 'CallExpression': {
      if (node.callee.type === 'Identifier') {
        if (!builtins.has(node.callee.name)) fail('只能调用已登记的数据转换函数');
        if (node.arguments.length > 1) fail('转换函数只接收一个值');
      } else if (node.callee.type === 'MemberExpression') {
        const name = key(node.callee);
        const owner = node.callee.object;
        const special = owner.type === 'Identifier' && (
          owner.name === 'Object' && objectMethods.has(name || '') ||
          owner.name === 'Array' && name === 'isArray' ||
          owner.name === 'Number' && ['isFinite','isInteger'].includes(name || ''));
        if (!special && !methods.has(name || '')) fail('不支持此数据方法');
        if (!special) walk(owner);
      } else fail('不支持动态函数调用');
      if (node.arguments.length > 3) fail('方法参数过多');
      node.arguments.forEach(walk); return;
    }
    default: fail(`不支持的表达式结构：${node.type}`);
  }
}
function tree(code: string): any {
  let source = code.trim();
  if (source.startsWith('return ')) source = source.slice(7).trim();
  if (source.endsWith(';')) source = source.slice(0, -1).trim();
  if (!source || source.length > 8000) fail('表达式为空或过长');
  if (cache.has(source)) return cache.get(source);
  const node: any = parseExpressionAt(source, 0, { ecmaVersion: 2022 });
  if (source.slice(node.end).trim()) fail('仅支持一个数据表达式，不支持脚本语句');
  validate(node);
  if (cache.size >= 128) cache.delete(cache.keys().next().value!);
  cache.set(source, node); return node;
}
export function validateExpression(code: string): void { tree(code); }

export function evaluateExpression(code: string, input: unknown): boolean {
  let remaining = 10000;
  const missingChain = Symbol();
  const primitive = (v: any) => {
    if (v !== null && (typeof v === 'object' || typeof v === 'function')) fail('数据运算需要标量');
    return v;
  };
  const evaluate = (n: any, scope: Record<string, any>): any => {
    if (--remaining < 0) fail('表达式超过运算预算');
    const run = (child: any) => evaluate(child, scope);
    switch (n.type) {
      case 'Literal': return n.value;
      case 'Identifier':
        if (n.name === 'undefined') return undefined;
        if (!Object.hasOwn(scope, n.name)) fail(`未知变量：${n.name}，请从input读取字段`);
        return scope[n.name];
      case 'ArrayExpression': return n.elements.map(run);
      case 'ChainExpression': { const value=run(n.expression); return value === missingChain ? undefined : value; }
      case 'MemberExpression': {
        const object = run(n.object), property = String(n.computed ? run(n.property) : n.property.name);
        if (forbidden.has(property)) fail('不可访问原型字段');
        if (object === missingChain) return missingChain;
        if (object == null) { if (n.optional) return missingChain; return fail('读取字段时上游数据缺失'); }
        if (typeof object === 'string' && property === 'length') return object.length;
        return Object.hasOwn(Object(object), property) ? object[property] : undefined;
      }
      case 'UnaryExpression': {
        const a = run(n.argument);
        if (n.operator === '!') return !a;
        if (n.operator === 'typeof') return typeof a;
        return n.operator === '+' ? +primitive(a) : -primitive(a);
      }
      case 'LogicalExpression': {
        const a = run(n.left);
        return n.operator === '&&' ? a && run(n.right) : n.operator === '||' ? a || run(n.right) : a ?? run(n.right);
      }
      case 'ConditionalExpression': return run(n.test) ? run(n.consequent) : run(n.alternate);
      case 'BinaryExpression': {
        const a = primitive(run(n.left)), b = primitive(run(n.right));
        switch (n.operator) {
          case '===': return a === b; case '!==': return a !== b;
          case '==': return a == b; case '!=': return a != b;
          case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
          case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return a / b; case '%': return a % b; case '**': return a ** b;
        }
        return fail('未知运算');
      }
      case 'CallExpression': {
        if (n.callee.type === 'Identifier') {
          if (!n.arguments.length) return n.callee.name === 'Number' ? 0 : n.callee.name === 'String' ? '' : false;
          const value = primitive(run(n.arguments[0]));
          return n.callee.name === 'Number' ? Number(value) : n.callee.name === 'String' ? String(value) : Boolean(value);
        }
        const member = n.callee, name = key(member)!, owner = member.object;
        if (owner.type === 'Identifier') {
          const first = () => n.arguments.length ? run(n.arguments[0]) : undefined;
          if (owner.name === 'Object' && objectMethods.has(name)) {
            const value = first(); if (!value || typeof value !== 'object') fail('Object方法需要对象');
            return name === 'keys' ? Object.keys(value) : name === 'values' ? Object.values(value) : Object.entries(value);
          }
          if (owner.name === 'Array' && name === 'isArray') return Array.isArray(first());
          if (owner.name === 'Number' && name === 'isFinite') return Number.isFinite(first());
          if (owner.name === 'Number' && name === 'isInteger') return Number.isInteger(first());
        }
        const value = run(owner);
        if (value === missingChain || value == null && (n.optional || member.optional)) return missingChain;
        if (Array.isArray(value) && ['some','every','map','filter'].includes(name)) {
          const callback = n.arguments[0];
          if (callback?.type !== 'ArrowFunctionExpression' || n.arguments.length !== 1 || value.length > 1000) fail('数组方法需要一个有限的数据回调');
          const invoke = (item: any, index: number) => evaluate(callback.body, { ...scope, ...Object.fromEntries(callback.params.map((p: any, i: number) => [p.name, i === 0 ? item : index])) });
          if (name === 'some') return value.some(invoke);
          if (name === 'every') return value.every(invoke);
          if (name === 'filter') return value.filter(invoke);
          return value.map(invoke);
        }
        const args = n.arguments.map(run);
        if (name === 'includes' && Array.isArray(value)) return value.includes(args[0],args[1] === undefined ? 0 : Number(primitive(args[1])));
        if (typeof value !== 'string') fail('文字方法需要字符串');
        if (name === 'split') {
          if (args.length !== 1 || typeof args[0] !== 'string' || value.length > 100000 || args[0].length > 128) fail('split需要一个文字分隔符，原文最多100000字符，分隔符最多128字符');
          const parts = value.split(args[0], 1001);
          if (parts.length > 1000) fail('split结果超过1000项预算');
          return parts;
        }
        if (name === 'includes') return value.includes(String(primitive(args[0])),args[1] === undefined ? 0 : Number(primitive(args[1])));
        if (name === 'startsWith') return value.startsWith(String(primitive(args[0])),args[1] === undefined ? 0 : Number(primitive(args[1])));
        if (name === 'endsWith') return value.endsWith(String(primitive(args[0])),args[1] === undefined ? undefined : Number(primitive(args[1])));
        if (args.length) fail('此文字方法不接受参数');
        if (name === 'trim') return value.trim();
        if (name === 'toLowerCase') return value.toLowerCase();
        if (name === 'toUpperCase') return value.toUpperCase();
        return fail('不支持此数据方法');
      }
      default: return fail('表达式不能作为数据值');
    }
  };
  const result = evaluate(tree(code), { input, value: input });
  if (typeof result !== 'boolean') fail('判断条件必须返回true或false');
  return result;
}
