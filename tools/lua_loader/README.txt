HOI4 Lua 内容构建器 0.1.0
=========================

内容用 Lua 编写，构建器生成普通 HOI4 Mod 文件。Lua 在外部 Node.js / Fengari 中执行。
游戏继续使用自身的文件加载方式；本原型没有注入 hoi4.exe，也没有注册或启用新 Mod。
Steam 安装目录是只读输入。所有产物放在本目录 build/ 下，不参与本项目当前加载。

运行
----
在 tools/lua_loader 目录执行：

  npm run build
  npm test
  npm run verify

本机已安装依赖；换电脑后先执行：

  npm ci --ignore-scripts --no-audit --no-fund

需要可运行 Node.js 和 npm，本机 Node 位于 D:/app/nodejs/node.exe。
默认游戏目录：F:/SteamLibrary/steamapps/common/Hearts of Iron IV。
可指定其他游戏目录：

  node cli.cjs build --game "F:/SteamLibrary/steamapps/common/Hearts of Iron IV"

测试和 verify 使用 HOI4_GAME_ROOT 环境变量指定其他安装位置。
HOI4_USER_DATA 可为输入层测试和 verify 指定用户数据目录。
npm test 在缺少对应原版文件或用户配置时跳过相关本机检查；verify 要求没有跳过项。

输入配置与来源检查
----------------
  node cli.cjs inspect
  node cli.cjs inspect --dlc installed
  node cli.cjs build --profile active
  node cli.cjs build --profile active --dlc installed

inspect 生成 build/input-profile/input-profile.json，读取当前 dlc_load.json 和已注册 .mod 描述。
build --profile active 使用对应候选输入视图，输出到 build/active-preview。
默认 --dlc none：记录 DLC 元数据但不挂载其内容。
--dlc installed：挂载本机已安装且未显式禁用的描述文件所指内容；不代表已验证所有权或引擎授权。
--user-data 指定用户数据目录，默认本项目上两级的 Hearts of Iron IV 目录。
可用 --profile "完整播放集备份路径.json" 读取 playsets_backup 导出的 enabled / position / steamId。
不读取或修改 launcher-v2.sqlite，不更改当前播放集，不自动启用依赖或 DLC。
备份里的 Steam ID 或显示名匹配到多个注册描述文件时直接报告错误，不猜测应选哪个。
已启用的同名依赖参与排序，未启用的声明列为诊断；当前原型不把这些声明一概解释成必须启用。
来源报告记录输入根目录、replace_path、元数据哈希、声明差异及未验证边界。

两个示例
--------
1. 默认显示示例：demo/config.json，只加载 core.lua。
   输出 build/preview/，共 6 个文件，另有构建报告。
   生成独立中文本地化文件、新 Sprite、新纹理、GUI 容器及 Scripted GUI。
   科技页附加说明面板限定 No Step Back 与 16 个幻想乡原始国家标签。
   不生成 NSB_armor.txt，不替换 Technologies.gfx，不更改原版公共装备图标键。
   本地化追加使用 basic_medium_tank_chassis_desc 同名键，会影响所有使用该键的地方。
   国家可见性限制只作用于附加面板，不作用于这个公共本地化键。
   图标复用项目已有 tank_magic_engine.dds，不生成新美术。

2. 科技合并演示：demo/merge.json，加载 core/basic/advanced 三个 Lua 包。
   两个补丁包分别修改基础、改进中型坦克节点。

  node cli.cjs build --config demo/merge.json --out build/merge-proof

   输出 build/merge-proof/，共 7 个文件，另有构建报告。
   此模式会生成同虚拟路径的 common/technologies/NSB_armor.txt 替代文件。
   修改点仅为两条 desc；原版完整字段和解锁内容从当前输入继承。
   它不写入安装目录，但仍然覆盖原版数据库文件，不能称为零原版覆盖。
   两条描述是全局字段修改，演示包尚未按国家生成动态描述。
   此模式用于证明组合补丁与数据保留，不应用来重新修改当前项目的科技体系。

两个输出都是独立预览目录，生成 descriptor.mod 不等于启动器已注册它们。
当前生产 Mod 的 common/、interface/ 和 localisation/ 没有接入这些示例产物。

Lua API
-------
每个 Lua 文件返回一个内容包，文件顺序不决定执行顺序；requires 声明依赖。
以下是基础用法，完整实例在 demo/*.lua：

  local p = hoi4.package {id="my.content", requires={"other.content"}}
  for i=1,3 do
    p:localisation {language="simp_chinese", key="my_item_"..i, value="条目 "..i}
  end
  return p

可用操作：

  localisation {language, key, value}
    输出一个本地化键，值是普通 Lua 字符串。
  append_localisation {language, key, value}
    捕获输入原文后追加；原文缺失即报错，不把 $同名键$ 当成继承语法。
  asset {source_root, source, target}
    从命名输入根目录逐字节复制资源；路径使用正斜杠。
  sprite {name, texture, frames?}
    输出独立 .gfx；检查纹理可解析，frames 可选。
  panel {id, parent, title, body, icon, tags, x?, y?}
    输出固定尺寸说明面板与 Scripted GUI。title/body 是本地化键，icon 是本包定义的 Sprite。
    parent 当前只支持 technology_tab、production_tab、tech_armor_folder。
    tags 必须显式提供，示例使用 original_tag 判断，含 No Step Back 条件。
  patch {file, path, action, key, value? / items?}
    file 是虚拟路径，path 是连续的唯一块节点标识，例如 {"technologies","basic_medium_tank_chassis"}。
    set 使用 Clausewitz 源码字符串 value，替换或新增一个字段。
    remove 删除一个已有字段。
    append_unique 使用 items 标识列表，在保留旧值的基础上去重追加。
  emit {file, content}
    直接输出文本；同文件不能同时采用 emit 和 patch。
    可承载目前尚未封装的原生事件、国策等定义，不代表已提供各领域的高级 Lua API。

组合、覆盖与保护
--------------
默认 CLI 按“原版输入 -> touhou114 输入”解析当前有效文件，后者优先。
--profile 模式读取启用顺序并按已启用依赖生成候选顺序；DLC 层位于原版之后、Mod 之前。
没有经冷启动确认这与所有版本的引擎加载顺序一致，不用注册数量或安装状态证明内容已在游戏里启用。
使用别的输入组合时，调用 builder.cjs 的 compile({sources,packageFiles,...}) 显式提供有序来源。
来源可指定 root 或 archive，replacePaths 处理低层目录排除；高层存在的同路径文件直接胜出。
本地化先按虚拟路径选择可见文件，避免已被整文件替换的低层条目重新出现。
然后按来源顺序和 normal -> replace 顺序组合，相同层文件按名称排序。
这是本构建器定义的确定性规则，不能当作所有游戏版本的完整加载顺序模型。

ZIP 输入在内存中读取，不解压落盘。支持 ZIP32 的 Stored/Deflate，并检查大小及 CRC32。
拒绝 ZIP64、分卷、加密、软链接、旧式非 ASCII 文件名编码与不支持的压缩方法。
档案限制 256 MiB，单条目限制 64 MiB；这些是原型限制，不是 HOI4 本身的限制。
报告 inputs 记录 ZIP 容器哈希，selectedInputs 记录实际读取条目的来源和内容哈希。
报告 localisationOrigins 给出追加本地化捕获的原文来自哪个来源和虚拟文件。

依赖缺失、循环和包 ID 重复均报错。
同字段不同值直接报错；相同操作与值可以去重。
父节点整块替换与子节点补丁同时出现时直接报错，防止静默丢失子节点修改。
多个追加操作需要明确依赖关系，包括传递依赖；不会用包名顺序替代作者声明的优先级。
重复块或重复字段无法唯一选择时直接报错。本原型不提供按序号选择重复 if 等节点。
源码未涉及部分保持原有字节，不做全文件重新排版；最终还会执行基础结构解析。

输出只允许在 lua_loader/build/ 或 .test-output/ 的子目录内。
不接受路径穿越、Windows 保留文件名、大小写别名冲突或逃逸根目录的源符号链接。
拒绝覆盖没有构建标记的非空目录，也拒绝覆盖被手工修改的已有生成文件。
只清理前一份构建报告登记且校验通过的过期文件，其他文件保留。
相同构建不重写未变化产物；报告包含 Lua 包、数据输入和输出 SHA256。

验证与边界
----------
36 项自动检查，包括真实 Lua 执行、本机原版科技完整字段对比、国家标签过滤、纹理字节保留、
冲突失败路径、循环预算、输出保护、播放集/依赖、目录排除、ZIP CRC、真实 ZIP 和重复构建。
详情见 test/builder.test.cjs 与 test/input.test.cjs。
npm run verify 重跑检查、生成三种预览及当前输入诊断，保存 docs/Lua加载器研究/原型验证结果.json。
build-report.json 标记 engineVerified=false；基础文本解析通过不等于引擎语义验证通过。
面板的视觉位置、尺寸、中文字体、真实挂载和各分辨率表现仍需游戏冷启动检查。
只有简体中文示例，没有完整多语言回退策略。

Fengari 是 Lua 5.3 实现，整数、GC 等与原版嵌入 Lua 5.1 环境不同。
移除了 io/os/require/debug 等入口并设置指令预算，供可信作者构建内容使用。
这不是针对恶意代码的完整隔离环境，也没有为标准库大分配提供独立内存上限。
没有引擎对象绑定、进程挂钩、运行时热载、存档迁移或联机同步验证。
这些能力不能仅凭 PE 导出的 PhysFS 符号或构建示例推导出来。
