# 角色美术候选调研（历史归档）

调研日期：2026-09-08。后续已按用户“可以试试”接入免费游侠与两种 Bestiary 怪物的试装变体。
本页保留当时的候选比较，付费候选不属于当前免费资产方案；实际资产、动画构建和运行时契约以 [角色资产](../game/actor-assets.md) 为准。
现代暗黑奇幻方向和免费资源方案见 [整体视觉评估](../game/visual-modernization.md)；不能把本页的历史试装当成最终美术方案。返回 [归档索引](README.md)。

## 风格判断

原来的 KayKit 主角和骷髅头身比偏大，表面接近纯色玩具，与场景中细密的草地、岩石纹理不协调。
候选优先采用正常人体比例、清晰的皮革与金属材质、克制的颜色；主角和敌人的细节密度应接近。
这是选型时对原有实机截图与作者预览图的美术判断；试装后的验证见资产文档。
场景草地的高饱和绿色也会影响协调性，后续试装应在相同相机和灯光下比较。

## 优先候选

| 候选 | 适合用途与判断 | 已核实的获取范围 | 动画与授权 |
|---|---|---|---|
| [Quaternius · Modular Character Outfits — Fantasy](https://quaternius.itch.io/modular-character-outfits-fantasy) | 游侠的正常比例、兜帽、皮带和护肩较适合守夜人；已试装 | 免费 Standard 为男女 Ranger / Peasant；完整服装与源文件包标价 $20。完整宣传图不等于免费内容 | CC0；试装已组合免费 Base Characters 头部与通用动作 |
| [Quaternius · Bestiary — Dungeon Monsters Kit](https://quaternius.itch.io/bestiary-dungeon-monsters-kit) | 与上述角色细节密度接近，完整包的骷髅、狼人和重甲敌人更适合敌群；已试装免费部分 | 免费 Standard 仅 Imp / Puglin，各三种配色；完整包七种怪物，Source 标价 $20 | 原包不含动画，试装已接通用动作；采用 QAL，不能按 CC0 处理 |
| [Hotstrike Studio · Free Stylized Dark Fantasy Skeleton](https://hotstrikestudio.itch.io/free-stylized-skeleton) | 骨骼与表面细节比现有骷髅丰富，可作为偏暗黑方向备选；仍有较夸张的头部比例 | 免费一个模型，作者提供 FBX、Blend 与 PBR 纹理；标注 9,402 三角形 | 仅绑定、T 姿势，需补动作；作者自有许可限制独立资源再分发；页面披露 AI Assisted |
| [Synty · POLYGON Fantasy Characters](https://syntystore.com/products/polygon-fantasy-characters-pack) | 统一的棱面风格，适合决定将角色与环境整体转为低多边形时采用 | $29.99，12 种人物，含 FBX 源文件；没有购买或下载付费文件 | 已绑定，明确不含动画；商业资源许可，不是 CC0 |

价格及免费范围以调研当天作者页面为准。Bestiary 的免费范围以作者的
[Standard 内容图](https://quaternius.com/assets/images/fullres/bestiarydungeonmonsterskit/standard.jpg) 为准；
不能采用官网通用的“60–70% 免费”说明推断七种怪物中有多少免费。
[QAL 原文](https://quaternius.com/license.html) 允许在游戏产品中使用，但限制把资源本身作为独立资产、模板或资源包再分发。
接入时必须保持各包许可边界，不能将新包误标成项目已有的 CC0。

本地下载并检查了 `Bestiary - Dungeon Monsters Kit[Standard].zip`：47,299,856 字节，
SHA-256 为 `94dbeed196b6ead9776c2ed0cfa02de818730886a25a507fb9d6c379bbbc4645`。
其中 GLB 只有 `Imp.glb` 与 `Puglin.glb`，均为一个 skin、零个 animation，且各含四张 image；
包内有 `License_Standard.txt`。这也确认当前单图集构建契约不能直接读取它们。
原下载包仅留在忽略的本地研究目录；实际采用的输入已作为该游戏的构建资源保存，并保留各自许可。

## 作者预览

主角免费部分：

![Fantasy Outfits 免费游侠与平民](https://quaternius.com/assets/images/fullres/modularcharacteroutfitsfantasy/standard.jpg)

Bestiary 完整包预览，含付费角色：

![Bestiary 完整包，含付费角色](https://quaternius.com/assets/images/fullres/bestiarydungeonmonsterskit.jpg)

## 排除与接入边界

- [RPG Character Pack](https://quaternius.com/packs/rpgcharacters.html)、[Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html)：虽然作者提供免费动画资产，实际预览仍偏大头、萌系，不解决这次的风格问题。
- Gobkit 当前免费 minion 也偏玩具风；网站宣传中的未发布奇幻模型不计入可选资源。
- 只有绑定不等于带动作。[Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) 是 CC0 动作来源；试装已验证免费版中的待机、慢走、小跑、持剑待机和施法待机，实际接入需做重定向。
- 原构建脚本只接受单内嵌图集、`Idle` / `Running_A` 动作；试装已改为动作重定向、多贴图烘焙和单 primitive，仍保留八帧 morph。
- 正式替换需先在当前俯视相机下验收轮廓、朝向、脚底高度、移动动作与四种敌人的辨识度，再记录源文件哈希、更新资产文档并执行浏览器验证。
- 保留构建期烘焙和固定实例池的性能路线；候选原始骨架不应变成每只怪物的运行时 AnimationMixer。

已试装 Fantasy Outfits 游侠；免费 Bestiary 以持械、姿势、配色与体型组成四种玩法表现，
明确是两个基础模型的试装变体，并非完整七怪物包，也未购买付费文件。
