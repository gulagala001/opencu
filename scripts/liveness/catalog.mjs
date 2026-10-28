import fs from 'node:fs/promises';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from '@babel/parser';
import {contracts,contractFor,VERSION} from './contracts.mjs';

export const hash=value=>createHash('sha256').update(value).digest('hex');
async function files(root, prefix='') {
  const result=[];
  for(const entry of await fs.readdir(join(root,prefix),{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})) {
    const file=prefix?`${prefix}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())continue;
    if(entry.isDirectory()) {
      if(!entry.name.startsWith('.')&&!/(?:^|\/)(?:rea|vendor|bin|__pycache__|node_modules|build-inputs)(?:\/|$)/.test(file))result.push(...await files(root,file));
    } else if(/\.(?:mjs|[jt]sx?|py|swift|ps1|cs)$/.test(file))result.push(file);
  }
  return result.sort();
}
function name(node) {
  if(!node)return '';
  if(node.type==='Identifier')return node.name;
  if(node.type.endsWith('Literal'))return String(node.value);
  if(node.type==='ThisExpression')return 'this';
  if(['MemberExpression','OptionalMemberExpression'].includes(node.type))return `${name(node.object)}.${node.computed?'[]':name(node.property)}`;
  if(['CallExpression','OptionalCallExpression','NewExpression'].includes(node.type))return name(node.callee)+'()';
  return node.type;
}
function inventory(source,file) {
  let ast;
  try{ast=parse(source,{sourceType:'unambiguous',plugins:['jsx',['typescript',{dts:file.endsWith('.d.ts')}],'importAttributes']});}
  catch(cause){throw Object.assign(Error(`Cannot inventory ${file}: ${cause.message}`,{cause}),{code:'CATALOG_PARSE'});}
  const sites=[], counts=new Map();
  const visit=(node,owner='<module>',parent)=>{
    if(!node||typeof node!=='object')return;
    if(/Function|Method/.test(node.type??''))owner=name(node.id)||name(node.key)||name(parent?.id)||name(parent?.key)||owner;
    let kind,callee;
    if(node.type==='AwaitExpression'){kind='await';callee=name(node.argument);}
    else if(node.type==='NewExpression'&&name(node.callee)==='Promise'){kind='promise';callee='Promise';}
    else if(['CallExpression','OptionalCallExpression'].includes(node.type)) {
      const call=name(node.callee);
      if(/(?:^|\.)(?:setTimeout|setInterval|waitFor|waitForEvent|request|send|postMessage|then|once)$/.test(call)){kind='handoff';callee=call;}
    }
    if(kind){const stem=`${owner}:${kind}:${callee}`,ordinal=(counts.get(stem)??0)+1;counts.set(stem,ordinal);sites.push({id:`${stem}:${ordinal}`,line:node.loc.start.line,kind,callee});}
    for(const [key,value]of Object.entries(node))if(!['loc','start','end','comments','tokens','extra'].includes(key)) {
      if(Array.isArray(value))for(const child of value)if(child?.type)visit(child,owner,node);
      if(!Array.isArray(value)&&value?.type)visit(value,owner,node);
    }
  };
  visit(ast);return sites;
}
export async function scan(root) {
  const records=[];
  for(const file of [...await files(root,'src'),...await files(root,'extension'),...await files(root,'native'),...await files(root,'host')]) {
    const source=await fs.readFile(join(root,file),'utf8'),native=!/\.(?:mjs|[jt]sx?)$/.test(file);
    const sites=native?[]:inventory(source,file);
    const contract=contractFor(file);
    if(!contract)throw Error(`Unregistered asynchronous source: ${file}`);
    records.push({file,contract:contract.id,sha256:hash(source),kind:native?'native-boundary':'javascript',sites});
  }
  return {version:VERSION,kind:'opencu-liveness-catalog',records};
}
export async function checkCatalog(root,baseline,{consumer=false}={}) {
  const actual=await scan(root),expected=JSON.parse(await fs.readFile(baseline,'utf8'));
  if(expected.version!==VERSION||expected.kind!==actual.kind)throw Error('Unsupported liveness catalog');
  const old=new Map(expected.records.map(record=>[record.file,record]));
  const changed=actual.records.filter(record=>JSON.stringify(record)!==JSON.stringify(old.get(record.file))).map(record=>record.file);
  const present=new Set(actual.records.map(record=>record.file));
  const excluded=[];
  for(const record of expected.records)if(!present.has(record.file)) {
    // The published package intentionally ships compiled client code instead.
    // Missing runtime/core/native/host files are never accepted as packaging.
    if(consumer&&record.file.startsWith('src/client/'))excluded.push(record.file);
    else changed.push(record.file);
  }
  if(changed.length)throw Object.assign(Error(`Unreviewed liveness source drift: ${changed.join(', ')}. Review ownership, cancellation and continuation, then run catalog --write.`),{code:'CATALOG_DRIFT',files:changed});
  return {sourceDigest:hash(JSON.stringify(actual)),files:actual.records.length,waitPoints:actual.records.reduce((n,r)=>n+r.sites.length,0),
    nativeSourceFiles:actual.records.filter(r=>r.kind==='native-boundary').length,contracts:contracts.map(c=>c.id),notDistributedClientSources:excluded,
    meaning:'Source inventory and drift gate; this is not dynamic branch coverage or a proof about arbitrary external code.'};
}
export async function adapterTests(root) {
  const names=(await fs.readdir(join(root,'test'))).filter(file=>file.endsWith('.test.mjs'));
  const groups=Object.fromEntries(contracts.map(contract=>[contract.id,[]]));
  for(const file of names) {
    const source=await fs.readFile(join(root,'test',file),'utf8'),owners=new Set();
    for(const match of source.matchAll(/(?:\.\.\/)+((?:src|host|native|extension)\/[\w./-]+)/g)) {const contract=contractFor(match[1]);if(contract)owners.add(contract.id);}
    for(const contract of contracts)if(contract.tests.some(prefix=>file===prefix+'.test.mjs'||file.startsWith(prefix+'-')||file.startsWith(prefix+'.')))owners.add(contract.id);
    // Maintenance-only tests still execute in the resource/distribution scope.
    if(!owners.size)owners.add('resources');
    for(const owner of owners)groups[owner].push('test/'+file);
  }
  return groups;
}
