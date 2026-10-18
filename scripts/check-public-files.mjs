import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
// Host-specific packages are built in a disposable directory. Inspect the
// source checkout's Git inventory and this directory's actual package contents.
const source=resolve(process.env.OPENCU_SOURCE_ROOT || root);
const forbidden=p=> /(?:^|\/)(?:AGENTS|CLAUDE|AI_README|PLAN|REFERENCE|COMPONENT-ALLOCATION|.*HANDOFF|PROMPT_(?:MAINTENANCE|CHANGES))\.md$/i.test(p) || /(?:^|\/)(?:\.local|\.codegraph|work|data|test-results|playwright-report|vendor\/rea)(?:\/|$)/.test(p) || /(?:^|\/)(?:codegraph\.json|\.env(?:\.[^/]*)?|[^/]+\.log)$/.test(p)&&!p.endsWith('.env.example');
const check=(paths,label)=>{const bad=paths.filter(forbidden);if(bad.length)throw Error(label+': '+bad.join('\n'));};
const git=args=>execFileSync('git',args,{cwd:source,encoding:'utf8',maxBuffer:64*1024*1024});
check(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean),'Git public files');
const base=git(['rev-parse','origin/main']).trim();
for(const ref of git(['rev-list',`${base}..HEAD`]).trim().split('\n').filter(Boolean)) check(git(['ls-tree','-r','--name-only','-z',ref]).split('\0').filter(Boolean),'New history '+ref);
const packed=JSON.parse(execFileSync('npm',['pack','--ignore-scripts','--dry-run','--json'],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']}))[0];
check(packed.files.map(f=>f.path),'Actual npm package');
console.error(`Public files/history/package passed (${packed.files.length} package files).`);
