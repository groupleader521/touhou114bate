// Category chooser rows use GFX_EMI_<category>, separately from individual module icons.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs'),catalog=require('./module_icon_catalog.cjs');
exports.installCategoryIcons=function({armor,aircraft}){
 const records=[],sprites=[];
 for(const [kind,plan] of [['armor',armor],['aircraft',aircraft]]){
  const ns=h.parse(plan.modulesScript)[0].value;
  const categories=new Set(plan.modules.flatMap(m=>[m.category,h.scalar(ns.find(n=>n.key===m.id),'gui_category')].filter(Boolean)));
  for(const category of categories){
   const matches=plan.modules.filter(m=>m.category===category||h.scalar(ns.find(n=>n.key===m.id),'gui_category')===category);
   const m=matches.find(m=>m.id.endsWith('_secondary_cannon'))||matches.find(m=>m.id.endsWith('_smoke'))||matches.find(m=>m.id.includes('magic'))||matches[0];
   const asset=catalog.assetFor(kind,m),texture='gfx/interface/equipmentdesigner/touhou_modules/icons/'+asset+'.dds',sprite='GFX_EMI_'+category;
   records.push({kind,category,sprite,asset,texture});sprites.push(h.node('spriteType',[h.node('name',JSON.stringify(sprite)),h.node('texturefile',JSON.stringify(texture)),h.node('legacy_lazy_load','no')]));
  }
 }
 return {records,graphics:h.render([h.node('spriteTypes',sprites)])};
};
exports.validateCategoryIcons=function({root,manifest,errors}){
 const sprites=h.parse(fs.readFileSync(path.join(root,'interface/zz_touhou_module_categories.gfx'),'utf8'))[0].value;
 const records=manifest.categoryIcons||[],seen=new Set();
 for(const r of records){
  const n=sprites.find(n=>h.scalar(n,'name')===JSON.stringify(r.sprite));
  if(!r.category.startsWith('touhou_')||seen.has(r.category)||!n||h.scalar(n,'texturefile')!==JSON.stringify(r.texture)||!fs.existsSync(path.join(root,r.texture)))errors.push('Missing/wrong category icon '+r.category);
  seen.add(r.category);
 }
 for(const kind of ['armor','aircraft'])for(const m of manifest[kind].modules)if(!seen.has(m.category))errors.push('Module category has no chooser icon '+m.id);
 for(const file of ['touhou_tank_modules.txt','touhou_aircraft_modules.txt']){
  const mods=h.parse(fs.readFileSync(path.join(root,'common/units/equipment/modules',file),'utf8'))[0].value;
  for(const m of mods)for(const n of h.children(m,'gui_category'))if(!seen.has(n.value))errors.push('GUI category has no chooser icon '+n.value);
 }
 if(sprites.length!==records.length)errors.push('Unexpected category sprites');
 return {categories:records.length,tank:records.filter(r=>r.kind==='armor').length,aircraft:records.filter(r=>r.kind==='aircraft').length};
};
