local p = hoi4.package {id="touhou.research.basic", requires={"touhou.research.core"}}
p:localisation {
  language="simp_chinese", key="touhou_lua_basic_medium_hint",
  value="幻想乡中型底盘与配件由本国研发许可开放。"
}
-- Merge demonstration only: the output shadows this virtual path without writing the installation.
p:patch {
  file="common/technologies/NSB_armor.txt",
  path={"technologies", "basic_medium_tank_chassis"},
  action="set", key="desc", value="touhou_lua_basic_medium_hint"
}
return p
