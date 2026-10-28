import {VERSION} from './contracts.mjs';

export function validateReplay(value,{cases,sourceDigest,verifierDigest,allowSourceChange=false}) {
  if(value?.version!==VERSION||value.kind!=='opencu-liveness-failure'||!value.spec||
    !/^[a-f0-9]{64}$/.test(value.sourceDigest??'')||!/^[a-f0-9]{64}$/.test(value.verifierDigest??'')||
    value.result?.id!==value.spec.id||value.result.ok!==false||typeof value.result.error?.message!=='string')throw Error('Unsupported or incomplete replay file');
  const original=cases.find(spec=>spec.id===value.spec.id);
  if(!original||JSON.stringify(original)!==JSON.stringify(value.spec))throw Error('Replay schedule is not in the current grammar');
  if(value.sourceDigest!==sourceDigest&&!allowSourceChange)throw Error('Source changed; use --allow-source-change to verify a fix against the same schedule');
  if(value.verifierDigest!==verifierDigest&&!allowSourceChange)throw Error('Verifier changed; use --allow-source-change to replay with the current verifier');
  return original;
}
