// Inventory shared runtime paths; never confuse independent files with zero object overrides.
const fs=require('fs'),path=require('path'),h=require('./hoi4_script.cjs');
const root=path.resolve(__dirname,'..'),game=process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const reasons={
 'common/bookmarks/the_gathering_storm.txt':'幻想乡开局书签和默认国家。',
 'common/combat_tactics.txt':'该系统读取根目录单文件；保留幻想乡战术与反制关系。',
 'common/script_enums.txt':'该系统读取根目录单文件；原版枚举保留，仅追加专用型号的装备加成键。',
 'interface/frontendmainviewbg.gfx':'既有主菜单主题。',
 'localisation/english/loading_tips_l_english.yml':'既有加载提示文本。',
 'localisation/simp_chinese/loading_tips_l_simp_chinese.yml':'既有加载提示文本。',
 'map/buildings.txt':'幻想乡地图建筑定位。',
 'map/adjacencies.csv':'幻想乡省份间特殊连接。',
 'map/definition.csv':'幻想乡地图省份索引、颜色与地形属性。',
 'map/heightmap.bmp':'幻想乡地图高度。',
 'map/provinces.bmp':'幻想乡地图省份边界。',
 'map/rivers.bmp':'幻想乡地图河流。',
 'map/terrain.bmp':'幻想乡地图地形。',
 'map/trees.bmp':'幻想乡地图树木分布。',
 'map/world_normal.bmp':'幻想乡地图地表法线。',
 'map/supply_nodes.txt':'幻想乡地图补给节点。',
 'map/unitstacks.txt':'幻想乡地图单位显示位置。',
 'map/weatherpositions.txt':'幻想乡地图天气显示位置。'
};
const errors=[],overrides=[];
for(const file of h.files(root)){
 const relative=path.relative(root,file).replaceAll('\\','/');
 if(!/^(common|events|history|interface|localisation|map|gfx)\//.test(relative))continue;
 const native=path.join(game,relative);if(!fs.existsSync(native)||!fs.statSync(native).isFile())continue;
 const reason=reasons[relative]||(relative.startsWith('gfx/loadingscreens/')?'既有加载画面；descriptor.mod 明确替换此目录。':null);
 if(!reason)errors.push('Unclassified native file override '+relative);
 if(relative.startsWith('common/technologies/')||relative.startsWith('common/units/equipment/'))errors.push('Military system must not replace native source file '+relative);
 overrides.push({file:relative,identical:fs.readFileSync(file).equals(fs.readFileSync(native)),reason});
}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/幻想乡军事原版化迁移清单.json'),'utf8'));
const generatedSourceOverrides=overrides.filter(o=>manifest.outputs[o.file]);
if(generatedSourceOverrides.some(o=>o.file!=='common/script_enums.txt'))errors.push('Unexpected military generator native source override');
const result={date:'2026-10-02',nativeTechnologySourceOverrides:overrides.filter(o=>o.file.startsWith('common/technologies/')).length,remainingTextSourceOverrides:overrides.filter(o=>/\.(txt|gui|gfx|yml|lua|csv)$/.test(o.file)).length,generatedSourceOverrides:generatedSourceOverrides.map(o=>o.file),overrides,errors,limitation:'File-path inventory; independent sprites/localization may intentionally customize Touhou presentation. No game UI execution.'};
fs.writeFileSync(path.join(root,'docs/原版文件覆盖审计.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
