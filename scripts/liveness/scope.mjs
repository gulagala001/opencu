import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {linuxHelper} from '../../src/native/linux-helper.mjs';

// These are exact, current-platform exclusions. Missing optional tools, SDKs,
// browsers, failed permission requests and unfinished tests are never exclusions.
export function platformSkips({platform=process.platform,environment=process.env}={}) {
  const records=[];
  const add=(file,name,reason)=>records.push({file:'test/'+file,name,reason});
  if(platform!=='linux')add('native-helper-selection.test.mjs','only the Hyprland helper advertises the screen hand-back',`Requires Linux; current platform is ${platform}`);
  if(platform!=='darwin') {
    add('macos-interaction.test.mjs','macOS normal clicks, modal scopes and visible AX geometry use the live interaction policies',`Requires macOS; current platform is ${platform}`);
    add('native-live.test.mjs','macOS real native input survives human intervention, cancellation and restart','requires macOS native UI');
  }
  if(platform!=='linux'||linuxHelper(environment)!=='hyprland.py') {
    const reason=platform!=='linux'?`Requires a live Linux Hyprland session; current platform is ${platform}`:'Requires a live Linux Hyprland session; no Hyprland session is configured';
    add('native.hyprland.test.mjs','real Hyprland backend enumerates windows and captures the foreground one',reason);
    add('native.hyprland.test.mjs','the helper gives up its session when its peer disappears',reason);
  }
  return records;
}
export const platformSkip=(file,name)=>platformSkips().find(record=>record.file===file&&record.name===name)?.reason??false;

export async function discoverDsh(root,{installation=process.env.OPENCU_DSH_INSTALL}={}) {
  const expected=JSON.parse(await fs.readFile(join(root,'package.json'),'utf8')).engines?.dsh;
  const candidates=installation?[resolve(installation)]:[
    join(root,'.local/cu-dsh-sdk/package.json'),join(root,'package.json'),
    join(root,'../omd/package.json'),join(root,'../oh-my-dsh/package.json'),
  ];
  const attempts=[];
  for(const anchor of [...new Set(candidates)]) {
    try {
      await fs.access(anchor);
      const dshPackage=createRequire(anchor).resolve('@deepseek-ai/dsh/package.json');
      const metadata=JSON.parse(await fs.readFile(dshPackage,'utf8'));
      if(metadata.version!==expected)throw Object.assign(Error(`Expected DSH ${expected}, found ${metadata.version}`),{code:'DSH_VERSION_MISMATCH'});
      const requireDsh=createRequire(dshPackage),modules={};
      for(const name of ['@deepseek-ai/dsh/profile-boot','@deepseek-ai/dsh-launch-environment','@deepseek-ai/dsh-system-prompt','@deepseek-ai/dsh-tools','@deepseek-ai/dsh-attachment-local'])modules[name]=requireDsh.resolve(name);
      return {available:true,installation:anchor,package:dshPackage,version:metadata.version,modules};
    } catch(error) {attempts.push({installation:anchor,code:error.code??error.name,message:error.message});}
  }
  return {available:false,expectedVersion:expected,attempts,error:{code:'MISSING_DSH_SDK',message:`Full verification requires a real DSH ${expected} SDK and isolated profile smoke; install it under .local/cu-dsh-sdk or set OPENCU_DSH_INSTALL to its package.json.`}};
}
