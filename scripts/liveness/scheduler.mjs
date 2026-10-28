import assert from 'node:assert/strict';

export class Schedule {
  events=[];pending=new Map();gates=[];sequence=0;armed=null;
  event(type,data={}) {const event={sequence:++this.sequence,type,...data};this.events.push(event);if(process.env.OPENCU_LIVENESS_CHILD==='1')process.send?.({type:'trace',event});return event;}
  arm(port,mode) {
    assert.equal(this.armed,null,'one injected fault per causal schedule');
    const entered=Promise.withResolvers(),gate=Promise.withResolvers();
    const fault={port,mode,entered,gate,fired:false};this.armed=fault;this.gates.push(gate);
    this.event('arm',{port,mode});return fault;
  }
  async call(port,args,work) {
    const target=args[0],scope={targetId:target?.id??target?.targetId,generation:target?.identity?.generation,action:args[1]?.action,actor:'ai'};
    const id=this.event('enter',{port,...scope}).sequence;this.pending.set(id,{id,port,...scope});
    const fault=this.armed?.port===port?this.armed:null;
    if(fault){this.armed=null;fault.fired=true;this.event('inject',{port,mode:fault.mode});fault.entered.resolve();}
    const fail=after=>{throw Object.assign(Error(`Injected ${port} ${after?'after':'before'} effect`),{code:'SYNTHETIC_FAULT',details:{inputDispatched:after}});};
    try {
      if(fault?.mode==='reject-before')fail(false);
      if(fault?.mode==='unacknowledged')return {released:false,failures:[{code:'SYNTHETIC_RELEASE',message:'No release receipt'}]};
      if(fault?.mode==='hold-before')await fault.gate.promise;
      const result=await work();
      if(fault?.mode==='reject-after')fail(true);
      if(fault?.mode==='hold-after')await fault.gate.promise;
      this.event('reply',{port,id});return result;
    } catch(error){this.event('reject',{port,id,code:error.code??error.name});throw error;}
    finally {this.pending.delete(id);}
  }
  release() {this.armed=null;for(const gate of this.gates)gate.resolve();}
  assertInjected(fault){assert.equal(fault.fired,true,'The declared fault was never reached');}
  snapshot(){return {events:this.events,pending:[...this.pending.values()]};}
}

/** A failed watchdog is a failure, never an accepted simulated timeout. */
export async function bounded(promise,label,ms=1500) {
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(`Unsettled operation: ${label}`),{code:'LIVENESS_VIOLATION',wait:label})),ms);})]);}
  finally{clearTimeout(timer);}
}
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
export const ok=result=>{assert.equal(result?.ok,true,JSON.stringify(result?.error??result));return result;};
