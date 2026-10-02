// Optional equipment: a few economical staples, many narrow or inefficient alternatives.
// Native categories, research gates and mission rules remain the source of compatibility.
const h=require('./hoi4_script.cjs');
const {node:N,scalar:S,children:C,render:R}=h;
const styles=['magic','wakan','demonforce'],sizes=['small','medium','large'];
const styleNames={magic:'魔力',wakan:'灵力',demonforce:'妖力'};
const sizeNames={small:'小型',medium:'中型',large:'大型'};
const statsBlock=(key,values)=>N(key,Object.entries(values||{}).map(([k,v])=>N(k,String(v))));
// Compatibility index only; names, functions and stats are authored in touhou_module_concepts.cjs.
const tanks=[
 {
  "key": "radio_1",
  "source": "tank_radio_1",
  "role": "core",
  "tech": "radio"
 },
 {
  "key": "radio_2",
  "source": "tank_radio_2",
  "role": "core",
  "tech": "improved_radio"
 },
 {
  "key": "radio_3",
  "source": "tank_radio_3",
  "role": "core",
  "tech": "advanced_radio"
 },
 {
  "key": "smoke",
  "source": "smoke_launchers",
  "role": "core",
  "tech": null
 },
 {
  "key": "wet_storage",
  "source": "wet_ammo_storage",
  "role": "core",
  "tech": null
 },
 {
  "key": "maintenance",
  "source": "easy_maintenance",
  "role": "core",
  "tech": "tech_maintenance_company2",
  "xp": 20
 },
 {
  "key": "secondary_mg",
  "source": "secondary_turret_hmg",
  "role": "core",
  "tech": "infantry_weapons"
 },
 {
  "key": "secondary_cannon",
  "source": "secondary_turret_small_cannon",
  "role": "niche",
  "tech": "gw_artillery"
 },
 {
  "key": "secondary_howitzer",
  "source": "secondary_turret_small_cannon",
  "role": "niche",
  "tech": "interwar_artillery"
 },
 {
  "key": "secondary_lance",
  "source": "secondary_turret_small_cannon",
  "role": "niche",
  "tech": "interwar_antitank"
 },
 {
  "key": "secondary_aa",
  "source": "secondary_turret_hmg",
  "role": "niche",
  "tech": "interwar_antiair"
 },
 {
  "key": "secondary_flame",
  "source": "secondary_turret_small_cannon",
  "role": "niche",
  "tech": "tech_engineers"
 },
 {
  "key": "coax",
  "source": "additional_machine_guns",
  "role": "niche",
  "tech": "infantry_weapons"
 },
 {
  "key": "stabilizer",
  "source": "stabilizer",
  "role": "niche",
  "tech": "improved_computing_machine"
 },
 {
  "key": "sloped_shield",
  "source": "sloped_armor",
  "role": "niche",
  "tech": null,
  "xp": 8
 },
 {
  "key": "skirts",
  "source": "armor_skirts",
  "role": "niche",
  "tech": "armor_tech_2"
 },
 {
  "key": "extra_magazine",
  "source": "extra_ammo_storage",
  "role": "niche",
  "tech": null
 },
 {
  "key": "dozer",
  "source": "dozer_blade",
  "role": "niche",
  "tech": "tech_engineers2"
 },
 {
  "key": "fuel_drum",
  "source": "expanded_fuel_tank",
  "role": "niche",
  "tech": null
 },
 {
  "key": "toolbox",
  "source": "wet_ammo_storage",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "signal_flags",
  "source": "tank_radio_1",
  "role": "flavor",
  "tech": null,
  "category": "tank_special_module"
 },
 {
  "key": "ornamental_armor",
  "source": "armor_skirts",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "parade_lights",
  "source": "smoke_launchers",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "crew_comfort",
  "source": "wet_ammo_storage",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "spare_tracks",
  "source": "armor_skirts",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "emergency_battery",
  "source": "expanded_fuel_tank",
  "role": "niche",
  "tech": "engine_tech_1"
 },
 {
  "key": "cooling_fins",
  "source": "wet_ammo_storage",
  "role": "niche",
  "tech": null
 },
 {
  "key": "seals",
  "source": "wet_ammo_storage",
  "role": "flavor",
  "tech": null
 }
];

const airSized=[
 {
  "key": "shield",
  "source": "armor_plate",
  "role": "niche",
  "tech": "survivability_studies"
 },
 {
  "key": "sealed_cells",
  "source": "self_sealing_fuel_tanks",
  "role": "core",
  "tech": "survivability_studies"
 },
 {
  "key": "reserve_cells",
  "source": "fuel_tanks",
  "role": "niche",
  "tech": "range_improvements"
 },
 {
  "key": "wood_frame",
  "source": "non_strategic_materials",
  "role": "niche",
  "tech": "aircraft_construction"
 },
 {
  "key": "fairing",
  "source": "armor_plate",
  "role": "core",
  "tech": "aircraft_construction"
 },
 {
  "key": "thrust_assist",
  "source": "fuel_tanks",
  "role": "niche",
  "tech": "engines_3"
 },
 {
  "key": "cooling_flaps",
  "source": "armor_plate",
  "role": "niche",
  "tech": null
 },
 {
  "key": "ballast_cage",
  "source": "armor_plate",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "signal_lamp",
  "source": "armor_plate",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "comfort",
  "source": "armor_plate",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "ornament",
  "source": "armor_plate",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "satchel",
  "source": "fuel_tanks",
  "role": "flavor",
  "tech": null
 },
 {
  "key": "floats",
  "source": "floats",
  "role": "niche",
  "tech": null
 }
];

const airOther=[
 {
  "key": "aux_light",
  "source": "light_mg_2x",
  "role": "core",
  "tech": "aa_lmg"
 },
 {
  "key": "aux_heavy",
  "source": "heavy_mg_2x",
  "role": "niche",
  "tech": "aa_hmg"
 },
 {
  "key": "aux_cannon",
  "source": "aircraft_cannon_1_1x",
  "role": "niche",
  "tech": "aa_cannon_1"
 },
 {
  "key": "aux_scatter",
  "source": "light_mg_2x",
  "role": "flavor",
  "tech": "aa_lmg"
 },
 {
  "key": "aux_bombs",
  "source": "bomb_locks",
  "role": "niche",
  "tech": "early_bombs"
 },
 {
  "key": "aux_rockets",
  "source": "rocket_rails",
  "role": "niche",
  "tech": "rocket_artillery"
 },
 {
  "key": "aux_torpedo",
  "source": "torpedo_mounting",
  "role": "niche",
  "tech": "air_torpedoe_1"
 },
 {
  "key": "aux_camera",
  "source": "recon_camera",
  "role": "niche",
  "tech": "photo_reconnaisance"
 },
 {
  "key": "aux_mines",
  "source": "airdropped_mines",
  "role": "flavor",
  "tech": "airdrop_mines_bba"
 },
 {
  "key": "bomb_sight",
  "source": "bomb_sights_1",
  "role": "core",
  "tech": "mechanical_computing"
 },
 {
  "key": "navigation",
  "source": "radio_navigation_1",
  "role": "niche",
  "tech": "radio"
 },
 {
  "key": "intercept_eye",
  "source": "air_air_radar_1",
  "role": "niche",
  "tech": "centimetric_radar"
 },
 {
  "key": "maritime_eye",
  "source": "air_ground_radar_1",
  "role": "niche",
  "tech": "centimetric_radar"
 },
 {
  "key": "false_echo",
  "source": "air_air_radar_1",
  "role": "flavor",
  "tech": "centimetric_radar"
 },
 {
  "key": "tail_sentry",
  "source": "lmg_defense_turret",
  "role": "niche",
  "tech": "aa_lmg"
 },
 {
  "key": "paired_tail",
  "source": "lmg_defense_turret_2x",
  "role": "niche",
  "tech": "aa_hmg"
 },
 {
  "key": "blind_spot",
  "source": "lmg_defense_turret",
  "role": "flavor",
  "tech": "aa_lmg"
 }
];

function missionNodes(records=[]){return records.map(r=>N('mission_type_stats',[
 N('limit',r.missions.map(m=>N(null,m))),statsBlock('add_stats',r.values),
 ...(r.averages?[statsBlock('add_average_stats',r.averages)]:[])
]));}

exports.installOptionalDesignerModules=function({root,game,armor,aircraft,tags}){
 const nativeModules=new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
 const nativeTech=h.definitions(game,'common/technologies','technologies'),techIds=new Set(nativeTech.map(t=>t.key));
 const unlocks=pattern=>nativeTech.filter(t=>C(t,'enable_equipments').flatMap(n=>n.value).some(n=>pattern.test(n.value))).map(t=>t.key);
 const baseTech={armor:unlocks(/^(light|medium|heavy|super_heavy|modern)_tank_chassis(?:_\d+)?$/),aircraft:unlocks(/^(small|medium|large)_plane_airframe_\d+$/)};
 const foundationTech={armor:'gwtank_chassis',aircraft:null};
 for(const id of Object.values(foundationTech).filter(Boolean))if(!techIds.has(id))throw Error('Missing designer foundation research '+id);
 for(const kind of ['armor','aircraft']){
  const plan=kind==='armor'?armor:aircraft,dlc=kind==='armor'?'No Step Back':'By Blood Alone';
  if(!baseTech[kind].length)throw Error('No native chassis/airframe unlocks for '+kind);
  const modules=h.parse(plan.modulesScript),techs=h.parse(plan.technologyScript),licenseGroups=new Map();
  const list=kind==='armor'?tanks:[...airSized.flatMap(r=>sizes.map(size=>({...r,key:r.key+'_'+size,source:r.source==='floats'?(size==='small'?'floats':'flying_boat_'+size):r.source+'_'+size,size}))),...airOther];
  for(let si=0;si<styles.length;si++)for(const base of list){
   const style=styles[si],r=require('./touhou_module_concepts.cjs').specialize(base,style,kind),template=nativeModules.get(r.source);if(!template)throw Error('Missing optional module template '+r.source);
   if(r.tech&&!techIds.has(r.tech))throw Error('Missing optional module research '+r.tech);
   const id='touhou_'+(kind==='armor'?'tank':'air')+'_optional_'+style+'_'+r.key;
   const values={...r.values,...r.variants?.[style]},category=r.category||S(template,'category');
   const name=r.name+(r.size?'（'+sizeNames[r.size]+'）':'');
   const nativeGfx=S(template,'gfx')||r.source;
   // Only carry compatibility/role metadata; never inherit native stats or upgrade parents.
   const metadata=new Set(['sfx','gui_category','allow_equipment_type','add_equipment_type','allow_mission_type','forbid_equipment_type','forbid_equipment_type_exact_match_for_category','forbid_module_categories','allowed_module_categories']);
   const node=N(id,[N('category',category),N('gfx',nativeGfx),N('abbreviation','"TH"'),
    ...template.value.filter(n=>metadata.has(n.key)).map(n=>structuredClone(n)),statsBlock('add_stats',values),
    ...(r.multiply?[statsBlock('multiply_stats',r.multiply)]:[]),...(r.resources?[statsBlock('build_cost_resources',r.resources)]:[]),
    ...missionNodes(r.missionStats),N('xp_cost',String(r.xp||1)),N('dismantle_cost_ic',String(Math.max(.1,(values.build_cost_ic||0)*.25)))]);
   modules[0].value.push(node);plan.localisation.set(id,name);plan.localisation.set(id+'_short',name);plan.localisation.set(id+'_desc',r.description);
   const requiredTechnology=r.tech||foundationTech[kind];
   const requiredTechnologies=[...new Set([foundationTech[kind],requiredTechnology].filter(Boolean))];
   plan.modules.push({id,name,description:r.description,conceptKey:r.conceptKey,identity:r.identity,category,source:r.source,values,resources:r.resources||{},multiply:r.multiply||{},missionStats:r.missionStats||[],optional:true,style,size:r.size||null,role:r.role,requiredTechnology,foundationTechnology:foundationTech[kind],requiredTechnologies,researchAlternatives:baseTech[kind],calibrated:false,iconMode:'custom',nativeGfx});
   const groupKey=style+'_'+(r.tech||'base');if(!licenseGroups.has(groupKey))licenseGroups.set(groupKey,{style,tech:r.tech,modules:[]});licenseGroups.get(groupKey).modules.push(id);
  }
  const scope=N('OR',tags.map(t=>N('original_tag',t))),licenseEffects=[];
  for(const [key,g] of licenseGroups){
   const id='touhou_'+(kind==='armor'?'tank':'air')+'_optional_license_'+key;
   const requiredTechnologies=[...new Set([foundationTech[kind],g.tech||foundationTech[kind]].filter(Boolean))];
   const condition=[N('has_dlc',JSON.stringify(dlc)),structuredClone(scope),N('has_country_flag','touhou_country_flag_'+g.style+'_first_research'),N('OR',baseTech[kind].map(t=>N('has_tech',t))),...requiredTechnologies.map(t=>N('has_tech',t))];
   techs[0].value.push(N(id,[N('allow',[N('always','no')]),N('research_cost','0'),N('start_year','1936'),N('enable_equipment_modules',g.modules.map(m=>N(null,m)))]));
   plan.licenses.push({id,condition,equipment:[],modules:g.modules,optional:true,style:g.style,requiredTechnology:g.tech||foundationTech[kind],foundationTechnology:foundationTech[kind],requiredTechnologies,researchAlternatives:baseTech[kind]});
   plan.localisation.set(id,styleNames[g.style]+(kind==='armor'?'装甲':'航空')+'选装配件许可');
   plan.localisation.set(id+'_desc','由制造体系、原版底盘或机体研究及配件对应原版科技自动开放，无独立研究节点。');
   licenseEffects.push(N('if',[N('limit',[...structuredClone(condition),N('NOT',[N('has_tech',id)])]),N('set_technology',[N(id,'1'),N('popup','no')])]),N('else_if',[N('limit',[N('has_tech',id),N('NOT',[N('AND',structuredClone(condition))])]),N('set_technology',[N(id,'0'),N('popup','no')])]));
  }
  plan.modulesScript=R(modules);plan.technologyScript=R(techs);
  // Grant optional licenses before preset checks; existing preset assemblies are untouched.
  plan.effectScript.value[0].value.splice(1,0,...licenseEffects);
 }
 return {armor:armor.modules.filter(m=>m.optional),aircraft:aircraft.modules.filter(m=>m.optional)};
};

exports.optionalModuleDirectory=function(catalog){
 const labels={build_cost_ic:'造价',maximum_speed:'速度',reliability:'可靠性',soft_attack:'软攻',hard_attack:'硬攻',ap_attack:'穿甲',air_attack:'对空攻击',armor_value:'装甲',defense:'防御',breakthrough:'突破',fuel_consumption:'燃耗',fuel_capacity:'载油量',entrenchment:'堑壕',air_defence:'空防',air_range:'航程',air_agility:'空中机动',thrust:'推力',weight:'重量',night_penalty:'夜间惩罚',air_bombing:'战略轰炸',air_ground_attack:'对地攻击',surface_detection:'水面探测',sub_detection:'潜艇探测',naval_strike_attack:'对海攻击',naval_strike_targetting:'对海命中',mines_planting:'布雷效率'};
 const roles={core:'较实用的取舍',niche:'窄用途/低效率',flavor:'低收益风味件'};
 const show=(values,percent=false)=>Object.entries(values).map(([k,v])=>(labels[k]||k)+' '+(v>=0?'+':'')+(percent?Number((v*100).toFixed(4))+'%':v)).join('；')||'无';
 const lines=['特殊配件与副武器目录','====================','2026-10-02；幻想乡独立功能设计，原版仅提供槽位与任务接口。','魔力：人偶协同与魔力过载；灵力：结界守护与符阵引导；妖力：活体异变与狂猎火力。','三系对应位置的配件均有不同性能取舍。定位是设计意图，不是实战强度排名。','所有新增项均为自行选装，不进入既有预设。','数值为模块增量；百分比为 multiply_stats，最终数值还受整机与游戏修正影响。','174 张原创透明图标对应 252 个选装件；同概念的航空三种尺寸共用图案。',''];
 for(const kind of ['armor','aircraft']){
  lines.push((kind==='armor'?'装甲':'航空')+'：'+catalog[kind].length+' 个新增配件','');
  for(const m of catalog[kind]){
   lines.push(m.name+' ['+m.id+']','  制造体系：'+styleNames[m.style]+'；定位：'+roles[m.role]+'；类别：'+m.category,
    '  功能主题：'+m.identity,'  原版槽位接口来源：'+m.source+'；必需科研：'+(m.requiredTechnologies.join(' + ')||'对应机体开发')+'（另需底盘/机体与本国制造体系）',
    '  固定增量：'+show(m.values),'  比例增量：'+show(m.multiply,true));
   if(Object.keys(m.resources).length)lines.push('  额外资源：'+show(m.resources));
   for(const effect of m.missionStats)lines.push('  仅任务 '+effect.missions.join('/')+'：'+show(effect.values)+(effect.averages?'；平均属性 '+show(effect.averages):''));
   lines.push('  '+m.description,'');
  }
 }
 return lines.join('\n')+'\n';
};
