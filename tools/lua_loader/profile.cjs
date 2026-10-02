const fs=require('fs'),path=require('path');
const {parse,files}=require('../hoi4_script.cjs');
const {virtual,hash}=require('./input_view.cjs');
const unquote=v=>{if(typeof v!=='string')throw Error('Descriptor scalar expected');return v.startsWith('"')?v.slice(1,-1).replace(/\\(["\\])/g,'$1'):v;};
function descriptor(text){const nodes=parse(text),one=key=>{const ns=nodes.filter(n=>n.key===key);if(ns.length>1)throw Error('Repeated descriptor field '+key);return ns[0];},scalar=key=>{const n=one(key);return n?unquote(n.value):null;};
 const deps=one('dependencies');if(deps&&!Array.isArray(deps.value))throw Error('dependencies must be a list');
 return {name:scalar('name'),path:scalar('path'),archive:scalar('archive'),steamId:scalar('remote_file_id')||scalar('steam_id'),popsId:scalar('pops_id'),dependencies:deps?deps.value.map(n=>{if(n.key!==null)throw Error('Invalid dependency list');return unquote(n.value);}):[],replacePaths:nodes.filter(n=>n.key==='replace_path').map(n=>virtual(unquote(n.value).replace(/\/+$/,'')))};
}
function resolveProfile({game,userData,profile='active',dlc='none',project}){
 game=fs.realpathSync(game);userData=fs.realpathSync(userData);if(!['none','installed'].includes(dlc))throw Error('DLC policy must be none or installed');
 const inputs=new Map(),warnings=[],errors=[],read=file=>{file=path.resolve(file);const bytes=fs.readFileSync(file);inputs.set(file,{file,sha256:hash(bytes)});return bytes.toString('utf8').replace(/^\uFEFF/,'');};
 const loadFile=path.join(userData,'dlc_load.json'),load=JSON.parse(read(loadFile));
 if(!Array.isArray(load.enabled_mods)||!load.enabled_mods.every(x=>typeof x==='string')||!Array.isArray(load.disabled_dlcs)||!load.disabled_dlcs.every(x=>typeof x==='string'))throw Error('Unsupported dlc_load.json structure');
 const modDir=path.join(userData,'mod'),registered=[];
 for(const file of fs.readdirSync(modDir).filter(p=>p.endsWith('.mod')).sort())try{const metadata=descriptor(read(path.join(modDir,file)));registered.push({file:path.join(modDir,file),rel:'mod/'+file,...metadata});}catch(error){warnings.push({code:'unreadable-registered-descriptor',file,message:error.message});}
 let requested=load.enabled_mods,profileFile=loadFile,profileName='active dlc_load.json';
 if(profile!=='active'){
  profileFile=path.resolve(profile);const backup=JSON.parse(read(profileFile));if(backup.game!=='hoi4'||!Array.isArray(backup.mods))throw Error('Unsupported playset backup structure');profileName=backup.name||path.basename(profileFile);
  const enabled=backup.mods.filter(m=>m.enabled===true);if(enabled.some(m=>!Number.isInteger(m.position)||m.position<0)||new Set(enabled.map(m=>m.position)).size!==enabled.length)throw Error('Playset positions must be unique non-negative integers');
  requested=enabled.sort((a,b)=>a.position-b.position).flatMap(m=>{const matches=registered.filter(d=>m.steamId?d.steamId===String(m.steamId):d.name===m.displayName);if(matches.length!==1){errors.push({code:'unresolved-playset-mod',name:m.displayName,steamId:m.steamId||null,matches:matches.length});return [];}return [matches[0].rel];});
 }
 const mods=[];for(const rel of requested){try{virtual(rel);if(!/^mod\/[^/]+\.mod$/.test(rel))throw Error('Only registered mod/*.mod references are supported');const selected=registered.find(d=>d.rel.toLowerCase()===rel.toLowerCase());if(!selected)throw Error('Enabled descriptor was not found or could not be parsed');if(mods.some(m=>m.rel.toLowerCase()===selected.rel.toLowerCase()))throw Error('Duplicate enabled descriptor');mods.push(selected);}catch(error){errors.push({code:'invalid-enabled-mod',file:rel,message:error.message});}}
 const names=new Map();for(const m of mods){if(!m.name){errors.push({code:'missing-mod-name',file:m.rel});continue;}if(names.has(m.name))errors.push({code:'ambiguous-active-mod-name',name:m.name});else names.set(m.name,m);}
 const ordered=[],visited=new Set(),visiting=new Set();
 function visit(m){if(visited.has(m.rel))return;if(visiting.has(m.rel)){errors.push({code:'cyclic-mod-dependency',name:m.name});return;}visiting.add(m.rel);for(const dep of m.dependencies){const target=names.get(dep);if(target)visit(target);else warnings.push({code:'declared-dependency-not-active',mod:m.name,dependency:dep,registeredCandidates:registered.filter(d=>d.name===dep).map(d=>d.rel)});}visiting.delete(m.rel);visited.add(m.rel);ordered.push(m);}
 for(const m of mods)visit(m);
 if(ordered.some((m,i)=>mods[i]!==m))warnings.push({code:'dependency-order-adjusted',message:'A proposed dependency order was generated; the actual engine order has not been verified.'});
 const sources=[{id:'vanilla',root:game}],sourceMods=[];
 function sourceFor(m,base,id){if(Boolean(m.path)===Boolean(m.archive))throw Error('Descriptor must declare exactly one path or archive');const spec=m.path||m.archive,target=path.isAbsolute(spec)?path.resolve(spec):path.resolve(base,spec);if(!fs.existsSync(target))throw Error('Declared content is missing '+target);const stat=fs.statSync(target);if(m.path&&!stat.isDirectory())throw Error('Declared path is not a directory '+target);if(m.archive&&(!stat.isFile()||!target.toLowerCase().endsWith('.zip')))throw Error('Only ZIP archive files are supported');return {id,...(m.archive?{archive:target}:{root:target}),replacePaths:m.replacePaths};}
 const dlcs=[],disabled=load.disabled_dlcs.map(p=>p.replaceAll('\\','/')),matchedDisabled=new Set();
 for(const file of files(path.join(game,'dlc')).filter(p=>p.endsWith('.dlc')).sort())try{
  const metadata=descriptor(read(file)),rel=path.relative(game,file).replaceAll('\\','/'),aliases=[rel,path.basename(rel),metadata.name,metadata.popsId,metadata.steamId].filter(Boolean);
  const disabledBy=disabled.filter(d=>aliases.includes(d));for(const d of disabledBy)matchedDisabled.add(d);
  const record={descriptor:rel,name:metadata.name,disabled:disabledBy.length>0,ownershipVerified:false,mounted:false};dlcs.push(record);
  if(!record.disabled&&dlc==='installed'){const source=sourceFor(metadata,game,'dlc_'+path.basename(file,'.dlc').replace(/[^A-Za-z0-9_]/g,'_'));sources.push(source);record.mounted=true;record.content=source.archive||source.root;}
 }catch(error){(dlc==='installed'?errors:warnings).push({code:'unreadable-dlc',file,message:error.message});}
 for(const d of disabled)if(!matchedDisabled.has(d))warnings.push({code:'unmatched-disabled-dlc',value:d});
 if(dlc==='installed')warnings.push({code:'dlc-ownership-not-verified',message:'Only installed and not explicitly disabled descriptors are mounted; ownership and engine entitlement were not checked.'});
 for(const m of ordered)try{const source=sourceFor(m,userData,'mod_'+path.basename(m.file,'.mod').replace(/[^A-Za-z0-9_]/g,'_'));if(project&&source.root&&fs.realpathSync(source.root)===fs.realpathSync(project))source.id='touhou114';sources.push(source);sourceMods.push({name:m.name,descriptor:m.rel,source:source.id,content:source.root||source.archive,replacePaths:source.replacePaths,dependencies:m.dependencies});}catch(error){errors.push({code:'invalid-mod-content',mod:m.name,message:error.message});}
 const report={schema:1,profileName,profileFile,dlcPolicy:dlc,requestedOrder:mods.map(m=>m.rel),proposedOrder:ordered.map(m=>m.rel),mods:sourceMods,dlcs,sources,warnings,errors,canBuild:errors.length===0,engineOrderVerified:false,dependencyPolicy:'Order active matching names only; absent declarations are reported and never auto-enabled.',dlcPolicyExplanation:'none excludes DLC payloads; installed mounts declared available payloads without ownership inference.',inputs:[...inputs.values()]};
 return {sources,report};
}
module.exports={descriptor,resolveProfile};
