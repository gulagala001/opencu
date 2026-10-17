import * as Host from "../host-boundaries.mjs";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { r as n } from "./shellscript-de7df40ae1fa.js";
import { n as t } from "./shellscript-de7df40ae1fa.js";
var r;
var i;
function a(){return(a=e(()=>{n();r=Object.freeze(JSON.parse(`{"displayName":"Shell Session","fileTypes":["sh-session"],"name":"shellsession","patterns":[{"captures":{"1":{"name":"entity.other.prompt-prefix.shell-session"},"2":{"name":"punctuation.separator.prompt.shell-session"},"3":{"name":"source.shell","patterns":[{"include":"source.shell"}]}},"match":"^(?:((?:\\\\(\\\\S+\\\\)\\\\s*)?(?:sh\\\\S*?|\\\\w+\\\\S+[:@]\\\\S+(?:\\\\s+\\\\S+)?|\\\\[\\\\S+?[:@]\\\\N+?].*?))\\\\s*)?([#$%>❯➜\\\\p{Greek}])\\\\s+(.*)$"},{"match":"^.+$","name":"meta.output.shell-session"}],"scopeName":"text.shell-session","embeddedLangs":["shellscript"],"aliases":["console"]}`));i=[...t,r];}))();}
a();
export { i as default };
export { e, n, t, r, i, a };
