// Keep vanilla research definitions intact; adapt only Touhou's own data and UI.
const h=require('./hoi4_script.cjs'),{node:N,scalar:S,children:C}=h;
const categoryAliases={
 magic:['infantry_weapons','cat_special_forces_generic','night_vision','mio_cat_artillery','cat_anti_tank','cat_light_armor','cat_medium_armor','cat_heavy_armor','air_equipment'],
 wakan:['infantry_weapons','cat_special_forces_generic','night_vision','mio_cat_artillery','cat_anti_air','motorized_equipment','air_equipment'],
 demonforce:['infantry_weapons','cat_special_forces_generic','night_vision','artillery','cat_heavy_armor','air_equipment'],
 goliath:['cat_heavy_armor'],mio_cat_tech_touhou_aircraft:['air_equipment']
};
exports.categoryAliases=categoryAliases;
exports.buildIndependentResearch=function({armor,aircraft,vanillaTech,tags}){
 const bonusMigrations=[],requirements=[];
 // Two applicable category entries can stack research speed. Use disjoint native categories.
 for(const style of ['magic','wakan','demonforce'])for(const t of vanillaTech){
  const matches=C(t,'categories').flatMap(n=>n.value.map(n=>n.value)).filter(c=>categoryAliases[style].includes(c));
  if(matches.length>1)throw Error('Overlapping native research bonus categories '+style+' '+t.key+' '+matches.join(','));
 }
 const clean=s=>s.replace(/^"|"$/g,'');
 function gate(ns,dlc,mode='AND'){
  const parts=ns.map(n=>{
   if(n.key==='has_tech')return {possible:true,text:'§Y$'+n.value+'$§!'};
   if(n.key==='has_dlc')return {possible:clean(n.value)===dlc,text:''};
   if(n.key==='NOT'&&n.value.length===1&&n.value[0].key==='has_dlc')return {possible:clean(n.value[0].value)!==dlc,text:''};
   if(['OR','AND'].includes(n.key))return gate(n.value,dlc,n.key);
   if(n.key==='has_country_flag'&&n.value.startsWith('touhou_project_unlocked_'))return {possible:true,text:'对应专属项目'};
   return {possible:true,text:''};
  });
  const possible=mode==='OR'?parts.some(p=>p.possible):parts.every(p=>p.possible);
  const text=[...new Set(parts.filter(p=>p.possible&&p.text).map(p=>p.text))].join(mode==='OR'?' 或 ':'、');
  return {possible,text:mode==='OR'&&text.includes(' 或 ')?'（'+text+'）':text};
 }
 for(const [kind,plan,dlc] of [['armor',armor,'No Step Back'],['aircraft',aircraft,'By Blood Alone']]){
  for(const id of [...plan.models.map(m=>m.id),...plan.modules.map(m=>m.id)]){
   const licenses=plan.licenses.filter(l=>l.equipment.includes(id)||l.modules.includes(id));
   const gates=[...new Set(licenses.map(l=>gate(l.condition,dlc)).filter(g=>g.possible&&g.text).map(g=>g.text))];
   const text=gates.join(' 或 ');
   if(!text)continue;
   const desc=plan.localisation.get(id+'_desc')||'';
   plan.localisation.set(id+'_desc',desc+'\n\n研发条件：'+text+'。须采用对应制造体系；配件用于幻想乡专用'+(kind==='armor'?'底盘':'机体')+'。');
   requirements.push({id,kind,licenses:licenses.map(l=>l.id),text});
  }
 }
 function rewriteBonuses(ns,file,parent=''){
  for(const n of ns){
   const location=parent?parent+'.'+n.key:n.key;
   if(n.key==='research_bonus'){
    const rewritten=[];
    for(const b of n.value){
     const targets=categoryAliases[b.key];
     if(targets){for(const category of targets)rewritten.push(N(category,b.value));bonusMigrations.push({file,location,source:b.key,value:b.value,categories:targets});}
     else rewritten.push(b);
    }
    n.value=rewritten;
   }else if(n.key==='research_categories'){
    n.value=[...new Set(n.value.flatMap(b=>categoryAliases[b.value]||[b.value]))].map(id=>N(null,id));
   }else if(n.key==='add_tech_bonus'){
    n.value=n.value.flatMap(b=>b.key==='category'&&categoryAliases[b.value]?categoryAliases[b.value].map(id=>N('category',id)):[b]);
   }
   if(Array.isArray(n.value))rewriteBonuses(n.value,file,location);
  }
 }
 const decision=N('touhou_designer_research_status',[
  N('icon','eng_trade_unions_support'),N('cost','0'),N('days_re_enable','0'),
  N('visible',[N('OR',tags.map(tag=>N('original_tag',tag)))]),N('ai_will_do',[N('factor','0')]),
  N('complete_effect',[N('custom_effect_tooltip','touhou_designer_research_refresh_tt'),N('hidden_effect',[N('touhou_sync_vanilla_military','yes')])])
 ]);
 const localisation=new Map([
  ['touhou_designer_research_status','检查装备研发'],
  ['touhou_designer_research_status_desc','幻想乡装备沿用通用科技树。\n\n§Y装甲配件§!：先研究§Y$gwtank_chassis$§!，再研究相应底盘与高级配件科技。\n§Y航空配件§!：基础配件随机体开发开放；高级配件需要各自专项研究。\n\n装备和配件须符合本国制造体系，特殊型号须完成对应项目。各配件说明列出研发条件。\n\n研究完成后，配件在次日开放；暂停时可点击此项立即检查。'],
  ['touhou_designer_research_refresh_tt','按本国已完成的研究和制造体系更新装备、底盘及配件。']
 ]);
 return {rewriteBonuses,decision,localisation,manifest:{synchronization:'country-scoped daily pulse, startup, historical initialization, project/style changes and manual refresh',nativeTechnologyOverrides:false,categoryAliases,bonusMigrations,requirements}};
};
