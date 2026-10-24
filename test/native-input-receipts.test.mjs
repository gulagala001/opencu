import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Linux helper replies preserve actual input and cleanup receipts',()=>{
  const result=spawnSync('python3',['-B',fileURLToPath(new URL('./fixtures/input-receipts.py',import.meta.url))],{encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+result.stderr);
});
