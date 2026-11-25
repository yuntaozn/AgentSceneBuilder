# 数字模型库

`registry` 为 AI 大模型提供可检索、可计算、可组合的开源数字模型。Agent 使用 `registry search` 找到条目，从清单读取模型的语义、参数和锚点，从生成索引 `registry/registry.json` 读取 `agent` 使用说明，再按任务需要构建、调整或组合模型。网页模型库和编辑器使用同一批条目，供查看和复核。

模型库收录 `component`（参数化构件）、`method`（空间建模方法）和 `composition`（完整模型）。完整模型表达由多个构件组成、对象边界明确的物体或系统。每个条目使用独立目录与 `manifest.json`，贡献者可复制同类条目后提交 Pull Request。

模型库网页与编辑器可以同时按领域、条目类型和关键词筛选。输入以空格分隔的多个词即可缩小范围，例如「风管 变径」。

当前示例条目必须能够由 Core 数字几何独立生成，不接受把 GLB/GLTF 文件作为模型本体。未来即使加入外部表现资源，也只能作为可选适配层，不能替代参数、结构和语义定义。

内容积累从可独立复用的构件和单体模型开始。例如无人机条目表达机身、旋翼和云台，巡检案例再组合无人机、外墙和测区。锚点连接、阵列、路径等可复用计算由空间方法提供。Agent 可用场景案例检查这些基础模型能否组合和复用。

## 日常家具、零售、餐饮与影像

- 日常家具提供桌腿、走线桌面、抽屉、柜门和万向脚轮。可直接打开工作桌或收纳柜整件，再调节翻盖、抽屉、柜门和脚垫。
- 零售提供货架立柱、搁板、洞洞板、挂钩、价签槽和线框篮。搁板可安装在不同高度，挂钩可换到任一有效孔位。陈列架整件和收银台可独立放置。
- 餐饮提供意式咖啡机机身、旋锁手柄、实孔滤篮、磨豆机、奶缸、咖啡杯和称盘。咖啡机整件保留滤篮随手柄转动、杯子随接水盘移动的结构关系。
- 影像与音频提供显示器支架和屏体、桌夹式麦克风悬臂、录音话筒、监听音箱和调音台。显示器和播客麦克风也有整件，安装点与观看或拾音方向可分别读取。

同一个场景可以使用多个领域的模型。例如先将桌脚与桌面组合，再把显示器的 `desk` 锚点对齐桌面的 `surface`。CLI 使用与网页相同的领域 ID。

```powershell
node packages/cli/src/agentscene.mjs registry search --domain furniture --kind component
node packages/cli/src/agentscene.mjs registry search "播客" --domain media
node packages/cli/src/agentscene.mjs registry search "咖啡机" --domain foodservice
node packages/cli/src/agentscene.mjs registry search "陈列" --domain retail
```

## 体育健身、出行与光学教学

- 体育与健身提供乒乓球台半幅、带轮底架、可调网柱、球拍、哑铃杆和中孔配重盘。球台两片台面沿各自铰轴折转，哑铃两侧可以继续叠加配重。
- 出行与旅行提供自行车车架、辐条轮组、可转向前叉、可升降鞍座，以及独立旅行箱壳、脚轮和伸缩拉杆。整车前轮随车把转向，旅行箱整件保留四轮回转和两级拉幅。
- 光学与教学提供四工位底板、升降立柱、凸透镜、四叶光阑、带孔板的示教光源和网格像屏。水平实验台与立式载片观察架可使用同一个透镜条目，分别读取机械安装面和光轴。

```powershell
node packages/cli/src/agentscene.mjs registry search "乒乓" --domain sports
node packages/cli/src/agentscene.mjs registry search "自行车" --domain mobility
node packages/cli/src/agentscene.mjs registry search "光学" --domain optics
```

## 乐器、露营与包装

- 乐器与演出提供军鼓鼓体、三脚鼓篮、铜镲、踩镲架、舞台键盘、双 X 支架和延音踏板。鼓篮升高时带动鼓体，两张镲片可共用一个条目并分别跟随固定托座和可动抽杆。
- 户外与露营提供帐篷篷面、分段拱杆、地钉、睡垫、露营灯、保温箱壳与线框篮。双拱帐篷带实际开口的独立篷门，保温箱内篮可随托架抬出。
- 包装与容器提供四摇盖纸箱、插槽隔板、开口玻璃罐、环封罐盖、泡棉端托、护角和打包带。纸箱可分别配合四格瓶罐内隔或对向泡棉端托，箱盖与箱内物品位置可独立调整。

```powershell
node packages/cli/src/agentscene.mjs registry search "踩镲" --domain music
node packages/cli/src/agentscene.mjs registry search "帐篷" --domain outdoor
node packages/cli/src/agentscene.mjs registry search "纸箱" --domain packaging
```

## 办公文具、宠物用品与家庭清洁

- 办公文具提供可翻封面、对开夹环、三孔活页纸、文件托盘、层架、订书机和双孔打孔器。活页夹整件保留独立的封面与夹环开度，双层文件盘的两张索引片可各自移动。
- 宠物用品提供猫爬架底板、可叠装猫抓柱、偏置踏板、猫窝、食盆、双盆架和猫砂铲。同种四孔立柱可叠到不同高度，两只食盆可按各自孔心嵌入同一承板。
- 家庭清洁提供双腔桶、可转甩水篮、拖布盘、伸缩拖把杆、吸尘器机体、地刷吸管和晾衣架。拖把整件默认位于甩水篮，吸尘器在吸管调姿后仍可独立抽出尘杯。

```powershell
node packages/cli/src/agentscene.mjs registry search "活页" --domain stationery
node packages/cli/src/agentscene.mjs registry search "猫爬架" --domain petcare
node packages/cli/src/agentscene.mjs registry search "吸尘器" --domain housekeeping
```

## 家庭园艺、纺织手作与桌面电子配件

- 家庭园艺提供三孔陶盆、接水盘、可提根团的观叶植物、盆缘支架、育苗接水座、育苗杯和透明盖。六格育苗盘复用同一款苗杯，每杯可独立取出，两片通风片可单独调节。
- 纺织手作提供带配件抽屉的机身、压脚、缝针杆、线轴、刺绣内外绷圈和绣布。缝纫机可分别调整针杆和压脚。绣绷提起内圈时带动布样。
- 电子设备新增双仓硬盘底座、可抽托架、四孔存储盘、集线器、回转托座、短线和理线夹。两个仓位各自抽换。集线器和线缆配接点随托座共同回转。

```powershell
node packages/cli/src/agentscene.mjs registry search "育苗" --domain gardening
node packages/cli/src/agentscene.mjs registry search "缝纫" --domain textilecraft
node packages/cli/src/agentscene.mjs registry search "硬盘" --domain electronics
```

## 水族造景、陶艺工坊与美术画具

- 水族造景提供玻璃缸、滑窗盖板、跨缸灯、背挂过滤盒、滤芯匣、石拱和喷淋管。滤芯匣可逐片提出，投喂窗和灯条可单独调节，石拱有贯通洞口。
- 陶艺工坊提供拉坯机底座、双销轮头、双孔坯板、可分挡泥盘、敞口陶瓶、压片床和压辊车。陶坯随坯板转动并可一同提起。压辊随行程联动转动，压片间隙可单独调整。
- 美术画具提供三脚底座、升降立杆、画布、六格色盒、小颜料盒、调色盘和水彩笔。画布随下画托移动，六色水彩盒重复使用同款可提色格，各自保留颜色和取出动作。

```powershell
node packages/cli/src/agentscene.mjs registry search "水族箱" --domain aquarium
node packages/cli/src/agentscene.mjs registry search "拉坯" --domain ceramics
node packages/cli/src/agentscene.mjs registry search "水彩" --domain artsupplies
```

## 基础构件拼装示例

下列示例 JSON 可用于 CLI 校核。由可编辑组合实例构成的场景也可通过编辑器的「导入 JSON」打开。

矩形梁、柱、板和 U 形桥架带有随几何更新的连接锚点。可分别检查梁柱板的接触位置，以及直线桥架和弯头的对接位置与方向。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/beam-column-slab-bay.json
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/cable-tray-connection.json
```

「直跑楼梯」和「带门洞隔墙」也可以从编辑器模型库加入当前场景。选择构件后直接修改踏步、墙体和门洞尺寸，锚点会随重建更新。

建筑开间样例包含实心隔墙、带门洞和窗洞的隔墙、平开门、固定窗、楼梯、平台板及栏杆。平开门与固定窗使用 `fit-*` 锚点对应墙体的 `opening-*` 锚点。墙和栏杆可直接调参，门窗可整组定位或分部件编辑。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/architectural-bay.json
```

楼层构件样例演示楼梯接开洞楼板、坡道接平台、转角墙接直墙，以及吊顶板定位到龙骨网格。龙骨网格作为整体加入场景，主龙骨、横撑和吊杆各自保留重复原型。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/floor-and-ceiling-assembly.json
```

两层两跨立面样例包含门窗洞口、窗台板、重复分格板、阳台板与栏杆、入口雨棚、檐沟和屋顶女儿墙压顶。可用连接报告检查关键位置和方向。库里的洞口过梁和矩形落水口也可在同类场景独立定位。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/two-storey-facade.json
```

双格幕墙样例包含立柱、横梁、固定中空玻璃、上悬开启扇、楼板转接角码与竖向遮阳。可检查双格接缝和 90 度转角各自的玻璃定位。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/curtain-wall-glazing-and-sunshade.json
```

钢构与桩基样例使用 H 形梁柱、四孔底板、柱脚锚栓和承台。底板的 `bolt-*` 点对齐锚栓座面，`column-seat` 对齐钢柱柱脚，承台底面的 `pile-*` 点对齐桩头。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/steel-bay-and-piles.json
```

室内开口与交通样例可验证双扇门、推拉门、推拉窗和百叶入洞，折返楼梯接楼层，检修口与板块分别入格，以及直圆扶手与斜接件拼装。门窗和检修盖板可在编辑器动画列表预览。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/interior-openings-and-circulation.json
```

门窗五金样例包含止口框、三节合页、闭门器、推杆、执手和下沉密封。移门上轨的两个吊轮与地面导向可分别检查。另有断桥铝剖面、弹扣压条、真实透气格卷帘与可动外窗护扇。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/door-and-window-hardware-details.json
```

场地排水与铺装样例包含两段带支座的 U 形沟、条缝格栅、侧进水集水井和独立圆井盖。路缘石转角、人行铺装边缘和相邻铺装块分别提供拼接点。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/site-drainage-and-paving.json
```

道路与挡墙样例连接双坡道路、边沟、降坡路缘、带侧翼过渡坡和人行铺装。旁侧展示挡墙、雨水井筒与井盖、渗蓄盒模块和带真实开挖空间的基槽断面。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/roadside-crossing-retaining-stormwater.json
```

临建样例连接盘扣立杆、底座、横杆、斜向杆、双横管护栏、挂钩脚手板和连墙件，并展示独立翻盖梯口、转扣与临时网片围挡。盘扣锚点绑定重复节点的具体层位。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/temporary-scaffold-and-site-perimeter.json
```

装配式墙板样例展示楼面斜撑座、墙板安装面、底部灌浆层、背衬竖缝和双肢吊索。局部节点单独展开套筒、插筋、进出浆弯管和封塞，便于查看中心孔和两个侧口。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/precast-wall-panel-installation.json
```

结构监测样例覆盖应变、位移、振动和倾角测点。应变片的测轴校核独立于粘贴位置，接触式位移计分别对接梁底和地面参考支架。另有信号引线与采集节点、三层埋入测温和表层探头。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/instrumented-structure-bay.json
```

木屋架样例使用墙顶托木、三榀屋架、双侧基层、八片锁边板和屋脊盖。连接覆盖支脚、基层上下表面、相邻屋面板、檐口滴水边与独立通风节点。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/timber-gable-roof.json
```

木构楼面样例检查架空柱脚、分层胶合木梁、五层正交胶合木楼板和带门洞墙板。分开的木节点包括榫眼与凸榫、木搁栅与前后托件、两条企口板，以及带鸟嘴座口的木椽。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/timber-floor-and-joint-details.json
```

基础钢筋与模板样例分开表达垫层、保护层垫块、上下网片、马凳、柱插筋、箍筋、模板对拉杆和槽钢背楞。旁侧两个柱脚分别展示坡形基础支承和杯口插入。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/foundation-rebar-and-formwork.json
```

屋面防水样例可检查女儿墙泄水口到雨水斗、双弯雨落管和墙箍的连接。另有屋面防叶罩、墙根圆弧基层、收头压条、楼板变形缝盖条、中埋止水带和墙根泛水节点。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/roof-rainwater-and-waterproofing.json
```

砌体样例拼装双孔块上下错缝、水平灰缝与拉结网，并检查内外叶拉结、企口砌块、直角转角、过梁槽和独立钢筋笼。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/masonry-bond-and-lintel-assembly.json
```

轻钢隔墙与吊顶样例使用上下轨、卷边竖龙骨、矿棉和退边石膏板。局部用隔振扣与帽形龙骨安装吸声板，并检查吊顶托边、方板和两点悬挂条板。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/drywall-and-suspended-ceiling.json
```

楼梯与栏杆样例把钢格栅梯接平台、随坡栏杆、挡板和防滑包边。旁侧展示圆扶手回弯及托架、转角扇步、带平台直角楼梯和中柱式螺旋楼梯的接续方向。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/stair-landings-and-guardrails.json
```

矩形风管直段、水平弯头和手动调节阀均提供方向锚点。手柄操作包络可作为独立构件参考 `handle-axis` 安装，包络尺寸可按项目需要设置。下面的样例可检查风管端口及包络的接入位置和方向。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/rectangular-duct-and-damper.json
```

风管变径样例演示平顶偏心段、织物软连接、保温层、顶开圆支口与可翻检修盖。另一条路线通过方圆过渡接圆管，再向下接四面扩散风口。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/duct-transitions-and-terminal-airflow.json
```

给排水样例使用地漏、中空管、弯头、带检修塞的三通、承插套管、同心变径、球阀和 P 形存水弯。校核同时检查接口位置、方向和声明外径，承插示例还保留了管段的插入距离。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/sanitary-pipe-connections.json
```

电气样例上部拼装桥架三通、分隔板、扣盖、侧拼接片和吊杆横担。墙面部分连接硬质线管、下弯、双口接线盒及可挠尾管，并展示暗装底盒与翘板面板。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/electrical-conduit-and-tray-assembly.json
```

卫浴样例使用双孔台板、椭圆台盆、下水篮、存水弯、龙头和两路供水软管。淋浴区另有四面找坡底盘、玻璃隔断、混水阀、顶喷与可折座板，可以检查安装面和管口。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/basin-and-shower-fixture-assembly.json
```

消防与疏散样例布置喷头、探测器、报警盒、方向指示和可开门消防箱。旁侧展示穿墙填充框与分体管箍、双口接合器以及可展开的风管阀体。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/fire-service-and-egress-modeling.json
```

泵房样例包含法兰短节、双鼓软接、闸阀、过滤器、止回阀、偏心变径和带隔振台座的离心泵。泵后管路接分集水器和稳压罐，另有沟槽卡箍和可动的手动泵、旋塞及压力表。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/pump-room-flanged-pipe-assembly.json
```

地坪样例并排展示环氧试板、V 槽修补、无机磨石分格、圆弧踢脚和瓷砖排缝。还可检查架空地板的支座、横梁、带孔面板与穿线刷盖，面层厚度为便于观察的示意尺寸。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/floor-finishes-and-access-floor.json
```

照明样例使用吊顶平板灯和筒灯、可转向轨道射灯、吊灯、壁灯和庭院柱灯。灯体、接口和渲染光源分别可编辑，可检查顶装基座、轨道端头和侧接线管。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/ceiling-and-wall-lighting-fixtures.json
```

预制楼板样例包含空心板及灌浆纵缝、双 T 板及肋底垫、倒 T 梁和带牛腿支承的缺口梁。另一侧展示压型钢板、嵌合的混凝土叠合层、挡浆角和板缝预埋件。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/precast-hollow-core-double-tee-and-metal-deck.json
```

电梯样例把导轨、接板、墙支架、两种导靴、轿架和轿厢带入同一个井道剖面。双槽门槛和两片层门各有可检查的接口，上部展示曳引轮与单根绳的接触段，旁侧另有导向轮和叠片对重。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/elevator-shaft-guide-and-landing-assembly.json
```

屋面光伏样例将组件分别装在直立锁边夹座和压载三角架上，带轨道接头、端压和中压夹具。还可查看穿孔检修踏板、过线座及壁挂设备的接线端点。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/roof-photovoltaic-mounting-and-cable-assembly.json
```

景观样例把四段树池围边与分片树篦子闭合，旁侧有通气帽、结构土框、植草沟和溢流口。绿化屋面剖面展示蓄排水层、种植盒和巡检围盒，与滴灌管线、阀门盒和地埋喷头一起可编辑。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/landscape-tree-pit-green-roof-and-irrigation.json
```

紧固件样例按压紧组件、锚固剖面、销轴与柜板接头布置。平垫、弹垫、碟簧和球面垫圈可替换查看，开口销贯穿销轴横孔，墙板背面的折翼和柜板偏心轮可单独预览。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/fastener-stacks-anchors-and-pin-details.json
```

教学空间样例展示带穿线孔的课桌、可翻阶梯座椅、分体储物柜、教室白板和吊装投影件。实训区可分别选择台下柜、台面、深槽盆、集中服务梁和洞洞板配件。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/classroom-auditorium-and-training-workbench.json
```

厂房样例包含双榀钢屋架和冷弯 C/Z 檩条，能检查拼板、角托和钢拉条。另有蜂窝腹板梁、暗扣夹芯墙板、压型板底口，以及带进气孔的屋脊和檐口部件。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/steel-industrial-frame-and-envelope-details.json
```

公共卫浴样例带壁挂便器、水箱支架、独立座圈、洗手盆和可上翻扶手。隔间的板、支脚、横梁、门铰链与插锁可分别编辑，入口附有双侧过渡板和淋浴挡水条。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/public-washroom-and-access-entry-details.json
```

厂房行车样例把双侧轨道与端梁、双轮缘车轮、箱梁、小车、卷筒和吊具连起来。还可分别观察轨腰接板、弹性挡块、检修走台以及挂在工字梁下翼缘的手动小车。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/overhead-crane-runway-and-lifting-details.json
```

仓储样例将开孔立柱、挂接梁、网层板、托盘与周转箱组合成货架。输送线包括直段、万向球台和直角辊道，另有装卸月台的调节板、独立搭唇、提升门轨道及软帘门罩。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/warehouse-rack-conveyor-and-loading-dock.json
```

施工巡检样例并排布置洞口盖板、临边网片、防护通道、材料架、临时照明和电缆保护件。车辆冲洗区的格台、歧管、喷嘴和可拆沉淀池件可以逐项查看并核对接口。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/site-inspection-washdown-protection-and-services.json
```

质量检测样例把拉拔头、反力架、标准块和环切试样分开安放，并展示地坪测厚、平整度和墙面测缝件。外墙对照区包括正常粘结、局部空鼓和窗边含湿剖片，以及带独立镜头轴的双光云台。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/floor-adhesion-and-facade-inspection-coupons.json
```

空气处理机组样例串联混合、热回收、初效与袋式过滤、盘管、加湿、挡水、检修、风机和消声段。凝结水盘、水封、取压件和风机盘管末端可以单独检查和组装。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/air-handler-filters-coil-fans-and-condensate.json
```

机电支吊架样例包含开口槽钢与拼接件、翼缘吊夹、弹簧吊架、立管导向、隔热管托和滑动管鞋。穿墙密封链与穿板翻边套管保留实际通孔，便于单独检查密封件、套管和载流管。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/pipe-strut-support-and-penetration-details.json
```

生活给水样例同时展示字轮和超声水表、可拆滤杯、双止回防回流器、留有空气间隙的漏斗以及四路分水器。热水支路可分开检查混水阀、循环泵、平衡阀、温度计护套、排气阀和防水锤活塞。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/domestic-water-metering-and-hot-water-return.json
```

地下管网样例展示带预留孔的预制井、偏心检修口、井内流槽、可拆井盖、埋地管接头和出水拍门。电缆排管区展示四孔定位件、手孔井穿管和井内喇叭口，可逐处检查连接和插入深度。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/underground-vault-pipe-joints-and-duct-bank.json
```

玻璃门厅样例包含带地弹簧与双面拉手的摆门、带齿带与防脱吊车的自动滑门，以及四翼旋转门。门扇、拉手、吊轮及旋转翼扇随各自机构联动，地垫排水盘和空气幕可独立检查。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/glazed-building-entry-sliding-and-revolving-door.json
```

活动隔墙样例展示分岔吊轨、停车弯轨、可下落检修轨盒、伸缩顶封和地封、末扇收口和独立小门。另有两级折叠隔断，以及能查看实际孔腔的吸声面板和蜂窝夹芯剖件。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/operable-acoustic-partitions-and-folding-wall.json
```

结构变形缝样例包含楼地面滑盖、屋面防雨罩、外墙伸缩罩、吊顶阴缝与缝下接水槽。还可查看多种支座、阻尼器、传力杆和预制板滑移节点的剖面及运动行程。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/structural-movement-joints-bearings-and-dampers.json
```

停车与慢行样例组合了道闸、地感线圈、反光减速带、抬升横道、无障碍标牌和自行车架。充电立柱可以独立查看插接头、挂线架和电缆走向，车位地锁、道闸杆与慢行门可以分别预览动作。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/parking-access-slow-streets-and-ev-bays.json
```

低压配电样例展示柜架、仪表门、帽形导轨、三极断路器、接触器、母排绝缘支架和带中心孔的互感器。顶进线密封窗、底进线格兰头和柜内检修照明可以独立编辑，门面仪表与门板联动。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/low-voltage-cabinet-din-and-cable-transits.json
```

装配式湿区样例展示调平底架、带坡底盘、偏心地漏、企口墙板和吊顶换气口。冷热水服务盒、可拔检修盖、整体台盆及快接排水短节均设有独立连接点。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/prefabricated-wet-room-tray-and-services.json
```

干挂外墙样例按支座、竖龙骨、横轨、背栓和饰面展示石材安装。可独立查看陶板空腔、GRC 后肋、纤维水泥板铆孔、保温与防风膜，以及窗头、窗侧和通风底口。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/structure/ventilated-rainscreen-stone-terracotta-and-window.json
```

## 工具、设备和工作端

「施工工具」领域包括扭矩扳手、棘轮扳手、三种尺寸的方驱套筒、管钳和压接钳。握持点、方驱、套筒紧固端、钳口或模具均有锚点。叉车支持门架倾斜、货叉升程和中心距。

角磨机、旋转锤、瓷砖切割机、取芯钻机和钢筋弯曲机均可作为单体调用。切割轮和 SDS 钻头也有独立条目。测量仪器提供三脚架安装点、全站仪光轴和棱镜反射轴，可用于定位与装配。

施工设备可按作业类型检索托盘搬运车、垂直升降平台、压路机、输送机、链条葫芦、地坪研磨机和集尘机。需要组合机械结构时，可以独立调用轴承座、联轴器、燕尾滑台、脚轮、压紧夹具和滑轮吊具。

伸缩臂叉装机本体带两级伸缩和可倾挂板。双叉架可以单独调用，通过挂板锚点与本体配接，再调节双叉中心距。

塔机底架、格构标准节、回转平台、带小车吊臂、平衡臂、附墙拉撑和液压顶升套架分别入库。标准节可重复叠接，前后吊臂可随回转平台转动。

施工升降机分为齿条标准节、吊笼、上滑钢网门、楼层过渡板和附墙伸臂。标准节可保持齿距连续叠接。吊笼上升时小齿轮同步转动，网门可装在吊笼前口并单独开合。

外墙作业可独立调用屋面悬臂、双悬点吊篮、穿绳牵引机、伸缩靠墙轮和四吸盘玻璃吊梁。吊篮端部提供驱动座及导轮座，可分别安装并调节各机构。

盾构组件提供开放辐条刀盘、可重复插装的盘形滚刀、三排盾尾刷、预制管片和径向拼装机。滚刀随刀盘共同转动，管片可沿同一圆心按周向接缝组合。

桩基机具分为可摆立架与动力头、两级旋挖钻杆、底开钻斗、空心取芯筒和护筒夹。动力头与钻杆按同轴接口配接，钻斗和取芯筒可装在同一个钻杆末端。

桥梁施工可把格构导梁装到双轴顶推托座上，再装侧导轮。托座升降和纵移会带动两件附件，导轮也可横向细调。穿索顶升机与双吊车节段吊梁为独立条目。

路面施工设备可独立调用摊铺机、振动找平梁和手推开槽机。挖机的破碎锤、双瓣抓斗、螺旋钻和压实轮也可独立复用，均保留挂接轴孔和工作端参考。

混凝土面层施工还可调用座驾双盘抹光机、激光整平车、可换振捣刮梁、填胶车和六轴铣刨鼓。整平车带动挂装刮梁升降，梁的横坡和后刮板仍可单独调节。

地下设施可单独调用双级隧道射流风机、分块式穿墙管密封环、带翻转格栅的曲底边沟、可升降测头的地下水观测立管和轮式抽排水检测台。使用条目中的管路、测点和固定安装锚点布置模型。

消防和防排烟模型包括湿式报警止回阀、活塞压力开关、三位置试水排水阀、三节垂降防烟分隔模块和独立吊架。试水阀可显示全流、试水和关闭三个几何位置。Agent 可按两侧吊点对接吊架和防烟模块，再调整挡片垂降量。

建筑防涝与排水模型包括地坪齐平翻升挡水门、侧装棘轮驱动盒、雨水排口拍门、直角地沟转角箱和可升降堰盒。门体和驱动盒以同轴锚点对接。堰盒提供独立的堰顶位置、固定排水口和拦污板提取位置。

光伏运维模型包括双轨清扫小车、可快换滚刷、浮动刮水头、便携 I-V 测试仪和折叠检修承台。两件清洁头与小车共用一套快挂孔位。Agent 可分别调节小车行走、头部高度和工具自身动作。

重载运输模型可分别调用低平板挂车底架、可拆鹅颈、双轴均衡摆臂轮组、牵引车鞍座、折叠轮挡和可调宽运输托架。使用固定锚点拼装底架、鹅颈和轮组，再分别设置坡道角、均衡摆臂和连接锁销位置。

电梯井道新增双甩块限速器、配重回绳张紧器、对楔式导轨夹持器、液压缓冲器和层门双滚轮联动件。两只绳轮公开成对绳路线。导轨夹持器可用现有 T 形导轨的 `guide` 锚点定位并调整楔块位置。

自动扶梯部件包括带工作轨和回程轨的斜桁架、两端过渡轨、带槽梯级、可调梳齿板、双链轮和扶手回转端。Agent 可通过配对轨端装配三段轨道，并用梯级槽和梳齿的真实轮廓检查端站啮合位置。

机房模型补充可调导轨服务器机架、可开启液冷后门、抽拉分液托盘、可抽风扇的服务器托架、液冷快接、双风道送风地板和翻盖穿线盒。设备可从机架前后锚点分别挂装，检修时可独立移动托盘、风扇和换热门。

仓储设备包括轨行双立柱堆垛机、三节双深位伸缩货叉、托盘穿梭车、可拼接货架双轨、末端挡爪和升起式皮带分流模块。堆垛机载台与货叉可分开替换，穿梭车可绑定双轨模型的活动锚点并独立升降。

通用农机包括独立拖拉机本体、三点升降快挂、护罩式伸缩传动轴、箱式刮平器、四行可调工具梁和双盘开沟行单体。Agent 可替换后挂具，再分别设置快挂高度、刃口、限深轮和行距。

大体积混凝土温控可独立调用四程预埋盘管、放气立管、双路冷却撬、保温回水罐、五深度测温架、采集盒和折叠养护毯。可通过中空管口布置冷却回路，再把各深度测温点分别映射到采集通道。

装配式保温外墙新增带真实窗洞的夹芯外墙板、断热连接杆、双道密封竖缝、双向窗洞胎具、带注排口灌浆套筒及吊装螺套。可用两叶板上的盲孔安装面定位断热杆，再调整卡环对齐夹芯层厚度。

独立基础补充了杯口插脚方柱、四爪校正套框、可拆注浆围领、四片模板、双层钢筋笼和四角吊具。方柱与校正框可装到现有杯口柱基。钢筋笼与吊具提供四组成对锚点，保护层垫块可独立调整。

围护检测新增双面片热像靶、外墙滚动敲击探头、气密采样杯、门框风机、幕墙淋水检测轨和热桥对比试片。模型公开固定安装面、可动测点及测试方向，可分别布置到竖墙、门框或夹芯试件。

综合机电补充双层预制吊架、快挂滚轮管托、双仓线缆托盒、矩形风管伸缩短节、旋转圆风管弯头和五滚轮穿线导向盒。吊架各层附件可分别挂装，风管短节提供独立伸缩法兰与可打开的真实探视口。

桥梁支座检修增加单向球面支座、对楔调平垫、双轴位移测头、临时顶升托台、同步双缸顶升架和低位抽换小车。可把支座布置在调平件上，也可将顶升架独立装上托台，分别调整滑移、标高和找平角。

隧道初期支护可调用低位伸缩湿喷台车、独立快挂喷头、双搅轴湿料斗、双封隔注浆套、三段钢拱肋和拱肋双爪夹具。喷头随台车臂段移动并保留独立角度，拱肋则可用拱顶和两侧脚位布置。

工业地坪设备新增闭式抛丸机、快挂回收鞋、磁辊分选盒、双料送料车、可抽芯静态混合管和双刃浮动布料槽。抛丸机与回收鞋的快挂座使用对齐开口，送料车与混合管使用两路彼此分开的对接口。

架空配电补充八角配电杆、双层横担、带转向线鞍的柱式绝缘件、跌落熔断器、杆挂翅片设备、楔形导线夹和复合伞裙避雷器。可分别布置杆体、横担和上下挂件。调节相间距时附件会随对应挂座移动。

增材制造补充三轴封闭机架、可换细丝头与膏料头、四角找平平台、双卷耗材盒、喷嘴擦拭槽和触面基准。Agent 可在同一四孔快换座选用两种工具，读出三轴叠加后的喷嘴位置，再单独操作取板和维护配件。

冷库构件补充抬升移门、独立下导轮、偏心锁接缝、双风扇冷风机、交错透明条帘及断热门槛。固定导轮可在门扇全行程留在槽内，冷风机的风扇罩和接水盘则可各自抽出。

海绵场地增加路缘树池过滤箱、可换导流进水唇、四向渗排立井、屋面弃流过滤筒、透水铺面剖件和根区透气环。进水唇与树池箱以同一方孔对位，筛篮、格盖和铺面拆取可分别示位。

地下电缆设施包括四孔牵引井、分瓣扩口护线套、双层导管定位架、跨沟三滚轮、编织牵引网套和走线计长夹。井两端各有四个实体孔，Agent 可对齐任一管口、安装护套并独立调整井内支架。

站台通行增加两级填隙踏板、快换弹性软鼻、双柱升降台、独立快换坡板、便携站台搭板和站台间隙检测尺。可组合填隙踏板与软鼻，也可把坡板挂到升降台后单独控制翻转。

钢板桩基础件补充帽形板桩、双偏心振动锤、快换夹桩头、双梁导向架、折叠检修台和分瓣岸桩护舷。板桩以互补锁边逐件对齐，振动锤可分别挂载夹头和板桩，再设置双轴和夹爪位置。

水处理设备补充斜置转鼓筛、外接清洗排、抽拉斜板沉淀束、带走行刮板的澄清槽、叠环螺旋压滤机和可提曝气轨。转鼓筛和清洗排用固定孔坐标挂接，筛鼓转动、整体倾置与喷座转角可分别设置。

洁净制造设施增加双门风淋舱、吊装滤箱、V 形可换滤芯、侧抽地板回风格栅、滤盒检修小车和齐平引线座。送风舱、箱体与滤芯使用成对锚点连接。移动滤芯架时，舱体顶部接口保持固定。

冬季道路维护新增双翼雪铲、双级旋转除雪头、侧摆扫路滚刷、拖挂颗粒撒布机、可调雪障和手推破冰铲。前三种工作头与现有滑移装载机铲斗复用同一快挂几何，可按作业需要替换并分别设定翼角、出料方向或滚刷位置。

机械停车可调用双柱升降架、双轮挡承车盘、地坑转向台、低位托盘搬运车、折转止扣和伸缩双轨搭坡。承车盘可分别放上升降架或转向台，随主体移动并保持两只轮挡独立翻转。

装配送料可组合六工位分度盘、四孔快换楔形夹具、螺旋振动料碗及双挡指分料块。各工位和四孔位置随盘转动，外部输送基准保持固定。槽轮与圆柱凸轮另有可分部件调姿的独立模型。

压缩空气设备包括可抽换热芯的冷干机、储气罐剖件、旋流分水器及配套聚结滤芯、双快接下降支管和壁挂软管卷盘。分水器沿轴放下滤杯时，两个气口和滤芯安装位仍固定。

道路材料试验可搭配单轮车辙台、四孔试件托盘和位移探针。旋转压实机另配独立开合试模，台座倾摆、模盘角度、压头和顶出盘分别调节。摆式抗滑仪可以独立调用。

航空测绘可直接插入六旋翼摄影测量无人机，也可分别调用六接口机架、共用旋翼臂、折叠起落架和双视角相机载荷。两个镜头各自公开光轴锚点。折叠四象限像控板可与三脚微调底座组合布置。

叉车属具可将独立调距货叉、纸卷圆弧夹和滑托板推拉器装入同一侧移载架。双套筒吊臂和折叠挡货架另可沿标准叉尖配接，现有对重式叉车的默认叉距可直接对齐。

管内检测可独立调用推索盘、弹簧颈摄像头、四滚轮定心环、支管导向滑靴、井缘导索桥和摄像标定筒。摄像头可在定心环和摆臂滑靴之间换装，光轴和尾部推索端继续可读。

水暖末端提供可揭盖的中空蛇形盘管地板、四回路分集水器、独立嵌墙检修柜、传热槽、地槽对流器和浮子计。分集水器可随柜内挂轨调整位置，各回路阀独立调姿。

检修出入工装包括伸缩三脚架、独立腿挂卷扬、洞口围栏、插座式可调坡角梯及双销横接梁。卷扬随三脚架外腿展开，短梯改变坡角时四个踏面保持水平。

包裹分拣可用同一标高组合十二轮抬升转向台、直线检重带和侧向三道滑槽。分拣轮与称重面可分别调整，三处输送对接面固定。上压带、推件拨杆和三测头扫描门架可以独立放置。

公铁两用作业车可整机调用，底盘和带四孔座的轨轮桥也可独立使用。前后轨轮桥独立升降，轮距也可在独立桥件中调节。双轨道口板、轨轮承托车和轨头轮挡为单独的基础模型。

玻璃加工可单独调用双工位磨边机、快换可倾磨头、双触针量规、封边回转台、间隔条折弯头及双面周转架。两个工位共用磨头的四孔基准，磨头可随工位升降并独立改变倾角。

下悬单轨设备可组合工字轨梁、四轮小车和四孔钢丝绳葫芦。双滑轮钩组、C 轨托缆车和翼缘端挡也能单独调用。葫芦设有固定出绳基准，卷筒转角与抽罩行程可分别调整。

管材加工可组合双排压指床与直缝枪头，也可分别使用四点对口夹、双刀修面头、管内双囊剖件和双坡口钢管对接剖件。剖件保留实际内腔和连续坡口，能分别调整根隙与错边。

开启桥可组合活动桥叶、剖分耳轴座、四孔配重托、滑移锁楔、驱动缸和双限位组件。桥叶带动配重和桥鼻一起转动，固定锁座独立设置，锁楔在桥叶落下后可推入真实锁孔。

材料实验室可组合温湿试验箱、抽取试件架和穿壁探针。剖切式竖轴振动台与水平滑台采用同一四孔座，一件十字槽夹具可在两台仪器之间换装。

地源换热可分别调用双 U 管剖孔、井口盖、四孔定心架、井底回弯、分配井和热响应试验小车。两个 U 管独立抽出，井口盖与定心架的四条穿管位置共用同一组坐标。

既有基础托换可组合微型桩头、四孔偏心承台、低净空顶升盒和双鞍针梁。顶升盒随偏心承台横移，并能独立升高。垫架和沉降基准支架可以另外布置。

预制楼梯可分别调用十级梯段、双销休息平台、两孔快拆栏杆柱、隔振承垫、吊梁和端缝尺。两枚休息平台销可独立伸入梯段插座，栏杆柱能安装在梯段或平台的同式预埋座上。

苗木栽植可独立调用低位周转车、分体土球护篮、树干防撞架、根区灌溉环、双探针标高桥和临时跨沟踏板。护篮可放在周转车上，两侧半篮和两只承托座分别调整。

育苗设施新增三槽位滚动苗床、四孔潮汐托盘、给水集管和托盘快换夹。托盘可在苗床的任一槽位安装，带实际贯通的底部排水口和可抬堰板。

传动基础件新增脚座电机剖件、横向张紧滑座、蛇形簧联轴器、剖分轴承座、变距带轮、多片摩擦限矩器和分口锥套。Agent 可按脚孔及同轴端面组合电机、滑座和联轴器，并读取实际键槽、转子位置和拆盖动作。

平地机本体有前置作业盘与后挂座，分别可对接回转侧移刮刀和五齿松土架。滑移装载机本体与快挂齿形铲斗也分开入库，方便调整抬升与卸料姿态。

散料设备可独立调用双层振动筛、旋转给料阀、双出口分流阀、带开盖的螺旋输送机、旋风分离器和吨袋卸料机。Agent 可以使用进出料锚点组织设备位置，单独调整转子、分流板、检修盖和吨袋升降位置。

材料回收可分别布置颚式破碎机、双轴撕碎机、开孔滚筒筛、带式磁选机和双出口风选箱。双刀轴反向联动，滚筒筛的开孔筛面与粗细料出口可直接引用。

传动条目提供开罩行星减速机构、四锥齿轮差速器、滑动花键轴套、牙嵌式离合器和双链轮滚子链。行星减速机构的输入角按固定比联动输出行星架。差速器可分别控制壳体和两半轴的差转量。

液压元件可分别调用四口三位滑阀、双出杆液压缸、活塞蓄能器、测压接头和可拆滤罐。双出杆沿同一轴等量移动，两处油口保持固定，可用来检查线性驱动端与概念管路的布置。

装卸口两级伸缩皮带机提供随末级运动的配接端，铰接过渡滑板可单独装上并调节角度。路面检测组提供推车探地雷达、线激光检测架、落锤检测头和可调四探头传感梁。检测头和传感梁可按固定接口组装。

土工检测新增分瓣取土器、十字板剪切仪、方形直剪仪、固结环室和滑锤式圆锥贯入仪。固结环室可调加载盖，直剪仪具有独立的横向剪切与竖向加载轴。

结构试验可调用四点弯曲加载横梁、独立试验支辊、锚栓拉拔座、可调位移表磁座和双向裂缝标距片。加载横梁可对称改变两辊间距，环形拉拔座保留实际贯通轴孔。

无损检测新增管焊缝环扫导轨、双楔块超声探头、真空盒、双脚磁轭和涡流阵列滑架。可把探头装在环扫小车上，分别设置周向位置和两探头间距。

排水与施工供给有潜水泵、注浆泵、热熔对接机、风机和照明灯塔。吊斗底门、搅拌筒、卷扬机导绳口和叉装夹桶器的活动端均在清单中提供锚点。

管道工装新增冷切管机、手摇支管开孔机、三脚滚轮支座、双环对口夹具和六瓣内撑芯轴。开孔机可对接既有机械开孔鞍座，刀轴进给和手轮角度单独调节。

钣金设备提供三辊卷板机、踏板剪板机和手摇压筋机。双滚轮进料支架与卷板机有等高的默认进出料锚点，另有可独立复用的 T 槽式定长挡尺。

自动化设备提供六轴工业机械臂本体、平行夹爪、四吸盘抓具、双导杆气动滑台、同步带模组、中空分度台和电动推杆。Agent 可以用末端法兰配接抓具，单独调整机械臂关节、夹爪开口或吸盘间距。

三轴立式铣床本体、机床主轴筒和八工位转盘刀库都能单独调用。铣床分别提供工装台和刀具锚点，刀库为八个刀位分别提供安装锚点。

机械臂快换主盘和工具从盘是两个独立条目，分别提供 `tool-dock` 和 `master-dock` 对接锚点。从盘的另一端保留 `tool-flange`，可与夹爪的 `robot-flange` 配接。

移动搬运由低位顶升底盘、地装充电座与三点托盘转运支座三个单体组成。可用充电触点对齐底盘和充电座，再按底盘顶升行程与支座承面检查托盘交接。

动力托盘辊道、回转换向台和四导柱升降移载台提供同一默认辊面高度，以及各自的进料和出料锚点。Agent 可以组合这三个单体来表达直行、换向和垂直移载。

Agent 可以通过清单里的 `editor.document.parameters.poseControls` 调整模型姿态，通过 `anchors` 读取安装、测量或工作基准。下列命令检索全站仪并检查其编辑文档。

```powershell
node packages/cli/src/agentscene.mjs registry search 全站仪 --kind component --domain instrument
node packages/cli/src/agentscene.mjs composition check registry/components/instrument/survey-total-station/manifest.json
```

在「施工设备 → 完整模型」中搜索「无人机」，可以找到独立的「建筑巡检双光四旋翼无人机」。在模型库可预览无人机本体。在编辑器模型库可单独打开，也可以选择「加入当前场景」，继续编辑旋翼、云台与电池。

需要自定义巡检无人机时，Agent 可从四接口机身基座开始，重复安装折叠旋翼臂，再配接尾置电池盒或下挂扫描头。停放舱也为独立条目，开盖和机体停放可使用各自的控制与锚点。

下面的场景可以导入编辑器。叉车示例用两条连接检查货叉与插孔的位置和朝向。套筒示例展示同一方驱在三种规格间复用。无人机示例可在组件树中分别显示可见光与红外的示意视场，改变云台角度后两个视场随镜头一起转动。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/equipment/forklift-pallet-alignment.json
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/equipment/interchangeable-ratchet-sockets.json
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/equipment/drone-facade-field-of-view.json
```

## 可动建筑与场地构件

建筑开口可独立调用翻盖排烟窗、顶轨平移门、齿条门机、卷帘滚轴侧导轨、挡水板和传递窗。场地构件提供地埋升降路桩和桥面梳齿伸缩缝。Agent 可以使用固定安装锚点布置构件，再通过姿态参数检查启闭、升降或伸缩包络。

围护和维护构件新增可叠收的竖轴遮阳翼、伸缩雨篷、平行外移窗、屋面检修盖和两段检修梯。检修盖和梯保留固定配接位置，翻盖、折梯及梯段伸缩分别编辑。

机电条目可独立调用电动变风量末端、冷凝水浮球排水器、直通滤筒、链式开窗器、可视流动指示器和排水防倒灌阀。进出接口锚点和检修运动单独定义，便于把它们装进管路或窗体组合。

沟槽支护板及伸缩撑杆各有独立条目。Agent 可将撑杆的两端与两张面对面侧板的销接座配对，再沿撑杆的位移更新外侧板。撑杆每隔 0.08 米设一个可插销的孔位。

轨道基础可分别调用轨枕、带弹条的扣件、带实孔的钢轨短节和鱼尾夹板。两段钢轨拼接后，夹板与两段轨腰的四处螺栓孔对应。轨距尺和双尖轨转换机构提供各自的测量点及运动控制。

轨道养护设备新增巡检小车、四镐捣固头、可倾砂轮打磨小车、双夹口拉轨器和低位起轨千斤顶。捣固头的工作端可同步下降，两组捣镐可相向夹动。

施工交通设施可调用销接围挡、升降导向屏、三槽过线坡板、翻折标牌架和两段伸缩横杆。围挡可沿销轴重复配接，过线坡板打开盖后保留三个固定通道。

临建箱房可用上下角件与独立双头扭锁叠接。三步钢梯、入口坡道、后墙接口箱及可调落脚座也分别入库，门、扭锁和附属件可独立调姿。

水处理设备提供可升降渠道闸门、倾斜清污格栅、双泵集水坑和四口板式换热器。导轨潜水泵可分别装在集水坑的两个接座上，翻开检修盖时两个排水口保持固定。

冷热源设备可独立调用双风扇热泵室外机、可抽管束管壳换热器、引风冷却塔和四通换向阀。管壳换热器有独立的壳侧与管侧接口，管束可在端盖让位后沿轴抽出。

机房检修可组合后抽离心泵的固定湿端壳与叶轮泵芯。抽出泵芯时两处管口保持固定。联轴器半罩、两只激光对中测头和回转伸缩检修悬臂吊也可独立调用。

电气检修可分别调用开关承座、开关抽屉、双层电池架、电源盒和分相母线槽接头。开关抽屉与护门独立移动，两层电池托架也可分别设定抽出位置。

工位通风可独立调用双回转排风臂、可倾吸气罩、双滤筒除尘箱、圆风管插板阀和下吸工作台。吸气罩可装在排风臂末端，两个回转关节与罩口俯仰分别调节。

基础和装配工序可调用双向锚栓定位框、预制墙板调平工装和快拆试模。地坪工序可调用消泡针辊、双滑靴刮膜齿耙、双桨搅拌机和接触式含水检测仪。

预制生产可单独布置钢筋滚丝机、网片点焊机和矩形钢筋笼胎架。A 字墙板运输架可在活动托座安装限位夹，托座调距时带动夹具，夹臂仍可单独翻开。

模板工装新增单侧三角支撑、带附墙锁舌的爬模导轨、早拆落头、折叠台模腿和可调内角模板。早拆落头的承顶盖固定，承梁托盘和卸荷拨片分别调节。

公共建筑可独立调用四级伸缩看台、折背座椅、两段检修步桥、三扇屏蔽门及四丝杆升降台。看台与座椅以安装孔位置配接，折背和行级收回可独立控制。

木结构可把两件楼板盒通过独立双槽插板接在同一标高，分别调整其中一件检修盖或拼条。另有胶合木梁双耳销座、斜拼夹具和可翻防拔扣座。

## 两层框架智能检测

在模型库搜索「两层混凝土框架智能检测」，打开后点击画布测点或「监测」中的测点编号。沿时间轴比较加载、稳载与卸载，查看传感器方向、读数、阈值与报警。位移通道使用固定在底板上的参考支架，探杆随梁中点移动。

```powershell
node packages/cli/src/agentscene.mjs composition monitor registry/compositions/two-storey-structural-monitoring/manifest.json D-01
```

## 面向 Agent 的条目说明

条目可以包含可选 `ai` 字段，用来告诉 Agent 这个条目应该如何被使用，而不是只描述它“看起来是什么”。

推荐字段：

- `intent`：该条目真正沉淀的能力或结构意图。
- `useWhen`：适合调用的任务情境。
- `avoidWhen`：不适合使用、需要 Agent 自行决策或需要更高阶能力的情境。
- `editableParts`：建议 Agent 优先修改的构件、参数或路径。
- `qualityChecks`：使用后应验证的结构条件。
- `commonVariants`：常见变体，不要求写成唯一标准。

构建 `registry/registry.json` 时，脚本会为每个条目生成 `agent` 上下文，合并手写 `ai` 与可推导结构信息，包括参数名、锚点、节点数量、几何类型和重复原型。Agent 应优先读取 `agent.intent`、`agent.useWhen` 和 `agent.qualityChecks`，再决定是否直接使用、改造或只把条目作为参考。

运行 `npm run registry:check` 校验清单，运行 `npm run registry:build` 更新 `registry/registry.json`。调整目录或标题时保留稳定 ID。破坏性协议修改需要提升条目主版本。
