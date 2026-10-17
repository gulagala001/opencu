import{n as e}from"./rolldown-runtime-2d059c5e81f4.js";import{EO as t,_O as n,cin as r,ein as i,fin as a,sin as o,tin as s}from"./app-shared-2f2228189a8d.js";import{$u as c,nd as l,td as u}from"./app-primary-5433e23a397e.js";function d(e,{viewport:t={width:window.innerWidth,height:window.innerHeight},viewportScale:n,zoomFactor:i=1}={}){let a=o(e,{viewport:t,viewportScale:n,zoomFactor:i});return r(n)===1?{left:a.x,top:a.y,width:a.width}:{height:a.height,left:a.x,top:a.y,width:a.width}}var f,p,m,h,g,_,v,y;function b(){return(b=e((()=>{l(),a(),t(),f=`#000000`,p=`#0069FB`,m={...i,fill:c,hotspotByMode:{add:{x:i.width/2,y:i.height/2},comment:i.hotspot,text:{x:7,y:13.5}},path:u({width:i.width,height:i.height,strokeWidth:1.65}),stroke:`white`,strokeWidth:1.65},h=m.hotspotByMode.comment.x/m.width*100,g=(m.hotspotByMode.comment.y+(m.width-m.height)/2)/m.width*100,_=`translate(-${h}%,-${g}%)`,v={position:`fixed`,inset:0,pointerEvents:`none`,fontSize:`13px`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`},y=`
.hover-box{position:fixed;box-sizing:border-box;border-radius:0;border:2px solid ${p};background:color-mix(in srgb,${p} 3%,transparent);box-shadow:inset 0 0 0 1px rgba(255,255,255,.28);pointer-events:none;transition:opacity 150ms cubic-bezier(${n.join(`,`)})}
[data-browser-comment-control-editing] .hover-box{opacity:0}
@media(prefers-reduced-motion:reduce){.hover-box{transition:none}}
.text-selection-highlight{position:fixed;box-sizing:border-box;background:#128dff66;pointer-events:none}
.flex-item-overlay{position:fixed;box-sizing:border-box;border-radius:0;border:1px solid rgba(2,133,255,.52);background:rgba(18,141,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);pointer-events:none}
.interaction-layer{position:fixed;inset:0;z-index:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;border:0;padding:0;background:transparent;pointer-events:none}
.interaction-layer::backdrop{background:transparent}
.interaction-blocker{position:absolute;inset:0;z-index:0;pointer-events:auto;touch-action:pan-x pan-y}
.annotation-selection-cursor{position:fixed;z-index:1;display:block}
.annotation-selection-modifier-cursor{z-index:2;color:${f};paint-order:stroke fill;stroke:${m.stroke};stroke-linejoin:round;stroke-width:2px}
.annotation-selection-comment-cursor{overflow:visible}
.annotation-selection-comment-cursor[data-browser-comment-annotation-selection-cursor-mode="text"]{z-index:2}
.annotation-selection-cursor-bubble{transform:translate(0,0) scale(1);transform-box:view-box;transform-origin:0 0;transition:transform 150ms cubic-bezier(${n.join(`,`)})}
.annotation-selection-cursor-beam{opacity:0;transition:opacity 150ms cubic-bezier(${n.join(`,`)})}
[data-browser-comment-annotation-selection-cursor-mode="text"] .annotation-selection-cursor-bubble{transform:translate(${12+m.hotspotByMode.comment.x-m.hotspotByMode.text.x}px,${-2+m.hotspotByMode.comment.y-m.hotspotByMode.text.y}px) scale(.55)}
[data-browser-comment-annotation-selection-cursor-mode="text"] .annotation-selection-cursor-beam{opacity:1}
@media(prefers-reduced-motion:reduce){.annotation-selection-cursor-bubble,.annotation-selection-cursor-beam{transition:none}}
[data-browser-comment-annotation-selection-modifier-active] .marker{cursor:none}
.annotation-selection-target-hover{border-color:color-mix(in srgb,${p} 80%,black)}
.annotation-selection-remove-hover{background:color-mix(in srgb,${p} 20%,transparent)}
.region-box{border-width:2px;border-style:dashed}
.posted-region-highlight{position:fixed;box-sizing:border-box;border-radius:0;background:color-mix(in srgb,${p} 3%,transparent);pointer-events:none}
.google-docs-annotation-box{background:transparent;box-shadow:none}
.google-docs-element-box{border-color:transparent}
.markers-layer{position:fixed;inset:0;z-index:1;pointer-events:none}
.marker{position:fixed;border:0;background:transparent;transform:${_};transform-origin:${h}% ${g}%;pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}
.marker-icon{position:absolute;inset:0;display:block;width:100%;height:100%;pointer-events:none}
.saved-marker{width:var(--browser-sidebar-saved-marker-size);height:var(--browser-sidebar-saved-marker-size)}
.draft-marker{width:var(--browser-sidebar-draft-marker-size);height:var(--browser-sidebar-draft-marker-size)}
.marker-label{position:relative;color:${m.stroke};font-size:var(--browser-sidebar-marker-label-font-size);font-weight:700;line-height:1;pointer-events:none}
.marker-motion{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;pointer-events:none;transform-origin:bottom left;scale:1;transition:scale 150ms cubic-bezier(${n.join(`,`)})}
.marker:hover .marker-motion,.marker[data-selected="true"] .marker-motion{scale:1.08}
@media(prefers-reduced-motion:reduce){.marker-motion{transition:none}}
${s}
`})))()}export{d as a,m as i,v as n,b as o,y as r,p as t};
//# sourceMappingURL=style-a96f0dc55672.js.map