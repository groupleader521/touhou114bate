local p = hoi4.package {id="touhou.research.advanced", requires={"touhou.research.basic"}}
p:localisation {
  language="simp_chinese", key="touhou_lua_improved_medium_hint",
  value="改进型专用底盘继续遵循本国制造体系与对应等级的研发条件。"
}
p:patch {
  file="common/technologies/NSB_armor.txt",
  path={"technologies", "improved_medium_tank_chassis"},
  action="set", key="desc", value="touhou_lua_improved_medium_hint"
}
return p
