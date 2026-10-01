// Evaluate the generated registration AST against representative national/research states.
// This checks condition behavior; it does not emulate the engine's design creation or UI.
const fs=require('fs'),path=require('path'),assert=require('assert'),h=require('./hoi4_script.cjs');
const root=path.resolve(__dirname,'..'),game=process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/幻想乡军事原版化迁移清单.json'),'utf8'));
const modelStyles=new Map(manifest.models.map(m=>[m.id,m.style]));
const effect=h.parse(fs.readFileSync(path.join(root,'common/scripted_effects/touhou_vanilla_military.txt'),'utf8')).find(n=>n.key==='touhou_register_country_equipment');
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
function register(s){const created=[];function execute(ns){for(const n of ns){
  if(n.key==='if'){if(match(h.children(n,'limit')[0].value,s))execute(n.value.filter(c=>c.key!=='limit'));}
  else if(n.key==='create_equipment_variant')created.push(h.scalar(n,'type'));
  else if(n.key==='set_country_flag')s.flags.add(n.value);
  else throw Error('Unsupported registration effect '+n.key);
}}execute(effect.value);return created;}
const allTechs=h.definitions(game,'common/technologies','technologies').map(n=>n.key);
const allProjects=[...new Set(manifest.models.filter(m=>m.style==='trump').map(m=>'touhou_project_unlocked_'+(m.unlock.startsWith('goliath_')?'goliath_0':m.unlock)))];
const checks=[];
function check(name,run){run();checks.push(name);}
check('Native GER/USA/JAP never register Touhou designs, even with all technology/style/project flags',()=>{
  for(const tag of ['GER','USA','JAP'])assert.deepStrictEqual(register(state(tag,'magic',allTechs,['No Step Back','By Blood Alone'],allProjects)),[]);
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
check('NSB requires chassis research; without NSB the legacy tank research applies',()=>{
  const hasLight=ids=>ids.some(id=>id.startsWith('touhou_magic_light_tank'));
  assert.strictEqual(hasLight(register(state('ALI','magic',['basic_light_tank'],['No Step Back']))),false);
  assert.strictEqual(hasLight(register(state('ALI','magic',['basic_light_tank_chassis'],['No Step Back']))),true);
  assert.deepStrictEqual(register(state('ALI','magic',['basic_light_tank'])),['touhou_magic_light_tank_equipment_1']);
});
check('BBA requires airframe research; without BBA legacy aircraft research applies',()=>{
  const fighter='touhou_magic_fighter_equipment_1';
  assert.strictEqual(register(state('ALI','magic',['fighter1'],['By Blood Alone'])).includes(fighter),false);
  assert.strictEqual(register(state('ALI','magic',['basic_small_airframe'],['By Blood Alone'])).includes(fighter),true);
  assert.strictEqual(register(state('ALI','magic',['fighter1'])).includes(fighter),true);
});
check('Native research alone grants no trump/project designs',()=>assert.strictEqual(register(state('ALI','magic',allTechs)).filter(id=>modelStyles.get(id)==='trump').length,0));
check('Goliath project does not grant unrelated projects or later unreached Goliath tiers',()=>{
  const actual=register(state('ALI',null,['basic_heavy_tank'],[],['touhou_project_unlocked_goliath_0'])).filter(id=>modelStyles.get(id)==='trump');
  assert.deepStrictEqual(actual,['goliath_equipment_1']);
});
check('Lotus project opens only its own modular hulls without creating invalid empty ship designs',()=>{
  const s=state('TEM',null,[],[],['touhou_project_unlocked_lotus']);assert.deepStrictEqual(register(s),[]);
  for(const m of manifest.models.filter(m=>m.modularHull))assert.strictEqual(s.flags.has('touhou_registered_model_'+m.id),true);
  const foreign=state('GER',null,[],[],['touhou_project_unlocked_lotus']);register(foreign);
  for(const m of manifest.models.filter(m=>m.modularHull))assert.strictEqual(foreign.flags.has('touhou_registered_model_'+m.id),false);
});
const result={checks:checks.length,passed:checks,limitation:'AST condition checks only; engine design creation, production UI and combat are not simulated.'};
fs.writeFileSync(path.join(root,'docs/国家装备解锁条件校验.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
