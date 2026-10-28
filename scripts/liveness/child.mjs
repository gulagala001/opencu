import {runCase} from './cases.mjs';
process.once('message',async input=>{
  try {
    const result=await runCase(input.spec,{root:input.root,parent:input.parent});
    process.send?.({type:'result',result},()=>process.disconnect());
  } catch(error) {process.send?.({type:'result',result:{id:input.spec.id,ok:false,error:{code:error.code??error.name,message:error.message,stack:error.stack}}},()=>process.disconnect());}
});
