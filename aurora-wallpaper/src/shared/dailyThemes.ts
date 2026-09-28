/**
 * Aurora Wallpaper — AI 每日主题池（纯本地、确定性轮换）
 *
 * 设计要点（契约 §4）：
 * - 12 个月各配一个主题池，每月池 ≥ 12 个主题，覆盖 ≥ 8 个类别
 *   （山川 mountain / 湖海 lake / 星空 starry / 城市 city / 国风 chinese /
 *    萌宠 pet / 节气 solar / 抽象艺术 abstract / 花草 flower / 森林 forest）；
 * - dayIndex = floor(北京时间（UTC+8）自然日自 1970-01-01 起的天数)，
 *   每日从当月池按 dayIndex 偏移连续取 6 个（池循环使用、去重不重复），
 *   同一天任意时刻计算结果恒定，跨天自动轮换；
 * - 完全离线计算，不依赖网络与外部服务。
 */

import type { DailyTheme } from './types';

/** 每日返回的主题数量 */
export const DAILY_THEME_COUNT = 6;

/** 北京时间（UTC+8）相对 UTC 的时间偏移（毫秒） */
const UTC_PLUS_8_MS = 8 * 60 * 60 * 1000;

/** 一天的毫秒数 */
const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* 主题池（数组下标 0 = 一月，依次至 11 = 十二月）                        */
/* ------------------------------------------------------------------ */

/**
 * 每月主题池。各字段含义见 DailyTheme：
 * - id：稳定英文 slug（全局唯一、跨版本不变，UI 以 id+日期做「已生成」标记）；
 * - name：中文主题名（卡片标题）；
 * - description：中文主题句（喂给 promptEngine / generateImage 的主题描述）；
 * - icon：类别标识（UI 自行映射图标/渐变，phase-1b 消费）。
 */
export const MONTHLY_THEME_POOLS: DailyTheme[][] = [
  /* ------------------------------ 一月 ------------------------------ */
  [
    { id: 'snow-peak-winter-sun', name: '雪岭初晴', description: '巍峨雪山在冬日晴空下银装素裹，山脊线条清晰锐利，远处云海翻涌', icon: 'mountain' },
    { id: 'frozen-lake-dawn', name: '冰湖晨曦', description: '结冰的湖面泛着淡蓝晨光，岸边雾凇晶莹剔透，宁静而空灵', icon: 'lake' },
    { id: 'aurora-polar-night', name: '极夜极光', description: '深邃夜空中绿色极光如绸带舞动，雪原反射着幽幽光晕', icon: 'starry' },
    { id: 'old-town-lanterns', name: '古镇灯影', description: '江南古镇石板街挂满红灯笼，倒影在冬夜的河面上摇曳生辉', icon: 'chinese' },
    { id: 'ink-flow-abstract', name: '墨韵流动', description: '水墨在宣纸上自然晕开的抽象形态，浓淡干湿层次分明', icon: 'abstract' },
    { id: 'plum-blossom-snow', name: '踏雪寻梅', description: '红梅傲雪绽放，枝头积雪与点点花瓣相映成趣', icon: 'flower' },
    { id: 'cat-by-heater', name: '暖炉猫眠', description: '橘猫蜷在冬日暖炉边的毛毯上熟睡，呼噜声中透着慵懒', icon: 'pet' },
    { id: 'minor-cold-forest', name: '小寒林语', description: '小寒时节寒林薄雾疏影，晨光穿透雾气洒在覆雪地面', icon: 'solar' },
    { id: 'city-warm-lights', name: '都市暖灯', description: '冬夜城市街头暖黄路灯，车流光轨与飘雪交织成温柔画面', icon: 'city' },
    { id: 'northern-snowfield', name: '北国雪原', description: '辽阔雪原上孤树独立，蓝调时刻天光云影静谧悠远', icon: 'mountain' },
    { id: 'koi-ink-wash', name: '锦鲤墨韵', description: '红白锦鲤在墨色水波中游弋，国风笔意与留白相得益彰', icon: 'chinese' },
    { id: 'winter-star-trails', name: '寒夜星轨', description: '冬季夜空长时间曝光的同心圆星轨，雪山顶一颗孤星明亮', icon: 'starry' },
    { id: 'ice-crystal-texture', name: '冰晶纹理', description: '冰面裂隙与气泡冻结瞬间的微距纹理，蓝色调极简美学', icon: 'abstract' },
  ],
  /* ------------------------------ 二月 ------------------------------ */
  [
    { id: 'huangshan-mist-peak', name: '黄山雾隐', description: '黄山奇峰在云海中若隐若现，晨光为峰林镀上金边', icon: 'mountain' },
    { id: 'west-lake-spring-dusk', name: '西湖暮春', description: '苏堤春晓柳丝拂水，远山如黛，暮色温柔铺满湖面', icon: 'lake' },
    { id: 'galaxy-over-sea', name: '海上银河', description: '宁静的海岸线倒映银河繁星，天海一色浩瀚无垠', icon: 'starry' },
    { id: 'tang-palace-dusk', name: '盛唐宫阙', description: '唐代宫殿飞檐斗拱，暮色中灯火初上尽显恢弘气象', icon: 'chinese' },
    { id: 'oil-paint-swirl', name: '油彩漩涡', description: '浓烈油彩在画布上旋转堆叠的抽象肌理，暖色调表现主义', icon: 'abstract' },
    { id: 'early-plum-branch', name: '早春梅枝', description: '梅枝斜逸入画，粉色花苞在春寒中蓄势待放', icon: 'flower' },
    { id: 'shiba-inu-snow', name: '柴犬踏雪', description: '柴犬在雪地里奔跑回眸，雪粒飞扬笑容治愈', icon: 'pet' },
    { id: 'rain-water-bamboo', name: '雨水竹林', description: '雨水节气春雨后竹林滴翠，笋尖破土带着晶莹水光', icon: 'solar' },
    { id: 'neon-wet-street', name: '雨夜霓虹', description: '雨后城市街道霓虹倒影在湿漉路面，蓝紫色调迷离', icon: 'city' },
    { id: 'cloud-sea-pine', name: '云海松峰', description: '高山之巅俯瞰云海，孤松立于崖畔守候日出', icon: 'mountain' },
    { id: 'fishing-boat-fires', name: '渔火帆影', description: '夕阳下渔船扬帆归港，点点渔火与晚霞交映', icon: 'chinese' },
    { id: 'meteor-wish-night', name: '流星许愿', description: '春夜流星划过深蓝天幕，山脊剪影静默守候', icon: 'starry' },
    { id: 'pastel-grad-clouds', name: '粉彩流云', description: '低饱和粉紫云层层层叠叠铺满天际，梦幻柔和', icon: 'abstract' },
  ],
  /* ------------------------------ 三月 ------------------------------ */
  [
    { id: 'peach-blossom-valley', name: '桃花溪谷', description: '春日溪谷两岸桃花盛放，落英随流水漂向远方', icon: 'flower' },
    { id: 'spring-terraced-fields', name: '春耕梯田', description: '灌水后的梯田如大地调色盘映着天光，农人春耕忙', icon: 'mountain' },
    { id: 'lijiang-old-town-night', name: '丽江夜色', description: '丽江古城四方街灯笼初亮，雪山轮廓在暮色中沉静', icon: 'city' },
    { id: 'misty-ink-landscape', name: '烟雨水墨', description: '远山近水在雨雾中晕成水墨长卷，一叶扁舟悠然', icon: 'chinese' },
    { id: 'kitten-petals', name: '花下猫影', description: '狸花猫在飘落的花瓣雨中仰头扑蝶，灵动可爱', icon: 'pet' },
    { id: 'spring-equinox-field', name: '春分麦野', description: '春分时节麦苗返青，田野尽头白鹭掠过', icon: 'solar' },
    { id: 'southern-aurora-isle', name: '南岛极光', description: '南半球岛岸夜空极光如帘，星辰与海浪共鸣', icon: 'starry' },
    { id: 'seaside-reef-dawn', name: '海边礁石', description: '春日海边黑色礁石群，浪花拍岸激起白色泡沫', icon: 'lake' },
    { id: 'bund-morning-light', name: '外滩晨光', description: '清晨外滩建筑群镀上金光，黄浦江面波光粼粼', icon: 'city' },
    { id: 'morning-mist-forest', name: '林间晨雾', description: '晨光穿过森林雾气形成丁达尔光束，青苔地面湿润', icon: 'forest' },
    { id: 'indigo-batik-waves', name: '蓝染波纹', description: '手工蓝染布的冰裂纹波纹肌理，靛蓝层次无穷', icon: 'abstract' },
    { id: 'night-cherry-blossom', name: '夜樱物语', description: '夜晚樱花树下灯光暖黄，花瓣飘落在石灯笼上', icon: 'flower' },
    { id: 'panda-bamboo-spring', name: '竹林熊猫', description: '大熊猫抱着春笋坐在竹林里啃食，憨态可掬', icon: 'pet' },
  ],
  /* ------------------------------ 四月 ------------------------------ */
  [
    { id: 'wuyuan-rapeseed', name: '婺源花田', description: '徽派村落白墙黛瓦簇拥在金黄色油菜花海之中', icon: 'flower' },
    { id: 'guilin-li-river', name: '漓江烟雨', description: '漓江两岸喀斯特峰林倒映碧水，竹筏划开雾面', icon: 'mountain' },
    { id: 'lakeside-dusk-clouds', name: '湖畔暮云', description: '春日晚霞将云层染成橘粉，湖面倒影层叠如黛', icon: 'lake' },
    { id: 'hanfu-garden-spring', name: '汉服游园', description: '身着汉服的少女在春日园林中执扇回眸，衣袂翩然', icon: 'chinese' },
    { id: 'goldfish-crystal', name: '琉璃金鱼', description: '红金鱼在清水中游动，光影折射如琉璃般通透', icon: 'pet' },
    { id: 'grain-rain-tea-hills', name: '谷雨茶山', description: '谷雨时节采茶人背着竹篓穿行于云雾缭绕的茶山', icon: 'solar' },
    { id: 'qingming-rain-alley', name: '清明雨巷', description: '细雨中的江南小巷，油纸伞下青石板泛着水光', icon: 'chinese' },
    { id: 'starry-campsite', name: '星空营地', description: '荒野营地帐篷里透出暖光，头顶银河横贯天际', icon: 'starry' },
    { id: 'suzhou-garden-spring', name: '苏式园林', description: '苏州园林曲径通幽，漏窗后海棠花开正盛', icon: 'chinese' },
    { id: 'cherry-riverside', name: '樱花河岸', description: '河道两岸樱花开成隧道，花瓣随流水漂成粉色丝带', icon: 'flower' },
    { id: 'watercolor-gradation', name: '水彩渐层', description: '水彩颜料在湿纸上晕染开的柔和渐层，春日色彩', icon: 'abstract' },
    { id: 'egret-pond', name: '白鹭池塘', description: '春塘边白鹭单足伫立，倒影与荷芽构成极简画面', icon: 'lake' },
    { id: 'ragdoll-windowsill', name: '布偶猫窗台', description: '布偶猫趴在洒满阳光的窗台上，蓝眼睛望向花园', icon: 'pet' },
  ],
  /* ------------------------------ 五月 ------------------------------ */
  [
    { id: 'may-terrace-reflection', name: '五月镜田', description: '初夏梯田蓄水如明镜，映着蓝天白云层层叠叠', icon: 'mountain' },
    { id: 'erhai-morning', name: '洱海清晨', description: '洱海晨雾未散，苍山倒影随渔舟缓缓荡开', icon: 'lake' },
    { id: 'grassland-milkyway', name: '草原银河', description: '内蒙古草原夜幕低垂，银河拱桥横跨天际线', icon: 'starry' },
    { id: 'dunhuang-feitian', name: '敦煌飞天', description: '敦煌壁画飞天衣带当风，藻井纹样与矿物颜料之美', icon: 'chinese' },
    { id: 'coral-tropical-fish', name: '珊瑚游鱼', description: '阳光射入浅海，珊瑚丛中热带鱼群穿梭如彩带', icon: 'lake' },
    { id: 'rose-garden-may', name: '月季花园', description: '五月月季盛放，晨露点缀的重瓣花朵层叠绽放', icon: 'flower' },
    { id: 'summer-begins-crickets', name: '立夏蝼鸣', description: '立夏时节蝼蝈鸣于田间，嫩绿秧苗随风轻摆', icon: 'solar' },
    { id: 'west-sichuan-snow-ridge', name: '川西雪岭', description: '川西高原雪岭连绵，五月草甸已返青，杜鹃点缀', icon: 'mountain' },
    { id: 'night-market-flames', name: '夜市烟火', description: '夏夜小吃街蒸汽与灯火升腾，人间烟火气十足', icon: 'city' },
    { id: 'bamboo-light-shadow', name: '竹影婆娑', description: '午后阳光穿过竹林，光斑洒在小径与青石上', icon: 'forest' },
    { id: 'kangding-wave', name: '康定波浪', description: '丹巴波浪谷状岩层曲线流畅，红岩与蓝天对比强烈', icon: 'abstract' },
    { id: 'grain-buds-wheat', name: '小满麦浪', description: '小满时节麦穗初齐，风过处绿色麦浪起伏', icon: 'solar' },
    { id: 'corgi-flower-field', name: '柴犬花田', description: '柯基犬在油菜花田里撒欢奔跑，短腿沾满花瓣', icon: 'pet' },
  ],
  /* ------------------------------ 六月 ------------------------------ */
  [
    { id: 'lotus-pond-summer', name: '荷塘消夏', description: '仲夏荷塘荷叶田田，粉荷亭亭立于晨光薄雾中', icon: 'flower' },
    { id: 'zhuoer-green-hills', name: '绿茵山甸', description: '祁连山下六月草原如绿毯铺展，野花开成星点', icon: 'mountain' },
    { id: 'milky-way-arch', name: '银河拱桥', description: '仲夏夜银河拱桥从山脊升起，与地面灯火呼应', icon: 'starry' },
    { id: 'forbidden-city-wall', name: '故宫红墙', description: '故宫朱红宫墙与琉璃瓦在夏日艳阳下饱和浓烈', icon: 'chinese' },
    { id: 'jellyfish-deep-blue', name: '深海水母', description: '深海中的水母群散发着幽蓝荧光，如漂浮的星空', icon: 'abstract' },
    { id: 'grain-in-ear-rice', name: '芒种插秧', description: '芒种时节水田如镜，农人弯腰插秧倒影成画', icon: 'solar' },
    { id: 'hk-harbor-night', name: '维港夜幕', description: '维多利亚港夜幕降临，霓虹与高楼灯影落满海面', icon: 'city' },
    { id: 'monet-water-lilies', name: '莫奈花园', description: '印象派笔触的睡莲池塘，光与色在水面交融', icon: 'abstract' },
    { id: 'cat-watermelon-summer', name: '猫与西瓜', description: '小猫趴在凉席上守着半只西瓜，夏日午后清凉惬意', icon: 'pet' },
    { id: 'lavender-field-june', name: '薰衣草田', description: '六月薰衣草进入盛花期，紫色花田与风车相映', icon: 'flower' },
    { id: 'stream-stone-moss', name: '溪石青苔', description: '山涧溪水流过覆满青苔的石块，水花如碎玉', icon: 'forest' },
    { id: 'fluid-grad-art', name: '流体渐变', description: '流体颜料在画布上流动交融的渐变纹理，清凉蓝紫', icon: 'abstract' },
    { id: 'summer-solstice-lake', name: '夏至湖光', description: '夏至白昼最长，湖面晚霞久久不散，天色澄澈', icon: 'lake' },
  ],
  /* ------------------------------ 七月 ------------------------------ */
  [
    { id: 'qinghai-lake-july', name: '青海湖畔', description: '七月青海湖畔油菜花金黄一片，湖水湛蓝如宝石', icon: 'lake' },
    { id: 'summer-alpine-meadow', name: '高山夏牧', description: '盛夏高山牧场绿意奔涌，牛羊散落如珍珠', icon: 'mountain' },
    { id: 'star-trails-timelapse', name: '斗转星移', description: '延时机位下夏季星空绕北极星旋转，山峦剪影静谧', icon: 'starry' },
    { id: 'firefly-forest', name: '萤火之森', description: '夏日夜晚萤火虫在林间飞舞，绿光点点如星河落地', icon: 'forest' },
    { id: 'big-fish-begonia', name: '海棠国风', description: '国风动画质感的海棠花与游鱼，红蓝撞色唯美', icon: 'chinese' },
    { id: 'koi-pond-summer', name: '锦鲤池', description: '庭院锦鲤池中红鱼摆尾，水波与倒影虚实交织', icon: 'pet' },
    { id: 'minor-heat-lotus', name: '小暑荷风', description: '小暑热风起时荷香满塘，蜻蜓立于花苞尖', icon: 'solar' },
    { id: 'coastal-city-dusk', name: '湾城暮色', description: '海滨城市日落时分，天空渐变成橘子汽水色', icon: 'city' },
    { id: 'burning-sunset', name: '晚霞如烧', description: '盛火烧云铺满整个天空，云层边缘金红灼灼', icon: 'abstract' },
    { id: 'lotus-moonlight', name: '荷塘月色', description: '月光下的荷塘朦胧静谧，荷叶间洒满银色碎光', icon: 'lake' },
    { id: 'panda-splashing', name: '熊猫戏水', description: '大熊猫在夏日水池里打滚扑腾，水花四溅憨态十足', icon: 'pet' },
    { id: 'minimal-blue-grad', name: '极简蓝调', description: '极简主义的深浅蓝色渐变几何构图，治愈系', icon: 'abstract' },
    { id: 'sunflower-field-noon', name: '向日葵田', description: '正午向日葵田金黄炽烈，花盘齐齐朝向太阳', icon: 'flower' },
  ],
  /* ------------------------------ 八月 ------------------------------ */
  [
    { id: 'hulunbuir-sunset', name: '草原日落', description: '呼伦贝尔草原日落，余晖把草浪染成金红色', icon: 'mountain' },
    { id: 'lugu-lake-flowers', name: '泸沽花海', description: '泸沽湖畔格桑花盛开，猪槽船划过镜面湖水', icon: 'lake' },
    { id: 'perseid-meteor', name: '英仙流星', description: '八月英仙座流星雨划过夏夜山脊，一颗火流星格外明亮', icon: 'starry' },
    { id: 'miao-village-lights', name: '苗寨灯火', description: '黔东南千户苗寨依山而建，入夜万家灯火如星图', icon: 'city' },
    { id: 'blue-white-porcelain', name: '青花瓷韵', description: '青花瓷缠枝莲纹样在素坯上晕开，蓝白相映典雅', icon: 'chinese' },
    { id: 'great-heat-cicada', name: '大暑蝉鸣', description: '大暑浓荫深处蝉声鼎沸，光斑在绿叶间跳跃', icon: 'solar' },
    { id: 'alpaca-highland', name: '高原羊驼', description: '毛茸茸的羊驼站在高原草甸上，背景雪山澄净', icon: 'pet' },
    { id: 'dog-days-clouds', name: '盛夏积云', description: '盛夏午后巨型积雨云耸立天际，光影立体如油画', icon: 'abstract' },
    { id: 'daocheng-adent', name: '稻城秋序', description: '稻城亚丁夏末秋初，雪山、海子与草甸同框', icon: 'mountain' },
    { id: 'harbor-night-fishing', name: '夜港渔灯', description: '夜晚渔港桅杆如林，渔灯在海面拉出长长光带', icon: 'city' },
    { id: 'end-heat-lotus-pond', name: '处暑荷塘', description: '处暑暑气渐消，荷塘褪去盛夏喧嚣归于沉静', icon: 'solar' },
    { id: 'forest-mist-valley', name: '林间幽谷', description: '清晨山谷森林雾气流转，绿意层层递进如仙境', icon: 'forest' },
    { id: 'hydrangea-rainy', name: '绣球烟雨', description: '雨季绣球花团锦簇，蓝紫花球沾满雨珠', icon: 'flower' },
  ],
  /* ------------------------------ 九月 ------------------------------ */
  [
    { id: 'kanas-early-autumn', name: '喀纳斯秋序', description: '九月中喀纳斯白桦转金，碧水与彩林交相辉映', icon: 'forest' },
    { id: 'golden-terrace-autumn', name: '金色梯田', description: '秋收前的梯田稻浪翻金，曲线随山势层层荡开', icon: 'mountain' },
    { id: 'great-wall-autumn', name: '长城秋晨', description: '晨雾中秋日长城蜿蜒于彩林山脊，气象雄浑', icon: 'mountain' },
    { id: 'crane-painting-style', name: '瑞鹤图卷', description: '宋徽宗瑞鹤图风格，青空之上群鹤盘旋祥云缭绕', icon: 'chinese' },
    { id: 'autumn-cat-window', name: '秋日猫望', description: '猫咪趴在窗台看落叶打旋，暖阳把毛发照得透亮', icon: 'pet' },
    { id: 'white-dew-reeds', name: '白露芦花', description: '白露后芦苇花絮如雪，晨露凝在芦秆上闪光', icon: 'solar' },
    { id: 'qiantang-tide', name: '钱塘涌潮', description: '八月十八潮，一线潮如万马奔腾拍岸而来', icon: 'lake' },
    { id: 'osmanthus-garden', name: '桂子飘香', description: '九月桂花缀满枝头，细碎金黄落了一地香雪', icon: 'flower' },
    { id: 'shangri-la-dawn', name: '香格里拉', description: '滇西北高原晨光初照，雪山金顶与草甸牛马', icon: 'mountain' },
    { id: 'starry-small-town', name: '星空小镇', description: '远离光污染的小镇夜空，星链般银河清晰可见', icon: 'starry' },
    { id: 'mid-autumn-lantern', name: '中秋灯彩', description: '中秋夜兔子灯与圆月同辉，桂花树下光影温柔', icon: 'chinese' },
    { id: 'ginkgo-first-gold', name: '银杏初金', description: '九月末银杏叶缘初染金色，蓝天衬得透亮', icon: 'forest' },
    { id: 'campus-autumn-afternoon', name: '梧桐校道', description: '大学校园梧桐大道落叶纷飞，午后阳光斜长', icon: 'city' },
  ],
  /* ------------------------------ 十月 ------------------------------ */
  [
    { id: 'ejina-populus', name: '额济纳胡杨', description: '十月胡杨林一夜鎏金，虬枝与黄叶在沙漠中燃烧', icon: 'forest' },
    { id: 'jiuzhaigou-autumn', name: '九寨彩林', description: '九寨沟秋日彩林层林尽染，海子碧蓝如宝石', icon: 'lake' },
    { id: 'bashang-autumn-herd', name: '坝上秋牧', description: '坝上草原秋色浓烈，牧群扬起尘土逆光成金', icon: 'mountain' },
    { id: 'crescent-spring-desert', name: '月牙鸣沙', description: '敦煌鸣沙山环抱月牙泉，大漠孤烟与驼队剪影', icon: 'chinese' },
    { id: 'maple-hot-spring', name: '枫汤秋暖', description: '红叶山谷中的露天温泉，热气与秋色氤氲交融', icon: 'forest' },
    { id: 'cold-dew-frost-leaf', name: '寒露霜叶', description: '寒露晨霜覆在红叶上，日光下霜晶与叶色交映', icon: 'solar' },
    { id: 'lijiang-fishing-fires', name: '漓江渔火', description: '秋夜漓江渔火点点，鸬鹚与竹筏剪影入画', icon: 'lake' },
    { id: 'wu-gorge-red-leaves', name: '巫峡红叶', description: '长江巫峡两岸红叶似火，江水碧绿穿峡而过', icon: 'mountain' },
    { id: 'harvest-terraces', name: '丰收梯田', description: '龙脊梯田稻谷归仓，晒秋的红黄点缀层层屋檐', icon: 'solar' },
    { id: 'panda-autumn-nap', name: '熊猫秋困', description: '秋日午后大熊猫窝在木架上酣睡，落叶落在肩头', icon: 'pet' },
    { id: 'sky-palette-oct', name: '天空调色板', description: '秋日黄昏天空如水彩调色盘，橙粉紫层次渐变', icon: 'abstract' },
    { id: 'ancient-town-moon', name: '古城明月', description: '秋夜古城墙头一轮满月，角楼剪影静谧苍茫', icon: 'city' },
    { id: 'oct-star-river', name: '秋夜星河', description: '秋高气爽夜空银河清晰，流星偶划过山脊', icon: 'starry' },
  ],
  /* ------------------------------ 十一月 ------------------------------ */
  [
    { id: 'changbai-tianchi', name: '长白天池', description: '初冬长白山天池静谧如镜，群峰环抱雪线初降', icon: 'mountain' },
    { id: 'ginkgo-avenue-gold', name: '银杏大道', description: '深秋银杏大道满地铺金，阳光穿过叶隙洒下光柱', icon: 'forest' },
    { id: 'first-snow-palace', name: '故宫初雪', description: '初雪落在故宫琉璃瓦与红墙上，一秒回到紫禁城', icon: 'chinese' },
    { id: 'winter-begins-tea', name: '立冬煮茶', description: '立冬围炉煮茶，炭火与茶烟在暖光里蒸腾', icon: 'solar' },
    { id: 'minor-snow-clear', name: '小雪初霁', description: '小雪节气初雪放晴，屋檐与枝头覆着薄雪', icon: 'solar' },
    { id: 'city-first-snow-night', name: '初雪夜城', description: '城市初雪的夜晚，路灯把雪花照成一根根光柱', icon: 'city' },
    { id: 'wetland-migratory-birds', name: '候鸟湿汀', description: '初冬湿地灰鹤与天鹅成群，芦苇荡在逆光中摇曳', icon: 'lake' },
    { id: 'metasequoia-red', name: '水杉红透', description: '十一月末水杉林红透，笔直树干倒映在静水中', icon: 'forest' },
    { id: 'mogao-starry-sky', name: '莫高星夜', description: '敦煌莫高窟外戈壁夜空，银河悬于九层楼之上', icon: 'starry' },
    { id: 'dry-landscape-zen', name: '枯山水禅', description: '水墨意境的枯山水庭院，砂纹与立石极简空寂', icon: 'chinese' },
    { id: 'shiba-scarf-walk', name: '柴犬围巾', description: '缠着小围巾的柴犬踩过落叶堆，表情一本正经', icon: 'pet' },
    { id: 'warm-hinner-grad', name: '暖调渐层', description: '暖橙到深棕的丝绒质感渐变，秋冬氛围治愈', icon: 'abstract' },
    { id: 'golden-larch-valley', name: '金秋落叶松', description: '川西落叶松林在秋末彻底金黄，溪流穿林而过', icon: 'forest' },
  ],
  /* ------------------------------ 十二月 ------------------------------ */
  [
    { id: 'snow-town-lanterns', name: '雪乡灯笼', description: '东北雪乡木屋覆着厚雪，屋檐下红灯笼温暖明亮', icon: 'chinese' },
    { id: 'meili-golden-summit', name: '日照金山', description: '黎明梅里雪山卡瓦格博主峰被朝阳染成金红', icon: 'mountain' },
    { id: 'rime-island-dawn', name: '雾凇晨岛', description: '吉林雾凇岛清晨玉树琼花，江面雾气缭绕', icon: 'forest' },
    { id: 'forbidden-snow-night', name: '紫禁雪夜', description: '雪夜的角楼在灯光下泛着暖光，雪片缓缓飘落', icon: 'chinese' },
    { id: 'winter-aurora-cabin', name: '极光木屋', description: '雪原小木屋烟囱冒着白烟，背后极光漫天舞动', icon: 'starry' },
    { id: 'major-snow-frozen-river', name: '大雪封河', description: '大雪节气江面冰排冻结，线条如大地抽象画', icon: 'solar' },
    { id: 'winter-solstice-pot', name: '冬至团圆', description: '冬至热气腾腾的饺子出锅，一家围坐暖意融融', icon: 'solar' },
    { id: 'new-year-fireworks', name: '跨年烟火', description: '岁末城市夜空烟花绽放，倒计时灯火通明', icon: 'city' },
    { id: 'snowfield-lone-tree', name: '雪原孤树', description: '空旷雪原上一棵孤树披雪而立，天光线极简', icon: 'mountain' },
    { id: 'blue-hour-ice-lake', name: '冰湖蓝调', description: '黄昏蓝调时刻冰湖泛着幽蓝，冰纹脉络清晰', icon: 'lake' },
    { id: 'swan-lake-winter', name: '天鹅冬湖', description: '冬日湖面白天鹅曲颈梳羽，热气在晨光中升腾', icon: 'pet' },
    { id: 'year-end-star-trail', name: '岁末星轨', description: '年末最后一夜星轨环绕北极星，岁月静好', icon: 'starry' },
    { id: 'red-lantern-snow', name: '雪中灯笼', description: '白雪覆盖的枝头挂着一串红灯笼，喜庆而宁静', icon: 'abstract' },
  ],
];

/* ------------------------------------------------------------------ */
/* 计算函数                                                            */
/* ------------------------------------------------------------------ */

/**
 * 计算北京时间（UTC+8）自然日自 1970-01-01 起的天数。
 *
 * 实现说明：「北京时间当天 0 点」= UTC 当天 16:00 前一天的 16:00，
 * 因此先把时间戳平移 +8h 再按 UTC 天取整，即得北京自然日序号。
 * 同一自然日内任意时刻结果恒定。
 *
 * @param now 当前时间（Date 或毫秒时间戳，默认取系统时间，测试可注入固定值）
 * @returns 自 1970-01-01（北京时间）起的天数（可为负，极早历史时间场景）
 */
export function getBeijingDayIndex(now: Date | number = Date.now()): number {
  const ms = typeof now === 'number' ? now : now.getTime();
  return Math.floor((ms + UTC_PLUS_8_MS) / DAY_MS);
}

/**
 * 取北京时间当月的月份下标（0 = 一月 … 11 = 十二月）。
 *
 * @param nowMs 当前毫秒时间戳
 */
function getBeijingMonth(nowMs: number): number {
  return new Date(nowMs + UTC_PLUS_8_MS).getUTCMonth();
}

/**
 * 获取某一天的 AI 每日主题（默认今天，北京时间）。
 *
 * 从当月主题池中按 dayIndex 偏移连续取 DAILY_THEME_COUNT 个，
 * 池子循环使用（越界回卷），由于池长 ≥ 12 > 6，单次结果内不会重复。
 *
 * @param now 当前时间（默认系统时间；测试注入固定时间以保证断言稳定）
 * @returns 6 个主题（若某月池意外不足 6 个则返回该池全部，防御性兜底）
 */
export function getDailyThemes(now: Date | number = Date.now()): DailyTheme[] {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const dayIndex = getBeijingDayIndex(nowMs);
  const month = getBeijingMonth(nowMs);
  const pool = MONTHLY_THEME_POOLS[month] ?? MONTHLY_THEME_POOLS[0];

  // 非负取模（dayIndex 理论上非负，防御历史时间场景）
  const start = ((dayIndex % pool.length) + pool.length) % pool.length;

  const themes: DailyTheme[] = [];
  const count = Math.min(DAILY_THEME_COUNT, pool.length);
  for (let i = 0; i < count; i++) {
    themes.push(pool[(start + i) % pool.length]);
  }
  return themes;
}
