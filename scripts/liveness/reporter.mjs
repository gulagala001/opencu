import {tap} from 'node:test/reporters';

// Keep human-readable TAP, but never infer success or coverage from its text.
// Node's own per-file/final summaries travel over the private parent IPC channel.
export default async function* reporter(source) {
  async function* observed() {
    for await (const event of source) {
      if (['test:pass','test:fail','test:summary'].includes(event.type)) {
        const value=JSON.parse(JSON.stringify(event,(_key,item)=>item instanceof Error
          ? {...item,name:item.name,message:item.message,code:item.code,stack:item.stack,failureType:item.failureType,cause:item.cause,errors:item.errors} : item));
        if (!process.send) throw Error('The liveness reporter requires its supervisor IPC channel');
        await new Promise((resolve,reject)=>process.send({type:'test-event',event:value},error=>error?reject(error):resolve()));
      }
      yield event;
    }
  }
  yield* tap(observed());
}
