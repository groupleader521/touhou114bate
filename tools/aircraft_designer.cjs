// Native aircraft archetypes, calibrated Touhou parts and country-owned editable designs.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {node:N,scalar:S,children:C,render:R}=h;
const round=x=>Number(x.toFixed(8)),num=x=>String(round(x));
const stats=n=>Object.fromEntries(n.value.filter(x=>x.key&&typeof x.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x.value)).map(x=>[x.key,Number(x.value)]));
exports.planAircraftDesigner=function({root,game,models,fixedDefinitions,vanillaEq,duplicates,localisation,tags,ordinaryTech,designerTech}){
  const original=models.filter(m=>m.archetype.includes('airframe')),fixed=new Map(fixedDefinitions.map(n=>[n.key,n]));
  const nativeModules=new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
  const effective=n=>({...((S(n,'archetype')&&vanillaEq.has(S(n,'archetype')))?effective(vanillaEq.get(S(n,'archetype'))):{}),...stats(n)});
  const slots=n=>{const own=C(n,'module_slots')[0];return own&&Array.isArray(own.value)?own:slots(vanillaEq.get(S(n,'archetype')));};
  const frames=[],frameNodes=[],moduleNodes=[],moduleRecords=[],licenses=[],licenseNodes=[],licenseEffects=[],presets=[],effects=[],aliases=[],replacements={},loc=new Map(),blueprints=[];
  const putLoc=(id,name,desc)=>{loc.set(id,name);loc.set(id+'_short',name);if(desc)loc.set(id+'_desc',desc);};
  const templates=new Map(h.parse(fs.readFileSync(path.join(game,'interface/equipmentdesigner/planes/plane_blueprints_generic.gui'),'utf8'))[0].value.map(n=>[S(n,'name')?.replace(/^"|"$/g,''),n]));
  function blueprint(type,source,fallback){const t=templates.get('equipment_designer_'+source)||templates.get('equipment_designer_'+fallback);if(!t)throw Error('Missing native aircraft designer blueprint '+source);const n=structuredClone(t);C(n,'name')[0].value='"equipment_designer_'+type+'"';blueprints.push(n);}
  function module(id,name,source,values,desc,resources={},extra=[]){
    const template=nativeModules.get(source);if(!template)throw Error('Missing aircraft module '+source);
    const n=N(id,[N('category',S(template,'category')),N('gfx',source),N('abbreviation','"TH"'),...template.value.filter(x=>x.key==='sfx').map(x=>structuredClone(x)),
      N('add_stats',Object.entries(values).filter(([,v])=>Math.abs(v)>1e-10).map(([k,v])=>N(k,num(v)))),
      ...(Object.values(resources).some(v=>v)?[N('build_cost_resources',Object.entries(resources).filter(([,v])=>v).map(([k,v])=>N(k,num(v))))]:[]),N('xp_cost','1'),N('dismantle_cost_ic',num(Math.max(.1,(values.build_cost_ic||0)*.25))),...extra]);
    moduleNodes.push(n);putLoc(id,name,desc);moduleRecords.push({id,name,source,category:S(template,'category'),values,resources});return id;
  }
  const sizeOf=m=>m.archetype.split('_')[0];
  const roleOf=m=>m.archetype.includes('_suicide_')?'suicide':m.archetype.includes('_cas_')?'cas':m.archetype.includes('_fighter_')?'heavy_fighter':sizeOf(m)==='large'?'strategic_bomber':sizeOf(m)==='medium'?'tactical_bomber':'fighter';
  const nativeFrameFor=m=>{
    const size=sizeOf(m);if(m.style==='trump')return size+'_plane_airframe_'+(size==='large'?1:0);
    const id=designerTech(ordinaryTech[m.unlock]),prefix=id.split('_')[0];
    const tier=({iw:0,basic:1,improved:2,advanced:3,modern:4,supersonic:5})[prefix];if(tier===undefined)throw Error('Unknown native aircraft tier '+m.id);
    return size+'_plane_airframe_'+tier;
  };
  const groups=new Map();for(const m of original){const key=m.style==='trump'?m.id:m.style+'_'+nativeFrameFor(m);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  const omitted=new Set(['year','priority','visual_level','air_map_icon_frame','interface_overview_category_index','lend_lease_cost','manpower','air_superiority']);
  for(const [key,group] of groups){
    const main=group.find(m=>!m.archetype.includes('_cas_'))||group[0],old=fixed.get(main.id),expected=effective(old),size=sizeOf(main),a=size+'_plane_airframe',source=nativeFrameFor(main),native=vanillaEq.get(source);
    if(!native)throw Error('Missing native frame '+source);
    const suffix=key.replace(/_plane_airframe_/,'_'),type=a+'_touhou_'+suffix,lic='touhou_air_license_'+suffix;
    const members=group.map(m=>effective(fixed.get(m.id))),minimum=k=>Math.min(...members.map(v=>v[k]||0));
    for(const k of ['lend_lease_cost','manpower'])if(members.some(v=>v[k]!==expected[k]))throw Error('Incompatible shared aircraft metadata '+key+' '+k);
    const min=Object.fromEntries(['maximum_speed','air_agility','air_defence','air_range','reliability','build_cost_ic','fuel_consumption'].map(k=>[k,minimum(k)]));
    const tier=Number(source.split('_').at(-1)),jet=tier>=4,engineSource=jet?({small:'jet_engine_1x',medium:'jet_engine_2x',large:'jet_engine_4x'})[size]:'engine_'+Math.max(1,tier+1)+'_'+({small:'1x',medium:'2x',large:'4x'})[size];
    const thrust=Number(S(C(nativeModules.get(engineSource),'add_stats')[0],'thrust'));
    const body={...expected};for(const k of omitted)delete body[k];
    Object.assign(body,{maximum_speed:min.maximum_speed*.4,air_agility:min.air_agility*.5,air_defence:min.air_defence*.35,air_range:min.air_range*.4,reliability:min.reliability*.5,build_cost_ic:min.build_cost_ic*.3,fuel_consumption:0,weight:thrust*.4,thrust:0,
      air_attack:0,air_ground_attack:0,air_bombing:0,naval_strike_attack:0,naval_strike_targetting:0,surface_detection:0,sub_detection:0});
    const resources=Object.fromEntries(C(old,'resources')[0].value.map(x=>[x.key,Math.floor(Math.min(...group.map(m=>Number(S(C(fixed.get(m.id),'resources')[0],x.key)||0)))*.3)]));
    const condition=[N('has_dlc','"By Blood Alone"'),...C(old,'can_be_produced')[0].value.filter(n=>!(n.key==='has_country_flag'&&n.value==='touhou_registered_model_'+main.id))];
    const name=localisation.get(main.id),prefix=main.style==='magic'?'魔力':main.style==='wakan'?'灵力':main.style==='demonforce'?'妖力':main.id.startsWith('suicide')?'自爆人偶':main.id.startsWith('tengu')?'天狗':main.id.startsWith('cas_boli')?'博丽':'欲望';
    const systemNames=({magic:['御空魔力核','附魔护罩','魔力储能组件'],wakan:['御风推进符阵','护身符阵','灵力导引阵列'],demonforce:['妖翼推进组件','妖羽护甲','妖力续航器官']})[main.style]||[prefix+'推进组件',prefix+'防护组件',prefix+'续航组件'];
    const desc='原版'+({small:'小型',medium:'中型',large:'大型'})[size]+'机体原型下的'+prefix+'泛型机体。可组合对应尺寸的原版与幻想乡模块。';
    const fields=[N('archetype',a),N('year',S(old,'year')),N('priority',S(old,'priority')||'5'),N('picture',type),N('variant_name',type+'_design'),N('derived_variant_name',type+'_design'),N('is_convertable','yes'),N('active','yes'),N('is_buildable','yes'),N('upgrades',[]),
      structuredClone(slots(native)),N('default_modules',slots(native).value.map(n=>N(n.key,'empty'))),
      ...['lend_lease_cost','manpower','air_superiority'].map(k=>N(k,num(expected[k]||0))),
      ...Object.entries(body).map(([k,v])=>N(k,num(v))),N('resources',Object.entries(resources).filter(([,v])=>v).map(([k,v])=>N(k,num(v)))),N('can_be_produced',[N('has_tech',lic),...condition])];
    for(const k of ['one_use_only','can_license'])if(S(old,k)!==undefined)fields.push(N(k,S(old,k)));
    if(S(old,'one_use_only')==='yes')fields.push(N('forbid_mission_type','training'));
    frameNodes.push(N(type,fields));putLoc(type,name+'机体',desc);putLoc(type+'_design',name,desc);blueprint(type,source);
    frames.push({id:type,archetype:a,oldArchetype:main.oldArchetype,style:main.style,unlock:main.unlock,airframe:true,license:lic,sourceModel:main.id,nativeFrame:source});
    const types=[type];for(const d of duplicates.filter(d=>S(d,'archetype')===a&&S(d,'only_duplicate_archetype')!=='yes')){
      const id=d.key+type.slice(a.length),nativeRole=d.key+source.slice(a.length),roleStats={};
      for(const change of C(d,'for_each').flatMap(n=>n.value))if(S(change,'set')!==undefined)roleStats[change.key]=Number(S(change,'set'));
      aliases.push({id,archetype:d.key,base:type,roleStats});types.push(id);putLoc(id,name+'衍生机体',desc);putLoc(id+'_design',name+'衍生型',desc);blueprint(id,nativeRole,source);
    }
    const parts={
      engine_type_slot:module('touhou_air_'+suffix+'_engine',name+'·'+systemNames[0],engineSource,{maximum_speed:min.maximum_speed*.6,air_agility:min.air_agility*.25,fuel_consumption:min.fuel_consumption,build_cost_ic:min.build_cost_ic*.25,thrust},'飞行附魔、御风推进或妖翼动力。性能由原型号的公共速度、机动、能耗与成本拆分；推力采用对应原版发动机的基准。'),
      special_type_slot_1:module('touhou_air_'+suffix+'_protection',name+'·'+systemNames[1],'armor_plate_'+size,{air_defence:min.air_defence*.65,reliability:min.reliability*.5,build_cost_ic:min.build_cost_ic*.15,weight:thrust*.25},'附魔护罩、护身符阵或妖羽护甲；承担公共防护与稳定性。'),
      special_type_slot_2:module('touhou_air_'+suffix+'_range',name+'·'+systemNames[2],'fuel_tanks_'+size,{air_range:min.air_range*.6,air_agility:min.air_agility*.25,build_cost_ic:min.build_cost_ic*.1,weight:thrust*.1},'魔力储能、灵力导引或妖力续航；承担公共航程和操控。')
    };
    const common={...body,...Object.fromEntries(['lend_lease_cost','manpower','air_superiority'].map(k=>[k,expected[k]||0]))};
    for(const id of Object.values(parts))for(const [k,v] of Object.entries(moduleRecords.find(m=>m.id===id).values))common[k]=round((common[k]||0)+v);
    const moduleIds=Object.values(parts);
    for(const m of group){
      const role=roleOf(m),target=m.archetype===a?type:m.archetype+type.slice(a.length),copy=aliases.find(x=>x.id===target),want=effective(fixed.get(m.id)),base={...common,...copy?.roleStats};
      const delta={};for(const k of new Set([...Object.keys(want),...Object.keys(base)]))if(!omitted.has(k)&&!['thrust','weight'].includes(k)){const v=round((want[k]||0)-(base[k]||0));if(v)delta[k]=v;}
      delta.weight=round(thrust*.25);
      if(Math.abs((base.air_superiority||0)-(want.air_superiority||0))>1e-8)throw Error('Aircraft role superiority mismatch '+m.id);
      const bill=Object.fromEntries(C(fixed.get(m.id),'resources')[0].value.map(x=>[x.key,Number(x.value)-(resources[x.key]||0)]));
      const sourceWeapon=({fighter:'light_mg_2x',heavy_fighter:'light_mg_2x',cas:'bomb_locks',tactical_bomber:'medium_bomb_bay',strategic_bomber:'large_bomb_bay',suicide:'fixed_explosive_charge'})[role];
      const roleMissions=C(nativeModules.get(sourceWeapon),'allow_mission_type').flatMap(n=>Array.isArray(n.value)?n.value.map(x=>x.value):[n.value]);
      const oldMissions=C(fixed.get(m.id),'allow_mission_type').flatMap(n=>Array.isArray(n.value)?n.value.map(x=>x.value):[n.value]).filter(v=>v!=='training');
      const missions=[...new Set([...roleMissions,...oldMissions])];
      const weaponName=role==='suicide'?'自爆人偶触发符咒':S(fixed.get(m.id),'one_use_only')==='yes'?'自爆人偶弹头':role==='fighter'?({magic:'弹幕投射术式',wakan:'御风切割阵列',demonforce:'妖羽撕裂武装'})[m.style]||'天狗羽扇弹幕':role==='cas'?(m.style==='wakan'?'雷击投射阵列':m.style==='demonforce'?'妖禽俯冲武装':'博丽驱魔支援阵'):role==='heavy_fighter'?'巨翼猎空武装':role==='tactical_bomber'?(m.style==='magic'?'爆裂轰击术式':'天火降击术式'):m.style==='magic'?'广域毁灭术式':'欲望能量轰击阵列';
      const weapon=module('touhou_air_weapon_'+m.id.replace(/^touhou_/,''),(localisation.get(m.id)||name)+'·'+weaponName,sourceWeapon,delta,'原型号的任务武器与安装架。攻击、探测及角色差额来自原成品；不叠加原版模板的任务数值修正。',bill,[N('add_equipment_type',role==='fighter'||role==='heavy_fighter'?[N(null,'fighter'),N(null,'heavy_fighter')]:role),N('allow_mission_type',missions.map(v=>N(null,v)))]);
      moduleIds.push(weapon);replacements[m.id]=target;
      const equipped=Object.fromEntries(slots(native).value.map(n=>[n.key,'empty']));Object.assign(equipped,parts,{fixed_main_weapon_slot:weapon});
      const flag='touhou_air_design_v1_'+m.id,design=[N('name',JSON.stringify(localisation.get(m.id))),N('type',target),N('allow_without_tech','yes'),N('parent_version','0'),N('icon','"GFX_'+m.id+'_medium"'),N('modules',Object.entries(equipped).map(([k,v])=>N(k,v))),N('upgrades',[])];
      effects.push(N('if',[N('limit',[N('has_tech',lic),N('NOT',[N('has_country_flag',flag)])]),N('create_equipment_variant',design),N('set_country_flag',flag)]));
      presets.push({id:m.id,oldModel:m.id,name:localisation.get(m.id),type:target,base:type,role,flag,modules:equipped,missions,expected:{...want,resources:Object.fromEntries(C(fixed.get(m.id),'resources')[0].value.map(x=>[x.key,Number(x.value)]))},design});
    }
    licenseNodes.push(N(lic,[N('allow',[N('always','no')]),N('research_cost','0'),N('start_year','1936'),N('enable_equipments',types.map(id=>N(null,id))),N('enable_equipment_modules',moduleIds.map(id=>N(null,id)))]));
    licenseEffects.push(N('if',[N('limit',[...condition,N('NOT',[N('has_tech',lic)])]),N('set_technology',[N(lic,'1'),N('popup','no')])]),N('else_if',[N('limit',[N('has_tech',lic),N('NOT',[N('AND',condition)])]),N('set_technology',[N(lic,'0'),N('popup','no')])]));
    licenses.push({id:lic,condition,equipment:types,modules:moduleIds});putLoc(lic,name+'航空配件许可','由本国制造体系、原版机体科技或特殊项目自动开放，没有独立研究节点。');
  }
  return {originalModels:original,models:frames,presets,aliases,replacements,licenses,modules:moduleRecords,localisation:loc,
    equipmentScript:R([N('equipments',frameNodes)]),modulesScript:R([N('equipment_modules',[N('limit',[N('has_dlc','"By Blood Alone"')]),...moduleNodes])]),technologyScript:R([N('technologies',licenseNodes)]),blueprintsScript:R([N('guiTypes',blueprints)]),
    effectScript:N('touhou_sync_aircraft_designer',[N('if',[N('limit',[N('OR',tags.map(t=>N('original_tag',t))),N('has_dlc','"By Blood Alone"')]),...licenseEffects,...effects])])};
};
