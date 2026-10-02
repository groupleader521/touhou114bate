// Evaluate the generated registration AST against representative national/research states.
// This checks condition behavior; it does not emulate the engine's design creation or UI.
const fs=require('fs'),path=require('path'),assert=require('assert'),h=require('./hoi4_script.cjs');
const root=path.resolve(__dirname,'..'),game=process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/幻想乡军事原版化迁移清单.json'),'utf8'));
const modelStyles=new Map(manifest.models.map(m=>[m.id,m.style]));
const effect=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_register_country_equipment');
const armorEffect=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_sync_tank_designer');
const aircraftEffect=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_sync_aircraft_designer');
for(const a of manifest.armor?.aliases||[])for(const id of [a.id,a.presetType].filter(Boolean))modelStyles.set(id,modelStyles.get(a.base));
for(const a of manifest.aircraft?.aliases||[])modelStyles.set(a.id,modelStyles.get(a.base));
const clean=s=>s.replace(/^"|"$/g,'');
const state=(tag,style,techs=[],dlcs=[],flags=[])=>({tag,techs:new Set(techs),dlcs:new Set(dlcs),flags:new Set([...flags,...(style?['touhou_country_flag_'+style+'_first_research']:[])])});
function match(ns,s){return ns.every(n=>{
  if(n.key==='OR')return n.value.some(c=>match([c],s));
  if(n.key==='AND')return match(n.value,s);
  if(n.key==='NOT')return !match(n.value,s);
  if(n.key==='original_tag')return s.tag===n.value;
  if(n.key==='has_country_flag')return s.flags.has(n.value);
  if(n.key==='has_tech')return s.techs.has(n.value);
  if(n.key==='has_dlc')return s.dlcs.has(clean(n.value));
  throw Error('Unsupported condition in behavioral check '+n.key);
});}
const frameProviders=new Map();
for(const plan of [manifest.armor,manifest.aircraft])for(const lic of plan.licenses)for(const id of lic.equipment){
 assert(!frameProviders.has(id),'Chassis has multiple activation technologies '+id);
 frameProviders.set(id,lic.id);
}
function requireEnabledFrame(type,s){
 const provider=frameProviders.get(type);
 if(provider)assert(s.techs.has(provider),'Design created before enabling chassis: '+s.tag+' '+type+' '+provider);
}
function register(s){const created=[];function execute(ns){let branchTaken=false;for(const n of ns){
  if(n.key==='if'){branchTaken=match(h.children(n,'limit')[0].value,s);if(branchTaken)execute(n.value.filter(c=>c.key!=='limit'));}
  else if(n.key==='else_if'){if(!branchTaken){branchTaken=match(h.children(n,'limit')[0].value,s);if(branchTaken)execute(n.value.filter(c=>c.key!=='limit'));}}
  else if(n.key==='create_equipment_variant'){const type=h.scalar(n,'type');requireEnabledFrame(type,s);created.push(type);}
  else if(n.key==='set_country_flag')s.flags.add(n.value);
  else if(n.key==='set_technology'){for(const c of n.value)if(c.key!=='popup'){if(c.value==='1')s.techs.add(c.key);else s.techs.delete(c.key);}}
  else throw Error('Unsupported registration effect '+n.key);
}}if(armorEffect)execute(armorEffect.value);if(aircraftEffect)execute(aircraftEffect.value);execute(effect.value);return created;}
const allTechs=h.definitions(game,'common/technologies','technologies').map(n=>n.key);
const allProjects=[...new Set(manifest.models.filter(m=>m.style==='trump').map(m=>'touhou_project_unlocked_'+(m.unlock.startsWith('goliath_')?'goliath_0':m.unlock)))];
const checks=[];
function check(name,run){run();checks.push(name);}
check('Spirit frames require their own size/tier research and never register native tank chassis',()=>{
 const s=state('HAK','wakan',['basic_light_tank_chassis','gwtank_chassis'],['No Step Back']);
 const created=register(s);assert(created.includes('light_tank_chassis_touhou_wakan_1'));
 assert(!created.some(id=>/^(light|medium)_tank_chassis_\d+$/.test(id)));
 assert(!s.techs.has('touhou_tank_frame_license_wakan_medium_1'));
 assert(!s.techs.has('touhou_tank_frame_license_wakan_light_2'));
 s.techs.add('basic_medium_tank_chassis');assert.deepStrictEqual(register(s),['medium_tank_chassis_touhou_wakan_1']);
});
check('Existing saves with old spirit preset flags register the new private chassis once',()=>{
 const s=state('HAK','wakan',['basic_light_tank_chassis','gwtank_chassis'],['No Step Back'],['touhou_tank_design_v1_wakan_light_1']);
 assert(register(s).includes('light_tank_chassis_touhou_wakan_1'));assert.strictEqual(register(s).length,0);
});
check('Native CHI/GER/USA/JAP never register Touhou designs, even with all technology/style/project flags',()=>{
  for(const tag of ['CHI','GER','USA','JAP'])assert.deepStrictEqual(register(state(tag,'magic',allTechs,['No Step Back','By Blood Alone'],allProjects)),[]);
});
check('No researched equipment technology yields no ordinary design',()=>assert.deepStrictEqual(register(state('ALI','magic')),[]));
check('Early infantry research registers only the selected magic/wakan/demonforce rifle',()=>{
  for(const style of ['magic','wakan','demonforce'])assert.deepStrictEqual(register(state('ALI',style,['infantry_weapons'])),['touhou_'+style+'_infantry_equipment_0']);
});
check('1936 magic infantry research does not grant later rifles or other cultures',()=>{
  const actual=register(state('ALI','magic',['infantry_weapons','infantry_weapons1']));
  assert.deepStrictEqual(new Set(actual),new Set(['touhou_magic_infantry_equipment_0','touhou_magic_infantry_equipment_1']));
});
check('Repeated daily synchronization does not duplicate a design',()=>{
  const s=state('ALI','magic',['infantry_weapons']);assert.strictEqual(register(s).length,1);assert.strictEqual(register(s).length,0);
});
check('Changing manufacturing tradition grants its design while closing the old production gate',()=>{
  const s=state('ALI','magic',['infantry_weapons']);register(s);s.flags.delete('touhou_country_flag_magic_first_research');s.flags.add('touhou_country_flag_wakan_first_research');
  assert.deepStrictEqual(register(s),['touhou_wakan_infantry_equipment_0']);
  assert.strictEqual(match(manifest.countryRegistrations.find(m=>m.id==='touhou_magic_infantry_equipment_0').condition,s),false);
});
check('Modular armor requires NSB and its native chassis research; no independent finished armor fallback',()=>{
  const hasLight=ids=>ids.some(id=>id.startsWith('light_tank_')&&id.includes('_touhou_magic_light_'));
  assert.strictEqual(hasLight(register(state('ALI','magic',['basic_light_tank'],['No Step Back']))),false);
  assert.strictEqual(hasLight(register(state('ALI','magic',['basic_light_tank_chassis'],['No Step Back']))),false);
  assert.strictEqual(hasLight(register(state('ALI','magic',['basic_light_tank_chassis','gwtank_chassis'],['No Step Back']))),true);
  assert.deepStrictEqual(register(state('ALI','magic',['basic_light_tank'])),[]);
});
check('Aircraft designer requires BBA and native airframe research; no standalone finished fallback',()=>{
  const fighter=manifest.aircraft.replacements.touhou_magic_fighter_equipment_1;
  assert.strictEqual(register(state('ALI','magic',['fighter1'],['By Blood Alone'])).includes(fighter),false);
  assert.strictEqual(register(state('ALI','magic',['basic_small_airframe'],['By Blood Alone'])).includes(fighter),true);
  assert.strictEqual(register(state('ALI','magic',['basic_small_airframe','aircraft_construction'],['By Blood Alone'])).includes(fighter),true);
  assert.strictEqual(register(state('ALI','magic',['fighter1'])).includes(fighter),false);
});
check('Small native research opens shared fighter/CAS parts in the selected tradition only',()=>{
  const s=state('SSS','wakan',['basic_small_airframe','aircraft_construction'],['By Blood Alone']);
  assert.deepStrictEqual(new Set(register(s)),new Set([manifest.aircraft.replacements.touhou_wakan_fighter_equipment_1,manifest.aircraft.replacements.touhou_wakan_CAS_equipment_1]));
  assert.strictEqual(register(s).length,0);
});
check('Changing aviation tradition withdraws old component licenses and retains preset guards',()=>{
  const s=state('ALI','magic',['basic_small_airframe','aircraft_construction'],['By Blood Alone']);assert.strictEqual(register(s).length,1);
  const old=manifest.aircraft.licenses.find(l=>l.equipment.includes(manifest.aircraft.replacements.touhou_magic_fighter_equipment_1));assert(s.techs.has(old.id));
  s.flags.delete('touhou_country_flag_magic_first_research');s.flags.add('touhou_country_flag_wakan_first_research');assert.strictEqual(register(s).length,2);assert(!s.techs.has(old.id));
});
check('Special aircraft require their own project; native research alone cannot open them',()=>{
  const s=state('TEN','demonforce',[],['By Blood Alone'],['touhou_project_unlocked_tengu_fighter']);
  assert.deepStrictEqual(register(s),[manifest.aircraft.replacements.tengu_fighter_equipment_0]);
  const noProject=register(state('ALI','magic',allTechs,['By Blood Alone']));assert(!noProject.some(id=>modelStyles.get(id)==='trump'));
});
check('Native countries receive no aviation parts or licenses',()=>{
  const s=state('GER','magic',allTechs,['By Blood Alone'],allProjects);assert.deepStrictEqual(register(s),[]);for(const lic of manifest.aircraft.licenses)assert(!s.techs.has(lic.id));
});
check('Native research alone grants no trump/project designs',()=>assert.strictEqual(register(state('ALI','magic',allTechs)).filter(id=>modelStyles.get(id)==='trump').length,0));
check('Goliath project does not grant unrelated projects or later unreached Goliath tiers',()=>{
  const actual=register(state('ALI',null,['basic_heavy_tank_chassis','gwtank_chassis'],['No Step Back'],['touhou_project_unlocked_goliath_0'])).filter(id=>modelStyles.get(id)==='trump');
  assert.deepStrictEqual(actual,[manifest.armor.replacements.goliath_equipment_1]);
});
check('Changing tradition withdraws the previous component licenses without duplicating old designs',()=>{
  const s=state('ALI','magic',['basic_light_tank_chassis','gwtank_chassis'],['No Step Back']);
  const first=register(s);assert.strictEqual(first.length,4);assert.strictEqual(register(s).length,0);
  const magic=manifest.armor.licenses.find(l=>l.id==='touhou_tank_license_magic_light_1');assert(s.techs.has(magic.id));
  s.flags.delete('touhou_country_flag_magic_first_research');s.flags.add('touhou_country_flag_wakan_first_research');
  assert.strictEqual(register(s).length,1);assert(!s.techs.has(magic.id));assert(s.techs.has('touhou_tank_license_wakan_1'));
});
check('Native countries receive no Touhou component licenses',()=>{
  const s=state('GER','magic',allTechs,['No Step Back'],allProjects);register(s);
  for(const l of manifest.armor.licenses)assert(!s.techs.has(l.id));
});
check('Lotus project opens only its own modular hulls without creating invalid empty ship designs',()=>{
  const s=state('TEM',null,[],[],['touhou_project_unlocked_lotus']);assert.deepStrictEqual(register(s),[]);
  for(const m of manifest.models.filter(m=>m.modularHull))assert.strictEqual(s.flags.has('touhou_registered_model_'+m.id),true);
  const foreign=state('GER',null,[],[],['touhou_project_unlocked_lotus']);register(foreign);
  for(const m of manifest.models.filter(m=>m.modularHull))assert.strictEqual(foreign.flags.has('touhou_registered_model_'+m.id),false);
});
check('Optional modules require their own native research and a researched chassis or airframe',()=>{
  const radio=manifest.armor.licenses.find(l=>l.optional&&l.style==='magic'&&l.requiredTechnology==='radio');
  const parts=manifest.armor.licenses.find(l=>l.optional&&l.style==='magic'&&l.requiredTechnology==='gwtank_chassis');
  const s=state('ALI','magic',['basic_light_tank_chassis'],['No Step Back']);register(s);
  assert(!s.techs.has(parts.id));assert(!s.techs.has(radio.id));
  s.techs.add('gwtank_chassis');register(s);assert(s.techs.has(parts.id));assert(!s.techs.has(radio.id));
  s.techs.add('radio');register(s);assert(s.techs.has(radio.id));
  const noFrame=state('ALI','magic',['radio'],['No Step Back','By Blood Alone']);register(noFrame);
  for(const p of [...manifest.armor.licenses,...manifest.aircraft.licenses].filter(l=>l.optional))assert(!noFrame.techs.has(p.id));
});
check('Interwar tank development opens basic optional parts without demanding a later chassis',()=>{
 for(const style of ['magic','wakan','demonforce']){
  const s=state('ALI',style,['gwtank_chassis'],['No Step Back']);register(s);
  for(const l of manifest.armor.licenses.filter(l=>l.optional))assert.strictEqual(s.techs.has(l.id),l.style===style&&l.requiredTechnology==='gwtank_chassis');
 }
});
check('All tank modules require interwar development, including old-save licenses',()=>{
 for(const [kind,dlc,foundation] of [['armor','No Step Back','gwtank_chassis']]){
  const plan=manifest[kind],providers=plan.licenses.filter(l=>l.modules.length);
  for(const m of plan.modules){
   const licenses=providers.filter(l=>l.modules.includes(m.id));assert(licenses.length,m.id);
   for(const l of licenses)assert(l.condition.some(n=>n.key==='has_tech'&&n.value===foundation),m.id+' provider bypass '+l.id);
  }
  for(const style of ['magic','wakan','demonforce']){
   const s=state('ALI',style,[...allTechs.filter(t=>t!==foundation),...providers.map(l=>l.id)],[dlc],allProjects);register(s);
   for(const l of providers)assert(!s.techs.has(l.id),l.id+' retained without '+foundation);
  }
 }
});
check('Aviation licenses require airframe research or their own research project, not aircraft materials',()=>{
 const providers=manifest.aircraft.licenses.filter(l=>l.modules.length);
 function hasGate(ns){return ns.some(n=>n.key==='has_tech'||n.key==='has_country_flag'&&n.value.startsWith('touhou_project_unlocked_')||Array.isArray(n.value)&&hasGate(n.value));}
 for(const l of providers)assert(hasGate(l.condition),l.id+' has no research gate');
 for(const style of ['magic','wakan','demonforce']){
  const s=state('ALI',style,providers.map(l=>l.id),['By Blood Alone']);register(s);
  for(const l of providers)assert(!s.techs.has(l.id),l.id+' remained unlocked without research');
 }
});
check('Every optional module stays locked when any required research is missing',()=>{
 for(const [kind,dlc] of [['armor','No Step Back'],['aircraft','By Blood Alone']]){
  for(const lic of manifest[kind].licenses.filter(l=>l.optional)){
   const complete=state('ALI',lic.style,allTechs,[dlc]);register(complete);assert(complete.techs.has(lic.id),lic.id);
   for(const missing of lic.requiredTechnologies){
    // Simulate an old save with the former automatically granted license as well.
    const s=state('ALI',lic.style,[...allTechs.filter(t=>t!==missing),lic.id],[dlc]);register(s);
    assert(!s.techs.has(lic.id),lic.id+' bypassed missing '+missing);
   }
  }
 }
});
check('Secondary weapons wait for their own research after basic tank development',()=>{
 for(const style of ['magic','wakan','demonforce']){
  const m=manifest.armor.modules.find(m=>m.optional&&m.style===style&&m.id.endsWith('_secondary_cannon'));
  const lic=manifest.armor.licenses.find(l=>l.modules.includes(m.id));
  const s=state('ALI',style,['gwtank_chassis'],['No Step Back']);register(s);assert(!s.techs.has(lic.id));
  s.techs.add(m.requiredTechnology);register(s);assert(s.techs.has(lic.id));
 }
});
check('Airframe research opens basic accessories while advanced aviation parts still need research',()=>{
 const s=state('ALI','magic',['basic_small_airframe'],['By Blood Alone']);register(s);
 for(const l of manifest.aircraft.licenses.filter(l=>l.optional))assert.strictEqual(s.techs.has(l.id),l.style==='magic'&&!l.requiredTechnology);
 s.techs.add('aircraft_construction');register(s);
 for(const l of manifest.aircraft.licenses.filter(l=>l.optional))assert.strictEqual(s.techs.has(l.id),l.style==='magic'&&(!l.requiredTechnology||l.requiredTechnology==='aircraft_construction'));
});
check('Optional licenses switch cultures without giving unrelated culture parts',()=>{
  const s=state('ALI','magic',allTechs,['No Step Back','By Blood Alone']);register(s);
  const optional=[...manifest.armor.licenses,...manifest.aircraft.licenses].filter(l=>l.optional);
  for(const l of optional)assert.strictEqual(s.techs.has(l.id),l.style==='magic');
  s.flags.delete('touhou_country_flag_magic_first_research');s.flags.add('touhou_country_flag_wakan_first_research');register(s);
  for(const l of optional)assert.strictEqual(s.techs.has(l.id),l.style==='wakan');
  register(s);for(const l of optional)assert.strictEqual(s.techs.has(l.id),l.style==='wakan');
});
check('Optional parts stay closed without the matching designer DLC',()=>{
  for(const dlcs of [[],['No Step Back'],['By Blood Alone']]){
    const s=state('ALI','magic',allTechs,dlcs);register(s);
    for(const [kind,dlc] of [['armor','No Step Back'],['aircraft','By Blood Alone']])for(const l of manifest[kind].licenses.filter(l=>l.optional))assert.strictEqual(s.techs.has(l.id),l.style==='magic'&&dlcs.includes(dlc));
  }
});
check('Large utility airframes require their exact research tier and culture',()=>{
 const utility=manifest.aircraft.models.filter(m=>m.utilityFrame);assert.strictEqual(utility.length,10);
 for(const m of utility){
  const s=state('ALI',m.style,[m.researchSource],['By Blood Alone']);register(s);assert(s.techs.has(m.license),m.id);
  const absent=state('ALI',m.style,['aircraft_construction'],['By Blood Alone']);register(absent);assert(!absent.techs.has(m.license));
  const other=state('ALI','magic',allTechs,['By Blood Alone']);register(other);assert(!other.techs.has(m.license));
  s.flags.delete('touhou_country_flag_'+m.style+'_first_research');s.flags.add('touhou_country_flag_magic_first_research');register(s);assert(!s.techs.has(m.license));
 }
});
function startingState(tag){
 const file=h.files(path.join(root,'history/countries')).find(f=>path.basename(f).startsWith(tag+' - '));
 const s=state(tag,null,[],['No Step Back','By Blood Alone']);
 function visit(ns){for(const n of ns){
  if(n.key==='if'){if(match(h.children(n,'limit')[0].value,s))visit(n.value.filter(n=>n.key!=='limit'));}
  else if(n.key==='set_technology'){for(const t of n.value)if(t.value==='1')s.techs.add(t.key);}
  else if(n.key==='set_country_flag'&&/^(touhou_country_flag_.*_first_research|touhou_project_unlocked_)/.test(n.value))s.flags.add(n.value);
 }}
 visit(h.parse(fs.readFileSync(file,'utf8')));return s;
}
check('Actual Alice starting history exposes private fighter, bomber and basic accessory menus',()=>{
 const s=startingState('ALI');assert(s.techs.has('iw_small_airframe'));assert(s.techs.has('iw_medium_airframe'));assert(!s.techs.has('aircraft_construction'));
 const created=register(s),plan=manifest.aircraft;
 const equip=new Map(h.definitions(root,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const mods=new Map(h.definitions(root,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
 const enabled=new Set(h.definitions(root,'common/technologies','technologies').filter(n=>s.techs.has(n.key)).flatMap(n=>h.children(n,'enable_equipment_modules').flatMap(b=>b.value.map(n=>n.value))));
 for(const size of ['small','medium']){
  const frame=plan.models.find(m=>m.style==='magic'&&m.nativeFrame===size+'_plane_airframe_0');
  const p=plan.presets.find(p=>p.base===frame.id);assert(created.includes(p.type),frame.id+' is missing from production');
  const slots=h.children(equip.get(frame.id),'module_slots')[0].value;
  const category=h.scalar(mods.get(p.modules.fixed_main_weapon_slot),'category');
  const main=slots.find(n=>n.key==='fixed_main_weapon_slot');
  assert(h.children(main,'allowed_module_categories')[0].value.some(n=>n.value===category),frame.id+' has no private main weapon category');
  assert(enabled.has(p.modules.fixed_main_weapon_slot),frame.id+' main weapon not researched');
  const basic=plan.modules.find(m=>m.optional&&m.style==='magic'&&m.id.endsWith('_cooling_flaps_'+size));
  assert(enabled.has(basic.id),frame.id+' basic accessory missing');
  assert(slots.some(slot=>h.children(slot,'allowed_module_categories').some(b=>b.value.some(n=>n.value===basic.category))),basic.id+' has no menu slot');
 }
 const advanced=plan.modules.find(m=>m.optional&&m.style==='magic'&&m.id.endsWith('_shield_small'));
 assert(!enabled.has(advanced.id),'Unresearched advanced shield was granted at startup');
});
check('Custom frames cannot globally supersede native equipment or repaint its research fallback',()=>{
 const defs=new Map(h.definitions(root,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const own=new Set([...manifest.armor.models,...manifest.aircraft.models].map(m=>m.id));
 for(const id of own){const n=defs.get(id);assert.strictEqual(h.scalar(n,'active'),'no',id+' globally active');const parent=h.scalar(n,'parent');if(parent)assert(own.has(parent),id+' extends native parent '+parent);}
 const sprites=new Set(h.parse(fs.readFileSync(path.join(root,'interface/zz_touhou_military_presentation.gfx'),'utf8'))[0].value.map(n=>h.scalar(n,'name')));
 for(const id of manifest.presentation.sharedDesignerVisuals)for(const tag of ['ALI','DES','HAK','DLD','HEL','SSS','OPP','RAB','TEM','BLQ','KAP','TEN','HUM','VAM','MLS','EVI'])assert(!sprites.has(JSON.stringify('GFX_'+tag+'_'+id+'_medium')),'Native fallback repainted '+id);
});
check('China native research still enables a complete interwar tank using native components',()=>{
 const s=state('CHI',null,['gwtank_chassis','infantry_weapons','gw_artillery'],['No Step Back']);assert.deepStrictEqual(register(s),[]);
 const tech=new Map([...h.definitions(game,'common/technologies','technologies'),...h.definitions(root,'common/technologies','technologies')].map(n=>[n.key,n]));
 const enabled=new Set([...s.techs].flatMap(id=>h.children(tech.get(id),'enable_equipment_modules').flatMap(b=>b.value.map(n=>n.value))));
 const defs=new Map(h.definitions(game,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const body=defs.get('light_tank_chassis'),slots=h.children(body,'module_slots')[0].value;
 const assembly=Object.fromEntries(h.children(body,'default_modules')[0].value.map(n=>[n.key,n.value]));
 assert.strictEqual(assembly.main_armament_slot,'empty','Native blank chassis unexpectedly given a weapon');
 assembly.main_armament_slot='tank_heavy_machine_gun';
 const modules=new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
 for(const slot of slots.filter(n=>h.scalar(n,'required')==='yes')){
  const id=assembly[slot.key];assert(enabled.has(id),'CHI lacks required native module '+id);
  const category=h.scalar(modules.get(id),'category');assert(h.children(slot,'allowed_module_categories')[0].value.some(n=>n.value===category));
 }
 for(const l of [...manifest.armor.licenses,...manifest.aircraft.licenses])assert(!s.techs.has(l.id));
});
check('China researched light/medium/heavy chassis retain their native unlocks and upgrade chains',()=>{
 const nativeTech=new Map(h.definitions(game,'common/technologies','technologies').map(n=>[n.key,n]));
 const localTech=new Map(h.definitions(root,'common/technologies','technologies').map(n=>[n.key,n]));
 const nativeEq=new Map(h.definitions(game,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const localEq=new Map(h.definitions(root,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const researched=['gwtank_chassis','basic_light_tank_chassis','improved_light_tank_chassis','basic_medium_tank_chassis','improved_medium_tank_chassis','basic_heavy_tank_chassis','improved_heavy_tank_chassis'];
 const s=state('CHI',null,researched,['No Step Back']);assert.deepStrictEqual(register(s),[]);
 const enabled=new Set();
 for(const id of researched){
  const source=nativeTech.get(id),actual=localTech.get(id)||source;
  assert.strictEqual(h.render(h.children(actual,'enable_equipments')),h.render(h.children(source,'enable_equipments')),'Native unlock changed '+id);
  for(const n of h.children(actual,'enable_equipments').flatMap(n=>n.value))if(n.key===null)enabled.add(n.value);
 }
 for(const size of ['light','medium','heavy'])for(const tier of [1,2]){
  const id=size+'_tank_chassis_'+tier;
  assert(enabled.has(id),'Researched native chassis not enabled '+id);
  assert(!localEq.has(id),'Native chassis overridden '+id);
  assert.strictEqual(h.scalar(nativeEq.get(id),'parent'),size+'_tank_chassis_'+(tier-1));
  assert.notStrictEqual(h.scalar(nativeEq.get(id),'active'),'no','Native chassis globally disabled '+id);
 }
 for(const l of manifest.armor.licenses)assert(!s.techs.has(l.id),'CHI acquired Touhou license '+l.id);
});
check('Private component licenses never take ownership of native chassis activation',()=>{
 const nativeIds=new Set(h.definitions(game,'common/units/equipment','equipments').map(n=>n.key));
 const ownTech=h.definitions(root,'common/technologies','technologies').filter(n=>/^touhou_.*license/.test(n.key));
 for(const tech of ownTech)for(const n of h.children(tech,'enable_equipments').flatMap(n=>n.value))if(n.key===null)assert(!nativeIds.has(n.value),'Private license owns native chassis '+tech.key+' '+n.value);
});
check('No native technology file or ID is overridden by the independent military system',()=>{
 const native=h.definitions(game,'common/technologies','technologies'),ids=new Set(native.map(n=>n.key));
 for(const t of h.definitions(root,'common/technologies','technologies'))assert(!ids.has(t.key),'Native technology ID overridden '+t.key);
 for(const file of new Set(native.map(t=>path.relative(game,t.file))))assert(!fs.existsSync(path.join(root,file)),'Native technology source overridden '+file);
 assert.strictEqual(Object.keys(manifest.presentation.equipmentTooltips).length,0);
 assert.strictEqual(Object.keys(manifest.presentation.moduleTooltips).length,0);
});
check('Daily synchronization runs once in the receiving country and respects researched medium tiers',()=>{
 const actions=h.parse(fs.readFileSync(path.join(root,'common/on_actions/touhou_vanilla_military.txt'),'utf8'))[0];
 const daily=h.children(h.children(actions,'on_daily')[0],'effect')[0].value;
 assert(!h.render(daily).includes('every_country'),'Country daily pulse incorrectly iterates every country again');
 function pulse(s){const created=[];for(const n of daily){assert.strictEqual(n.key,'if');if(match(h.children(n,'limit')[0].value,s))for(const e of n.value.filter(n=>n.key!=='limit')){assert.strictEqual(e.key,'touhou_sync_vanilla_military');created.push(...register(s));}}return created;}
 const s=state('HAK','wakan',['gwtank_chassis'],['No Step Back']);pulse(s);
 assert(!s.techs.has('touhou_tank_frame_license_wakan_medium_2'));
 s.techs.add('basic_medium_tank_chassis');s.techs.add('improved_medium_tank_chassis');
 assert.deepStrictEqual(new Set(pulse(s)),new Set(['medium_tank_chassis_touhou_wakan_1','medium_tank_chassis_touhou_wakan_2']));
 assert(s.techs.has('touhou_tank_frame_license_wakan_medium_2'));assert.strictEqual(pulse(s).length,0);
 assert.deepStrictEqual(pulse(state('CHI','wakan',allTechs,['No Step Back','By Blood Alone'],allProjects)),[]);
});
check('Private requirements and free manual refresh replace native completion hooks',()=>{
 const decisions=h.parse(fs.readFileSync(path.join(root,'common/decisions/touhou_switch.txt'),'utf8'));
 const decision=h.children(decisions.find(n=>n.key==='touhou_research_type'),'touhou_designer_research_status')[0];
 assert.strictEqual(h.scalar(decision,'cost'),'0');
 assert(match(h.children(decision,'visible')[0].value,state('ALI','magic')));
 assert(!match(h.children(decision,'visible')[0].value,state('CHI','magic')));
 assert(h.render(h.children(decision,'complete_effect')).includes('touhou_sync_vanilla_military = yes'));
 const loc=fs.readFileSync(path.join(root,'localisation/simp_chinese/touhou_tank_designer_l_simp_chinese.yml'),'utf8')+fs.readFileSync(path.join(root,'localisation/simp_chinese/touhou_aircraft_designer_l_simp_chinese.yml'),'utf8');
 for(const r of manifest.independentResearch.requirements){const line=loc.split(/\r?\n/).find(line=>line.startsWith(' '+r.id+'_desc:'));assert(line?.includes(r.text),'Missing actual private requirement text '+r.id);}
 assert.strictEqual(manifest.independentResearch.requirements.length,535+23+47);
});
check('Advisor research bonuses retain their rates and use disjoint native categories',()=>{
 const native=h.definitions(game,'common/technologies','technologies');
 const categories=new Set(native.flatMap(t=>h.children(t,'categories').flatMap(b=>b.value.map(n=>n.value))));
 const original=h.parse(JSON.parse(fs.readFileSync(path.join(root,'tools/military_migration_baseline.json'),'utf8')).sources['common/ideas/touhou_government.txt']);
 const current=h.parse(fs.readFileSync(path.join(root,'common/ideas/touhou_government.txt'),'utf8'));
 function at(nodes,location){for(const key of location.split('.'))nodes=nodes.find(n=>n.key===key)?.value;return nodes;}
 assert.strictEqual(manifest.independentResearch.bonusMigrations.length,6);
 for(const b of manifest.independentResearch.bonusMigrations){
  assert.strictEqual(h.scalar({value:at(original,b.location)},b.source),b.value);
  const actual=at(current,b.location);assert(!actual.some(n=>n.key===b.source));assert.strictEqual(actual.length,b.categories.length);
  for(const c of b.categories){assert(categories.has(c),'Unknown native bonus category '+c);assert.strictEqual(h.scalar({value:actual},c),b.value);}
  for(const t of native)assert(h.children(t,'categories').flatMap(b=>b.value.map(n=>n.value)).filter(c=>b.categories.includes(c)).length<=1,'Research bonus stacks on '+t.key);
 }
 const org=fs.readFileSync(path.join(root,'common/military_industrial_organization/organizations/touhou_air_organizations.txt'),'utf8');
 assert(!org.includes('mio_cat_tech_touhou_aircraft'));assert(org.includes('air_equipment'));
});
function historicalDesigns(tag){
 const s=state(tag,null,[],['No Step Back','By Blood Alone']),created=[];
 const file=h.files(path.join(root,'history/countries')).find(f=>path.basename(f).startsWith(tag+' - '));
 function visit(ns){let branchTaken=false;for(const n of ns){
  if(n.key==='if'){branchTaken=match(h.children(n,'limit')[0].value,s);if(branchTaken)visit(n.value.filter(n=>n.key!=='limit'));}
  else if(n.key==='else_if'){if(!branchTaken){branchTaken=match(h.children(n,'limit')[0].value,s);if(branchTaken)visit(n.value.filter(n=>n.key!=='limit'));}}
  else if(['touhou_sync_vanilla_military','touhou_sync_tank_designer'].includes(n.key))created.push(...register(s));
  else if(n.key==='create_equipment_variant'){const type=h.scalar(n,'type');requireEnabledFrame(type,s);created.push(type);}
  else if(n.key==='set_technology'){for(const t of n.value)if(t.value==='1')s.techs.add(t.key);}
  else if(n.key==='set_country_flag')s.flags.add(n.value);
 }}visit(h.parse(fs.readFileSync(file,'utf8')));return {s,created};
}
check('All national histories enable private chassis before creating their modular stock designs',()=>{
 for(const tag of ['ALI','DES','HAK','DLD','HEL','SSS','OPP','RAB','TEM','BLQ','KAP','TEN','HUM','VAM','MLS','EVI'])historicalDesigns(tag);
});
check('Alice, Hell and fairies retain historical armor without granting unresearched tank components',()=>{
 for(const [tag,id] of [['ALI','touhou_magic_light_tank_equipment_1'],['HEL','oni_champion_equipment_0'],['EVI','evil_armor_equipment_0']]){
  const {s,created}=historicalDesigns(tag),p=manifest.armor.presets.find(p=>p.id===id);
  assert(created.includes(p.type),'Starting army references a missing design '+tag+' '+id);
  assert(!s.techs.has('gwtank_chassis'));
  for(const l of manifest.armor.licenses.filter(l=>l.modules.length))assert(!s.techs.has(l.id),'Historical stock granted unresearched modules '+tag+' '+l.id);
  const foreign=state('CHI','magic',allTechs,['No Step Back'],[...s.flags]);register(foreign);
  assert(!foreign.techs.has(frameProviders.get(p.type)));
 }
});
check('Historical chassis permission preserves research gates for new production and other frames',()=>{
 const eq=new Map(h.definitions(root,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const {s}=historicalDesigns('ALI'),p=manifest.armor.presets.find(p=>p.id==='touhou_magic_light_tank_equipment_1');
 assert(!match(h.children(eq.get(p.type),'can_be_produced')[0].value,s));
 assert(!s.techs.has('touhou_tank_frame_license_magic_light_2'));
 s.techs.add('basic_light_tank_chassis');s.techs.add('gwtank_chassis');register(s);
 assert(match(h.children(eq.get(p.type),'can_be_produced')[0].value,s));
});
check('Authored equipment definitions do not repeat module/category count limits',()=>{
 for(const n of h.definitions(root,'common/units/equipment','equipments')){
  const seen=new Set();for(const limit of h.children(n,'module_count_limit')){
   const kind=h.scalar(limit,'module')?'module':'category',id=h.scalar(limit,kind),key=kind+':'+id;
   assert(id,'Malformed module count limit '+n.key);assert(!seen.has(key),'Repeated authored limit '+n.key+' '+key);seen.add(key);
  }
 }
});
const result={checks:checks.length,passed:checks,limitation:'AST condition checks only; engine design creation, production UI and combat are not simulated.'};
fs.writeFileSync(path.join(root,'docs/国家装备解锁条件校验.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
