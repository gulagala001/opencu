import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createPageDialogs} from '../src/browser/dialogs.mjs';

async function fixture(t) {
  const mainFrame = {}, page = Object.assign(new EventEmitter(), {isClosed:()=>false,mainFrame:()=>mainFrame,url:()=>'https://parent.test/'});
  const session = Object.assign(new EventEmitter(), {send:async()=>({})});
  const dialogs = createPageDialogs(page,()=>0); await dialogs.attach(session); t.after(()=>dialogs.dispose());
  const open = (message='child', type='alert') => {
    const calls = [], dialog = {type:()=>type,message:()=>message,defaultValue:()=>'',accept:async text=>{calls.push(['accept',text]);},dismiss:async()=>{calls.push(['dismiss']);}};
    page.emit('dialog',dialog);return {dialog,calls};
  };
  const protocolOpen = (url='https://child.test/dialog')=>session.emit('Page.javascriptDialogOpening',{url});
  const close = ()=>session.emit('Page.javascriptDialogClosed',{});
  return {page,session,dialogs,open,protocolOpen,close};
}

test('iframe dialog source comes from its protocol opening without inventing a parent URL',async t=>{
  const f=await fixture(t), guard=f.dialogs.begin();
  const interrupted=guard.wait(new Promise(()=>{})).catch(error=>error);f.open();
  assert.equal(f.dialogs.read().url,undefined);
  f.protocolOpen();const error=await interrupted;
  assert.equal(error.code,'JS_DIALOG_OPEN');assert.equal(error.details.dialog.url,'https://child.test/dialog');
  assert.equal(f.dialogs.read().url,'https://child.test/dialog');guard.finish();
});

test('protocol events can precede Playwright dialog events, including an external closure',async t=>{
  const f=await fixture(t);f.protocolOpen('https://old.test/');f.close();f.open('externally closed');
  assert.equal(f.dialogs.read(),null);
  f.protocolOpen('https://next.test/');const next=f.open('next');
  const descriptor=f.dialogs.read();assert.equal(descriptor.url,'https://next.test/');
  await f.dialogs.handle({dialogId:descriptor.id,accept:true});assert.deepEqual(next.calls,[['accept',undefined]]);
});

test('a late protocol close cannot invalidate a chained dialog or let its old token answer it',async t=>{
  const f=await fixture(t);const first=f.open('first');f.protocolOpen();const original=f.dialogs.read();
  // The page channel may deliver the resumed script's next dialog before this
  // independent CDP session delivers the previous dialog's close event.
  first.dialog.accept=async()=>{f.open('second','confirm');};
  await f.dialogs.handle({dialogId:original.id,accept:true});const next=f.dialogs.read();
  f.close();f.protocolOpen('https://child.test/second');
  assert.equal(f.dialogs.read().id,next.id);assert.equal(next.url,'https://child.test/second');
  await assert.rejects(f.dialogs.handle({dialogId:original.id,accept:false}),{code:'STALE_DIALOG'});
  f.close();assert.equal(f.dialogs.read(),null);
});

test('a close without its pre-enable opening retires the old page event before the next dialog',async t=>{
  const f=await fixture(t);f.open('before enable');const original=f.dialogs.read();
  f.close();assert.equal(f.dialogs.read(),null);
  f.open('after enable');f.protocolOpen('https://child.test/after-enable');
  assert.equal(f.dialogs.read().url,'https://child.test/after-enable');
  await assert.rejects(f.dialogs.handle({dialogId:original.id,accept:true}),{code:'STALE_DIALOG'});
  f.close();assert.equal(f.dialogs.read(),null);
});

test('a pre-enable close arriving after the next Page event preserves the new dialog identity',async t=>{
  const f=await fixture(t);f.open('before enable');f.open('after enable');const next=f.dialogs.read();
  f.close();assert.equal(f.dialogs.read().id,next.id);
  f.protocolOpen('https://child.test/after-enable');assert.equal(next.url,'https://child.test/after-enable');
  f.close();assert.equal(f.dialogs.read(),null);
});

test('disposing dialog state removes both protocol lifecycle listeners',async t=>{
  const f=await fixture(t);assert.equal(f.session.listenerCount('Page.javascriptDialogOpening'),1);
  f.dialogs.dispose();assert.equal(f.session.listenerCount('Page.javascriptDialogOpening'),0);assert.equal(f.session.listenerCount('Page.javascriptDialogClosed'),0);
  assert.equal(f.page.listenerCount('dialog'),0);assert.equal(f.dialogs.read(),null);
});
