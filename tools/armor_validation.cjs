// Reconstruct designs from the actual chassis/modules and compare against the pre-migration audit.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {scalar:S,children:C}=h;
const clean=s=>s?.replace(/^"|"$/g,'');
exports.installArmorAliases=function(manifest,eq){for(const a of manifest.armor?.aliases||[]){
  if(eq.has(a.id))continue;
  const source=eq.get(a.base);eq.set(a.id,{...source,key:a.id,value:[...source.value.filter(n=>!['archetype','hardness','variant_name','derived_variant_name'].includes(n.key)),h.node('archetype',a.archetype),h.node('hardness',String(a.hardness)),...(a.lendLeaseCost!==undefined?[h.node('lend_lease_cost',String(a.lendLeaseCost))]:[])]});
}};
exports.validateArmor=function({root,game,manifest,eq,values,errors}){
  const armor=manifest.armor;if(!armor)return {numericChecks:0};
  const modules=new Map([...h.definitions(game,'common/units/equipment/modules','equipment_modules'),...h.definitions(root,'common/units/equipment/modules','equipment_modules')].map(n=>[n.key,n]));
  const nativeModules=new Set(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>n.key));
  const licenses=new Map(h.definitions(root,'common/technologies','technologies').map(n=>[n.key,n]));
  const effects=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_sync_tank_designer');
  const registered=new Map();function scan(ns){for(const n of ns){if(n.key==='if'&&C(n,'create_equipment_variant').length)registered.set(S(n,'set_country_flag'),C(n,'create_equipment_variant')[0]);if(Array.isArray(n.value))scan(n.value);}}scan(effects.value);
  const resolve=n=>{if(!n)throw Error('Missing armor definition');const a=S(n,'archetype'),r=a?resolve(eq.get(a)):{};for(const c of n.value){if(c.key==='resources'&&Array.isArray(c.value)){for(const k of Object.keys(r).filter(k=>k.startsWith('resources.')))delete r[k];for(const x of c.value)r['resources.'+x.key]=Number(x.value);}else if(c.key&&typeof c.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(c.value))r[c.key]=Number(c.value);}return r;};
  const inherit=(n,key)=>{const own=C(n,key).at(-1);return own&&own.value!=='inherit'?own:((S(n,'archetype')&&eq.has(S(n,'archetype')))?inherit(eq.get(S(n,'archetype')),key):null);};
  const blueprintValues=new Map();let numericChecks=0,slotChecks=0;
  for(const p of armor.presets){
    const design=registered.get(p.flag);if(!design){errors.push('Missing assembled armor design '+p.id);continue;}
    if(S(design,'type')!==p.type||JSON.parse(S(design,'name'))!==p.name)errors.push('Wrong armor design identity '+p.id);
    if(!eq.has(p.type)){errors.push('Missing generic armor type '+p.type);continue;}
    const equipped=Object.fromEntries(C(design,'modules')[0].value.map(n=>[n.key,n.value]));
    const slots=inherit(eq.get(p.type),'module_slots'),categories=new Map((slots?.value||[]).map(n=>[n.key,C(n,'allowed_module_categories')[0]?.value.map(x=>x.value)||[]]));
    const turret=modules.get(equipped.turret_type_slot);
    for(const n of C(turret,'allowed_module_categories').flatMap(n=>n.value))categories.set(n.key,[...(categories.get(n.key)||[]),...n.value.map(x=>x.value)]);
    for(const slot of slots?.value||[]){if(S(slot,'required')==='yes'&&(!equipped[slot.key]||equipped[slot.key]==='empty'))errors.push('Required armor slot empty '+p.id+' '+slot.key);}
    const result=resolve(eq.get(p.type)),multipliers={};
    for(const [slot,id] of Object.entries(equipped)){if(id==='empty')continue;const module=modules.get(id);slotChecks++;if(!module){errors.push('Unknown armor module '+id);continue;}
      if(!categories.get(slot)?.includes(S(module,'category')))errors.push('Incompatible armor module '+p.id+' '+slot+' '+id);
      for(const n of C(module,'add_stats').flatMap(n=>n.value))result[n.key]=(result[n.key]||0)+Number(n.value);
      for(const n of C(module,'multiply_stats').flatMap(n=>n.value))multipliers[n.key]=(multipliers[n.key]||0)+Number(n.value);
      for(const n of C(module,'build_cost_resources').flatMap(n=>n.value))result['resources.'+n.key]=(result['resources.'+n.key]||0)+Number(n.value);
      if(S(module,'manpower'))result.manpower=(result.manpower||0)+Number(S(module,'manpower'));
    }
    for(const [k,v] of Object.entries(multipliers))result[k]=(result[k]||0)*(1+v);
    blueprintValues.set(p.oldModel||p.id,result);
    for(const n of C(design,'upgrades')[0]?.value||[])if(n.value!=='0')errors.push('Preset armor has unaccounted upgrades '+p.id);
    if(p.expected){for(const [k,v] of Object.entries(p.expected).filter(([k])=>!['resources','year','priority','visual_level','interface_overview_category_index','air_map_icon_frame'].includes(k)))if(Math.abs((result[k]||0)-v)>1e-7)errors.push('Assembled armor stat mismatch '+p.id+' '+k+' '+result[k]+' != '+v);
      const actualResources=Object.fromEntries(Object.entries(result).filter(([k,v])=>k.startsWith('resources.')&&v).map(([k,v])=>[k.slice(10),v]));
      for(const k of new Set([...Object.keys(actualResources),...Object.keys(p.expected.resources)]))if(Math.abs((actualResources[k]||0)-(p.expected.resources[k]||0))>1e-7)errors.push('Assembled armor resource mismatch '+p.id+' '+k);
    }
  }
  for(const r of [...values.regular,...values.special])if(armor.replacements[r.id]){const result=blueprintValues.get(r.id);for(const p of r.values.filter(p=>p.custom)){numericChecks++;if(Math.abs((result?.[p.key]||0)-p.custom.value)>1e-7)errors.push('Original armor audit mismatch '+r.id+' '+p.key+' '+result?.[p.key]+' != '+p.custom.value);}}
  for(const m of armor.models){const n=eq.get(m.id);if(S(n,'is_archetype')==='yes'||S(n,'module_slots')!=='inherit')errors.push('Armor chassis is independent/fixed '+m.id);if(!S(n,'archetype')?.endsWith('_tank_chassis'))errors.push('Non-native armor prototype '+m.id);}
  for(const m of armor.originalModels)if(eq.has(m.id))errors.push('Finished standalone armor definition remains '+m.id);
  for(const lic of armor.licenses){const n=licenses.get(lic.id);if(!n||C(n,'folder').length||S(C(n,'allow')[0],'always')!=='no')errors.push('Component license became a research node '+lic.id);for(const id of lic.modules)if(!modules.has(id))errors.push('License unlocks unknown module '+id);for(const id of lic.equipment)if(!eq.has(id))errors.push('License unlocks unknown chassis '+id);}
  for(const m of armor.modules){const n=modules.get(m.id);if(nativeModules.has(m.id))errors.push('Native tank module overridden '+m.id);if(!S(n,'gfx')||!nativeModules.has(clean(S(n,'gfx'))))errors.push('Armor module lacks a valid graphics source '+m.id);}
  return {numericChecks,chassis:armor.models.length,generatedRoleTypes:armor.aliases.length,retiredFinishedModels:armor.originalModels.length,modules:armor.modules.length,presets:armor.presets.length,originalPresets:armor.presets.filter(p=>p.oldModel).length,spiritPresets:armor.presets.filter(p=>!p.oldModel).length,hiddenComponentLicenses:armor.licenses.length,slotChecks,blueprintValues:Object.fromEntries(blueprintValues)};
};
