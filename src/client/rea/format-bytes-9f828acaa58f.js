import * as Host from "../host-boundaries.mjs";
function t(e,t){if(!Number.isFinite(e)||e<=0)return t.formatNumber(0,{style:`unit`,unit:`byte`,unitDisplay:`long`});if(e<1024)return t.formatNumber(e,{style:`unit`,unit:`byte`,unitDisplay:`long`});let n=[`kilobyte`,`megabyte`,`gigabyte`,`terabyte`],r=e/1024,i=0;for(;r>=1024&&i<n.length-1;)r/=1024,i+=1;return t.formatNumber(r,{maximumFractionDigits:1,style:`unit`,unit:n[i],unitDisplay:`short`})}
export { t };
