import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {ComputerUseManager} from '../src/computer-use/manager.mjs';
import {testBrowserExecutable} from './fixtures/computer-use/test-browser.mjs';
import {extensionFixture} from './fixtures/computer-use/extension.mjs';

for(const backend of ['managed','extension'])test(backend+': network diagnostics read observed requests without replaying them',{timeout:30000,skip:backend==='extension'&&process.platform==='win32'},async t=>{
 const hits=new Map();const server=createServer(async(req,res)=>{
  hits.set(req.url,(hits.get(req.url)||0)+1);
  if(req.url==='/broken'){req.socket.destroy();return;}
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/json'});res.end();return;}
  if(req.url==='/json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:'响应中文'}));return;}
  if(req.url==='/post'){let body='';for await(const chunk of req)body+=chunk;res.setHeader('Content-Type','application/json');res.end(body);return;}
  if(req.url==='/binary'){res.setHeader('Content-Type','application/octet-stream; name="json.bin"');res.end(Buffer.from([0,1,255]));return;}
  if(req.url==='/large'){res.setHeader('Content-Type','text/plain');res.end('x'.repeat(1024*1024+1));return;}
  if(req.url==='/missing'){res.writeHead(404,{'Content-Type':'text/plain'});res.end('missing');return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<button onclick="Promise.allSettled([fetch('/redirect'),fetch('/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({value:'请求中文'})}),fetch('/broken'),fetch('/missing'),fetch('/binary'),fetch('/large')]).then(()=>document.querySelector('output').textContent='完成')">请求</button><output>等待</output>`);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const fixture={url:'http://127.0.0.1:'+server.address().port};t.after(()=>{server.closeAllConnections();server.close();});
 const root=await mkdtemp(join(tmpdir(),'opencu-network-'));const env=backend==='extension'?await extensionFixture(t,{fixture}):null;
 const m=new ComputerUseManager(root,{browser:{executablePath:await testBrowserExecutable(root)},...(env?{extensionHub:env.hub}:{}),native:{binary:join(root,'missing')}});t.after(async()=>{await m.close();await rm(root,{recursive:true,force:true});});
 const run=async code=>{const r=await m.execute('test',code);assert.equal(r.error,undefined,r.error?.message);return r.blocks.filter(x=>x.type==='text').at(-1)?.text;};
 const json=async code=>JSON.parse(await run('nodeRepl.write(JSON.stringify('+code+'));'));
 await run(`var tab=await cua.createBrowserTab(${JSON.stringify(env?.browser.id??'browser')},${JSON.stringify(fixture.url)});`);
 await run("await tab.playwright.getByRole('button',{name:'请求'}).click(); await tab.playwright.getByText('完成',{exact:true}).waitFor();");
 let list;for(let i=0;i<100;i++){list=await json('await tab.dev.network.list({limit:200})');if(list.requests.some(x=>x.url.endsWith('/large')&&x.state==='finished'))break;await delay(20);}
 const find=path=>{const v=list.requests.find(x=>x.url.endsWith(path));assert.ok(v,path);return v;};
 assert.equal(find('/missing').status,404);assert.equal(find('/broken').state,'failed');assert.ok(find('/json').redirectedFrom);assert.equal(find('/redirect').status,302);
 const details=await json(`await tab.dev.network.request(${JSON.stringify(find('/post').id)})`);assert.equal(details.requestHeaders['content-type'],'application/json');assert.deepEqual(JSON.parse(details.requestBody.content),{value:'请求中文'});
 const count=hits.get('/post');const body=await json(`await tab.dev.network.responseBody(${JSON.stringify(find('/post').id)})`);assert.deepEqual(JSON.parse(body.content),{value:'请求中文'});assert.equal(hits.get('/post'),count,'diagnostics must not resend POST');
 const binary=await json(`await tab.dev.network.responseBody(${JSON.stringify(find('/binary').id)})`);assert.equal(binary.encoding,'base64');assert.deepEqual(Buffer.from(binary.content,'base64'),Buffer.from([0,1,255]));
 assert.match((await m.execute('test',`await tab.dev.network.responseBody(${JSON.stringify(find('/large').id)});`)).error?.message,/1 MiB/);
 assert.match((await m.execute('test',`await tab.dev.network.request('unknown');`)).error?.message,/Unknown or expired/);
 const filtered=await json("await tab.dev.network.list({url:'/post',limit:1})");assert.equal(filtered.requests.length,1);assert.equal(filtered.requests[0].id,details.id);
});
