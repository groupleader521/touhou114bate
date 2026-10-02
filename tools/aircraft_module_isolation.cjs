// Own category namespace and complete large-frame support for ritual/beast aviation.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {node:N,scalar:S,children:C,render:R}=h;
const priv=id=>'touhou_'+id;
const titles={plane_engine_type:'航空动力',plane_jet_engine_type:'喷气动力',twin_plane_engine_type:'双引擎动力',twin_plane_jet_engine_type:'双喷气动力',quad_large_plane_engine_type:'大型四引擎动力',quad_large_plane_jet_engine_type:'大型四喷气动力',fighter_weapon:'对空武装',cas_weapon:'对地武装',tac_weapon:'战术轰击武装',strat_weapon:'战略轰击武装',kamikaze_bomber_weapon:'自爆武装',nav_bomber_weapon:'对海武装',recon_camera:'侦察组件',mine_warfare_offense:'航空布雷',plane_special_module_small:'小型特殊配件',plane_special_module_medium:'中型特殊配件',plane_special_module_large:'大型特殊配件',plane_special_module_electronics:'航空电子设备',plane_special_module_bomb_sights:'轰击瞄准',plane_special_module_radio_navigation:'导航组件',plane_special_module_air_air_radar:'空中探测',plane_special_module_air_ground_radar:'对地探测',plane_special_module_defense_turret:'防御副武器',plane_special_module_defense_turret_x2:'双联防御副武器'};
exports.installAircraftIsolation=function({aircraft:plan,game,tags}){
 const native=new Map(h.definitions(game,'common/units/equipment','equipments').map(n=>[n.key,n]));
 const inherit=(n,key)=>{const own=C(n,key).at(-1);return own&&Array.isArray(own.value)?own:S(n,'archetype')?inherit(native.get(S(n,'archetype')),key):null;};
 const equip=h.parse(plan.equipmentScript),techs=h.parse(plan.technologyScript),blueprints=h.parse(plan.blueprintsScript);
 const templates=new Map(h.parse(fs.readFileSync(path.join(game,'interface/equipmentdesigner/planes/plane_blueprints_generic.gui'),'utf8'))[0].value.map(n=>[S(n,'name')?.replace(/^"|"$/g,''),n]));
 const nativeTech=h.definitions(game,'common/technologies','technologies');
 const duplicates=h.definitions(game,'common/units/equipment','duplicate_archetypes');
 const utility=[];
 for(const style of ['wakan','demonforce'])for(let tier=0;tier<=4;tier++){
  const source='large_plane_airframe_'+tier,type='large_plane_airframe_touhou_'+style+'_utility_'+tier,lic='touhou_air_frame_license_'+style+'_large_'+tier;
  const research=nativeTech.find(t=>C(t,'enable_equipments').some(b=>b.value.some(n=>n.value===source)))?.key;
  if(!research)throw Error('No native large-frame research '+source);
  const display=plan.models.find(m=>m.style===style&&m.nativeFrame==='medium_plane_airframe_1');
  const condition=[N('has_dlc','"By Blood Alone"'),N('OR',tags.map(t=>N('original_tag',t))),N('has_country_flag','touhou_country_flag_'+style+'_first_research'),N('has_tech',research)];
  const frame=structuredClone(native.get(source));frame.key=type;
  frame.value=frame.value.filter(n=>!['parent','active','is_buildable','picture','variant_name','derived_variant_name','can_be_produced','default_modules'].includes(n.key));
  if(tier>0)frame.value.push(N('parent','large_plane_airframe_touhou_'+style+'_utility_'+(tier-1)));
  frame.value.push(N('active','no'),N('is_buildable','yes'),N('picture',type),N('variant_name',type+'_design'),N('derived_variant_name',type+'_design'),N('can_be_produced',[N('has_tech',lic),...structuredClone(condition)]));
  const slots=structuredClone(inherit(frame,'module_slots'));frame.value=frame.value.filter(n=>n.key!=='module_slots');frame.value.push(slots,N('default_modules',slots.value.map(n=>N(n.key,'empty'))));
  equip[0].value.push(frame);
  const name=(style==='wakan'?'灵力':'妖力')+'大型通用机体 '+['战间期','1936','1940','1944','喷气'][tier];
  for(const [id,text] of [[type,name],[type+'_short',name],[type+'_design',name],[type+'_desc','专用于本制造体系的大型配件装配；机体数值与对应原版大型机体一致。']])plan.localisation.set(id,text);
  plan.models.push({id:type,archetype:'large_plane_airframe',style,unlock:display.unlock,researchSource:research,airframe:true,license:lic,sourceModel:display.sourceModel,displaySource:display.sourceModel,nativeFrame:source,nativeStatSource:source,utilityFrame:true});
  utility.push({id:type,source,research});
  const types=[type];
  const addBlueprint=(id,src)=>{const b=structuredClone(templates.get('equipment_designer_'+src)||templates.get('equipment_designer_'+source));if(!b)throw Error('Missing utility blueprint '+src);b.value.find(n=>n.key==='name').value=JSON.stringify('equipment_designer_'+id);blueprints[0].value.push(b);};
  addBlueprint(type,source);
  for(const d of duplicates.filter(d=>S(d,'archetype')==='large_plane_airframe'&&S(d,'only_duplicate_archetype')!=='yes')){
   const id=d.key+type.slice('large_plane_airframe'.length),roleStats={};for(const n of C(d,'for_each').flatMap(n=>n.value))if(S(n,'set')!==undefined)roleStats[n.key]=Number(S(n,'set'));
   plan.aliases.push({id,archetype:d.key,base:type,roleStats});types.push(id);plan.localisation.set(id,name+'衍生型');plan.localisation.set(id+'_design',name+'衍生型');addBlueprint(id,d.key+source.slice('large_plane_airframe'.length));
  }
  techs[0].value.push(N(lic,[N('allow',[N('always','no')]),N('research_cost','0'),N('start_year','1936'),N('enable_equipments',types.map(id=>N(null,id)))]));
  plan.licenses.push({id:lic,condition,equipment:types,modules:[],utilityFrame:true});plan.localisation.set(lic,name+'许可');
  plan.effectScript.value[0].value.splice(1,0,N('if',[N('limit',[...structuredClone(condition),N('NOT',[N('has_tech',lic)])]),N('set_technology',[N(lic,'1'),N('popup','no')])]),N('else_if',[N('limit',[N('has_tech',lic),N('NOT',[N('AND',structuredClone(condition))])]),N('set_technology',[N(lic,'0'),N('popup','no')])]));
 }
 const modules=h.parse(plan.modulesScript);
 const used=new Set(plan.modules.map(m=>m.category));
 for(const m of plan.modules){
  const n=modules[0].value.find(n=>n.key===m.id);m.nativeCategory=m.category;m.category=priv(m.category);n.value.find(n=>n.key==='category').value=m.category;
  for(const gui of C(n,'gui_category')){m.nativeGuiCategory=gui.value;gui.value=priv(gui.value);used.add(m.nativeGuiCategory);}
  for(const b of C(n,'forbid_module_categories'))b.value.push(...b.value.filter(n=>used.has(n.value)).map(n=>N(null,priv(n.value))));
  for(const b of C(n,'can_convert_from'))for(const field of C(b,'module_category'))field.value=priv(field.value);
 }
 for(const category of used){if(!titles[category])throw Error('Missing aviation category title '+category);plan.localisation.set(priv(category),titles[category]);plan.localisation.set('EQ_MOD_CAT_'+priv(category)+'_TITLE','幻想乡·'+titles[category]);}
 for(const frame of equip[0].value){
  const slots=C(frame,'module_slots')[0];for(const slot of slots.value)for(const b of C(slot,'allowed_module_categories'))b.value.push(...b.value.filter(n=>used.has(n.value)).map(n=>N(null,priv(n.value))));
  const base=native.get(S(frame,'archetype'));
  for(const limit of C(base,'module_count_limit')){
   if(!C(frame,'module_count_limit').some(n=>R([n])===R([limit])))frame.value.push(structuredClone(limit));
   const category=S(limit,'category');if(used.has(category)){const own=structuredClone(limit);own.value.find(n=>n.key==='category').value=priv(category);frame.value.push(own);}
  }
 }
 plan.equipmentScript=R(equip);plan.technologyScript=R(techs);plan.blueprintsScript=R(blueprints);plan.modulesScript=R(modules);
 plan.isolation={nativeAirframesAcceptTouhouModules:false,moduleCategories:'private Touhou aviation categories',utilityFrames:utility};
};
exports.validateAircraftIsolation=function({root,game,manifest,eq,errors}){
 const start=errors.length,plan=manifest.aircraft;
 const mods=new Map(h.definitions(root,'common/units/equipment/modules','equipment_modules').map(n=>[n.key,n]));
 const inherit=(n,key)=>{if(!n)return null;const own=C(n,key).at(-1);return own&&Array.isArray(own.value)?own:S(n,'archetype')?inherit(eq.get(S(n,'archetype')),key):null;};
 const custom=new Set([...plan.models.map(m=>m.id),...plan.aliases.map(a=>a.id)]);
 let nativeFrames=0,rejectionChecks=0,utilityStatChecks=0,guiChecks=0;
 for(const n of eq.values()){
  if(custom.has(n.key)||!/_plane_.*airframe/.test(n.key))continue;
  const slots=inherit(n,'module_slots');if(!slots)continue;nativeFrames++;
  const allowed=new Set(slots.value.flatMap(slot=>C(slot,'allowed_module_categories').flatMap(b=>b.value.map(n=>n.value))));
  for(const m of plan.modules){rejectionChecks++;if(allowed.has(S(mods.get(m.id),'category')))errors.push('Native airframe accepts fantasy part '+n.key+' '+m.id);}
 }
 for(const m of plan.modules){
  const n=mods.get(m.id);if(S(n,'category')!==priv(m.nativeCategory))errors.push('Missing own aviation category '+m.id);
  if(m.nativeGuiCategory){guiChecks++;if(S(n,'gui_category')!==priv(m.nativeGuiCategory))errors.push('Electronics/turret falls into native GUI group '+m.id);}
 }
 const numeric=n=>{const a=S(n,'archetype'),r=a?numeric(eq.get(a)):{};for(const c of n.value)if(typeof c.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(c.value))r[c.key]=Number(c.value);return r;};
 for(const m of plan.models.filter(m=>m.utilityFrame)){
  const actual=numeric(eq.get(m.id)),expected=numeric(eq.get(m.nativeStatSource));
  for(const k of new Set([...Object.keys(actual),...Object.keys(expected)])){utilityStatChecks++;if(actual[k]!==expected[k])errors.push('Utility aircraft stat changed '+m.id+' '+k);}
  const lic=plan.licenses.find(l=>l.id===m.license);if(!lic||!lic.condition.some(n=>n.key==='has_tech'&&n.value===m.researchSource))errors.push('Utility aircraft has incorrect research gate '+m.id);
 }
 const result={privateModules:plan.modules.length,nativeFrames,rejectionChecks,guiChecks,utilityFrames:plan.models.filter(m=>m.utilityFrame).length,utilityStatChecks,errors:errors.slice(start),limitation:'Actual category, slot, stat and gate checks; game UI not simulated.'};
 if(!nativeFrames||rejectionChecks!==nativeFrames*322||result.utilityFrames!==10)errors.push('Incomplete aircraft isolation coverage');
 fs.writeFileSync(path.join(root,'docs/飞机配件隔离校验.json'),JSON.stringify(result,null,2)+'\n');return result;
};
