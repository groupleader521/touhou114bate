// Private categories separate compatibility from country/technology unlocks.
const h=require('./hoi4_script.cjs'),{node:N,scalar:S,children:C,render:R}=h;
const privateCategory=category=>'touhou_'+category;
exports.privateCategory=privateCategory;
exports.installArmorIsolation=function({armor,game}){
 const native=new Map(h.definitions(game,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const inherit=(n,key)=>{const own=C(n,key).at(-1);return own&&Array.isArray(own.value)?own:S(n,'archetype')?inherit(native.get(S(n,'archetype')),key):null;};
 const modules=h.parse(armor.modulesScript),byId=new Map(modules[0].value.map(n=>[n.key,n]));
 for(const m of armor.modules){
  const n=byId.get(m.id);m.nativeCategory=m.category;m.category=privateCategory(m.category);
  n.value.find(n=>n.key==='category').value=m.category;
  if(['tank_radio_module','tank_secondary_turret'].includes(m.nativeCategory))n.value.push(N('forbid_module_categories',[N(null,m.nativeCategory)]));
  // Fixed turrets retain their native caliber expansions and restrictions for both category namespaces.
  for(const block of C(n,'allowed_module_categories'))for(const slot of block.value)slot.value.push(...slot.value.filter(n=>n.value.startsWith('tank_')).map(n=>N(null,privateCategory(n.value))));
  for(const block of C(n,'forbid_equipment_type_exact_match_for_category'))block.value.push(...block.value.filter(n=>n.key.startsWith('tank_')).map(n=>N(privateCategory(n.key),n.value)));
  for(const block of C(n,'can_convert_from'))for(const field of C(block,'module_category'))field.value=privateCategory(field.value);
  armor.localisation.set(m.category,'$EQ_MOD_CAT_'+m.nativeCategory+'_TITLE$');
  armor.localisation.set('EQ_MOD_CAT_'+m.category+'_TITLE','幻想乡·$EQ_MOD_CAT_'+m.nativeCategory+'_TITLE$');
 }
 const equip=h.parse(armor.equipmentScript),roles=h.parse(armor.roleOverridesScript);
 for(const n of [...equip[0].value,...(roles[0]?.value||[])]){
  const slots=structuredClone(inherit(n,'module_slots'));
  if(!slots)throw Error('Missing isolation slot source '+n.key);
  for(const slot of slots.value)for(const block of C(slot,'allowed_module_categories'))block.value.push(...block.value.filter(n=>n.value.startsWith('tank_')).map(n=>N(null,privateCategory(n.value))));
  n.value=n.value.filter(n=>n.key!=='module_slots');n.value.push(slots);
  const alias=armor.aliases.find(a=>a.presetType===n.key),base=alias&&armor.models.find(m=>m.id===alias.base);
  const parent=native.get(S(n,'archetype'))||native.get(base?.archetype);
  for(const limit of C(parent||{value:[]},'module_count_limit')){
   n.value.push(structuredClone(limit));
   const category=S(limit,'category');if(category?.startsWith('tank_')){const own=structuredClone(limit);own.value.find(n=>n.key==='category').value=privateCategory(category);n.value.push(own);}
  }
 }
 armor.modulesScript=R(modules);armor.equipmentScript=R(equip);armor.roleOverridesScript=R(roles);
 armor.isolation={moduleCategories:'private Touhou tank categories',nativeChassisAcceptTouhouModules:false,spiritFrames:armor.models.filter(m=>m.nativeStatSource).map(m=>({id:m.id,source:m.nativeStatSource}))};
};
exports.validateArmorIsolation=function({root,game,manifest,eq,errors}){
 const fs=require('fs'),path=require('path'),armor=manifest.armor,errorStart=errors.length;
 const inherit=(n,key)=>{if(!n)return null;const own=C(n,key).at(-1);return own&&Array.isArray(own.value)?own:S(n,'archetype')?inherit(eq.get(S(n,'archetype')),key):null;};
 const nativeModules=h.definitions(game,'common/units/equipment/modules','equipment_modules');
 const localModules=new Map(h.definitions(root,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
 const nativeTurretCategories=new Set(nativeModules.filter(n=>/tank_.*turret_type/.test(S(n,'category')||'')).flatMap(n=>C(n,'allowed_module_categories').flatMap(n=>n.value.flatMap(slot=>slot.value.map(n=>n.value)))));
 const customIds=new Set([...armor.models.map(m=>m.id),...armor.aliases.flatMap(m=>[m.id,m.presetType].filter(Boolean))]);
 let nativeChassis=0,rejectionChecks=0,spiritStatChecks=0;
 for(const n of eq.values()){
  if(customIds.has(n.key)||!/(?:^|_)tank_.*chassis/.test(n.key))continue;
  const slots=inherit(n,'module_slots');if(!slots)continue;
  nativeChassis++;
  const categories=new Set([...nativeTurretCategories,...slots.value.flatMap(slot=>C(slot,'allowed_module_categories').flatMap(n=>n.value.map(n=>n.value)))]);
  for(const m of armor.modules){rejectionChecks++;if(categories.has(S(localModules.get(m.id),'category')))errors.push('Native chassis accepts Touhou module '+n.key+' '+m.id);}
 }
 for(const m of armor.modules)if(S(localModules.get(m.id),'category')!==privateCategory(m.nativeCategory))errors.push('Missing private tank category '+m.id);
 function numeric(n){const out=S(n,'archetype')?numeric(eq.get(S(n,'archetype'))):{};for(const c of n.value)if(typeof c.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(c.value))out[c.key]=Number(c.value);return out;}
 for(const m of armor.models.filter(m=>m.nativeStatSource)){
  const actual=numeric(eq.get(m.id)),expected=numeric(eq.get(m.nativeStatSource));
  for(const key of new Set([...Object.keys(actual),...Object.keys(expected)])){spiritStatChecks++;if(actual[key]!==expected[key])errors.push('Spirit frame stat changed '+m.id+' '+key);}
 }
 const result={privateModules:armor.modules.length,nativeChassis,rejectionChecks,spiritFrames:armor.models.filter(m=>m.nativeStatSource).length,spiritStatChecks,limitation:'Exhaustive native slot/category rejection and preset/stat checks; game UI not simulated.'};
 if(!nativeChassis||rejectionChecks!==nativeChassis*armor.modules.length||result.spiritFrames!==6)errors.push('Incomplete tank isolation coverage');
 result.errors=errors.slice(errorStart);
 fs.writeFileSync(path.join(root,'docs/装甲配件隔离校验.json'),JSON.stringify(result,null,2)+'\n');return result;
};
