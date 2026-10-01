// Reproducible migration from the saved, unmodified Touhou military definitions.
// Fixed models keep their numerical values. Vanilla chassis/airframe designers remain available.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const h=require('./hoi4_script.cjs'),{node:N,scalar:S,children:C,render:R,parse:P}=h;
const root=path.resolve(__dirname,'..'),game=process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const baselinePath=path.join(root,'tools/military_migration_baseline.json');
const relative=f=>path.relative(root,f).replaceAll('\\','/');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const previousManifest=path.join(root,'docs/幻想乡军事原版化迁移清单.json');
if(fs.existsSync(previousManifest)){
  const previous=JSON.parse(fs.readFileSync(previousManifest,'utf8'));
  for(const [f,expected] of Object.entries(previous.outputs)){
    const target=path.join(root,f);
    if(!fs.existsSync(target)||hash(fs.readFileSync(target,'utf8'))!==expected)throw Error('Generated file was edited; preserve/reconcile it before rerunning: '+f);
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
write('common/technology_tags/touhou_technology.txt',wrap('technology_categories',['magic','wakan','demonforce','goliath','mio_cat_tech_touhou_aircraft'].map(x=>N(null,x))));
// Preserve research-bonus categories without attaching custom models to native unlock lists.
const additions=new Map();
for(const m of generatedModels.filter(m=>m.style!=='trump')) {
  const legacy=ordinaryTech[m.unlock];
  for(const id of new Set([legacy,designerTech(legacy)])){if(!additions.has(id))additions.set(id,[]);additions.get(id).push(m.id);}
}
const techFiles=new Map();
for(const [id,ids] of additions) {
  const t=vTech.get(id),file=path.relative(game,t.file).replaceAll('\\','/');
  if(!techFiles.has(file))techFiles.set(file,P(fs.readFileSync(t.file,'utf8')));
  const tech=techFiles.get(file).find(n=>n.key==='technologies').value.find(n=>n.key===id);
  let categories=C(tech,'categories')[0];if(!categories){categories=N('categories',[]);tech.value.push(categories);}
  // Existing focuses/MIO research bonuses remain useful on the shared research tree.
  const flavor=[...new Set(ids.map(x=>group(x)).filter(x=>x!=='support'))];
  for(const c of flavor)if(!categories.value.some(n=>n.value===c))categories.value.push(N(null,c));
  if(ids.some(id=>generatedModels.find(m=>m.id===id)?.archetype.includes('airframe'))&&!categories.value.some(n=>n.value==='mio_cat_tech_touhou_aircraft'))categories.value.push(N(null,'mio_cat_tech_touhou_aircraft'));
}
// Lotus uses its original preset modules when its national design is registered.
// Native carrier research does not globally unlock Touhou modules either.
// Preserve the research-bonus categories on improvements as well as model unlocks.
// Goliath's former research stages now use native heavy/super-heavy chassis research.
const categorySources=[...oldTech.filter(t=>group(t.key)!=='trump').map(t=>({ids:[ordinaryTech[t.key],designerTech(ordinaryTech[t.key])],categories:C(t,'categories').flatMap(n=>n.value).map(n=>n.value).filter(c=>['magic','wakan','demonforce','mio_cat_tech_touhou_aircraft'].includes(c))})),
  ...['basic_heavy_tank','improved_heavy_tank','advanced_heavy_tank','super_heavy_tank'].map(id=>({ids:[id,designerTech(id)],categories:['magic','goliath']}))];
for(const source of categorySources)for(const id of new Set(source.ids)){
  const t=vTech.get(id),file=path.relative(game,t.file).replaceAll('\\','/');
  if(!techFiles.has(file))techFiles.set(file,P(fs.readFileSync(t.file,'utf8')));
  const tech=techFiles.get(file).find(n=>n.key==='technologies').value.find(n=>n.key===id);
  let categories=C(tech,'categories')[0];if(!categories){categories=N('categories',[]);tech.value.push(categories);}
  for(const c of source.categories)if(!categories.value.some(n=>n.value===c))categories.value.push(N(null,c));
}
// Synchronize immediately after research while retaining the original completion limits
// around vanilla's existing template/equipment effects.
const equipmentTooltips=new Map();
for(const id of new Set(Object.values(ordinaryTech).flatMap(id=>[id,designerTech(id)]))){
  const t=vTech.get(id),file=path.relative(game,t.file).replaceAll('\\','/');
  if(!techFiles.has(file))techFiles.set(file,P(fs.readFileSync(t.file,'utf8')));
  const tech=techFiles.get(file).find(n=>n.key==='technologies').value.find(n=>n.key===id);
  const originalEffect=C(tech,'on_research_complete')[0],originalLimit=C(tech,'on_research_complete_limit')[0];
  const effects=originalEffect?(originalLimit?[N('if',[N('limit',originalLimit.value),...originalEffect.value])]:originalEffect.value):[];
  tech.value=tech.value.filter(n=>!['on_research_complete','on_research_complete_limit'].includes(n.key));
  const displayEffects=[];
  for(const style of ['magic','wakan','demonforce','support']){
    const matching=generatedModels.filter(m=>m.style===style&&[ordinaryTech[m.unlock],designerTech(ordinaryTech[m.unlock])].includes(id));
    if(!matching.length)continue;
    const key='touhou_model_unlock_'+style+'_'+id;
    equipmentTooltips.set(key,{technology:id,style,models:matching.map(m=>m.id),text:'幻想乡装备型号：'+matching.map(m=>'§Y$'+m.id+'$§!').join('、')});
    displayEffects.push(N('if',[N('limit',styleLimit(style)),N('custom_effect_tooltip',key)]));
  }
  tech.value.push(N('on_research_complete',[...effects,...displayEffects,N('if',[N('limit',touhouLimit()),N('hidden_effect',[N('touhou_sync_vanilla_military','yes')])])]));
}
for(const [file,nodes] of techFiles)write(file,'# Vanilla 1.19.3 equipment/module unlock lists; national Touhou research synchronization.\n'+R(nodes));
// Native 1.19 country effect: apply only the delta from vanilla research, once per country.
// Daily and immediate synchronization also handles switching the production tradition.
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
const syncScript=[N('touhou_sync_vanilla_military',[...setup,...sync])];
write('common/scripted_effects/touhou_vanilla_military.txt','# Research deltas preserve the old technology effects without double counting vanilla bonuses.\n'+R(syncScript));
write('common/dynamic_modifiers/touhou_vanilla_military.txt',R(dynamic));
write('common/on_actions/touhou_vanilla_military.txt',wrap('on_actions',['on_startup','on_daily'].map(event=>N(event,[N('effect',[N('every_country',[N('limit',touhouLimit()),N('touhou_sync_vanilla_military','yes')])])]))));
// Replace references in history, focuses, decisions, ideas, MIOs, AI and template scripts.
// Independent conditions work in both country-history and normal effect scopes.
// Country history interprets a sibling else as an unknown history command.
const grantTech=id=>[N('if',[N('limit',[N('has_dlc','"'+dlcFor(id)+'"')]),N('set_technology',[N(designerTech(id),'1')])]),N('if',[N('limit',[N('NOT',[N('has_dlc','"'+dlcFor(id)+'"')])]),N('set_technology',[N(id,'1')])])];
function projectGrant(id) {
  const out=[N('set_country_flag',projectFlag(id.startsWith('goliath_')?'goliath_0':id))];
  const required={goliath_1:'basic_heavy_tank',goliath_2:'improved_heavy_tank',goliath_3:'advanced_heavy_tank',goliath_4:'super_heavy_tank',oni_champion:'basic_heavy_tank',tengu_fighter:'early_fighter',cas_boli_fighter:'CAS1',desires_bomber:'strategic_bomber1',evil_army:'infantry_weapons',human_army:'infantry_weapons',DLD_animal:'infantry_weapons',dragon:'tech_mountaineers',die:'motorised_infantry',rabbit_team:'tech_engineers',deep_sea:'basic_ship_hull_submarine',soul:'tech_logistics_company',wunv:'tech_field_hospital',lotus:'basic_ship_hull_carrier',magician:'gw_artillery'};
  if(required[id])out.push(...(dlcFor(required[id])?grantTech(required[id]):[N('set_technology',[N(required[id],'1')])]));
  if(id==='goliath_1')out.push(N('load_oob','"unlock_goliath"'));
  // Project completion grants availability only within the completing country's scope.
  out.push(N('touhou_sync_vanilla_military','yes'));
  return out;
}
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
      for(const m of models.filter(m=>S(m,'archetype')===n.key))out.push(N(m.key,transform(n.value,'model_bonus')));
      continue;
    }
    if(n.key&&unitMap[n.key])n.key=unitMap[n.key];
    else if(n.key&&ordinaryTech[n.key])n.key=ordinaryTech[n.key];
    else if(n.key&&archetypeMap[n.key])n.key=archetypeMap[n.key];
    if(n.key)for(const [old,id] of Object.entries(unitMap))n.key=n.key.replace('army_sub_unit_'+old+'_','army_sub_unit_'+id+'_');
    if(Array.isArray(n.value))n.value=transform(n.value,n.key||parent);
    else if(unitMap[n.value])n.value=unitMap[n.value];
    else if(archetypeMap[n.value])n.value=archetypeMap[n.value];
    else if(ordinaryTech[n.value])n.value=ordinaryTech[n.value];
    else if(typeof n.value==='string'&&n.value.startsWith('"')){
      const id=n.value.slice(1,-1);
      if(unitMap[id])n.value='"'+unitMap[id]+'"';
      else if(archetypeMap[id])n.value='"'+archetypeMap[id]+'"';
    }
    // Archetype/category lists often merge several former cultures into the same native type.
    // Avoid duplicate items in set-like lists, while retaining repeated battalions/effects.
    if(n.key===null&&typeof n.value==='string'&&['division_types','equipment_type','script_enum_equipment','script_enum_equipment_type'].includes(parent)&&out.some(x=>x.key===null&&x.value===n.value))continue;
    out.push(n);
  }
  return out;
}
const techIds=new Set([...Object.keys(ordinaryTech),...cardTech.keys()]),oldIds=new Set([...Object.keys(unitMap),...Object.keys(archetypeMap),...techIds]);
const mentions=s=>[...s.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[^\s{}=<>!#"]+/g)].some(m=>{
  if(m[0].startsWith('#'))return false;const token=m[0].replace(/^"|"$/g,'');
  return oldIds.has(token)||Object.keys(unitMap).some(id=>token.includes('army_sub_unit_'+id+'_'));
});
for(const [file,s] of Object.entries(baseline.sources)) {
  if(!file.endsWith('.txt')||deleted.has(file)||outputs[file]||file.startsWith('interface/')||file.startsWith('common/technology_tags/'))continue;
  if(!mentions(s)&&file!=='common/decisions/touhou_switch.txt')continue;
  const nodes=transform(P(s));
  if(file==='common/script_enums.txt'){
    const list=nodes.find(n=>n.key==='script_enum_equipment_bonus_type')||nodes.find(n=>n.key==='script_enum_equipment_type');
    if(list)for(const id of ['evil_armor_equipment_0','evil_artillery_equipment_0'])list.value.push(N(null,id));
  }
  if(file==='common/decisions/touhou_switch.txt')for(const category of nodes)if(Array.isArray(category.value))for(const d of category.value)if(d.key?.startsWith('touhou_research_type_change_to_'))for(const effect of C(d,'complete_effect'))effect.value.push(N('touhou_sync_vanilla_military','yes'));
  if(file==='common/decisions/touhou_country_only.txt')for(const category of nodes)if(Array.isArray(category.value))for(const d of category.value)if(d.key==='touhou_mission_doll_production_line')d.value=d.value.filter(n=>n.key!=='modifier');
  // Initialize national designs after this country's original technology/style/project setup.
  if(file.startsWith('history/countries/')&&tags.includes(path.basename(file).slice(0,3)))nodes.push(N('touhou_sync_vanilla_military','yes'));
  write(file,R(nodes));
}
// Extend the current game's script enums instead of carrying an outdated full override.
const enums=P(fs.readFileSync(path.join(game,'common/script_enums.txt'),'utf8'));
const equipmentEnum=enums.find(n=>n.key==='script_enum_equipment_bonus_type');
if(!equipmentEnum)throw Error('Vanilla equipment bonus enum missing');
for(const m of generatedModels)if(!equipmentEnum.value.some(n=>n.value===m.id))equipmentEnum.value.push(N(null,m.id));
write('common/script_enums.txt',R(enums));
// Restore Touhou research/model display assets without renaming native equipment or chassis.
const localisation=new Map();
for(const f of h.files(path.join(root,'localisation/simp_chinese')).filter(f=>f.endsWith('.yml')))for(const line of fs.readFileSync(f,'utf8').split(/\r?\n/)) {
  const m=line.match(/^\s*([^\s:#]+):\s*\d*\s*"(.*)"/);if(m)localisation.set(m[1],m[2]);
}
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
for(const m of generatedModels){
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
write('common/scripted_effects/touhou_vanilla_military.txt','# Country-owned designs and original research deltas; native equipment unlock lists stay native.\n'+R([registrationScript,...syncScript]));
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
const presentation=require('./military_presentation.cjs').buildMilitaryPresentation({root,game,oldTech,models:generatedModels,ordinaryTech,designerTech,tags,countryStyles,localisation,nativeEquipmentIds});
const newLocKeys=new Set(presentation.localisation.keys());
const mergedLoc=loc.filter(line=>!newLocKeys.has(line.match(/^ ([^:]+):/)?.[1]));
mergedLoc.push(...[...presentation.localisation].map(([key,value])=>' '+key+':0 "'+value+'"'));
mergedLoc.push(...[...equipmentTooltips].map(([key,t])=>' '+key+':0 "'+t.text+'"'));
write('localisation/simp_chinese/touhou_vanilla_military_l_simp_chinese.yml',mergedLoc.join('\n')+'\n');
write('interface/zz_touhou_military_presentation.gfx','# Native IDs with the original Touhou technology and equipment illustrations.\n'+R(presentation.graphics));
const equipmentRoleChanges={touhou_boss_army:{unit:'heavy_armor',reason:'Native super-heavy AA is a support company; boss front-line armor must use a native regimental armor unit.'}};
const manifest={vanillaVersion:'1.19.3',original:{technologies:268,units:90,archetypes:61,models:143},models:generatedModels,units:unitMap,archetypes:archetypeMap,technologies:ordinaryTech,bonuses,equipmentRoleChanges,countryRegistrations,presentation:{...presentation.manifest,equipmentTooltips:Object.fromEntries(equipmentTooltips)},deleted:[...deleted],outputs:Object.fromEntries(Object.entries(outputs).map(([f,s])=>[f,hash(s)]))};
write('docs/幻想乡军事原版化迁移清单.json',JSON.stringify(manifest,null,2)+'\n');
for(const [file,s] of Object.entries(outputs)){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('Unsafe target');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,s);}
for(const file of deleted){const target=path.resolve(root,file);if(!target.startsWith(root+path.sep))throw Error('Unsafe deletion');if(fs.existsSync(target))fs.unlinkSync(target);}
console.log(JSON.stringify({written:Object.keys(outputs).length,removed:deleted.size,models:generatedModels.length,unitBonusTransitions:bonuses.length,countryModifiers:dynamic.length},null,2));
