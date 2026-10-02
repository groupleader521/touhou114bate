// Verify optional parts against actual slot tables and physically flyable representative designs.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {scalar:S,children:C}=h;
exports.validateOptionalModules=function({root,game,manifest,eq,errors}){
 const native=h.definitions(game,'common/units/equipment/modules','equipment_modules');
 const modules=new Map([...native,...h.definitions(root,'common/units/equipment/modules','equipment_modules')].map(n=>[n.key,n]));
 const nativeTech=new Set(h.definitions(game,'common/technologies','technologies').map(n=>n.key));
 const allowedKeys=new Set(native.flatMap(n=>n.value.map(n=>n.key)).concat(['gfx']));
 const statKeys=new Set(native.flatMap(n=>C(n,'add_stats').concat(C(n,'multiply_stats')).flatMap(n=>n.value.map(n=>n.key))));
 const missionNames=new Set(native.flatMap(n=>[...C(n,'mission_type_stats').flatMap(n=>C(n,'limit').flatMap(n=>n.value.map(n=>n.value))),...C(n,'allow_mission_type').flatMap(n=>Array.isArray(n.value)?n.value.map(n=>n.value):[n.value])]));
 const inherit=(n,key)=>{const own=C(n,key)[0];if(own&&Array.isArray(own.value))return own;return S(n,'archetype')?inherit(eq.get(S(n,'archetype')),key):null;};
 function values(n){const base=S(n,'archetype')?values(eq.get(S(n,'archetype'))):{};for(const c of n.value){if(c.key&&typeof c.value==='string'&&/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(c.value))base[c.key]=Number(c.value);}return base;}
 function assemble(type,equipped,mission){
  const result=values(eq.get(type)),multiply={};
  const add=ns=>{for(const n of ns)result[n.key]=(result[n.key]||0)+Number(n.value);};
  for(const id of Object.values(equipped).filter(id=>id!=='empty')){
   const m=modules.get(id);add(C(m,'add_stats').flatMap(n=>n.value));
   for(const n of C(m,'multiply_stats').flatMap(n=>n.value))multiply[n.key]=(multiply[n.key]||0)+Number(n.value);
   for(const b of C(m,'mission_type_stats'))if(C(b,'limit').flatMap(n=>n.value).some(n=>n.value===mission)){
    add(C(b,'add_stats').flatMap(n=>n.value));
    for(const n of C(b,'multiply_stats').flatMap(n=>n.value))multiply[n.key]=(multiply[n.key]||0)+Number(n.value);
   }
  }
  for(const [k,v] of Object.entries(multiply))result[k]=(result[k]||0)*(1+v);
  return result;
 }
 const cultureGroups=new Map(),concepts=new Set();
 const result={tankModules:0,aircraftModules:0,core:0,niche:0,flavor:0,slotChecks:0,flyableAssemblies:0,nativeFrameAssemblies:0,utilityFrameAssemblies:0,missionAssemblyChecks:0,missionIsolationChecks:0};
 for(const kind of ['armor','aircraft']){
  const plan=manifest[kind],optional=plan.modules.filter(m=>m.optional);
  for(const record of optional){
   result[kind==='armor'?'tankModules':'aircraftModules']++;result[record.role]++;
   const n=modules.get(record.id),source=modules.get(record.source);
   if(!n||!source){errors.push('Missing optional module/source '+record.id);continue;}
   if(!record.conceptKey?.includes('/'+record.style+'/')||!record.identity)errors.push('Missing authored culture identity '+record.id);
   concepts.add(record.conceptKey);
   const groupKey=kind+'/'+record.id.replace(/^touhou_(tank|air)_optional_(magic|wakan|demonforce)_/,'');
   if(!cultureGroups.has(groupKey))cultureGroups.set(groupKey,[]);
   const gameplayKeys=new Set(['add_stats','multiply_stats','mission_type_stats','build_cost_resources']);
   cultureGroups.get(groupKey).push({style:record.style,signature:h.render(n.value.filter(n=>gameplayKeys.has(n.key)))});
   if(S(n,'parent'))errors.push('Optional part inherits native upgrade parent '+record.id);
   if(record.requiredTechnology&&!nativeTech.has(record.requiredTechnology))errors.push('Unknown optional research '+record.id);
   for(const c of n.value)if(!allowedKeys.has(c.key))errors.push('Unknown optional module field '+record.id+' '+c.key);
   for(const block of C(n,'add_stats').concat(C(n,'multiply_stats')))for(const c of block.value)if(!statKeys.has(c.key)||!Number.isFinite(Number(c.value)))errors.push('Unsupported optional stat '+record.id+' '+c.key);
   for(const block of C(n,'mission_type_stats'))for(const c of C(block,'limit').flatMap(n=>n.value))if(!missionNames.has(c.value))errors.push('Unknown optional mission '+record.id+' '+c.value);
   const lic=plan.licenses.filter(l=>l.modules.includes(record.id));
   if(lic.length!==1||!lic[0].optional||lic[0].style!==record.style)errors.push('Missing/foreign optional license '+record.id);
   if(record.foundationTechnology!==(kind==='armor'?'gwtank_chassis':null)||!record.researchAlternatives?.length)errors.push('Missing foundation research '+record.id);
   for(const id of record.requiredTechnologies||[]){
    if(!nativeTech.has(id)||!lic[0]?.condition.some(n=>n.key==='has_tech'&&n.value===id))errors.push('Missing actual research gate '+record.id+' '+id);
   }
   const requirement=manifest.independentResearch?.requirements.find(r=>r.id===record.id);
   if(!requirement||!requirement.licenses.includes(lic[0]?.id))errors.push('Missing private research requirement description '+record.id);
   for(const tech of record.requiredTechnologies||[])if(!requirement?.text.includes('$'+tech+'$'))errors.push('Private description omits research gate '+record.id+' '+tech);
   if(plan.presets.some(p=>Object.values(p.modules).includes(record.id)))errors.push('Optional part silently added to preserved preset '+record.id);
   // Find a genuine compatible slot in this culture's existing chassis/airframe, not a fabricated test chassis.
   let candidate;
   const candidatePresets=kind==='aircraft'?[...plan.presets].sort((a,b)=>(b.expected?.air_defence||0)-(a.expected?.air_defence||0)):plan.presets;
   for(const p of candidatePresets){
    const base=plan.models.find(m=>m.id===(p.base||p.type));
    if(base?.style!==record.style&&!(kind==='armor'&&record.style==='wakan'&&p.id.startsWith('wakan_')))continue;
    const table=inherit(eq.get(p.type),'module_slots');
    const rank=s=>p.modules[s.key]==='empty'?0:p.modules[s.key]?.endsWith('_range')?1:2;
    const slot=table.value.filter(s=>S(s,'required')!=='yes'&&C(s,'allowed_module_categories').flatMap(n=>n.value).some(n=>n.value===S(modules.get(record.id),'category'))).sort((a,b)=>rank(a)-rank(b))[0];
    if(slot){candidate={preset:p,table,slot:slot.key};break;}
   }
   // Missing large product lines now use owned utility frames, never native frames.
   if(!candidate&&kind==='aircraft')for(const frame of plan.models.filter(m=>m.utilityFrame&&m.style===record.style)){
    const type=frame.id,table=inherit(eq.get(type),'module_slots');
    const slot=table.value.find(s=>S(s,'required')!=='yes'&&C(s,'allowed_module_categories').flatMap(n=>n.value).some(n=>n.value===record.category));
    if(!slot)continue;
    const equipped=Object.fromEntries(table.value.map(n=>[n.key,'empty']));
    equipped.fixed_main_weapon_slot='large_bomb_bay';
    candidate={preset:{type,modules:equipped},table,slot:slot.key,utilityFrame:true};break;
   }
   if(!candidate){errors.push('Optional module has no compatible native/culture frame slot '+record.id);continue;}
   result.slotChecks++;
   if(kind==='armor'){
    const equipped={...candidate.preset.modules,[candidate.slot]:record.id},r=assemble(candidate.preset.type,equipped);
    if(r.maximum_speed<=0||r.build_cost_ic<=0||r.reliability<=0||r.armor_value<0)errors.push('Invalid representative optional tank '+record.id);
    continue;
   }
   const equipped={...candidate.preset.modules,[candidate.slot]:record.id};
   const engineCategories=C(candidate.table.value.find(n=>n.key==='engine_type_slot'),'allowed_module_categories')[0].value.map(n=>n.value);
   const engine=native.filter(n=>engineCategories.includes(S(n,'category'))).sort((a,b)=>Number(S(C(b,'add_stats')[0],'thrust')||0)-Number(S(C(a,'add_stats')[0],'thrust')||0))[0];
   if(!engine){errors.push('No compatible engine for optional air module '+record.id);continue;}
   equipped.engine_type_slot=engine.key;
   const missions=[undefined,...new Set(C(n,'mission_type_stats').flatMap(n=>C(n,'limit').flatMap(n=>n.value.map(n=>n.value))))];
   let flyable=true;
   for(const mission of missions){
    const r=assemble(candidate.preset.type,equipped,mission);if(mission)result.missionAssemblyChecks++;
    if(r.thrust+1e-7<r.weight||r.weight<0||r.build_cost_ic<=0||r.maximum_speed<=0||r.air_defence<0||r.air_attack<0||r.reliability<=0)flyable=false;
   }
   if(!flyable)errors.push('Optional aircraft has no valid representative assembly '+record.id);else {result.flyableAssemblies++;if(candidate.utilityFrame)result.utilityFrameAssemblies++;}
   // Mission-only payload/bonuses must disappear during an unrelated mission.
   for(const block of C(n,'mission_type_stats')){
    const active=C(block,'limit')[0].value.map(n=>n.value),unrelated=[...missionNames].find(m=>!active.includes(m)&&!C(n,'mission_type_stats').some(b=>C(b,'limit')[0].value.some(x=>x.value===m)));
    if(unrelated){const base=assemble(candidate.preset.type,equipped),other=assemble(candidate.preset.type,equipped,unrelated);if(JSON.stringify(base)!==JSON.stringify(other))errors.push('Optional mission bonus leaks '+record.id);result.missionIsolationChecks++;}
   }
  }
 }
 for(const [key,group] of cultureGroups)if(new Set(group.map(m=>m.style)).size!==3||new Set(group.map(m=>m.signature)).size!==3)errors.push('Cultures share a renamed identical optional function '+key);
 result.authoredConcepts=concepts.size;result.distinctCultureGroups=cultureGroups.size;
 result.limitation='Slot/stat/condition simulations only. Representative aircraft use a compatible high-thrust vanilla engine; early engines may require fewer parts. UI, engine creation and combat are not simulated.';
 return result;
};
