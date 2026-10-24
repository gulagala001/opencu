import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPresentationInteraction, isNestedPresentationControl } from '../src/client/presentation-interaction.mjs';

test('nested presentation controls retain their click recipient while the REA frame still drags', t => {
  class Element {
    constructor(tag, parent) { this.tag = tag; this.parent = parent; this.dataset = {}; this.events = new Map(); }
    closest(selector) {
      for (let node = this; node; node = node.parent) {
        if (selector.includes('data-pip-presentation-frame') && node.frame) return node;
        if (selector.includes('data-pip-close') && node.close) return node;
        if (selector.includes('button,a[href]') && ['button','a','input','select','textarea'].includes(node.tag)) return node;
      }
      return null;
    }
    addEventListener(type, listener) { this.events.set(type, listener); }
    removeEventListener(type) { this.events.delete(type); }
    querySelectorAll() { return []; }
    contains() { return true; }
    getBoundingClientRect() { return {x:0,y:0,width:100,height:100}; }
    setPointerCapture(id) { this.captured = id; }
    hasPointerCapture(id) { return this.captured === id; }
    releasePointerCapture() { delete this.captured; }
  }
  const previous = new Map(['Element','window','MutationObserver','requestAnimationFrame','cancelAnimationFrame'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const root = new Element('div'), frame = new Element('button',root), events = [];
  frame.frame = true; frame.dataset.pipPresentationFrame = 'real-frame';
  Object.assign(globalThis,{ Element, window:new Element('window'), MutationObserver:class {observe(){} disconnect(){}}, requestAnimationFrame:()=>1, cancelAnimationFrame(){} });
  t.after(() => { for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis,key,descriptor) : delete globalThis[key]; });
  const dispose = connectPresentationInteraction(root,event => events.push(event));
  const down = target => root.events.get('pointerdown')({target,button:0,isPrimary:true,pointerId:7,clientX:50,clientY:50,screenX:50,screenY:50});
  for (const tag of ['button','a','input','select','textarea']) {
    events.length = 0; const icon = new Element('svg',new Element(tag,frame)); down(icon);
    assert.equal(isNestedPresentationControl(icon,frame),true,`${tag} icon clicks must not focus the outer frame`);
    assert.equal(frame.captured,undefined,`${tag} must not lose its recipient to frame pointer capture`);
    assert(!events.some(event => event.type === 'drag-start' || event.type === 'resize-start'));
  }
  assert.equal(isNestedPresentationControl(new Element('img',frame),frame),false);
  down(new Element('img',frame)); assert.equal(frame.captured,7); assert(events.some(event => event.type === 'drag-start'));
  window.events.get('pointerup')(); assert.equal(frame.captured,undefined); dispose(); assert.equal(root.events.size,0);
});
