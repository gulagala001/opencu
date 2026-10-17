import * as Host from "../host-boundaries.mjs";
function t(e){let t=new Set,n=[e],r=new Set;for(;n.length>0;){let i=n.pop();if(!(typeof i!=`object`||!i||i instanceof Uint8Array||r.has(i))){if(r.add(i),Array.isArray(i)){for(let e of i)n.push(e);continue}for(let[r,a]of Object.entries(i))(i!==e||r!==`images`)&&((r===`imageReference`||r===`previewImageReference`)&&typeof a==`object`&&a&&`id`in a&&typeof a.id==`string`&&a.id.length>0&&t.add(a.id),n.push(a))}}return t}
export { t };
