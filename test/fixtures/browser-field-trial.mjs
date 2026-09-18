// Isolated comparison of Chromium's embedded testing configuration.
// This hook is only imported by the diagnostic workflow, never by production.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const fork=childProcess.fork;
childProcess.fork=function(module,args,options){
 if(process.env.CU_FIELD_TRIAL_MODE==='disabled' && String(module).endsWith('browser-process.mjs'))
  args=[...args,'--disable-field-trial-config'];
 return fork(module,args,options);
};
syncBuiltinESMExports();
