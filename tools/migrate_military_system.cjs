// Reproducible migration from the saved, unmodified Touhou military definitions.
// Fixed models keep their numerical values. Vanilla chassis/airframe designers remain available.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const h=require('./hoi4_script.cjs'),{node:N,scalar:S,children:C,render:R,parse:P}=h;
const root=path.resolve(__dirname,'..'),game=process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const baselinePath=path.join(root,'tools/military_migration_baseline.json');
const relative=f=>path.relative(root,f).replaceAll('\\','/');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const previousManifest=path.join(root,'docs/幻想乡军事原版化迁移清单.json');
const managedOutputs=new Set();
const changedManagedOutputs=[];
let previousMigration;
if(fs.existsSync(previousManifest)){
  const previous=previousMigration=JSON.parse(fs.readFileSync(previousManifest,'utf8'));
  for(const f of Object.keys(previous.outputs))managedOutputs.add(f);
  for(const [f,expected] of Object.entries(previous.outputs)){
    const target=path.join(root,f);
    if(!fs.existsSync(target)||hash(fs.readFileSync(target,'utf8'))!==expected)changedManagedOutputs.push(f);
  }
}
let baseline;
if(fs.existsSync(baselinePath)) baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
else {
  const sources={};
  for(const folder of ['common','events','history/countries','history/units','recp','interface'])
    for(const f of h.files(path.join(root,folder)).filter(f=>/\.(txt|gui|gfx)$/.test(f))) {
      const s=fs.readFileSync(f,'utf8');
      if(/touhou_(?:magic|wakan|demonforce|tech_)|(?:goliath|evil|human|animal|dragon|die|rabbit_team|deep_sea|soul|wunv|lotus|magician|oni|tengu|desires|cas_boli|suicide_puppet).*?(?:equipment|brigade|craft)|countrytechtreeview|technology_folders/.test(s)||/common\/(technologies|units)\//.test(relative(f))) sources[relative(f)]=s;
    }
  baseline={version:1,vanillaVersion:'1.19.3',sources};
  fs.writeFileSync(baselinePath,JSON.stringify(baseline,null,2)+'\n');
}
// These scripts refer only to the old boss/card IDs and therefore need explicit capture.
for(const f of ['common/scripted_effects/touhou_boss_scripted_effects.txt','history/countries/EVI - Evil.txt','common/decisions/touhou_switch.txt','localisation/simp_chinese/touhou/touhou_decisions_l_simp_chinese.yml'])
  if(!baseline.sources[f])baseline.sources[f]=fs.readFileSync(path.join(root,f),'utf8');
fs.writeFileSync(baselinePath,JSON.stringify(baseline,null,2)+'\n');
const sourceDefs=(folder,wrapper)=>Object.entries(baseline.sources).filter(([f])=>f.startsWith(folder+'/')&&f.endsWith('.txt')&&(!folder.endsWith('units')||f.split('/').length===3))
  .flatMap(([file,s])=>P(s).filter(n=>n.key===wrapper).flatMap(n=>n.value).filter(n=>n.key&&Array.isArray(n.value)&&!n.key.startsWith('@')).map(n=>({...n,file})));
const oldEq=sourceDefs('common/units/equipment','equipments'),oldUnits=sourceDefs('common/units','sub_units');
const oldTech=sourceDefs('common/technologies','technologies').filter(t=>t.file!=='common/technologies/special_forces_doctrine.txt');
const vanillaEq=h.definitions(game,'common/units/equipment','equipments');
const dup=h.definitions(game,'common/units/equipment','duplicate_archetypes');
const vanillaUnits=h.definitions(game,'common/units','sub_units');
const vanillaTech=h.definitions(game,'common/technologies','technologies');
const vEq=new Map([...vanillaEq,...dup].map(x=>[x.key,x])),vUnit=new Map(vanillaUnits.map(x=>[x.key,x])),vTech=new Map(vanillaTech.map(x=>[x.key,x]));
const eqMap=new Map(oldEq.map(x=>[x.key,x]));
const strip=id=>id.replace(/^touhou_(?:magic_|wakan_|demonforce_)?/,'');
const group=id=>id.startsWith('touhou_magic_')?'magic':id.startsWith('touhou_wakan_')?'wakan':id.startsWith('touhou_demonforce_')?'demonforce':id.startsWith('touhou_')?'support':'trump';
const tags=['ALI','DES','HAK','DLD','HEL','SSS','OPP','RAB','TEM','BLQ','KAP','TEN','HUM','VAM','MLS','EVI'];
const touhouLimit=()=>[N('OR',tags.map(t=>N('original_tag',t)))];
const specialUnits={suicide_puppet_1:'suicide_craft',suicide_puppet_2:'cas',goliath_brigade:'heavy_armor',oni_brigade:'heavy_armor',tengu_brigade:'fighter',cas_boli_fighter_brigade:'cas',desires_brigade:'strat_bomber',evil_brigade:'infantry',evil_armor_brigade:'medium_armor',evil_artillery_brigade:'artillery_brigade',human_brigade:'infantry',animal_brigade:'infantry',dragon_brigade:'mountaineers',die_brigade:'motorized',rabbit_team_brigade:'engineer',deep_sea_brigade:'submarine',soul_brigade:'logistics_company',wunv_brigade:'field_hospital',lotus_brigade:'carrier',magician_brigade:'artillery_brigade',touhou_boss_army:'heavy_armor'};
const unitMap=Object.fromEntries(oldUnits.map(u=>[u.key,specialUnits[u.key]||strip(u.key)]));
for(const [a,b] of Object.entries(unitMap))if(!vUnit.has(b))throw Error('Unknown vanilla unit '+a+' -> '+b);
if(oldEq.length!==204||oldUnits.length!==90||oldTech.length!==268)throw Error('Unexpected original inventory');
const designerTech=id=>{
  if(/^(basic|improved|advanced)_(light|medium|heavy)_(tank|td|art|spaa)$/.test(id))return id.replace(/_(tank|td|art|spaa)$/,'_tank_chassis');
  if(/^(main_battle_tank|modern_td|modern_art|modern_spaa)$/.test(id))return 'main_battle_tank_chassis';
  if(/^super_heavy_(tank|td|art|spaa)$/.test(id))return 'super_heavy_tank_chassis';
  const air={early_fighter:'iw_small_airframe',fighter1:'basic_small_airframe',fighter2:'improved_small_airframe',fighter3:'advanced_small_airframe',CAS1:'basic_small_airframe',CAS2:'improved_small_airframe',CAS3:'advanced_small_airframe',heavy_fighter1:'basic_medium_airframe',heavy_fighter2:'improved_medium_airframe',heavy_fighter3:'advanced_medium_airframe',early_bomber:'iw_medium_airframe',tactical_bomber1:'basic_medium_airframe',tactical_bomber2:'improved_medium_airframe',tactical_bomber3:'advanced_medium_airframe',strategic_bomber1:'basic_large_airframe',strategic_bomber2:'improved_large_airframe',strategic_bomber3:'advanced_large_airframe',jet_fighter1:'modern_small_airframe',jet_fighter2:'supersonic_small_airframe',jet_tactical_bomber1:'modern_medium_airframe',jet_tactical_bomber2:'modern_medium_airframe',jet_strategic_bomber1:'modern_large_airframe'};
  return air[id]||id;
};
const dlcFor=id=>designerTech(id)===id?null:/chassis/.test(designerTech(id))?'No Step Back':'By Blood Alone';
const ordinaryTech=Object.fromEntries(oldTech.filter(t=>group(t.key)!=='trump').map(t=>[t.key,strip(t.key)]));
for(const [a,b] of Object.entries(ordinaryTech))if(!vTech.has(b)||!vTech.has(designerTech(b)))throw Error('Unknown vanilla tech '+a+' -> '+b+'/'+designerTech(b));
const cardTech=new Map(oldTech.filter(t=>group(t.key)==='trump').map(t=>[t.key,t]));
const projectFlag=id=>'touhou_project_unlocked_'+id;
const techCondition=id=>{
  const dlc=dlcFor(id);return dlc?[N('OR',[N('AND',[N('has_dlc','"'+dlc+'"'),N('has_tech',designerTech(id))]),N('AND',[N('NOT',[N('has_dlc','"'+dlc+'"')]),N('has_tech',id)])])]:[N('has_tech',id)];
};
const styleLimit=style=>style==='support'?touhouLimit():[...touhouLimit(),N('has_country_flag','touhou_country_flag_'+style+'_first_research')];
const specialArchetypes={suicide_puppet_little_equipment:'small_plane_suicide_airframe',suicide_puppet_big_equipment:'small_plane_cas_airframe',goliath_equipment:'heavy_tank_chassis',tengu_fighter_equipment:'small_plane_airframe',oni_champion_equipment:'heavy_tank_chassis',cas_boli_equipment:'small_plane_cas_airframe',desires_equipment:'large_plane_airframe',evil_equipment:'infantry_equipment',human_equipment:'infantry_equipment',animal_equipment:'infantry_equipment',dragon_equipment:'infantry_equipment',die_equipment:'motorized_equipment',rabbit_team_equipment:'support_equipment',deep_sea_equipment:'ship_hull_submarine',soul_equipment:'support_equipment',wunv_equipment:'support_equipment',lotus_equipment:'ship_hull_carrier',magician_equipment:'artillery_equipment'};
const archetypeMap={};
const numeric=/^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const metadata=new Set(['year','priority','visual_level','air_map_icon_frame','interface_overview_category_index','land_air_wing_size','carrier_air_wing_size']);
const resolve=(n,map)=>{const a=S(n,'archetype');const inherited=a?resolve(map.get(a),map):[];const merged=new Map(inherited.map(x=>[x.key,x]));for(const c of n.value)merged.set(c.key,c);return [...merged.values()];};
const models=oldEq.filter(n=>S(n,'is_archetype')!=='yes');
const modelTech={};for(const t of oldTech)for(const n of C(t,'enable_equipments').flatMap(n=>n.value))modelTech[n.value]=t.key;
for(const m of models) {
  const oldRoot=S(m,'archetype'),vanilla=vEq.get(strip(m.key));
  const native=vanilla?S(vanilla,'archetype'):specialArchetypes[oldRoot];
  const target=({jet_fighter_equipment:'small_plane_airframe',jet_tac_bomber_equipment:'medium_plane_airframe',jet_strat_bomber_equipment:'large_plane_airframe'})[native]||native;
  if(!target||!vEq.has(target))throw Error('No archetype mapping '+m.key+' '+target);
  if(archetypeMap[oldRoot]&&archetypeMap[oldRoot]!==target)throw Error('Conflicting archetype '+oldRoot);
  archetypeMap[oldRoot]=target;
}
const outputs={},deleted=new Set();
const write=(file,s)=>{outputs[file]=s;};
const wrap=(key,nodes)=>R([N(key,nodes)]);
const generatedModels=[];
for(const file of [...new Set(models.map(m=>m.file))]) {
  const newModels=[];
  for(const m of models.filter(m=>m.file===file)) {
    const oldRoot=S(m,'archetype'),target=archetypeMap[oldRoot],oldResolved=resolve(m,eqMap);
    // Explicit effective values prevent the new archetype from changing existing equipment statistics.
    const discarded=new Set(['is_archetype','is_buildable','archetype','group_by','type','alias','carrier_capable','module_slots','can_be_produced','active','parent','picture','derived_variant_name','variant_name']);
    const props=oldResolved.filter(n=>!discarded.has(n.key)&&n.key!==null&&!n.key.startsWith('@'));
    // A shared vanilla archetype must not supply the retained model's display identity.
    // The picture stem resolves to GFX_<model>_medium, just like native picture stems.
    props.push(N('picture',m.key),N('variant_name',m.key),N('derived_variant_name',m.key));
    // Absence of a resource bill/fuel/crew on the old equipment must not acquire
    // a new production resource bill or consumption from the native archetype.
    if(!props.some(n=>n.key==='resources'))props.push(N('resources',[]));
    for(const key of ['fuel_consumption','manpower'])if(!props.some(n=>n.key===key))props.push(N(key,'0'));
    // Do not add offensive capabilities that were absent from the old model/root.
    for(const key of ['breakthrough','naval_strike_attack','naval_strike_targetting']){
      if(!props.some(n=>n.key===key)&&resolve(vEq.get(target),vEq).some(n=>n.key===key&&typeof n.value==='string'&&numeric.test(n.value)&&Number(n.value)!==0))props.push(N(key,'0'));
    }
    const ownParent=S(m,'parent');if(ownParent&&models.some(x=>x.key===ownParent))props.push(N('parent',ownParent));
    props.unshift(N('archetype',target));props.push(N('is_buildable','yes'));
    // Original fixed designs must not inherit designer modules on top of their old finished stats.
    if(/chassis|airframe|ship_hull/.test(target)&&!oldResolved.some(n=>n.key==='module_slots'))props.push(N('module_slots','none'));
    else if(oldResolved.some(n=>n.key==='module_slots'))props.push(oldResolved.find(n=>n.key==='module_slots'));
    const t=modelTech[m.key],style=group(m.key);
    if(!t)throw Error('Missing unlock '+m.key);
    let condition;
    if(style==='trump') {
      const project=t.startsWith('goliath_')?'goliath_0':t;
      condition=[...touhouLimit(),N('has_country_flag',projectFlag(project))];
      if(t.startsWith('goliath_')&&t!=='goliath_0') {
        const tiers={goliath_1:'basic_heavy_tank',goliath_2:'improved_heavy_tank',goliath_3:'advanced_heavy_tank',goliath_4:'super_heavy_tank'};
        condition.push(...techCondition(tiers[t]));
      }
    } else {condition=[...styleLimit(style),...techCondition(ordinaryTech[t])];}
    // Modular Lotus hulls need the engine's baseline chassis so the original designer works.
    // Their production/design gate still requires this country's project registration.
    const modularHull=oldResolved.some(n=>n.key==='module_slots'&&Array.isArray(n.value));
    props.push(N('active',modularHull?'yes':'no'));
    condition.push(N('has_country_flag','touhou_registered_model_'+m.key));
    props.push(N('can_be_produced',condition));
    newModels.push(N(m.key,props));generatedModels.push({id:m.key,oldArchetype:oldRoot,archetype:target,unlock:t,style,modularHull});
  }
  // Load after vanilla x_* duplicate_archetypes, so fixed Touhou models are not auto-duplicated
  // into new roles or changed by the role generator's for_each hardness overrides.
  const targetFile=file.replace('common/units/equipment/','common/units/equipment/zz_');
  deleted.add(file);
  write(targetFile,'# Vanilla archetypes; original Touhou finished-model statistics are preserved.\n'+wrap('equipments',newModels));
}
// One original fairy model served three incompatible roles. Keep its ID for infantry,
// and duplicate its original values into two models consumed by the other vanilla battalions.
const cardFile='common/units/equipment/zz_touhou_trump_card.txt';
const cardNodes=P(outputs[cardFile])[0].value,evil=cardNodes.find(n=>n.key==='evil_equipment_0');
for(const [id,a] of [['evil_armor_equipment_0','medium_tank_chassis'],['evil_artillery_equipment_0','artillery_equipment']]) {
  const clone=structuredClone(evil);clone.key=id;clone.value.find(n=>n.key==='archetype').value=a;
  for(const key of ['picture','variant_name','derived_variant_name'])clone.value.find(n=>n.key===key).value=id;
  C(clone,'can_be_produced')[0].value.find(n=>n.key==='has_country_flag'&&n.value==='touhou_registered_model_evil_equipment_0').value='touhou_registered_model_'+id;
  if(a.includes('chassis'))clone.value.push(N('module_slots','none'));
  cardNodes.push(clone);generatedModels.push({id,oldArchetype:'evil_equipment',archetype:a,unlock:'evil_army',style:'trump',copiedFrom:'evil_equipment_0'});
}
write(cardFile,'# Vanilla archetypes; original Touhou finished-model statistics are preserved.\n'+wrap('equipments',cardNodes));
const localisation=new Map();
for(const f of h.files(path.join(root,'localisation/simp_chinese')).filter(f=>f.endsWith('.yml')&&!['touhou_vanilla_military_l_simp_chinese.yml','touhou_tank_designer_l_simp_chinese.yml','touhou_aircraft_designer_l_simp_chinese.yml'].includes(path.basename(f))))for(const line of fs.readFileSync(f,'utf8').split(/\r?\n/)){
  const m=line.match(/^\s*([^\s:#]+):\s*\d*\s*"(.*)"/);if(m)localisation.set(m[1],m[2]);
}
localisation.set('evil_armor_equipment_0','妖精装甲装备');
const armor=require('./armor_designer.cjs').planArmorDesigner({root,game,models:generatedModels,
  fixedDefinitions:Object.entries(outputs).filter(([f])=>f.startsWith('common/units/equipment/')).flatMap(([,s])=>P(s)[0].value),
  vanillaEq:vEq,duplicates:dup,localisation,tags,techCondition,styleLimit});
const aircraft=require('./aircraft_designer.cjs').planAircraftDesigner({root,game,models:generatedModels,
  fixedDefinitions:Object.entries(outputs).filter(([f])=>f.startsWith('common/units/equipment/')).flatMap(([,s])=>P(s)[0].value),
  vanillaEq:vEq,duplicates:dup,localisation,tags,ordinaryTech,designerTech});
const optionalModules=require('./optional_designer_modules.cjs').installOptionalDesignerModules({root,game,armor,aircraft,tags});
require('./armor_module_isolation.cjs').installArmorIsolation({armor,game});
require('./aircraft_module_isolation.cjs').installAircraftIsolation({aircraft,game,tags});
const independentResearch=require('./independent_military_research.cjs').buildIndependentResearch({armor,aircraft,vanillaTech,tags});
write('docs/特殊配件与副武器设计清单.json',JSON.stringify({date:'2026-10-02',vanillaVersion:'1.19.3',design:'Independent Touhou functions; native compatibility only',icons:'174 original transparent artwork concepts for 252 optional modules',...optionalModules},null,2)+'\n');
write('docs/特殊配件与副武器目录.txt',require('./optional_designer_modules.cjs').optionalModuleDirectory(optionalModules));
const moduleArt=require('./module_icon_art.cjs').installModuleArt({root,armor,aircraft});
const categoryArt=require('./module_category_icons.cjs').installCategoryIcons({armor,aircraft});
write('interface/zz_touhou_module_categories.gfx',categoryArt.graphics);
write('interface/zz_touhou_module_icons.gfx',moduleArt.graphics);
write('docs/配件图标映射清单.json',JSON.stringify(moduleArt.manifest,null,2)+'\n');
const oldArmorIds=new Set(armor.originalModels.map(m=>m.id)),oldAircraftIds=new Set(aircraft.originalModels.map(m=>m.id));
const retiredDesignIds=new Set([...oldArmorIds,...oldAircraftIds]),designReplacements={...armor.replacements,...aircraft.replacements};
// Older baseline capture did not include scripts that referenced only finished model IDs.
for(const folder of ['common','events','history/countries','history/units'])for(const file of h.files(path.join(root,folder)).filter(f=>f.endsWith('.txt'))){
  const rel=relative(file);if(baseline.sources[rel]||outputs[rel]||managedOutputs.has(rel)||rel.includes('/units/equipment/'))continue;
  const source=fs.readFileSync(file,'utf8');
  if([...source.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[^\s{}=<>!#"]+/g)].some(m=>!m[0].startsWith('#')&&retiredDesignIds.has(m[0].replace(/^"|"$/g,''))))baseline.sources[rel]=source;
}
fs.writeFileSync(baselinePath,JSON.stringify(baseline,null,2)+'\n');
for(const [file,s] of Object.entries(outputs).filter(([f])=>f.startsWith('common/units/equipment/'))){
  const nodes=P(s);nodes[0].value=nodes[0].value.filter(n=>!retiredDesignIds.has(n.key));write(file,R(nodes));
}
generatedModels.splice(0,generatedModels.length,...generatedModels.filter(m=>!retiredDesignIds.has(m.id)),...armor.models,...aircraft.models);
write('common/units/equipment/touhou_tank_chassis.txt','# Native tank archetypes; blank modular chassis. Load before native x_* role duplication.\n'+armor.equipmentScript);
write('common/units/equipment/zz_touhou_tank_role_adjustments.txt','# Generic role chassis metadata only; native module stats do not accept lend_lease_cost.\n'+armor.roleOverridesScript);
write('common/units/equipment/modules/touhou_tank_modules.txt',armor.modulesScript);
write('common/technologies/touhou_tank_component_licenses.txt','# Script-only national component licenses; no research folders or independent research nodes.\n'+armor.technologyScript);
for(const [key,value] of armor.localisation)localisation.set(key,value);
write('localisation/simp_chinese/touhou_tank_designer_l_simp_chinese.yml','\uFEFFl_simp_chinese:\n'+[...armor.localisation].map(([k,v])=>' '+k+':0 '+JSON.stringify(v)).join('\n')+'\n');
write('common/units/equipment/touhou_plane_airframes.txt','# Native aircraft archetypes; blank generic frames before native x_* role duplication.\n'+aircraft.equipmentScript);
write('common/units/equipment/modules/touhou_aircraft_modules.txt',aircraft.modulesScript);
write('common/technologies/touhou_aircraft_component_licenses.txt','# Script-only national aviation component licenses.\n'+aircraft.technologyScript);
write('interface/equipmentdesigner/planes/touhou_plane_blueprints.gui',aircraft.blueprintsScript);
for(const [key,value] of aircraft.localisation)localisation.set(key,value);
write('localisation/simp_chinese/touhou_aircraft_designer_l_simp_chinese.yml','\uFEFFl_simp_chinese:\n'+[...aircraft.localisation].map(([k,v])=>' '+k+':0 '+JSON.stringify(v)).join('\n')+'\n');
for(const u of oldUnits)deleted.add(u.file);
for(const t of oldTech)deleted.add(t.file);
deleted.add('common/technologies/special_forces_doctrine.txt');
deleted.add('common/technology_tags/00_technology.txt');
deleted.add('interface/countrytechtreeview.gui');
// Previous generations used this override solely to unlock Lotus modules globally.
// Restore the installed native naval technology file instead.
deleted.add('common/technologies/MTG_naval.txt');
// Native MIO groups now contain the retained models through their native archetypes.
// The old override widened vanilla light tank groups to include heavy/super-heavy equipment.
deleted.add('common/equipment_groups/mio_equipment_groups.txt');
// Native technologies are read only: requirements are checked by independent country scripts.
// Do not replace a whole vanilla technology file merely to attach categories or completion effects.
const nativeTechnologyFiles=new Set(vanillaTech.map(t=>path.relative(game,t.file).replaceAll('\\','/')));
const removedNativeTechnologyFiles=[...nativeTechnologyFiles].filter(file=>fs.existsSync(path.join(root,file))||managedOutputs.has(file)||previousMigration?.independentResearch?.removedNativeTechnologyFiles?.includes(file));
for(const file of removedNativeTechnologyFiles)deleted.add(file);
deleted.add('common/technology_tags/touhou_technology.txt');
// No custom effects are attached to vanilla research tooltips; private parts describe their gates.
const equipmentTooltips=new Map(),moduleTooltips=new Map();
// Native 1.19 country effect: apply only the delta from vanilla research, once per country.
// Daily synchronization and local project/style effects handle changes without native tech hooks.
const flat=nodes=>{const out={};function visit(ns,p=''){for(const n of ns)if(n.key){const k=p+n.key;if(Array.isArray(n.value))visit(n.value,k+'.');else if(numeric.test(n.value))out[k]=(out[k]||0)+Number(n.value);}}visit(nodes);return out;};
const unflat=values=>{const out=[];for(const [k,v] of Object.entries(values)){const parts=k.split('.');let ns=out;for(const p of parts.slice(0,-1)){let n=ns.find(n=>n.key===p);if(!n){n=N(p,[]);ns.push(n);}ns=n.value;}ns.push(N(parts.at(-1),String(Number(v.toFixed(8)))));}return out;};
const unitCats=u=>C(u,'categories').flatMap(n=>n.value).map(n=>n.value);
const unitEffects=(tech,unit)=>flat(tech.value.filter(n=>n.key===unit.key||unitCats(unit).includes(n.key)).flatMap(n=>n.value));
const sync=[],dynamic=[],bonuses=[],countryKeys=new Set(['special_forces_training_time_factor','special_forces_cap','special_forces_no_supply_grace','special_forces_out_of_supply_factor','land_night_attack','tech_air_damage_factor','static_anti_air_damage_factor']);
function toggle(id,condition,bonus){
  const flag='touhou_migration_bonus_'+id;
  // The installed engine rejects name inside the stat block despite its generated documentation.
  const positive=N('add_unit_bonus',bonus.map(b=>N(b.unit,unflat(b.values))));
  const negative=N('add_unit_bonus',bonus.map(b=>N(b.unit,unflat(Object.fromEntries(Object.entries(b.values).map(([k,v])=>[k,-v]))))));
  sync.push(N('if',[N('limit',[...condition,N('NOT',[N('has_country_flag',flag)])]),positive,N('set_country_flag',flag)]),
    N('else_if',[N('limit',[N('has_country_flag',flag),N('NOT',[N('AND',condition)])]),negative,N('clr_country_flag',flag)]));
}
for(const t of oldTech.filter(t=>group(t.key)!=='trump')) {
  const style=group(t.key),legacy=ordinaryTech[t.key],original=vTech.get(legacy),bonus=[];
  const affected=oldUnits.filter(u=>group(u.key)===style||(style!=='support'&&group(u.key)==='trump'));
  const targets=[...new Set(affected.map(u=>unitMap[u.key]))];
  for(const id of targets) {
    // Prefer the standard culture unit when several removed units merge into one vanilla type.
    const candidates=affected.filter(u=>unitMap[u.key]===id);
    const old=candidates.find(u=>group(u.key)===style)||candidates[0],vanilla=vUnit.get(id);
    // A few old Touhou technologies also named vanilla motorized/mechanized directly.
    // Those real effects must continue to apply after the custom vehicle unit is removed.
    const a=flat([...t.value.filter(n=>n.key===old.key||unitCats(old).includes(n.key)).flatMap(n=>n.value),
      ...t.value.filter(n=>n.key===id&&id!==old.key).flatMap(n=>n.value)]),b=unitEffects(original,vanilla),delta={};
    // Only units present in the old technology's own military system receive a replacement delta.
    if(!Object.keys(a).length&&!t.value.some(n=>n.key===old.key||unitCats(old).includes(n.key))) {
      if(group(old.key)==='trump')continue;
    }
    for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const d=(a[key]||0)-(b[key]||0);if(Math.abs(d)>1e-8)delta[key]=d;}
    if(Object.keys(delta).length)bonus.push({unit:id,values:delta});
  }
  const condition=[...styleLimit(style),...techCondition(legacy)];
  if(bonus.length){toggle(t.key,condition,bonus);bonuses.push({source:t.key,vanilla:legacy,style,bonus});}
  const countryDelta={};
  for(const key of countryKeys){const d=Number(S(t,key)||0)-Number(S(original,key)||0);if(Math.abs(d)>1e-8)countryDelta[key]=d;}
  if(Object.keys(countryDelta).length){const id='touhou_migration_'+t.key;dynamic.push(N(id,[N('enable',condition),...unflat(countryDelta)]));}
}
const setup=[N('if',[N('limit',[N('NOT',[N('has_country_flag','touhou_migration_initialized')])]),
  ...dynamic.map(n=>N('add_dynamic_modifier',[N('modifier',n.key)])),N('set_country_flag','touhou_migration_initialized')])];
// Unlock fairies are innate to EVI, while other countries retain the original project decisions.
setup.push(N('if',[N('limit',[N('original_tag','EVI')]),N('set_country_flag',projectFlag('evil_army'))]));
setup.push(N('touhou_sync_tank_designer','yes'));
setup.push(N('touhou_sync_aircraft_designer','yes'));
const syncScript=[N('touhou_sync_vanilla_military',[...setup,...sync])];
write('common/scripted_effects/touhou_vanilla_military.txt','# Research deltas preserve the old technology effects without double counting vanilla bonuses.\n'+R(syncScript));
write('common/dynamic_modifiers/touhou_vanilla_military.txt',R(dynamic));
write('common/on_actions/touhou_vanilla_military.txt',wrap('on_actions',[
 N('on_startup',[N('effect',[N('every_country',[N('limit',touhouLimit()),N('touhou_sync_vanilla_military','yes')])])]),
 // Unlike startup, the daily pulse already has the receiving country's scope.
 N('on_daily',[N('effect',[N('if',[N('limit',touhouLimit()),N('touhou_sync_vanilla_military','yes')])])])
]));
// Replace references in history, focuses, decisions, ideas, MIOs, AI and template scripts.
// Independent conditions work in both country-history and normal effect scopes.
// Country history interprets a sibling else as an unknown history command.
const grantTech=id=>[N('if',[N('limit',[N('has_dlc','"'+dlcFor(id)+'"')]),N('set_technology',[N(designerTech(id),'1')])]),N('if',[N('limit',[N('NOT',[N('has_dlc','"'+dlcFor(id)+'"')])]),N('set_technology',[N(id,'1')])])];
function projectGrant(id) {
  const out=[N('set_country_flag',projectFlag(id.startsWith('goliath_')?'goliath_0':id))];
  const required={goliath_1:'basic_heavy_tank',goliath_2:'improved_heavy_tank',goliath_3:'advanced_heavy_tank',goliath_4:'super_heavy_tank',oni_champion:'basic_heavy_tank',tengu_fighter:'early_fighter',cas_boli_fighter:'CAS1',desires_bomber:'strategic_bomber1',evil_army:'infantry_weapons',human_army:'infantry_weapons',DLD_animal:'infantry_weapons',dragon:'tech_mountaineers',die:'motorised_infantry',rabbit_team:'tech_engineers',deep_sea:'basic_ship_hull_submarine',soul:'tech_logistics_company',wunv:'tech_field_hospital',lotus:'basic_ship_hull_carrier',magician:'gw_artillery'};
  if(required[id])out.push(...(dlcFor(required[id])?grantTech(required[id]):[N('set_technology',[N(required[id],'1')])]));
  if(id==='goliath_1')out.push(N('touhou_sync_vanilla_military','yes'),N('load_oob','"unlock_goliath"'));
  // Project completion grants availability only within the completing country's scope.
  out.push(N('touhou_sync_vanilla_military','yes'));
  return out;
}
const aircraftFallback=p=>vEq.has(strip(p.oldModel))?strip(p.oldModel):({fighter:'fighter_equipment_0',heavy_fighter:'heavy_fighter_equipment_1',cas:'CAS_equipment_1',suicide:'rocket_suicide_equipment_1',tactical_bomber:'tac_bomber_equipment_1',strategic_bomber:'strat_bomber_equipment_1'})[p.role];
function transform(nodes,parent='') {
  const out=[];
  for(const n0 of nodes) {
    const n=structuredClone(n0);
    if(n.key==='has_tech'&&ordinaryTech[n.value]){out.push(...techCondition(ordinaryTech[n.value]));continue;}
    if(n.key==='has_tech'&&cardTech.has(n.value)){out.push(N('has_country_flag',projectFlag(n.value.startsWith('goliath_')?'goliath_0':n.value)));continue;}
    if(n.key==='set_technology') {
      const normal=[];for(const c of n.value){
        if(cardTech.has(c.key)){out.push(...projectGrant(c.key));continue;}
        const id=ordinaryTech[c.key]||c.key;
        if(ordinaryTech[c.key]&&dlcFor(id)){out.push(...grantTech(id));continue;}
        if(!normal.some(x=>x.key===id))normal.push(N(id,c.value));
      }if(normal.length)out.push(N('set_technology',normal));continue;
    }
    if(parent==='equipment_bonus'&&archetypeMap[n.key]) {
      for(const m of models.filter(m=>S(m,'archetype')===n.key))out.push(N(designReplacements[m.key]||m.key,transform(n.value,'model_bonus')));
      continue;
    }
    if(n.key&&unitMap[n.key])n.key=unitMap[n.key];
    else if(n.key&&ordinaryTech[n.key])n.key=ordinaryTech[n.key];
    else if(n.key&&archetypeMap[n.key])n.key=archetypeMap[n.key];
    if(n.key)for(const [old,id] of Object.entries(unitMap))n.key=n.key.replace('army_sub_unit_'+old+'_','army_sub_unit_'+id+'_');
    if(designReplacements[n.key])n.key=designReplacements[n.key];
    if(Array.isArray(n.value))n.value=transform(n.value,n.key||parent);
    else if(unitMap[n.value])n.value=unitMap[n.value];
    else if(archetypeMap[n.value])n.value=archetypeMap[n.value];
    else if(ordinaryTech[n.value])n.value=ordinaryTech[n.value];
    else if(designReplacements[n.value])n.value=designReplacements[n.value];
    else if(typeof n.value==='string'&&n.value.startsWith('"')){
      const id=n.value.slice(1,-1);
      if(unitMap[id])n.value='"'+unitMap[id]+'"';
      else if(archetypeMap[id])n.value='"'+archetypeMap[id]+'"';
      else if(designReplacements[id])n.value='"'+designReplacements[id]+'"';
    }
    // Archetype/category lists often merge several former cultures into the same native type.
    // Avoid duplicate items in set-like lists, while retaining repeated battalions/effects.
    if(n.key===null&&typeof n.value==='string'&&['division_types','equipment_type','script_enum_equipment','script_enum_equipment_type'].includes(parent)&&out.some(x=>x.key===null&&x.value===n.value))continue;
    const oldType=S(n0,'type')||S(C(n0,'equipment')[0]||N(null,[]),'type');
    const armorPreset=armor.presets.find(p=>p.oldModel===oldType)||aircraft.presets.find(p=>p.oldModel===oldType);
    if(armorPreset&&['add_equipment_to_stockpile','add_equipment_production'].includes(n.key)){
      const airPreset=aircraft.presets.includes(armorPreset),dlc=airPreset?'By Blood Alone':'No Step Back';
      const nativeFallback=airPreset?aircraftFallback(armorPreset):vEq.has(strip(oldType))?strip(oldType):({heavy:'heavy_tank_equipment_1',medium:'medium_tank_equipment_1',light:'light_tank_equipment_1',modern:'modern_tank_equipment_1',super_heavy:'super_heavy_tank_equipment_1'})[armor.originalModels.find(m=>m.id===oldType).archetype.replace(/_tank.*$/,'')];
      const fallback=structuredClone(n);const fallbackEquipment=n.key==='add_equipment_production'?C(fallback,'equipment')[0]:fallback;
      fallbackEquipment.value.find(c=>c.key==='type').value=nativeFallback;
      if(n.key==='add_equipment_production'){
        C(n,'equipment')[0].value.push(airPreset?N('version_name',JSON.stringify(armorPreset.name)):N('version','1'));
        out.push(N('if',[N('limit',[N('has_dlc','"'+dlc+'"')]),n]),N('if',[N('limit',[N('NOT',[N('has_dlc','"'+dlc+'"')])]),fallback]));
      }else{
        n.value.push(N('variant_name',JSON.stringify(armorPreset.name)));
        const frame=!airPreset&&(armor.models.find(m=>m.id===armorPreset.type)||armor.models.find(m=>armor.aliases.some(a=>(a.id===armorPreset.type||a.presetType===armorPreset.type)&&a.base===m.id)));
        const ensure=N('if',[N('limit',[N('NOT',[N('has_country_flag',armorPreset.flag)])]),
          ...(frame?[N('set_country_flag',frame.historicalFlag),N('touhou_sync_tank_designer','yes')]:[]),
          N('create_equipment_variant',armorPreset.design),N('set_country_flag',armorPreset.flag)]);
        const producer=S(n,'producer')?.replace(/^"|"$/g,'');
        out.push(N('if',[N('limit',[N('has_dlc','"'+dlc+'"')]),...(producer?[N(producer,[ensure])]:[ensure]),n]),N('if',[N('limit',[N('NOT',[N('has_dlc','"'+dlc+'"')])]),fallback]));
      }
      continue;
    }
    if(n.key==='load_oob')out.push(N('touhou_sync_vanilla_military','yes'));
    out.push(n);
  }
  return out;
}
const techIds=new Set([...Object.keys(ordinaryTech),...cardTech.keys()]),oldIds=new Set([...Object.keys(unitMap),...Object.keys(archetypeMap),...techIds,...retiredDesignIds]);
const mentions=s=>[...s.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[^\s{}=<>!#"]+/g)].some(m=>{
  if(m[0].startsWith('#'))return false;const token=m[0].replace(/^"|"$/g,'');
  return oldIds.has(token)||Object.keys(unitMap).some(id=>token.includes('army_sub_unit_'+id+'_'));
});
// Air OOBs select owned designs by version_name, and have separate non-BBA native fallbacks.
const airOobs=new Map();
for(const [file,s] of Object.entries(baseline.sources).filter(([f])=>f.startsWith('history/units/'))){
  const wings=P(s).filter(n=>n.key==='air_wings');if(!wings.length)continue;
  const relevant=[];for(const wing of wings)for(const state of wing.value)for(const plane of state.value){const p=aircraft.presets.find(p=>p.oldModel===plane.key);if(p)relevant.push(p);}
  if(!relevant.length)continue;
  const bba=transform(wings),legacy=structuredClone(wings);
  for(const wing of bba)for(const state of wing.value)for(const plane of state.value){const p=aircraft.presets.find(p=>p.type===plane.key);if(p)plane.value.push(N('version_name',JSON.stringify(p.name)));}
  for(const wing of legacy)for(const state of wing.value)for(const plane of state.value){const p=aircraft.presets.find(p=>p.oldModel===plane.key);if(p)plane.key=aircraftFallback(p);}
  const stem=path.basename(file,'.txt')+'_air';
  write('history/units/'+stem+'_bba.txt',R(bba));write('history/units/'+stem+'_legacy.txt',R(legacy));airOobs.set(path.basename(file,'.txt'),{stem,presets:[...new Map(relevant.map(p=>[p.id,p])).values()]});
}
for(const [file,s] of Object.entries(baseline.sources)) {
  if(!file.endsWith('.txt')||deleted.has(file)||outputs[file]||file.startsWith('interface/')||file.startsWith('common/technology_tags/'))continue;
  if(!mentions(s)&&file!=='common/decisions/touhou_switch.txt'&&!/research_bonus|mio_cat_tech_touhou_aircraft/.test(s))continue;
  const nodes=transform(P(s).filter(n=>!(file.startsWith('history/units/')&&airOobs.has(path.basename(file,'.txt'))&&n.key==='air_wings')));
  if(file.startsWith('history/countries/')&&tags.includes(path.basename(file).slice(0,3))){
    const style=s.match(/set_country_flag\s*=\s*touhou_country_flag_(magic|wakan|demonforce)_first_research/);
    if(style)nodes.unshift(N('set_country_flag','touhou_country_flag_'+style[1]+'_first_research'));
  }
  if(file==='common/script_enums.txt'){
    const list=nodes.find(n=>n.key==='script_enum_equipment_bonus_type')||nodes.find(n=>n.key==='script_enum_equipment_type');
    if(list)for(const id of ['evil_armor_equipment_0','evil_artillery_equipment_0'])list.value.push(N(null,id));
  }
  if(file==='common/decisions/touhou_switch.txt')for(const category of nodes)if(Array.isArray(category.value))for(const d of category.value)if(d.key?.startsWith('touhou_research_type_change_to_'))for(const effect of C(d,'complete_effect'))effect.value.push(N('touhou_sync_vanilla_military','yes'));
  if(file==='common/decisions/touhou_switch.txt')nodes.find(n=>n.key==='touhou_research_type').value.push(independentResearch.decision);
  independentResearch.rewriteBonuses(nodes,file);
  if(file==='common/decisions/touhou_country_only.txt')for(const category of nodes)if(Array.isArray(category.value))for(const d of category.value)if(d.key==='touhou_mission_doll_production_line')d.value=d.value.filter(n=>n.key!=='modifier');
  // Initialize national designs after this country's original technology/style/project setup.
  if(file.startsWith('history/countries/')&&tags.includes(path.basename(file).slice(0,3))){
    // A historical stock design may exist before its components are researched.
    // Authorize only its chassis before creating the design; component licenses stay locked.
    const army=nodes.find(n=>n.key==='oob')?.value.replace(/^"|"$/g,'');
    const armySource=baseline.sources['history/units/'+army+'.txt']||'';
    const armyTokens=new Set([...armySource.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[^\s{}=<>!#"]+/g)].filter(m=>!m[0].startsWith('#')).map(m=>m[0].replace(/^"|"$/g,'')));
    // Fairy armor previously used the shared infantry equipment ID implicitly through its battalion.
    if(armyTokens.has('evil_armor_brigade'))armyTokens.add('evil_armor_equipment_0');
    const historicalArmor=armor.presets.filter(p=>p.oldModel&&armyTokens.has(p.oldModel));
    const historicalFrames=[...new Set(historicalArmor.map(p=>armor.models.find(m=>m.id===p.type)||armor.models.find(m=>armor.aliases.some(a=>(a.id===p.type||a.presetType===p.type)&&a.base===m.id))))];
    if(historicalFrames.some(m=>!m?.historicalFlag))throw Error('Historical chassis authorization missing '+file);
    if(historicalFrames.length)nodes.push(N('if',[N('limit',[N('has_dlc','"No Step Back"')]),...historicalFrames.map(m=>N('set_country_flag',m.historicalFlag))]));
    nodes.push(N('touhou_sync_vanilla_military','yes'));
    if(historicalArmor.length)nodes.push(N('if',[N('limit',[N('has_dlc','"No Step Back"')]),...historicalArmor.map(p=>N('if',[N('limit',[N('NOT',[N('has_country_flag',p.flag)])]),N('create_equipment_variant',p.design),N('set_country_flag',p.flag)]))]));
    const air=airOobs.get(nodes.find(n=>n.key==='oob')?.value.replace(/^"|"$/g,''));
    if(air)nodes.push(N('if',[N('limit',[N('has_dlc','"By Blood Alone"')]),...air.presets.map(p=>N('if',[N('limit',[N('NOT',[N('has_country_flag',p.flag)])]),N('create_equipment_variant',p.design),N('set_country_flag',p.flag)])),N('set_air_oob','"'+air.stem+'_bba"')]),N('if',[N('limit',[N('NOT',[N('has_dlc','"By Blood Alone"')])]),N('set_air_oob','"'+air.stem+'_legacy"')]));
  }
  write(file,R(nodes));
}
// Extend the current game's script enums instead of carrying an outdated full override.
const enums=P(fs.readFileSync(path.join(game,'common/script_enums.txt'),'utf8'));
const equipmentEnum=enums.find(n=>n.key==='script_enum_equipment_bonus_type');
if(!equipmentEnum)throw Error('Vanilla equipment bonus enum missing');
for(const m of generatedModels)if(!equipmentEnum.value.some(n=>n.value===m.id))equipmentEnum.value.push(N(null,m.id));
for(const m of armor.aliases)for(const id of [m.id,m.presetType].filter(Boolean))if(!equipmentEnum.value.some(n=>n.value===id))equipmentEnum.value.push(N(null,id));
for(const m of aircraft.aliases)if(!equipmentEnum.value.some(n=>n.value===m.id))equipmentEnum.value.push(N(null,m.id));
write('common/script_enums.txt',R(enums));
// Restore Touhou research/model display assets without renaming native equipment or chassis.
const countryStyles={ALI:'magic',DES:'wakan',HAK:'magic',DLD:'demonforce',HEL:'demonforce',SSS:'wakan',OPP:'wakan',RAB:'wakan',TEM:'magic',BLQ:'wakan',KAP:'demonforce',TEN:'wakan',HUM:'wakan',VAM:'magic',MLS:'magic',EVI:'demonforce'};
for(const [file,s] of Object.entries(baseline.sources).filter(([f])=>f.startsWith('history/countries/'))) {
  const tag=path.basename(file).slice(0,3),match=s.match(/set_country_flag\s*=\s*touhou_country_flag_(magic|wakan|demonforce)_first_research/);if(match)countryStyles[tag]=match[1];
}
const prefixes={magic:'魔力人偶',wakan:'附灵',demonforce:'妖力'};
const loc=['\uFEFFl_simp_chinese:',' touhou_original_technology_values:0 "幻想乡原科技加成"',' evil_armor_equipment_0:0 "妖精装甲装备"',' evil_artillery_equipment_0:0 "妖精火炮装备"'];
// The installed engine's supported country design effect creates an owned design without
// adding a research unlock or changing the shared archetype. Empty changes inherit the
// original finished model's values/default modules; flags prevent repeated registrations.
const countryRegistrations=[],registrationEffects=[];
const cloneNames={evil_armor_equipment_0:'妖精装甲装备',evil_artillery_equipment_0:'妖精火炮装备'};
for(const [id,name] of Object.entries(cloneNames))localisation.set(id,name);
const registeredModelDefinitions=new Map(Object.entries(outputs).filter(([f])=>f.startsWith('common/units/equipment/')).flatMap(([,s])=>P(s)[0].value).map(n=>[n.key,n]));
for(const m of generatedModels.filter(m=>!m.armorChassis&&!m.airframe)){
  const model=registeredModelDefinitions.get(m.id);
  const flag='touhou_registered_model_'+m.id;
  const condition=C(model,'can_be_produced')[0].value.filter(n=>n.key!=='has_country_flag'||n.value!==flag);
  const name=cloneNames[m.id]||localisation.get(m.id);
  if(!name)throw Error('Missing original design name '+m.id);
  const design=[N('name',JSON.stringify(name)),N('type',m.id),N('allow_without_tech','yes'),N('parent_version','0'),N('icon','"GFX_'+m.id+'_medium"')];
  registrationEffects.push(N('if',[N('limit',[...condition,N('NOT',[N('has_country_flag',flag)])]),...(m.modularHull?[]:[N('create_equipment_variant',design)]),N('set_country_flag',flag)]));
  countryRegistrations.push({id:m.id,flag,style:m.style,modularHull:!!m.modularHull,condition,design:m.modularHull?null:design});
}
syncScript[0].value.splice(setup.length,0,N('touhou_register_country_equipment','yes'));
const registrationScript=N('touhou_register_country_equipment',[N('if',[N('limit',touhouLimit()),...registrationEffects])]);
write('common/scripted_effects/touhou_vanilla_military.txt','# Country-owned designs and original research deltas; native equipment unlock lists stay native.\n'+R([armor.effectScript,aircraft.effectScript,registrationScript,...syncScript]));
const decisionLoc={'touhou_research_type':'装备制造体系','touhou_research_type_desc':'科技研究采用通用体系。选择魔力、灵力或妖力制造体系，将决定可生产的幻想乡装备与原有科技加成。装备与原版兵种通用。'};
for(const [style,p] of Object.entries(prefixes))decisionLoc['touhou_research_type_change_to_'+style]='采用'+p+'装备体系';
const decisionsLocFile='localisation/simp_chinese/touhou/touhou_decisions_l_simp_chinese.yml';
let decisionsLoc=baseline.sources[decisionsLocFile];
for(const [key,value] of Object.entries(decisionLoc)){
  const pattern=new RegExp('^([ \\t]*)'+key+':\\d*\\s*"[\\s\\S]*?"[ \\t]*(?=\\r?$)','gm');
  if(!pattern.test(decisionsLoc))throw Error('Missing original decision localization '+key);
  decisionsLoc=decisionsLoc.replace(pattern,(_,indent)=>indent+key+':0 "'+value+'"');
}
write(decisionsLocFile,decisionsLoc);
const nativeEquipmentIds=new Set(vEq.keys());
for(const d of dup)if(S(d,'only_duplicate_archetype')!=='yes'){
  const a=S(d,'archetype');
  for(const n of vanillaEq.filter(n=>S(n,'archetype')===a&&n.key.startsWith(a)))nativeEquipmentIds.add(d.key+n.key.slice(a.length));
}
const presentation=require('./military_presentation.cjs').buildMilitaryPresentation({root,game,oldTech,models:[...generatedModels,...armor.originalModels.map(m=>({...m,presetDesign:true})),...aircraft.originalModels.map(m=>({...m,presetDesign:true}))],ordinaryTech,designerTech,tags,countryStyles,localisation,nativeEquipmentIds});
const newLocKeys=new Set(presentation.localisation.keys());
const mergedLoc=loc.filter(line=>!newLocKeys.has(line.match(/^ ([^:]+):/)?.[1]));
mergedLoc.push(...[...presentation.localisation].map(([key,value])=>' '+key+':0 "'+value+'"'));
mergedLoc.push(...[...equipmentTooltips].map(([key,t])=>' '+key+':0 "'+t.text+'"'));
mergedLoc.push(...[...moduleTooltips].map(([key,t])=>' '+key+':0 "'+t.text+'"'));
mergedLoc.push(...[...independentResearch.localisation].map(([key,t])=>' '+key+':0 '+JSON.stringify(t).replaceAll('\\\\n','\\n')));
write('localisation/simp_chinese/touhou_vanilla_military_l_simp_chinese.yml',mergedLoc.join('\n')+'\n');
write('interface/zz_touhou_military_presentation.gfx','# Native IDs with the original Touhou technology and equipment illustrations.\n'+R(presentation.graphics));
const equipmentRoleChanges={touhou_boss_army:{unit:'heavy_armor',reason:'Native super-heavy AA is a support company; boss front-line armor must use a native regimental armor unit.'}};
const armorManifest={originalModels:armor.originalModels,models:armor.models,replacements:armor.replacements,aliases:armor.aliases,presets:armor.presets,licenses:armor.licenses,modules:armor.modules,allocated:armor.allocated,isolation:armor.isolation};
const aircraftManifest={originalModels:aircraft.originalModels,models:aircraft.models,replacements:aircraft.replacements,aliases:aircraft.aliases,presets:aircraft.presets,licenses:aircraft.licenses,modules:aircraft.modules,isolation:aircraft.isolation};
const manifest={vanillaVersion:'1.19.3',original:{technologies:268,units:90,archetypes:61,models:143},models:generatedModels,armor:armorManifest,aircraft:aircraftManifest,moduleIcons:moduleArt.manifest,categoryIcons:categoryArt.records,units:unitMap,archetypes:archetypeMap,technologies:ordinaryTech,bonuses,equipmentRoleChanges,countryRegistrations,independentResearch:{...independentResearch.manifest,removedNativeTechnologyFiles},presentation:{...presentation.manifest,equipmentTooltips:Object.fromEntries(equipmentTooltips),moduleTooltips:Object.fromEntries(moduleTooltips)},deleted:[...deleted],outputs:Object.fromEntries(Object.entries(outputs).map(([f,s])=>[f,hash(s)]))};
write('docs/飞机模块化迁移清单.json',JSON.stringify(aircraftManifest,null,2)+'\n');
write('docs/装甲模块化迁移清单.json',JSON.stringify(armorManifest,null,2)+'\n');
write('docs/幻想乡军事原版化迁移清单.json',JSON.stringify(manifest,null,2)+'\n');
// Recover interrupted writes only when the current bytes equal this run's regenerated result.
// Unrelated manual edits still fail before any generated output is replaced.
for(const file of changedManagedOutputs){
 const target=path.resolve(root,file);
 const matchesNew=outputs[file]!==undefined&&fs.existsSync(target)&&hash(fs.readFileSync(target,'utf8'))===hash(outputs[file]);
 if(!matchesNew&&!(deleted.has(file)&&!fs.existsSync(target)))throw Error('Generated file was edited; preserve/reconcile it before rerunning: '+file);
}
for(const file of Object.keys(outputs))if(nativeTechnologyFiles.has(file))throw Error('Refusing to generate native technology override '+file);
for(const [file,s] of Object.entries(outputs)){
 const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('Unsafe target');fs.mkdirSync(path.dirname(target),{recursive:true});
 for(let attempt=0;;attempt++){try{fs.writeFileSync(target,s);break;}catch(error){if(attempt>=2||!['UNKNOWN','EBUSY','EPERM'].includes(error.code))throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,100);}}
}
for(const file of deleted){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('Unsafe deletion');if(fs.existsSync(target))fs.unlinkSync(target);}
console.log(JSON.stringify({written:Object.keys(outputs).length,removed:deleted.size,models:generatedModels.length,unitBonusTransitions:bonuses.length,countryModifiers:dynamic.length},null,2));
