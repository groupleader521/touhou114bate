// Reconstruct actual aircraft assemblies, including the native thrust/weight agility rule.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {scalar:S,children:C}=h;
exports.installAircraftAliases=function(manifest,eq){for(const a of manifest.aircraft?.aliases||[]){
  if(eq.has(a.id))continue;const source=eq.get(a.base);
  eq.set(a.id,{...source,key:a.id,value:[...source.value.filter(n=>!['archetype','variant_name','derived_variant_name',...Object.keys(a.roleStats)].includes(n.key)),h.node('archetype',a.archetype),...Object.entries(a.roleStats).map(([k,v])=>h.node(k,String(v)))]});
}};
exports.validateAircraft=function({root,game,manifest,eq,values,errors}){
  const air=manifest.aircraft;if(!air)return {numericChecks:0};
  const nativeModules=new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
  const modules=new Map([...nativeModules,...h.definitions(root,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n])]);
  const techs=new Map(h.definitions(root,'common/technologies','technologies').map(n=>[n.key,n]));
  const effect=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_sync_aircraft_designer');
  const designs=new Map();function scan(ns){for(const n of ns){if(n.key==='if'&&C(n,'create_equipment_variant').length)designs.set(S(n,'set_country_flag'),C(n,'create_equipment_variant')[0]);if(Array.isArray(n.value))scan(n.value);}}scan(effect.value);
  const resolve=n=>{const a=S(n,'archetype'),r=a?resolve(eq.get(a)):{};for(const c of n.value){if(c.key==='resources'&&Array.isArray(c.value)){for(const k of Object.keys(r).filter(k=>k.startsWith('resources.')))delete r[k];for(const x of c.value)r['resources.'+x.key]=Number(x.value);}else if(c.key&&typeof c.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(c.value))r[c.key]=Number(c.value);}return r;};
  const slots=n=>{const own=C(n,'module_slots')[0];return own&&Array.isArray(own.value)?own:slots(eq.get(S(n,'archetype')));};
  const blueprints=new Set(h.parse(fs.readFileSync(path.join(root,'interface/equipmentdesigner/planes/touhou_plane_blueprints.gui'),'utf8'))[0].value.map(n=>S(n,'name')?.replace(/^"|"$/g,'')));
  const defines=fs.readFileSync(path.join(game,'common/defines/00_defines.lua'),'utf8'),factor=Number(defines.match(/THRUST_WEIGHT_AGILITY_FACTOR\s*=\s*([\d.]+)/)[1]);
  const assembled=new Map();let slotChecks=0,numericChecks=0,missionChecks=0,historicalWings=0,historicalPlanes=0;
  for(const p of air.presets){
    const design=designs.get(p.flag);if(!design){errors.push('Missing aircraft preset '+p.id);continue;}
    if(S(design,'type')!==p.type||JSON.parse(S(design,'name'))!==p.name)errors.push('Wrong aircraft preset identity '+p.id);
    const n=eq.get(p.type);if(!n){errors.push('Missing generic aircraft '+p.type);continue;}
    const equipped=Object.fromEntries(C(design,'modules')[0].value.map(n=>[n.key,n.value])),slotTable=slots(n);
    const categories=new Map(slotTable.value.map(n=>[n.key,C(n,'allowed_module_categories')[0]?.value.map(x=>x.value)||[]]));
    for(const slot of slotTable.value)if(S(slot,'required')==='yes'&&(!equipped[slot.key]||equipped[slot.key]==='empty'))errors.push('Required aircraft slot empty '+p.id+' '+slot.key);
    const result=resolve(n),multipliers={},missions=new Set();
    for(const [slot,id] of Object.entries(equipped)){if(id==='empty')continue;slotChecks++;const mod=modules.get(id);if(!mod){errors.push('Unknown aircraft module '+id);continue;}
      if(!categories.get(slot)?.includes(S(mod,'category')))errors.push('Incompatible aircraft module '+p.id+' '+slot+' '+id);
      if(C(mod,'mission_type_stats').length)errors.push('Uncalibrated mission modifiers on aircraft '+id);
      for(const c of C(mod,'add_stats').flatMap(n=>n.value))result[c.key]=(result[c.key]||0)+Number(c.value);
      for(const c of C(mod,'multiply_stats').flatMap(n=>n.value))multipliers[c.key]=(multipliers[c.key]||0)+Number(c.value);
      for(const c of C(mod,'build_cost_resources').flatMap(n=>n.value))result['resources.'+c.key]=(result['resources.'+c.key]||0)+Number(c.value);
      for(const c of C(mod,'allow_mission_type').flatMap(n=>Array.isArray(n.value)?n.value:[{value:n.value}]))missions.add(c.value);
    }
    for(const [k,v] of Object.entries(multipliers))result[k]=(result[k]||0)*(1+v);
    if(result.thrust+1e-7<result.weight)errors.push('Aircraft preset cannot fly: insufficient thrust '+p.id);
    result.air_agility=(result.air_agility||0)+Math.max(0,(result.thrust||0)-(result.weight||0))*factor;
    for(const mission of p.missions){missionChecks++;if(!missions.has(mission))errors.push('Missing aircraft mission '+p.id+' '+mission);}
    if(!blueprints.has('equipment_designer_'+p.type))errors.push('Aircraft lacks designer blueprint '+p.type);
    for(const [k,v] of Object.entries(p.expected).filter(([k])=>!['resources','year','priority','visual_level','air_map_icon_frame','interface_overview_category_index'].includes(k)))if(Math.abs((result[k]||0)-v)>1e-7)errors.push('Aircraft assembled stat mismatch '+p.id+' '+k+' '+result[k]+' != '+v);
    const actual=Object.fromEntries(Object.entries(result).filter(([k,v])=>k.startsWith('resources.')&&v).map(([k,v])=>[k.slice(10),v]));
    for(const k of new Set([...Object.keys(actual),...Object.keys(p.expected.resources)]))if(Math.abs((actual[k]||0)-(p.expected.resources[k]||0))>1e-7)errors.push('Aircraft resource mismatch '+p.id+' '+k);
    assembled.set(p.oldModel,result);
  }
  for(const r of [...values.regular,...values.special])if(air.replacements[r.id])for(const p of r.values.filter(p=>p.custom)){numericChecks++;if(Math.abs((assembled.get(r.id)?.[p.key]||0)-p.custom.value)>1e-7)errors.push('Original aircraft audit mismatch '+r.id+' '+p.key);}
  for(const m of air.models){const n=eq.get(m.id);if(S(n,'is_archetype')==='yes'||!['small_plane_airframe','medium_plane_airframe','large_plane_airframe'].includes(S(n,'archetype')))errors.push('Aircraft has custom/non-base prototype '+m.id);if(!Array.isArray(C(n,'module_slots')[0]?.value))errors.push('Aircraft has no editable slots '+m.id);if(!blueprints.has('equipment_designer_'+m.id))errors.push('Generic aircraft designer blueprint missing '+m.id);}
  for(const a of air.aliases)if(!blueprints.has('equipment_designer_'+a.id))errors.push('Role aircraft designer blueprint missing '+a.id);
  for(const m of air.originalModels)if(eq.has(m.id))errors.push('Standalone aircraft remains '+m.id);
  for(const lic of air.licenses){const n=techs.get(lic.id);if(!n||C(n,'folder').length||S(C(n,'allow')[0],'always')!=='no')errors.push('Aviation license became a research node '+lic.id);for(const id of lic.modules)if(!modules.has(id))errors.push('Unknown aviation licensed module '+id);for(const id of lic.equipment)if(!eq.has(id))errors.push('Unknown aviation licensed frame '+id);}
  for(const m of air.modules){const n=modules.get(m.id);if(nativeModules.has(m.id))errors.push('Native aircraft module override '+m.id);require('./module_icon_art.cjs').validateModuleIcon({root,game,kind:'aircraft',module:m,node:n,errors});}
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'tools/military_migration_baseline.json'),'utf8'));
  const wingRows=ns=>ns.filter(n=>n.key==='air_wings').flatMap(n=>n.value.flatMap(state=>state.value.map(plane=>({state:state.key,type:plane.key,owner:S(plane,'owner'),amount:S(plane,'amount'),version:S(plane,'version_name')}))));
  for(const [file,source] of Object.entries(baseline.sources).filter(([f])=>f.startsWith('history/units/'))){
    const old=wingRows(h.parse(source));if(!old.some(p=>air.replacements[p.type]))continue;
    const stem=file.slice(0,-4)+'_air',bba=wingRows(h.parse(fs.readFileSync(path.join(root,stem+'_bba.txt'),'utf8'))),legacy=wingRows(h.parse(fs.readFileSync(path.join(root,stem+'_legacy.txt'),'utf8')));
    if(old.length!==bba.length||old.length!==legacy.length)errors.push('Historical aircraft count changed '+file);
    for(let i=0;i<old.length;i++){
      const p=air.presets.find(p=>p.oldModel===old[i].type);if(!p)continue;historicalWings++;historicalPlanes+=Number(old[i].amount);
      if(bba[i]?.type!==p.type||bba[i]?.version!==JSON.stringify(p.name)||['state','owner','amount'].some(k=>bba[i]?.[k]!==old[i][k]||legacy[i]?.[k]!==old[i][k]))errors.push('Historical aircraft identity/amount changed '+file+' '+i);
      if(!eq.has(legacy[i]?.type))errors.push('Unknown native non-BBA historical plane '+file+' '+legacy[i]?.type);
    }
  }
  const missile=air.presets.find(p=>p.id==='suicide_puppet_equipment_2'),missileFrame=eq.get(missile.base);
  if(S(missileFrame,'one_use_only')!=='yes'||!C(missileFrame,'forbid_mission_type').some(n=>n.value==='training'))errors.push('Original one-use strategic missile behavior lost');
  const smallPuppet=air.presets.find(p=>p.id==='suicide_puppet_equipment_1');
  if(smallPuppet.role!=='suicide'||!smallPuppet.missions.includes('naval_kamikaze'))errors.push('Original small puppet kamikaze capability lost');
  const isolation=require('./aircraft_module_isolation.cjs').validateAircraftIsolation({root,game,manifest,eq,errors});
  return {numericChecks,airframes:air.models.length,generatedRoleTypes:air.aliases.length,retiredFinishedModels:air.originalModels.length,modules:air.modules.length,presets:air.presets.length,hiddenComponentLicenses:air.licenses.length,slotChecks,missionChecks,designerBlueprints:blueprints.size,historicalWings,historicalPlanes,isolation,blueprintValues:Object.fromEntries(assembled)};
};
