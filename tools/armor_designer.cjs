// Convert finished armor into native-archetype chassis, interchangeable parts and owned designs.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {node:N,scalar:S,children:C,render:R}=h;
const round=x=>Number(x.toFixed(8)),num=x=>String(round(x));
const stats=n=>Object.fromEntries(n.value.filter(x=>x.key&&typeof x.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(x.value)).map(x=>[x.key,Number(x.value)]));
exports.planArmorDesigner=function({root,game,models,fixedDefinitions,vanillaEq,duplicates,localisation,tags,techCondition,styleLimit}){
  const original=models.filter(m=>/tank.*chassis$/.test(m.archetype));
  const fixed=new Map(fixedDefinitions.map(n=>[n.key,n]));
  const effective=n=>({...((S(n,'archetype')&&vanillaEq.has(S(n,'archetype')))?effective(vanillaEq.get(S(n,'archetype'))):{}),...stats(n)});
  const nativeModules=new Map(h.definitions(game,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
  const moduleNodes=[],chassisNodes=[],licenseNodes=[],effects=[],licenseEffects=[],presets=[],chassis=[],licenses=[],moduleRecords=[];
  const loc=new Map(),replacements={},aliases=[],allocated=[],roleOverrides=[];
  const putLoc=(id,name,desc)=>{loc.set(id,name);loc.set(id+'_short',name);if(desc)loc.set(id+'_desc',desc);};
  const allCountry=()=>[N('OR',tags.map(t=>N('original_tag',t)))];
  function module(id,name,category,values,source,description,resources={}){
    const template=nativeModules.get(source);if(!template)throw Error('Missing native module template '+source);
    const keep=new Set(['sfx','allowed_module_categories','forbid_equipment_type','forbid_equipment_type_exact_match_for_category']);
    const definition=N(id,[N('category',category),N('gfx',source),N('abbreviation','"TH"'),...template.value.filter(x=>keep.has(x.key)).map(x=>structuredClone(x)),
      N('add_stats',Object.entries(values).filter(([,v])=>Math.abs(v)>1e-10).map(([k,v])=>N(k,num(v)))),N('xp_cost','1'),N('dismantle_cost_ic',num(Math.max(0.1,(values.build_cost_ic||0)*0.25)))]);
    if(Object.keys(resources).length)definition.value.push(N('build_cost_resources',Object.entries(resources).filter(([,v])=>v!==0).map(([k,v])=>N(k,num(v)))));
    moduleNodes.push(definition);putLoc(id,name,description);moduleRecords.push({id,name,category,source,values,resources,calibrated:true});return id;
  }
  function license(id,name,condition,equipment,moduleIds){
    // Chassis research must not bypass the foundational tank-development technology.
    if(moduleIds.length)condition=[...condition,N('has_tech','gwtank_chassis')];
    licenseNodes.push(N(id,[N('research_cost','0'),N('start_year','1936'),N('allow',[N('always','no')]),
      ...(equipment.length?[N('enable_equipments',equipment.map(x=>N(null,x)))]:[]),N('enable_equipment_modules',moduleIds.map(x=>N(null,x)))]));
    putLoc(id,name,'由国家脚本按原版科技与制造体系开放的装甲配件许可，无独立研究节点。');
    licenseEffects.push(N('if',[N('limit',[...condition,N('NOT',[N('has_tech',id)])]),N('set_technology',[N(id,'1'),N('popup','no')])]),
      N('else_if',[N('limit',[N('has_tech',id),N('NOT',[N('AND',condition)])]),N('set_technology',[N(id,'0'),N('popup','no')])]));
    licenses.push({id,condition,equipment,modules:moduleIds});
  }
  function preset({id,name,type,modules,condition,texture,oldModel,expected,flagVersion=1}){
    const flag='touhou_tank_design_v'+flagVersion+'_'+id;
    const slots={...modules};for(let i=1;i<=4;i++)slots['special_type_slot_'+i]??='empty';
    const design=[N('name',JSON.stringify(name)),N('type',type),N('allow_without_tech','yes'),N('parent_version','0'),N('icon',JSON.stringify(texture)),N('modules',Object.entries(slots).map(([k,v])=>N(k,v))),N('upgrades',[N('tank_nsb_engine_upgrade','0'),N('tank_nsb_armor_upgrade','0')])];
    effects.push(N('if',[N('limit',[...condition,N('NOT',[N('has_country_flag',flag)])]),N('create_equipment_variant',design),N('set_country_flag',flag)]));
    presets.push({id,name,type,modules:slots,condition,texture,flag,oldModel,expected,design});
  }
  const familyKey=m=>m.id.startsWith('touhou_')?m.id.replace(/_tank_(artillery_|destroyer_|aa_)?equipment_/,'_tank_equipment_'):m.id;
  const groups=new Map();for(const m of original){const key=familyKey(m);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);}
  const roleOf=m=>m.archetype.includes('_artillery_')?'artillery':m.archetype.includes('_destroyer_')?'destroyer':m.archetype.includes('_aa_')?'aa':'armor';
  const turretSource={light:'tank_light_three_man_tank_turret',medium:'tank_medium_three_man_tank_turret',heavy:'tank_heavy_three_man_tank_turret',super_heavy:'tank_super_heavy_four_man_tank_turret',modern:'tank_modern_tank_turret'};
  const weaponSource={armor:{light:'tank_small_cannon',medium:'tank_medium_cannon',heavy:'tank_heavy_cannon',super_heavy:'tank_super_heavy_cannon',modern:'tank_medium_cannon_2'},artillery:{light:'tank_close_support_gun',medium:'tank_medium_howitzer',heavy:'tank_heavy_howitzer',super_heavy:'tank_heavy_howitzer',modern:'tank_medium_howitzer_2'},destroyer:{light:'tank_high_velocity_cannon',medium:'tank_high_velocity_cannon_2',heavy:'tank_high_velocity_cannon_3',super_heavy:'tank_high_velocity_cannon_3',modern:'tank_high_velocity_cannon_3'},aa:{light:'tank_anti_air_cannon',medium:'tank_anti_air_cannon_2',heavy:'tank_anti_air_cannon_3',super_heavy:'tank_anti_air_cannon_3',modern:'tank_anti_air_cannon_3'}};
  for(const [key,group] of groups){
    const main=group.find(m=>roleOf(m)==='armor');if(!main)throw Error('Armor family has no base design '+key);
    const size=main.archetype.replace(/_tank_chassis$/,''),a=main.archetype;
    const suffix=main.id.replace(/^touhou_(magic|demonforce)_/, '$1_').replace(/_tank_equipment_/,'_').replace(/_equipment_/,'_');
    const type=a+'_touhou_'+suffix,base=fixed.get(main.id),resolved=effective(base),memberStats=group.map(m=>effective(fixed.get(m.id)));
    const minimum=k=>Math.min(...memberStats.map(s=>s[k]||0));
    const min=Object.fromEntries(['maximum_speed','reliability','armor_value','defense','breakthrough','build_cost_ic','fuel_consumption'].map(k=>[k,minimum(k)]));
    const baseStats={...resolved};for(const k of ['year','priority','visual_level','interface_overview_category_index','air_map_icon_frame'])delete baseStats[k];
    Object.assign(baseStats,{soft_attack:0,hard_attack:0,ap_attack:0,air_attack:0,maximum_speed:min.maximum_speed*.25,reliability:min.reliability*.4,armor_value:min.armor_value*.35,defense:min.defense*.25,breakthrough:min.breakthrough*.5,build_cost_ic:min.build_cost_ic*.35,fuel_consumption:0,hardness:.1});
    const resources=Object.fromEntries(C(base,'resources')[0].value.map(x=>[x.key,Math.floor(Math.min(...group.map(m=>Number(S(C(fixed.get(m.id),'resources')[0],x.key)||0)))*.35)]));
    const lic='touhou_tank_license_'+suffix;
    const oldCondition=C(base,'can_be_produced')[0].value.filter(n=>!(n.key==='has_country_flag'&&n.value==='touhou_registered_model_'+main.id));
    const condition=[N('has_dlc','"No Step Back"'),...oldCondition];
    const name=localisation.get(main.id)||'妖精装甲装备';
    const fields=[N('archetype',a),N('year',S(base,'year')),N('priority',S(base,'priority')||'2000'),N('visual_level',S(base,'visual_level')||'0'),
      N('module_slots','inherit'),N('active','no'),N('is_buildable','yes'),N('picture',type),N('derived_variant_name',type+'_design'),N('variant_name',type+'_design'),
      N('upgrades',[N(null,'tank_nsb_engine_upgrade'),N(null,'tank_nsb_armor_upgrade')]),
      ...Object.entries(baseStats).map(([k,v])=>N(k,num(v))),N('resources',Object.entries(resources).filter(([,v])=>v).map(([k,v])=>N(k,String(v)))),
      N('can_be_produced',[N('has_dlc','"No Step Back"'),...oldCondition,N('has_tech',lic)])];
    chassisNodes.push(N(type,fields));
    const desc='通用'+({light:'轻型',medium:'中型',heavy:'重型',super_heavy:'超重型',modern:'现代'}[size])+'坦克原型下的幻想乡底盘。选择动力、悬挂、护甲、操控和主武器后形成可编辑的坦克设计。';
    putLoc(type,name+'底盘',desc);putLoc(type+'_design',name,desc);
    const body={id:type,oldArchetype:main.oldArchetype,archetype:a,unlock:main.unlock,style:main.style,armorChassis:true,license:lic,sourceModel:main.id};chassis.push(body);
    const nativeCopies=duplicates.filter(d=>S(d,'archetype')===a&&S(d,'only_duplicate_archetype')!=='yes');
    const types=[type];for(const d of nativeCopies){const id=d.key+type.slice(a.length);types.push(id);const hardnessBlock=C(C(d,'for_each')[0],'hardness')[0];const hardness=hardnessBlock?Number(S(hardnessBlock,'set')):baseStats.hardness;aliases.push({id,archetype:d.key,base:type,hardness});putLoc(id,name+({aa:'防空',artillery:'火炮',destroyer:'歼击',amphibious:'两栖',flame:'喷火'}[d.key.replace(a.replace('_chassis',''),'').replace(/^_|_chassis$/g,'')]||'衍生')+'底盘',desc);putLoc(id.replace('chassis','equipment'),name+'衍生型',desc);}
    const prefix=main.style==='magic'||main.id.startsWith('goliath')?'人偶':main.style==='demonforce'?'妖化':main.id.startsWith('oni')?'鬼铸':'妖精';
    const modulePrefix='touhou_tank_'+suffix;
    const parts={
      engine_type_slot:module(modulePrefix+'_engine',name+'·'+prefix+'动力核','tank_engine_type',{maximum_speed:min.maximum_speed*.5,reliability:min.reliability*.25,build_cost_ic:min.build_cost_ic*.2,fuel_consumption:min.fuel_consumption},'tank_diesel_engine',prefix+'动力系统。数值由原型号最低公共速度、可靠性、能耗和造价拆分；武器安装架承担额外能耗。'),
      suspension_type_slot:module(modulePrefix+'_suspension',name+'·'+prefix+'机动关节','tank_suspension_type',{maximum_speed:min.maximum_speed*.25,reliability:min.reliability*.25,build_cost_ic:min.build_cost_ic*.1},'tank_torsion_bar_suspension','以关节、步态稳定或履带支撑承担公共机动能力，可与原版悬挂互换。'),
      armor_type_slot:module(modulePrefix+'_armor',name+'·'+prefix+'护甲','tank_armor_type',{armor_value:min.armor_value*.65,defense:min.defense*.35,build_cost_ic:min.build_cost_ic*.15},'tank_welded_armor','人偶炼金外壳、妖兽角质外甲或鬼铸护甲；与底盘共同承担所有角色的公共防护。'),
      turret_type_slot:module(modulePrefix+'_control',name+'·'+prefix+'操控座',S(nativeModules.get(turretSource[size]),'category'),{breakthrough:min.breakthrough*.5,defense:min.defense*.4,reliability:min.reliability*.1,build_cost_ic:min.build_cost_ic*.1},turretSource[size],'人偶指令节点、妖力协调座或鬼族战斗操控座。保持原版炮塔尺寸和武器兼容规则。')
    };
    const common=Object.fromEntries(Object.entries(baseStats));for(const id of Object.values(parts))for(const [k,v] of Object.entries(moduleRecords.find(x=>x.id===id).values))common[k]=round((common[k]||0)+v);
    const moduleIds=Object.values(parts);
    for(const m of group){
      const role=roleOf(m),copy=aliases.find(x=>x.id===m.archetype+type.slice(a.length)),expected=effective(fixed.get(m.id));
      let target=role==='armor'?type:m.archetype+type.slice(a.length);
      const assembledBase={...common,hardness:copy?.hardness??baseStats.hardness};
      // Lend-lease cost is chassis metadata, not an allowed module add_stat.
      if(copy&&expected.lend_lease_cost!==baseStats.lend_lease_cost){
        // A separate generic role model avoids redefining the native rule's generated model.
        target+='_preset';types.push(target);copy.presetType=target;
        const definition=structuredClone(chassisNodes.at(-1));definition.key=target;
        definition.value=definition.value.filter(n=>!['archetype','hardness','lend_lease_cost','variant_name','derived_variant_name','picture','module_slots'].includes(n.key));
        // Generated role archetypes do not expose an inheritable slot table to late overrides.
        // Copy the native super-heavy chassis slots onto this generic role model explicitly.
        definition.value.push(structuredClone(C(vanillaEq.get(a),'module_slots')[0]));
        definition.value.push(N('archetype',m.archetype),N('hardness',num(copy.hardness)),N('lend_lease_cost',num(expected.lend_lease_cost)),N('picture',type),N('variant_name',target+'_design'),N('derived_variant_name',target+'_design'));
        putLoc(target,(localisation.get(m.id)||name)+'底盘',desc);putLoc(target+'_design',localisation.get(m.id)||name,desc);
        roleOverrides.push(definition);assembledBase.lend_lease_cost=expected.lend_lease_cost;
      }
      const values={};for(const k of new Set([...Object.keys(expected),...Object.keys(assembledBase)]))if(!['year','priority','visual_level','interface_overview_category_index','air_map_icon_frame'].includes(k)){const d=round((expected[k]||0)-(assembledBase[k]||0));if(d)values[k]=d;}
      const residualResources=Object.fromEntries(C(fixed.get(m.id),'resources')[0].value.map(x=>[x.key,Number(x.value)-(resources[x.key]||0)]));
      const weaponId='touhou_tank_weapon_'+m.id.replace(/^touhou_/,'');
      const weaponName=(localisation.get(m.id)||'妖精装甲装备')+'·'+({armor:prefix==='人偶'?'弹幕主武器组':'近战重击武器组',artillery:'范围轰击武器组',destroyer:'集中破甲武器组',aa:'对空弹幕武器组'}[role]);
      const source=weaponSource[role][size],category=S(nativeModules.get(source),'category');
      module(weaponId,weaponName,category,values,source,'完整主武器与专用安装架。攻击、穿甲、防空来自原型号；安装架的遮蔽、指令、能耗和成本差额使原预设保持原有成品数值。',residualResources);
      const weapon=moduleNodes.at(-1);weapon.value=weapon.value.filter(n=>!['forbid_equipment_type','forbid_equipment_type_exact_match_for_category'].includes(n.key));
      if(role!=='armor')weapon.value.push(N('allow_equipment_type',role==='aa'?'anti_air':role==='destroyer'?'anti_tank':'artillery'),N('forbid_equipment_type_exact_match','armor'));
      moduleIds.push(weaponId);replacements[m.id]=target;
      const image='GFX_'+m.id+'_medium';
      preset({id:m.id,name:localisation.get(m.id)||'妖精装甲装备',type:target,modules:{...parts,main_armament_slot:weaponId},condition:[N('has_tech',lic)],texture:image,oldModel:m.id,expected:{...expected,resources:Object.fromEntries(C(fixed.get(m.id),'resources')[0].value.map(x=>[x.key,Number(x.value)]))}});
      allocated.push({oldModel:m.id,chassis:target,base:type,modules:{...parts,main_armament_slot:weaponId},expected,resources:residualResources});
    }
    // Historical stock needs an enabled chassis before the engine creates version 1.
    // Keep chassis authorization separate so stock never grants unresearched parts.
    const frameLicense='touhou_tank_frame_license_'+suffix,historicalFlag='touhou_historical_tank_frame_'+suffix;
    body.frameLicense=frameLicense;body.historicalFlag=historicalFlag;
    license(frameLicense,name+'底盘许可',[
      ...allCountry(),N('has_dlc','"No Step Back"'),N('OR',[
        N('AND',[...structuredClone(condition),N('has_tech','gwtank_chassis')]),N('has_country_flag',historicalFlag)
      ])
    ],types,[]);
    license(lic,name+'配件许可',condition,[],moduleIds);
  }
  // Spirit frames retain native stats but own distinct IDs, so ritual parts never unlock native tanks.
  function cloneSpirit(id,name,source,desc){const n=structuredClone(nativeModules.get(source));n.key=id;n.value=n.value.filter(x=>x.key!=='parent');n.value.push(N('gfx',source));moduleNodes.push(n);putLoc(id,name,desc);moduleRecords.push({id,name,category:S(n,'category'),source,calibrated:false});return id;}
  const spirit={engine_type_slot:cloneSpirit('touhou_tank_wakan_engine','附灵动力机','tank_diesel_engine','将灵力附着于机械传动系统。采用原版柴油动力数值，兼容所有坦克底盘。'),suspension_type_slot:cloneSpirit('touhou_tank_wakan_suspension','灵力稳定悬挂','tank_torsion_bar_suspension','以灵力场稳定车体，采用原版扭杆悬挂数值。'),armor_type_slot:cloneSpirit('touhou_tank_wakan_armor','护身符阵装甲','tank_welded_armor','附灵道具组成防护符阵，采用原版焊接装甲数值与资源代价。')};
  const spiritControl={light:cloneSpirit('touhou_tank_wakan_light_control','轻型灵力共鸣座','tank_light_three_man_tank_turret','采用原版轻型三人炮塔的尺寸和数值；灵力共鸣组织武器操控。'),medium:cloneSpirit('touhou_tank_wakan_medium_control','中型灵力共鸣座','tank_medium_three_man_tank_turret','采用原版中型三人炮塔的尺寸和数值。')};
  for(let tier=1;tier<=3;tier++){
    const lic='touhou_tank_license_wakan_'+tier,techLevel=['basic','improved','advanced'][tier-1];
    const guns={light:cloneSpirit('touhou_tank_wakan_light_weapon_'+tier,'破魔穿甲炮 '+tier,['tank_small_cannon','tank_small_cannon_2','tank_high_velocity_cannon'][tier-1],'灵力集中于弹体完成破甲，采用对应原版小型坦克炮数值。'),medium:cloneSpirit('touhou_tank_wakan_medium_weapon_'+tier,'灵力爆破炮 '+tier,['tank_medium_cannon','tank_medium_cannon_2','tank_high_velocity_cannon_2'][tier-1],'将原灵力爆破体系装入车载炮组，采用对应原版中型坦克炮数值。')};
    const condition=[N('has_dlc','"No Step Back"'),...styleLimit('wakan'),N('OR',[N('AND',techCondition(techLevel+'_light_tank')),N('AND',techCondition(techLevel+'_medium_tank'))])];
    license(lic,'附灵装甲配件许可 '+tier,condition,[],[...Object.values(spirit),...Object.values(spiritControl),...Object.values(guns)]);
    for(const size of ['light','medium']){
      const nativeType=size+'_tank_chassis_'+tier,type=size+'_tank_chassis_touhou_wakan_'+tier,frameLicense='touhou_tank_frame_license_wakan_'+size+'_'+tier;
      const source=vanillaEq.get(nativeType),frame=structuredClone(source);frame.key=type;
      frame.value=frame.value.filter(n=>!['parent','picture','variant_name','derived_variant_name','can_be_produced','active','is_buildable'].includes(n.key));
      if(tier>1)frame.value.push(N('parent',size+'_tank_chassis_touhou_wakan_'+(tier-1)));
      const frameCondition=[N('has_dlc','"No Step Back"'),...styleLimit('wakan'),...techCondition(techLevel+'_'+size+'_tank')];
      frame.value.push(N('active','no'),N('is_buildable','yes'),N('picture',type),N('variant_name',type+'_design'),N('derived_variant_name',type+'_design'),N('can_be_produced',[...frameCondition,N('has_tech',frameLicense)]));
      chassisNodes.push(frame);
      const name=({light:'破魔式轻型坦克',medium:'附灵式中型坦克'}[size])+['','改良型','完全型'][tier-1],desc='附灵专用底盘，保留对应原版底盘数值与升级规则；幻想乡配件仅能安装在专用底盘上。';
      putLoc(type,name+'底盘',desc);putLoc(type+'_design',name,desc);
      const art='touhou_wakan_infantry_equipment_'+tier,display=models.find(m=>m.id===art);
      if(!display)throw Error('Missing spirit frame presentation '+art);
      chassis.push({id:type,archetype:size+'_tank_chassis',unlock:display.unlock,researchSource:techLevel+'_'+size+'_tank',style:'wakan',armorChassis:true,license:frameLicense,sourceModel:art,displaySource:art,nativeStatSource:nativeType});
      const types=[type];for(const d of duplicates.filter(d=>S(d,'archetype')===size+'_tank_chassis'&&S(d,'only_duplicate_archetype')!=='yes')){
        const id=d.key+type.slice((size+'_tank_chassis').length),block=C(C(d,'for_each')[0],'hardness')[0];types.push(id);aliases.push({id,archetype:d.key,base:type,hardness:block?Number(S(block,'set')):effective(source).hardness});putLoc(id,name+'衍生底盘',desc);
      }
      license(frameLicense,name+'底盘许可',frameCondition,types,[]);
      preset({id:'wakan_'+size+'_'+tier,name,type,flagVersion:2,modules:{...spirit,turret_type_slot:spiritControl[size],main_armament_slot:guns[size]},condition:[N('has_tech',lic),N('has_tech',frameLicense),...techCondition(techLevel+'_'+size+'_tank')],texture:'GFX_'+art+'_medium'});
    }
  }
  return {originalModels:original,models:chassis,replacements,aliases,presets,licenses,modules:moduleRecords,allocated,localisation:loc,
    equipmentScript:R([N('equipments',chassisNodes)]),roleOverridesScript:R([N('equipments',roleOverrides)]),modulesScript:R([N('equipment_modules',[N('limit',[N('has_dlc','"No Step Back"')]),...moduleNodes])]),technologyScript:R([N('technologies',licenseNodes)]),
    effectScript:N('touhou_sync_tank_designer',[N('if',[N('limit',[...allCountry(),N('has_dlc','"No Step Back"')]),...licenseEffects,...effects])])};
};
