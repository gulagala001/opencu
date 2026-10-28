import {verifyBrowser} from './browser.mjs';

process.once('message',async input=>{
  try {
    const result=await verifyBrowser({root:input.root,parent:input.parent});
    process.send?.({type:'result',result},()=>process.disconnect());
  } catch(error) {
    process.send?.({type:'result',result:{ok:false,checkpoints:[],error:{code:error.code??error.name,message:error.message,stack:error.stack}}},()=>process.disconnect());
  }
});
