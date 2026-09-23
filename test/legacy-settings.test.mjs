import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Config} from '../src/config.mjs';
import {legacySettings} from '../src/legacy-settings.mjs';

test('legacy profile import preserves paths, unwraps live fields, ignores retired keys and respects later edits',async t=>{
 const home=await mkdtemp(join(tmpdir(),'opencu-settings-'));t.after(()=>rm(home,{recursive:true,force:true}));
 const path=join(home,'custom-data');
 await writeFile(join(home,'settings.yaml.imported'),JSON.stringify({opencu:{dataDir:path,computerUseEnabled:false,computerUseNativeBinary:'/old/native',removedSetting:'retired'}}));
 const row={entry:{options:{id:'opencu',config:{}}},override:{computerUseNativeBinary:'/current/native'}};
 const updates=[],ctx={root:{loader:{await:async()=>{}}},logger:{error:message=>assert.fail(message)},settings:{describe:()=>[],update:async(...args)=>updates.push(args)},configEditor:{configuration:()=>[row],edit:async(entry,change)=>{assert.equal(entry,row.entry);updates.push(change(row.override));}}};
 ctx.get=name=>name==='profileContext'?{home,dir:home}:ctx[name];
 const legacy=await legacySettings(ctx,'opencu',Config);
 assert.deepEqual(legacy.value,{dataDir:path,computerUseEnabled:false});
 row.override.computerUseEnabled=true;
 await new Promise(resolve=>legacy.persist(resolve));
 assert.deepEqual(updates,[{computerUseNativeBinary:'/current/native',computerUseEnabled:true,dataDir:path}]);
 assert.deepEqual(JSON.parse(await readFile(join(home,'.opencu-settings-v4.json'),'utf8')).imported,['dataDir']);
 assert.deepEqual((await legacySettings(ctx,'opencu',Config)).value,{},'a restart cannot resurrect the old section');
});

test('legacy alias belongs to the replacement only while its original entry is disabled',async t=>{
 const home=await mkdtemp(join(tmpdir(),'opencu-alias-'));t.after(()=>rm(home,{recursive:true,force:true}));
 await writeFile(join(home,'settings.yaml'),JSON.stringify({legacy:{computerUseEnabled:false}}));
 const source={entry:{options:{id:'legacy'},disabled:false},override:{computerUseNativeBinary:'/profile/native',dataDir:'/unrelated/plugin-data'}};
 const ctx={get:name=>name==='profileContext'?{home,dir:home}:name==='configEditor'?{configuration:()=>[source]}:undefined};
 assert.deepEqual((await legacySettings(ctx,'opencu',Config,['legacy'])).value,{});
 source.entry.disabled=true;
 assert.deepEqual((await legacySettings(ctx,'opencu',Config,['legacy'])).value,{computerUseEnabled:false,computerUseNativeBinary:'/profile/native'});
});
