local p = hoi4.package {id="touhou.research.core"}

p:append_localisation {
  language="simp_chinese", key="basic_medium_tank_chassis_desc",
  value="\n\n幻想乡制造体系可通过本国研发许可使用专用底盘。配件仍需完成对应研究。"
}

for _, entry in ipairs({
  {"touhou_lua_research_title", "幻想乡配件研发"},
  {"touhou_lua_research_body", "基础装甲配件需要战间期型坦克开发。\n无线电、副武器等配件还需要对应专项科技。\n配件仅用于幻想乡专用底盘。"}
}) do
  p:localisation {language="simp_chinese", key=entry[1], value=entry[2]}
end

p:asset {
  source_root="touhou114",
  source="gfx/interface/equipmentdesigner/touhou_modules/icons/tank_magic_engine.dds",
  target="gfx/interface/touhou_lua/research_hint.dds"
}
p:sprite {name="GFX_touhou_lua_research_hint", texture="gfx/interface/touhou_lua/research_hint.dds"}

p:panel {
  id="touhou_lua_research_panel", parent="tech_armor_folder",
  title="touhou_lua_research_title", body="touhou_lua_research_body",
  icon="GFX_touhou_lua_research_hint", x=920, y=30,
  tags={"ALI","DES","HAK","DLD","HEL","SSS","OPP","RAB","TEM","BLQ","KAP","TEN","HUM","VAM","MLS","EVI"}
}

return p
