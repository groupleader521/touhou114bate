const fs=require('fs'),path=require('path'),crypto=require('crypto');
const h=require('../hoi4_script.cjs'),{node:N,render:R,parse:P}=h;
const {runLuaSource}=require('./lua_runtime.cjs');
const {createInputView,virtual}=require('./input_view.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const list=v=>Array.isArray(v)?v:v&&typeof v==='object'&&!Object.keys(v).length?[]:(()=>{throw Error('Expected an array');})();
const ident=s=>{if(typeof s!=='string'||!/^[_A-Za-z][_A-Za-z0-9.-]*$/.test(s))throw Error('Invalid identifier '+s);return s;};
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
function normalizePackages(packages){
 const byId=new Map();for(const p of packages){ident(p.id);if(byId.has(p.id))throw Error('Duplicate package '+p.id);p.requires=list(p.requires);p.operations=list(p.operations);byId.set(p.id,p);}
 const result=[],visiting=new Set(),visited=new Set();
 function visit(id){if(visited.has(id))return;if(visiting.has(id))throw Error('Cyclic dependency '+id);const p=byId.get(id);if(!p)throw Error('Missing dependency '+id);visiting.add(id);for(const dep of p.requires)visit(ident(dep));visiting.delete(id);visited.add(id);result.push(p);}
 for(const id of [...byId.keys()].sort())visit(id);return result;
}
function select(nodes,selector){let current=nodes,target;for(const key of list(selector)){const matches=current.filter(n=>n.key===key);if(matches.length!==1)throw Error('Selector must match exactly once: '+JSON.stringify(selector)+' at '+key+' ('+matches.length+')');target=matches[0];if(!Array.isArray(target.value))throw Error('Selector is not a block '+key);current=target.value;}if(!target)throw Error('Empty selector');return target;}
function patchText(source,op){
 const node=select(P(source),op.path),key=ident(op.key),fields=node.value.filter(n=>n.key===key);
 if(fields.length>1)throw Error('Ambiguous repeated field '+key);
 const field=fields[0],indent=source.slice(0,node.start).match(/(?:^|\n)([ \t]*)[^\n]*$/)?.[1]||'';
 function insert(value){return source.slice(0,node.end-1)+'\n'+indent+'\t'+key+' = '+value+'\n'+indent+source.slice(node.end-1);}
 function validateValue(value){if(typeof value!=='string'||/\0/.test(value))throw Error('Patch value must be Clausewitz source text');const ns=P('probe = '+value);if(ns.length!==1||ns[0].key!=='probe')throw Error('Patch must contain one value');return ns[0];}
 if(op.action==='set'){
  validateValue(op.value);return field?source.slice(0,field.valueStart)+op.value+source.slice(field.end):insert(op.value);
 }
 if(op.action==='remove'){if(!field)throw Error('Cannot remove absent field '+key);return source.slice(0,field.start)+source.slice(field.end);}
 if(op.action==='append_unique'){
  const items=list(op.items);for(const item of items){ident(item);}
  if(!field)return insert('{ '+[...new Set(items)].join(' ')+' }');
  if(!Array.isArray(field.value)||field.value.some(n=>n.key!==null||Array.isArray(n.value)))throw Error('append_unique requires an identifier list '+key);
  const exists=new Set(field.value.map(n=>n.value)),add=[...new Set(items)].filter(id=>!exists.has(id));
  return !add.length?source:source.slice(0,field.end-1)+' '+add.join(' ')+' '+source.slice(field.end-1);
 }
 throw Error('Unsupported patch action '+op.action);
}
function compile({sources,packages,packageFiles,name='Touhou Lua Overlay Preview',baseDependency,inputProfile}){
 if(!sources?.length)throw Error('Source roots are required');
 const view=createInputView(sources.map(s=>({...s,id:ident(s.id)})));sources=view.sources;
 const authoringInputs=[];
 const ordered=normalizePackages(packages||packageFiles.map(file=>{file=path.resolve(file);const bytes=fs.readFileSync(file);authoringInputs.push({file,sha256:hash(bytes)});return {...runLuaSource(bytes.toString('utf8'),file),file};}));
 const outputs=new Map(),claims=new Map(),operations=[],localisations=new Map(),locCache=new Map(),spriteNames=new Set(),panels=[],patchTargets=[],outputSpellings=new Map();
 const byId=new Map(ordered.map(p=>[p.id,p]));
 function dependsOn(pkg,id){return pkg.requires.some(dep=>dep===id||dependsOn(byId.get(dep),id));}
 function outputName(rel){virtual(rel);const key=rel.toLowerCase(),previous=outputSpellings.get(key);if(previous&&previous!==rel)throw Error('Case-insensitive output collision '+previous+' / '+rel);outputSpellings.set(key,rel);return key;}
 const effective=rel=>view.effective(rel);
 function claim(key,pkg,value,append=false){
  const old=claims.get(key);if(old){
   if(append&&old.append){if(old.package!==pkg.id&&!dependsOn(pkg,old.package))throw Error('Ordered append requires dependency: '+key);}
   else if(old.append!==append||old.value!==value)throw Error('Conflict '+key+' between '+old.package+' and '+pkg.id);
   else return false;
  }claims.set(key,{package:pkg.id,value,append});return true;
 }
 function emit(rel,bytes,pkg){const key=outputName(rel);if(patchTargets.some(t=>t.file===key))throw Error('Emit collides with patched file '+rel);if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);if(claim('file:'+key,pkg,hash(bytes)))outputs.set(rel,bytes);}
 function loadLocalisations(language){
  ident(language);if(locCache.has(language))return locCache.get(language);const values=new Map();
  const order=new Map(sources.map((s,i)=>[s.id,i]));
  const paths=view.visibleFiles('localisation').filter(f=>path.posix.basename(f.rel).endsWith('_l_'+language+'.yml')).sort((a,b)=>order.get(a.source)-order.get(b.source)||Number(a.rel.split('/').includes('replace'))-Number(b.rel.split('/').includes('replace'))||a.rel.localeCompare(b.rel,'en'));
   for(const {source,rel} of paths){const text=view.readFrom(source,rel).toString('utf8');
    if(!new RegExp('^\\uFEFF?l_'+language+':','m').test(text))continue;
    for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*([^\s:#]+):\s*\d*\s*"((?:\\.|[^"\\])*)"\s*(?:#.*)?$/);if(m)values.set(m[1],{escaped:m[2],root:source,file:rel});}
   }
  locCache.set(language,values);return values;
 }
 function loc(op,pkg,append){
  const language=ident(op.language),key=ident(op.key);if(typeof op.value!=='string'||op.value.includes('\0'))throw Error('Localisation requires text');
  const map=localisations.get(language)||new Map();localisations.set(language,map);
  if(!claim('loc:'+language+':'+key,pkg,op.value,append))return;
  const own=map.get(key),base=own||loadLocalisations(language).get(key);
  if(append&&!base)throw Error('Cannot append missing localisation '+key);
  const escaped=JSON.stringify(op.value).slice(1,-1);
  map.set(key,{escaped:(append?base.escaped:'')+escaped,base:append?(base.base||base):null,package:pkg.id});
 }
 for(const pkg of ordered)for(const op of pkg.operations){
  if(!op||typeof op.kind!=='string')throw Error('Invalid content operation');
  const record={package:pkg.id,kind:op.kind};
  if(op.kind==='localisation'||op.kind==='append_localisation'){loc(op,pkg,op.kind==='append_localisation');record.key=op.key;record.language=op.language;}
  else if(op.kind==='patch'){
   const rel=virtual(op.file);if(!rel.endsWith('.txt')&&!rel.endsWith('.gui')&&!rel.endsWith('.gfx'))throw Error('Unsupported patch file '+rel);
   const fileKey=outputName(rel),target=[...list(op.path).map(ident),ident(op.key)];
   const signature=JSON.stringify([op.action,op.action==='set'?op.value:op.action==='append_unique'?list(op.items):null]);
   const key='patch:'+fileKey+':'+JSON.stringify(target);
   if(claims.has('file:'+fileKey))throw Error('Patch collides with emitted file '+rel);
   for(const previous of patchTargets)if(previous.file===fileKey&&previous.path.length!==target.length&&previous.path.slice(0,Math.min(previous.path.length,target.length)).every((v,i)=>v===target[i]))throw Error('Overlapping parent/child patches '+rel);
   patchTargets.push({file:fileKey,path:target});
   if(claim(key,pkg,signature,op.action==='append_unique')){
    const base=outputs.get(rel)||effective(rel).bytes,text=patchText(base.toString('utf8'),op);outputs.set(rel,Buffer.from(text));
   }record.file=rel;record.path=list(op.path);record.field=op.key;record.action=op.action;
  }
  else if(op.kind==='asset'){
   const s=sources.find(s=>s.id===op.source_root);if(!s)throw Error('Unknown asset source root '+op.source_root);
   emit(op.target,view.readFrom(s.id,virtual(op.source)),pkg);record.file=op.target;
  }
  else if(op.kind==='sprite'){
   const id=ident(op.name);virtual(op.texture);if(claim('sprite:'+id,pkg,JSON.stringify(op))){
    const fields=[N('name',JSON.stringify(id)),N('texturefile',JSON.stringify(op.texture))];
    if(op.frames!==undefined){if(!Number.isInteger(op.frames)||op.frames<1)throw Error('Invalid sprite frames');fields.push(N('noOfFrames',String(op.frames)));}
    emit('interface/touhou_lua_sprite_'+id+'.gfx',R([N('spriteTypes',[N('spriteType',fields)])]),pkg);spriteNames.add(op.texture);
   }record.name=id;record.file='interface/touhou_lua_sprite_'+id+'.gfx';
  }
  else if(op.kind==='panel'){
   const id=ident(op.id),parent=ident(op.parent),title=ident(op.title),body=ident(op.body),icon=ident(op.icon),tags=list(op.tags).map(ident);
   const allowedParents=new Set(['technology_tab','production_tab','tech_armor_folder']);if(!allowedParents.has(parent))throw Error('Unsupported panel parent '+parent);
   if(!tags.length)throw Error('Panel must explicitly restrict national visibility');
   for(const v of [op.x,op.y])if(v!==undefined&&(!Number.isInteger(v)||v<0))throw Error('Invalid panel position');
   const ns=[N('name',JSON.stringify(id)),N('position',[N('x',String(op.x??920)),N('y',String(op.y??30))]),N('size',[N('width','360'),N('height','180')]),
    N('background',[N('name','"background"'),N('quadTextureSprite','"GFX_tiled_plain_bg2"')]),
    N('iconType',[N('name','"research_icon"'),N('position',[N('x','12'),N('y','10')]),N('spriteType',JSON.stringify(icon))]),
    N('instantTextBoxType',[N('name','"title"'),N('position',[N('x','70'),N('y','14')]),N('font','"hoi_18mbs"'),N('text',JSON.stringify(title)),N('maxWidth','275'),N('maxHeight','30'),N('alwaystransparent','yes')]),
    N('instantTextBoxType',[N('name','"body"'),N('position',[N('x','14'),N('y','58')]),N('font','"hoi_18mbs"'),N('text',JSON.stringify(body)),N('maxWidth','332'),N('maxHeight','110'),N('alwaystransparent','yes')])];
   emit('interface/'+id+'.gui',R([N('guiTypes',[N('containerWindowType',ns)])]),pkg);
   emit('common/scripted_guis/'+id+'.txt',R([N('scripted_gui',[N(id,[N('context_type','player_context'),N('window_name',JSON.stringify(id)),N('parent_window_token',parent),N('visible',[N('has_dlc','"No Step Back"'),N('OR',tags.map(t=>N('original_tag',t)))])])])]),pkg);
   panels.push({id,title,body,icon,parent});record.id=id;record.parent=parent;
  }
  else if(op.kind==='emit'){
   const rel=virtual(op.file);if(typeof op.content!=='string')throw Error('emit requires a string');
   if(/\.(?:txt|gfx|gui)$/.test(rel))P(op.content);emit(rel,op.content,pkg);record.file=rel;
  }
  else throw Error('Unsupported content operation '+op.kind);
  operations.push(record);
 }
 for(const [language,map] of localisations){const text='\uFEFFl_'+language+':\n'+[...map].sort((a,b)=>a[0].localeCompare(b[0],'en')).map(([key,v])=>' '+key+':0 "'+v.escaped+'"').join('\n')+'\n';emit('localisation/replace/touhou_lua_overlay_l_'+language+'.yml',text,{id:'builder'});}
 for(const texture of spriteNames)if(!outputs.has(texture))effective(texture);
 for(const panel of panels){for(const key of [panel.title,panel.body])if(![...localisations.values()].some(m=>m.has(key)))throw Error('Panel localisation missing '+key);
  if(!claims.has('sprite:'+panel.icon))throw Error('Panel sprite missing '+panel.icon);
 }
 for(const [rel,bytes] of outputs)if(/\.(?:txt|gfx|gui)$/.test(rel))P(bytes.toString('utf8'));
 const descriptor='name='+JSON.stringify(name)+'\nversion="0.1.0"\nsupported_version="1.19.*"\n'+(baseDependency?'dependencies={ '+JSON.stringify(baseDependency)+' }\n':'');
 emit('descriptor.mod',descriptor,{id:'builder'});
 // Read-set integrity guards source changes during the build; no installation writes occur.
 view.assertUnchanged();
 for(const r of inputProfile?.inputs||[])if(hash(fs.readFileSync(r.file))!==r.sha256)throw Error('Profile input changed '+r.file);
 for(const r of authoringInputs)if(hash(fs.readFileSync(r.file))!==r.sha256)throw Error('Lua package changed while building '+r.file);
 const fileRecords=[...outputs].sort((a,b)=>a[0].localeCompare(b[0],'en')).map(([file,b])=>({file,sha256:hash(b),bytes:b.length}));
 const buildId=hash(JSON.stringify({files:fileRecords,packages:ordered.map(p=>p.id),operations}));
 const localisationOrigins=[...localisations].flatMap(([language,map])=>[...map].filter(([,v])=>v.base).map(([key,v])=>({language,key,source:v.base.root,file:v.base.file})));
 const report={schema:1,builderVersion:'0.1.0',luaRuntime:'Fengari / Lua 5.3 authoring VM; independent of engine Lua 5.1',buildId,packageOrder:ordered.map(p=>p.id),authoringInputs,operations,files:fileRecords,inputs:[...view.reads.values()],selectedInputs:[...view.selected.values()],sources:sources.map(s=>({id:s.id,root:s.root||null,archive:s.archive||null,replacePaths:s.replacePaths})),localisationOrigins,inputProfile:inputProfile||null,panels,sourceMode:inputProfile?'Launcher-profile candidate view; engine order and DLC ownership are not verified.':'Explicit source roots; directory/ZIP/replace_path view, without automatic launcher/DLC selection.',engineVerified:false,installationWrites:0};
 return {outputs,report};
}
function writeBuild(build,destination){
 destination=path.resolve(destination);const roots=['build','.test-output'].map(p=>path.resolve(__dirname,p));
 if(!roots.some(r=>inside(r,destination)&&r!==destination))throw Error('Output must be a subdirectory of lua_loader/build or .test-output');
 function noLinks(target){let p=target;while(inside(__dirname,p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('Output symlink is not allowed '+p);if(p===__dirname)break;p=path.dirname(p);}}
 noLinks(destination);const marker=path.join(destination,'build-report.json'),old=fs.existsSync(marker)?JSON.parse(fs.readFileSync(marker,'utf8')):null;
 if(fs.existsSync(destination)&&fs.readdirSync(destination).length&&!old)throw Error('Refusing to overwrite an unmanaged directory');
 if(old&&(old.schema!==1||old.builderVersion!=='0.1.0'||!Array.isArray(old.files)))throw Error('Unsupported existing build report');
 for(const r of old?.files||[]){const file=path.join(destination,virtual(r.file));noLinks(file);if(!fs.existsSync(file)||hash(fs.readFileSync(file))!==r.sha256)throw Error('Generated file was externally modified '+r.file);}
 for(const rel of build.outputs.keys()){const file=path.join(destination,virtual(rel));noLinks(file);if(fs.existsSync(file)&&!(old?.files||[]).some(r=>r.file===rel))throw Error('Unmanaged output collision '+rel);}
 fs.mkdirSync(destination,{recursive:true});let written=0;
 for(const [rel,bytes] of build.outputs){const file=path.join(destination,rel);fs.mkdirSync(path.dirname(file),{recursive:true});if(!fs.existsSync(file)||!fs.readFileSync(file).equals(bytes)){fs.writeFileSync(file,bytes);written++;}}
 for(const r of old?.files||[])if(!build.outputs.has(r.file))fs.unlinkSync(path.join(destination,r.file));
 const report={...build.report,outputDirectory:destination};const json=JSON.stringify(report,null,2)+'\n';if(!fs.existsSync(marker)||fs.readFileSync(marker,'utf8')!==json)fs.writeFileSync(marker,json);
 return {buildId:report.buildId,outputDirectory:destination,files:build.outputs.size,written,packageOrder:report.packageOrder,engineVerified:false};
}
module.exports={compile,writeBuild,normalizePackages,patchText,virtual,hash};
