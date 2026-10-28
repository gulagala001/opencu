import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,dirname,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';

const sourceFiles=root=>execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','.'],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).split('\0').filter(Boolean).filter(file=>! /^(?:node_modules|lib|\.local)(?:\/|$)/.test(file));
const inside=(root,path)=>{const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../');};
async function generatedFiles(root,dir='lib') {
  const result=[];let base;
  try{base=await fs.realpath(join(root,dir));}catch(error){if(error.code==='ENOENT')return result;throw error;}
  const visit=async(path,prefix)=>{
    for(const item of await fs.readdir(path,{withFileTypes:true})){
      const file=join(path,item.name),relativeFile=prefix+'/'+item.name;
      if(item.isSymbolicLink())throw Error('Generated output must not contain symlinks: '+relativeFile);
      if(item.isDirectory())await visit(file,relativeFile);else if(item.isFile())result.push({file:relativeFile,path:file});
    }
  };await visit(base,dir);return result;
}
/** Includes verifier/tests/build bytes and lockfiles, not only runtime await sites. */
export async function fingerprint(root) {
  const records=[];
  for(const file of sourceFiles(root)){
    const path=join(root,file);let info;try{info=await fs.lstat(path);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!info.isFile())throw Error('Source fingerprint requires ordinary files: '+file);
    records.push({file,mode:info.mode&0o777,hash:createHash('sha256').update(await fs.readFile(path)).digest('hex')});
  }
  for(const item of await generatedFiles(root)){const info=await fs.stat(item.path);records.push({file:item.file,mode:info.mode&0o777,hash:createHash('sha256').update(await fs.readFile(item.path)).digest('hex')});}
  records.sort((a,b)=>a.file.localeCompare(b.file));
  return {digest:createHash('sha256').update(JSON.stringify(records)).digest('hex'),files:records.length,
    dependencies:'Locked dependencies are shared; package metadata/lockfiles are fingerprinted. Arbitrary external dependency mutation is outside this source snapshot.'};
}

/** Tests may rebuild files or be killed. Give them a private checkout, never a
 * symlink to the user's source or generated output. Only dependencies are shared. */
export async function snapshot(root,parent,{dependencyRoot}={}) {
  const destination=await fs.mkdtemp(join(parent,'source-'));
  const paths=sourceFiles(root),copied=[];
  for(const file of paths) {
    if(isAbsolute(file)||file.split('/').includes('..'))throw Error('Snapshot path escaped source');
    if(/^(?:node_modules|lib|\.local)(?:\/|$)/.test(file))continue;
    const from=join(root,file),to=join(destination,file);let info;
    try{info=await fs.lstat(from);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    if(!info.isFile())throw Error('Snapshot only accepts ordinary tracked source files: '+file);
    await fs.mkdir(dirname(to),{recursive:true});await fs.copyFile(from,to);await fs.chmod(to,info.mode&0o777);
    copied.push(file);
  }
  const lib=await fs.realpath(join(root,'lib')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(lib){await generatedFiles(root);await fs.cp(lib,join(destination,'lib'),{recursive:true,dereference:true,preserveTimestamps:true});}
  let dependencies=await fs.realpath(join(root,'node_modules')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  // Embedded consumers often have no local node_modules. Resolve their runtime
  // imports from an explicit tool dependency root, never an incidental ancestor.
  if(!dependencies&&dependencyRoot)dependencies=await fs.realpath(join(dependencyRoot,'node_modules'));
  if(dependencies)await fs.symlink(dependencies,join(destination,'node_modules'),'dir');
  // Prevent a test's Git command from walking up into the real checkout.
  const git=args=>execFileSync('git',args,{cwd:destination,stdio:'pipe'});
  git(['init','--quiet','-b','main']);
  // Preserve source membership even for an intentionally tracked legacy file
  // that now matches .gitignore. Do not stage generated output or dependencies.
  execFileSync('git',['add','--force','--pathspec-from-file=-','--pathspec-file-nul'],{cwd:destination,input:copied.join('\0')+'\0',stdio:['pipe','pipe','pipe']});
  git(['-c','user.name=OpenCU synthetic verification','-c','user.email=synthetic@example.invalid','commit','--quiet','-m','Synthetic source snapshot']);
  git(['update-ref','refs/remotes/origin/main','HEAD']);
  return destination;
}
