// Compare the artwork-only migration with its saved gameplay definitions.
const fs=require('fs'),crypto=require('crypto'),h=require('./hoi4_script.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const root=require('path').resolve(__dirname,'..');process.chdir(root);
const before=read('docs/module_icon_art/optional_gameplay_before.json');
const manifest=read('docs/幻想乡军事原版化迁移清单.json');
const plan=read('docs/module_icon_art/optional_generation_plan.json');
const art=manifest.moduleIcons,errors=[];let gameplayChecks=0,receiptChecks=0,originalArtworkChecks=0,generatorOutputChecks=0;
for(const [kind,file] of [['armor','touhou_tank_modules.txt'],['aircraft','touhou_aircraft_modules.txt']]){
 const nodes=h.parse(fs.readFileSync('common/units/equipment/modules/'+file,'utf8'));
 for(const n of nodes.find(n=>n.key==='equipment_modules').value.filter(n=>n.key!=='limit')){
  const copy=structuredClone(n);copy.value=copy.value.filter(x=>x.key!=='gfx');
  if(kind==='armor'&&manifest.armor.isolation){
   const category=copy.value.find(n=>n.key==='category');category.value=category.value.replace(/^touhou_/, '');
   for(const block of h.children(copy,'allowed_module_categories'))for(const slot of block.value)slot.value=slot.value.filter(n=>!n.value.startsWith('touhou_tank_'));
   for(const block of h.children(copy,'forbid_equipment_type_exact_match_for_category'))block.value=block.value.filter(n=>!n.key.startsWith('touhou_tank_'));
   for(const block of h.children(copy,'can_convert_from'))for(const field of h.children(block,'module_category'))field.value=field.value.replace(/^touhou_/, '');
   copy.value=copy.value.filter(n=>!(n.key==='forbid_module_categories'&&n.value.length===1&&['tank_radio_module','tank_secondary_turret'].includes(n.value[0].value)));
  }
  if(kind==='aircraft'&&manifest.aircraft.isolation){
   for(const field of copy.value.filter(n=>['category','gui_category'].includes(n.key)))field.value=field.value.replace(/^touhou_/, '');
   for(const block of h.children(copy,'forbid_module_categories'))block.value=block.value.filter(n=>!n.value.startsWith('touhou_'));
   for(const block of h.children(copy,'can_convert_from'))for(const field of h.children(block,'module_category'))field.value=field.value.replace(/^touhou_/, '');
  }
  if(hash(h.render([copy]))!==before.modules[n.key])errors.push('Gameplay changed '+n.key);
  gameplayChecks++;
 }
 const presets=structuredClone(manifest[kind].presets);
 if(kind==='armor'&&manifest.armor.isolation)for(const p of presets){
  const frame=manifest.armor.models.find(m=>m.id===p.type&&m.nativeStatSource);if(!frame)continue;
  p.type=frame.nativeStatSource;p.condition=p.condition.filter(n=>n.value!==frame.license);p.flag=p.flag.replace('touhou_tank_design_v2_','touhou_tank_design_v1_');
  p.design.find(n=>n.key==='type').value=p.type;
 }
 if(hash(JSON.stringify(presets))!==before.presets[kind])errors.push('Presets changed '+kind);
}
if(gameplayChecks!==Object.keys(before.modules).length)errors.push('Module count changed');
for(const a of read('docs/module_icon_art/conversion_metadata.json')){
 if(hash(fs.readFileSync(a.source))!==a.sourceSha256||hash(fs.readFileSync(a.texture))!==a.textureSha256)errors.push('Original artwork changed '+a.id);
 originalArtworkChecks++;
}
for(const a of plan){
 const receipt=read('docs/module_icon_art/optional_receipts/'+a.id+'.json');
 const asset=art.assets.find(x=>x.id===a.id);
 if(receipt.method!=='built-in image_gen'||receipt.prompt!==a.prompt||receipt.id!==a.id)errors.push('Generation receipt mismatch '+a.id);
 if(!asset||!fs.existsSync(asset.source)||!fs.existsSync(asset.texture))errors.push('Missing completed artwork '+a.id);
 // Saved PNGs and the manifest are portable; the generator cache may be absent on another host.
 if(asset&&fs.existsSync(receipt.generatedSource)){
  if(hash(fs.readFileSync(asset.source))!==hash(fs.readFileSync(receipt.generatedSource)))errors.push('Saved source differs from generated PNG '+a.id);
  generatorOutputChecks++;
 }
 receiptChecks++;
}
const optional=[...manifest.armor.modules,...manifest.aircraft.modules].filter(m=>m.optional);
for(const m of optional){
 const a=plan.find(a=>a.conceptKey===m.conceptKey);
 const mapping=art.mappings.find(a=>a.module===m.id);
 if(!a||m.iconAsset!==a.id||m.iconMode!=='custom'||mapping?.asset!==a.id)errors.push('Optional artwork mapping mismatch '+m.id);
}
const optionalIds=new Set(plan.map(a=>a.id));
const uniqueNewSources=new Set(art.assets.filter(a=>optionalIds.has(a.id)).map(a=>a.sourceSha256)).size;
if(plan.length!==174||new Set(plan.map(a=>a.conceptKey)).size!==174||uniqueNewSources!==174||originalArtworkChecks!==55||optional.length!==252||art.artworkCount!==229||art.mappings.length!==535||(art.placeholders||[]).length)errors.push('Incomplete artwork coverage');
const result={date:'2026-10-02',method:'built-in image_gen',newArtwork:plan.length,newTankArtwork:plan.filter(a=>a.id.startsWith('tank_')).length,newAircraftArtwork:plan.filter(a=>a.id.startsWith('air_')).length,uniqueNewSources,optionalModuleMappings:optional.length,totalArtwork:art.artworkCount,totalModuleSprites:art.mappings.length,nativePlaceholders:art.placeholders.length,gameplayChecks,preservedPresets:manifest.armor.presets.length+manifest.aircraft.presets.length,originalArtworkChecks,receiptChecks,generatorOutputChecks,engineChecked:false,errors};
result.compatibilityNormalization=!!manifest.armor.isolation;
fs.writeFileSync('docs/module_icon_art/optional_validation_summary.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
