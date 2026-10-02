// Custom module artwork only. Never use a native sprite name as an output key.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const h=require('./hoi4_script.cjs'),catalog=require('./module_icon_catalog.cjs');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const clean=s=>s?.replace(/^"|"$/g,'');
const textureFor=id=>'gfx/interface/equipmentdesigner/touhou_modules/icons/'+id+'.dds';
const spriteCache=new Map();
const nativeModuleCache=new Map();
function nativeModule(game,id){
  if(!nativeModuleCache.has(game))nativeModuleCache.set(game,new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n])));
  return nativeModuleCache.get(game).get(id);
}
function customSprites(root){
  if(!spriteCache.has(root)){
    const ns=h.parse(fs.readFileSync(path.join(root,'interface/zz_touhou_module_icons.gfx'),'utf8'));
    spriteCache.set(root,ns.flatMap(n=>n.value));
  }
  return spriteCache.get(root);
}
function checkDDS(file){
  const d=fs.readFileSync(file);
  if(d.toString('ascii',0,4)!=='DDS '||d.readUInt32LE(4)!==124||d.readUInt32LE(12)!==42||d.readUInt32LE(16)!==56||d.readUInt32LE(84)!==0||d.readUInt32LE(88)!==32||d.readUInt32LE(104)!==0xff000000||d.length!==128+56*42*4)throw Error('Invalid transparent 56x42 RGBA DDS: '+file);
  const alphas=[];for(let i=131;i<d.length;i+=4)alphas.push(d[i]);
  if(!alphas.includes(0)||!alphas.includes(255))throw Error('DDS has no transparent margin/solid object: '+file);
  return {width:56,height:42};
}
exports.installModuleArt=function({root,armor,aircraft}){
  const assets=catalog.assets.map(a=>{
    const texture=textureFor(a.id),file=path.join(root,texture),source='gfx/interface/equipmentdesigner/touhou_modules/source/'+a.id+'.png';
    return {id:a.id,name:a.name,source,texture,...checkDDS(file),sourceSha256:hash(path.join(root,source)),textureSha256:hash(file)};
  });
  const assetIds=new Set(assets.map(a=>a.id)),mappings=[],sprites=[],placeholders=[];
  for(const [kind,plan] of [['armor',armor],['aircraft',aircraft]]){
    const nodes=h.parse(plan.modulesScript),modules=new Map(nodes.find(n=>n.key==='equipment_modules').value.map(n=>[n.key,n]));
    for(const m of plan.modules){
      if(!m.id.startsWith('touhou_'))throw Error('Refusing a native module icon override: '+m.id);
      const n=modules.get(m.id);if(!n)throw Error('Missing module '+m.id);
      if(m.iconMode==='native_placeholder'){
        n.value=n.value.filter(x=>x.key!=='gfx');n.value.push(h.node('gfx',m.nativeGfx));
        placeholders.push({kind,module:m.id,gfx:m.nativeGfx,source:m.source});continue;
      }
      const asset=catalog.assetFor(kind,m);if(!assetIds.has(asset))throw Error('No artwork for '+m.id);
      n.value=n.value.filter(x=>x.key!=='gfx');n.value.push(h.node('gfx',m.id));
      const sprite='GFX_EMI_'+m.id,texture=textureFor(asset);
      sprites.push(h.node('spriteType',[h.node('name',JSON.stringify(sprite)),h.node('texturefile',JSON.stringify(texture)),h.node('legacy_lazy_load','no')]));
      m.iconAsset=asset;mappings.push({kind,module:m.id,asset,sprite,texture});
    }
    plan.modulesScript=h.render(nodes);
  }
  const manifest={artworkCount:assets.length,tankModules:armor.modules.length,aircraftModules:aircraft.modules.length,assets,mappings,placeholders};
  return {manifest,graphics:'# Original Touhou module artwork; native module sprites remain untouched.\n'+h.render([h.node('spriteTypes',sprites)])};
};
exports.validateModuleIcon=function({root,game,kind,module,node,errors}){
  try{
    if(module.iconMode==='native_placeholder'){
      const template=nativeModule(game,module.source);
      if(!module.optional||!template||module.nativeGfx!==(h.scalar(template,'gfx')||module.source)||clean(h.scalar(node,'gfx'))!==module.nativeGfx)throw Error('Incorrect native placeholder');
      return;
    }
    const asset=catalog.assetFor(kind,module),texture=textureFor(asset),sprite='GFX_EMI_'+module.id;
    if(clean(h.scalar(node,'gfx'))!==module.id||module.iconAsset!==asset)throw Error('Incorrect custom gfx source');
    const matches=customSprites(root).filter(n=>clean(h.scalar(n,'name'))===sprite);
    if(matches.length!==1||clean(h.scalar(matches[0],'texturefile'))!==texture)throw Error('Incorrect or duplicate custom sprite');
    checkDDS(path.join(root,texture));
  }catch(e){errors.push('Module icon '+module.id+': '+e.message);}
};
exports.validateAllModuleArt=function({root,game,manifest,errors}){
  const art=manifest.moduleIcons;if(!art){errors.push('Missing module artwork manifest');return null;}
  const sprites=customSprites(root),nativeNames=new Set();
  for(const file of h.files(path.join(game,'interface')).filter(f=>f.endsWith('.gfx')))
    for(const m of fs.readFileSync(file,'utf8').matchAll(/\bname\s*=\s*"(GFX_EMI_[^"]+)"/g))nativeNames.add(m[1]);
  const allModules=[...manifest.armor.modules,...manifest.aircraft.modules];
  const expected=new Set(allModules.filter(m=>m.iconMode!=='native_placeholder').map(m=>'GFX_EMI_'+m.id));
  const placeholders=art.placeholders||[];
  if(placeholders.length!==allModules.filter(m=>m.iconMode==='native_placeholder').length)errors.push('Incomplete native placeholder mappings');
  if(new Set(placeholders.map(p=>p.module)).size!==placeholders.length)errors.push('Duplicate native placeholder mappings');
  for(const p of placeholders){const module=manifest[p.kind]?.modules.find(m=>m.id===p.module);if(!module||module.iconMode!=='native_placeholder'||module.source!==p.source||module.nativeGfx!==p.gfx||!nativeNames.has('GFX_EMI_'+p.gfx))errors.push('Incorrect/missing native placeholder mapping '+p.module);}
  if(art.assets.length!==catalog.assets.length||new Set(art.assets.map(a=>a.id)).size!==catalog.assets.length)errors.push('Incomplete module artwork families');
  if(sprites.length!==expected.size||art.mappings.length!==expected.size)errors.push('Incomplete module sprite mappings');
  for(const n of sprites){const name=clean(h.scalar(n,'name'));if(nativeNames.has(name)||!expected.has(name))errors.push('Native/unexpected module sprite override '+name);}
  for(const a of art.assets){try{
    checkDDS(path.join(root,a.texture));
    if(a.texture!==textureFor(a.id)||hash(path.join(root,a.texture))!==a.textureSha256||hash(path.join(root,a.source))!==a.sourceSha256)throw Error('Artwork path or checksum changed');
    if(!art.mappings.some(m=>m.asset===a.id))throw Error('Unused artwork');
  }catch(e){errors.push('Module artwork '+a.id+': '+e.message);}}
  for(const m of art.mappings){
    const module=manifest[m.kind]?.modules.find(n=>n.id===m.module);
    if(!module||catalog.assetFor(m.kind,module)!==m.asset||m.sprite!=='GFX_EMI_'+m.module||m.texture!==textureFor(m.asset))errors.push('Incorrect module artwork mapping '+m.module);
  }
  return {artworkFamilies:art.assets.length,tankModules:art.tankModules,aircraftModules:art.aircraftModules,sprites:sprites.length,nativePlaceholders:placeholders.length,nativeSpriteOverrides:sprites.filter(n=>nativeNames.has(clean(h.scalar(n,'name')))).length};
};
exports.checkDDS=checkDDS;
