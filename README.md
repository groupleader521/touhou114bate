# touhou114 · 幻想世界入

《钢铁雄心 IV》的东方题材模组，使用游戏原生 Clausewitz 脚本、界面定义、本地化与地图资源。当前版本及启动器元数据以 `descriptor.mod` 为准，适配版本为 `1.19.*`。

直接编辑本目录中的原生文件即可开发和维护模组。

| 目录 | 内容 |
| --- | --- |
| `common/` | 国家、角色、国策、理念、装备、决议及共享条件和效果 |
| `events/` | 剧情、新闻、统一改革与旧存档修复事件 |
| `history/` | 国家、地区、军队及开局配置 |
| `interface/`、`gfx/`、`portraits/` | 界面、图标、图片和肖像 |
| `localisation/` | 简体中文、英文和俄文本地化 |
| `map/` | 地图资源 |
| `docs/` | 实施说明、数据清单与验证记录 |
| `tools/` | 原生脚本分析、军事改造和静态校验工具 |

军事体系沿用原版研究入口和装备原型，通过国家限定的后台许可管理幻想乡装备与配件。当前装甲有 23 个基础底盘、213 个配件及 56 个预设；航空有 47 个基础机体、322 个配件及 43 个预设。

启动器描述声明依赖 `52 Chinese Localisation`。坦克设计器需要 No Step Back，飞机设计器需要 By Blood Alone。完整军事重置建议使用新开局；旧科技、兵种及独立装甲、飞机成品 ID 的调整见实施说明。

安装 Node.js 后，可在项目根目录进行静态校验：

```powershell
node tools/validate_military_migration.cjs "F:/SteamLibrary/steamapps/common/Hearts of Iron IV"
node tools/check_country_equipment_conditions.cjs "F:/SteamLibrary/steamapps/common/Hearts of Iron IV"
```

将上述路径替换为本机游戏安装目录。工具会更新对应的 `docs/` 校验记录。静态校验不代替游戏内界面、生产、战斗和存档测试。

实施细节与验证边界见 [文档索引](docs/文档索引.txt)。
