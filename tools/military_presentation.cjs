// Keep native research IDs while reconnecting the original Touhou display assets.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const {scalar:S,children:C,node:N}=h;
exports.buildMilitaryPresentation=function({root,game,oldTech,models,ordinaryTech,designerTech,tags,countryStyles,localisation,nativeEquipmentIds}) {
  const clean=x=>x?.replace(/^"|"$/g,'');
  const originalSprites=new Map();
  for(const f of h.files(path.join(root,'interface')).filter(f=>f.endsWith('.gfx')&&!f.endsWith('zz_touhou_military_presentation.gfx')))
    for(const top of h.parse(fs.readFileSync(f,'utf8')))if(top.key?.toLowerCase()==='spritetypes')
      for(const n of top.value)if(n.key?.toLowerCase()==='spritetype')originalSprites.set(clean(S(n,'name')),n);
  const sourceTech=new Map(oldTech.map(t=>[t.key,t]));
  const loc=new Map(),sprites=new Map(),research=[],equipment=[],sharedTechnologyEquipmentIds=[];
  const enabled=t=>C(t,'enable_equipments').flatMap(n=>n.value).map(n=>n.value);
  function nameSource(t) {
    if(localisation.has(t.key))return t.key;
    return enabled(t).find(id=>localisation.has(id));
  }
  function iconSource(id) {
    // Legacy tank role sub-technologies share their parent tank's illustration.
    const tank=id.includes('_modern_')?id.replace(/_modern_(td|art|spaa)$/,'_main_battle_tank'):id.replace(/_(td|art|spaa)$/,'_tank');
    return originalSprites.get('GFX_'+id+'_medium')||originalSprites.get('GFX_'+tank+'_medium');
  }
  function addIcon(name,source) {
    if(!source)throw Error('No original illustration for '+name);
    const sprite=structuredClone(source);sprite.value.find(n=>n.key==='name').value='"'+name+'"';
    sprites.set(name,sprite);return clean(S(source,'texturefile')||S(source,'textureFile'));
  }
  function alias(key,source,suffix='') {if(source)loc.set(key,'$'+source+'$'+suffix);}
  function styleOf(id){return id.startsWith('touhou_magic_')?'magic':id.startsWith('touhou_wakan_')?'wakan':id.startsWith('touhou_demonforce_')?'demonforce':'support';}
  // The engine also uses these research sprite keys as native equipment fallback icons.
  const sharedDesignerVisuals=new Set(models.filter(m=>m.armorChassis||m.airframe||m.presetDesign).flatMap(m=>{
    const legacy=m.researchSource||ordinaryTech[m.unlock];return legacy?[legacy,designerTech(legacy)]:[];
  }));
  // Country prefixes are the same native mechanism used by GER/SOV tech artwork and names.
  for(const tag of tags) {
    const candidates=new Map();
    for(const t of oldTech.filter(t=>ordinaryTech[t.key]&&[countryStyles[tag],'support'].includes(styleOf(t.key)))) {
      const legacy=ordinaryTech[t.key],source=nameSource(t),icon=iconSource(t.key);
      if(!source)throw Error('No original Chinese name for '+t.key);
      const desc=localisation.has(source+'_desc')?source+'_desc':localisation.has(t.key+'_desc')?t.key+'_desc':null;
      // Designer research merges weapon roles: choose the main tank / fighter before variants.
      const priority=/_(td|art|spaa)$/.test(legacy)?0:/^(CAS|heavy_fighter|tactical_bomber|jet_tactical)/.test(legacy)?1:2;
      for(const id of new Set([legacy,designerTech(legacy)])) {
        // Some native research IDs also identify an equipment archetype (super-heavy chassis).
        // Renaming such research would rename native equipment too; keep its native display.
        if(nativeEquipmentIds.has(id)){sharedTechnologyEquipmentIds.push({tag,id,original:t.key});continue;}
        const previous=candidates.get(id);
        if(!previous||priority>previous.priority)candidates.set(id,{t,id,source,desc,icon,priority});
      }
    }
    for(const {t,id,source,desc,icon} of candidates.values()) {
      const suffix=id.endsWith('_tank_chassis')?'底盘':id.endsWith('_airframe')?'机体':'';
      alias(tag+'_'+id,source,suffix);alias(tag+'_'+id+'_desc',desc);
      const nativeVisual=sharedDesignerVisuals.has(id);
      const texture=icon&&!nativeVisual?addIcon('GFX_'+tag+'_'+id+'_medium',icon):null;
      research.push({tag,id,style:countryStyles[tag],original:t.key,nameSource:source,descriptionSource:desc,texture,nativeVisual});
      // A technology's display aliases must never be copied onto the vanilla equipment it unlocks.
      // Retained Touhou models below own their own labels and images through their distinct model IDs.
    }
  }
  for(const model of models) {
    const t=sourceTech.get(model.unlock),source=nameSource(t),desc=localisation.has(model.id+'_desc')?model.id+'_desc':localisation.has(source+'_desc')?source+'_desc':null;
    const name=localisation.has(model.id)?model.id:source;
    const short=localisation.has(model.id+'_short')?model.id+'_short':name;
    if(!localisation.has(model.id))alias(model.id,source);
    const icon=originalSprites.get('GFX_'+model.id+'_medium')||originalSprites.get('GFX_'+model.displaySource+'_medium')||iconSource(model.unlock);
    const texture=addIcon('GFX_'+model.id+'_medium',icon);
    // Archetype defaults no longer point at custom graphics, so every retained model needs a direct sprite.
    equipment.push({id:model.id,presetDesign:!!model.presetDesign,original:model.unlock,nameSource:name,shortNameSource:short,descriptionSource:desc,texture});
    for(const tag of tags){
      alias(tag+'_'+model.id,name);alias(tag+'_'+model.id+'_short',short);alias(tag+'_'+model.id+'_desc',desc);
      addIcon('GFX_'+tag+'_'+model.id+'_medium',icon);
    }
  }
  const allSprites=[...sprites].map(([name,n])=>({name,texture:clean(S(n,'texturefile')||S(n,'textureFile'))}));
  for(const {name,texture} of allSprites)if(!texture||!fs.existsSync(path.join(root,texture.replaceAll('//','/')))&&!fs.existsSync(path.join(game,texture.replaceAll('//','/'))))throw Error('Missing illustration file '+name+' -> '+texture);
  return {localisation:loc,graphics:[N('spriteTypes',[...sprites.values()])],manifest:{research,equipment,nativeEquipment:[],sharedTechnologyEquipmentIds,sharedDesignerVisuals:[...sharedDesignerVisuals],sprites:allSprites}};
};
