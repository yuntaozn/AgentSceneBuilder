# 数字模型库

`registry` 是 AgentSceneBuilder 面向使用者和 Agent 的开源内容源。网站、编辑器和工具读取同一批条目；它不是下载式网格素材目录。

条目分为 `component`、`method` 和 `composition`。其中 `composition` 在网站中称为“完整模型”：它主要表达一个由多个构件组成、具有明确对象边界的完整物体或完整系统，而不是随意摆放的演示场景。每个条目使用独立目录与 `manifest.json`，贡献者可复制同类条目后提交 Pull Request。

模型库网页与编辑器可以同时按领域、条目类型和关键词筛选。输入以空格分隔的多个词即可缩小范围，例如「风管 变径」。

当前示例条目必须能够由 Core 数字几何独立生成，不接受把 GLB/GLTF 文件作为模型本体。未来即使加入外部表现资源，也只能作为可选适配层，不能替代参数、结构和语义定义。

完整模型只表达对象本身：车辆不附带运输货物，吊机不附带被吊构件，仪器不附带施工环境。锚点连接、阵列、路径等可复用逻辑归入 `method`；货物、作业对象和环境由使用者在编辑器中另行组合，避免课件场景边界污染数字模型边界。

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
