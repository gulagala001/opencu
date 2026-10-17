import * as Host from "../host-boundaries.mjs";
import { CB as n } from "./app-shared-2f2228189a8d.js";
import { s as a } from "./chatgpt_tasks-6e6034f93363.js";
import { t as s } from "./chatgpt_tasks-6e6034f93363.js";
import { i as r } from "./chatgpt_tasks-6e6034f93363.js";
import { o as e } from "./rolldown-runtime-2d059c5e81f4.js";
import { c as i } from "./chatgpt_tasks-6e6034f93363.js";
import { OB as t } from "./app-shared-2f2228189a8d.js";
import { r as o } from "./chatgpt_tasks-6e6034f93363.js";
function c(e,{taskId:t,conversationId:i,destination:o,source:c}){n(e,a,{type:s.CHATGPT_TASKS_EVENT_TYPE_TASK_OPENED,taskId:t,conversationId:i,openSource:c==null?void 0:u[c],openDestination:o===`conversation`?r.CHATGPT_TASKS_OPEN_DESTINATION_CONVERSATION:r.CHATGPT_TASKS_OPEN_DESTINATION_EDITOR})}
var u;
function d(){return(d=e(()=>{i();t();u={scheduled_page:o.CHATGPT_TASKS_OPEN_SOURCE_SCHEDULED_PAGE,notification:o.CHATGPT_TASKS_OPEN_SOURCE_NOTIFICATION,conversation:o.CHATGPT_TASKS_OPEN_SOURCE_CONVERSATION,conversation_sidebar:o.CHATGPT_TASKS_OPEN_SOURCE_CONVERSATION_SIDEBAR,editor:o.CHATGPT_TASKS_OPEN_SOURCE_EDITOR};}))();}
export { n, a, s, r, e, i, t, o, c, u, d };
