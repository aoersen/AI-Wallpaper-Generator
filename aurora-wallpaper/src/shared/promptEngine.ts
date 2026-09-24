/**
 * Aurora Wallpaper — 提示词引擎（纯函数，零 Electron 依赖）
 *
 * 职责：用户原始输入 → 题材扩充 → 风格模板 + 质量 boosters → 完善后提示词。
 * 10 种风格模板 + 编辑史管理 + 会话上下文注入。
 */

import type { EnhancedPrompt, PromptHistoryEntry, SessionContext } from './types';

/* ------------------------------------------------------------------ */
/* 风格模板                                                             */
/* ------------------------------------------------------------------ */

export interface StylePreset {
  id: string;
  label: string;
  template: string;
  boosters: string[];
}

/** 10 种风格模板 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'masterpiece',
    label: '名画风格',
    template: '古典油画构图，大师级笔触，博物馆收藏级光影，细腻的颜料质感与画布纹理',
    boosters: ['高细节', '8K 分辨率', '专业构图', '艺术光影', '质感丰富'],
  },
  {
    id: 'photography',
    label: '摄影风格',
    template: '专业摄影作品，浅景深，自然光捕捉，胶片质感，色彩还原精准，杂志封面级画质',
    boosters: ['高细节', '8K 分辨率', '专业构图', '色彩准确', '光影自然'],
  },
  {
    id: 'anime',
    label: '动漫风格',
    template: '日系动漫插画，赛璐璐上色，鲜明的轮廓线，柔和的光影过渡，新海诚风格',
    boosters: ['高细节', '8K 分辨率', '专业构图', '色彩鲜明', '线条清晰'],
  },
  {
    id: 'watercolor',
    label: '水彩插画',
    template: '水彩画风格，颜料自然晕染，纸张纹理通透，柔和色调，手绘质感',
    boosters: ['高细节', '8K 分辨率', '专业构图', '色彩柔和', '纹理自然'],
  },
  {
    id: 'pixel',
    label: '8-bit 像素',
    template: '复古 8-bit 像素艺术，经典游戏风格，色彩块面分明，像素边缘清晰，怀旧游戏画质',
    boosters: ['像素完美', '复古色调', '游戏风格', '色彩鲜明', '边缘清晰'],
  },
  {
    id: 'cyberpunk',
    label: '赛博朋克',
    template: '赛博朋克风格，霓虹灯光，未来都市，高科技低生活，雨夜反光，机械义体',
    boosters: ['高细节', '8K 分辨率', '专业构图', '霓虹光影', '未来感'],
  },
  {
    id: 'minimal',
    label: '极简艺术',
    template: '极简主义风格，大面积留白，几何构图，色彩克制，包豪斯美学，干净利落',
    boosters: ['高细节', '8K 分辨率', '专业构图', '色彩克制', '构图简洁'],
  },
  {
    id: 'render3d',
    label: '3D 渲染',
    template: '3D 渲染艺术，Cinema 4D 风格，光线追踪，材质逼真，Octane 渲染，电影级画质',
    boosters: ['高细节', '8K 分辨率', '专业构图', '材质逼真', '光影真实'],
  },
  {
    id: 'epic',
    label: '史诗自然',
    template: '史诗级自然风光，广角视野，壮丽山川，戏剧性光影，国家地理摄影风格',
    boosters: ['高细节', '8K 分辨率', '专业构图', '戏剧光影', '色彩壮阔'],
  },
  {
    id: 'ink',
    label: '国风水墨',
    template: '中国传统水墨画，泼墨技法，留白意境，山水画卷，古典东方美学',
    boosters: ['高细节', '8K 分辨率', '专业构图', '墨色层次', '东方意境'],
  },
];

/* ------------------------------------------------------------------ */
/* 题材扩充词表（≥15 个题材映射）                                        */
/* ------------------------------------------------------------------ */

const SUBJECT_EXPANSIONS: Array<{ pattern: RegExp; expansion: string }> = [
  { pattern: /猫|猫咪|小猫/, expansion: '毛茸茸的橘色猫咪，眼神灵动，姿态优雅' },
  { pattern: /狗|狗狗|小狗|犬/, expansion: '忠诚可爱的狗狗，毛发柔顺，活泼欢快' },
  { pattern: /山|山峰|群山|高山/, expansion: '巍峨的群山，云雾缭绕，层峦叠嶂' },
  { pattern: /海|大海|海洋|海浪/, expansion: '辽阔的大海，波涛汹涌，海天一色' },
  { pattern: /城市|都市|都市夜景|街道/, expansion: '繁华的都市，霓虹闪烁，车水马龙' },
  { pattern: /森林|树林|丛林/, expansion: '幽深的森林，阳光穿透树叶，光影斑驳' },
  { pattern: /星空|夜空|星星|银河/, expansion: '璀璨的星空，银河横跨，繁星点点' },
  { pattern: /花|花朵|花园|玫瑰|樱花/, expansion: '盛开的花瓣，色彩娇艳，微风轻拂' },
  { pattern: /雪|雪景|冬天|冰雪/, expansion: '洁白的雪景，银装素裹，宁静祥和' },
  { pattern: /月|月亮|月光/, expansion: '皎洁的月光，月色如水，夜色静谧' },
  { pattern: /水|河流|湖|溪流/, expansion: '清澈的水面，波光粼粼，倒影如画' },
  { pattern: /云|云朵|云海/, expansion: '飘逸的云朵，云卷云舒，天空辽阔' },
  { pattern: /鸟|飞鸟|鹰|鹤/, expansion: '翱翔的飞鸟，羽翼丰满，姿态优美' },
  { pattern: /龙|神龙/, expansion: '威武的神龙，鳞片闪耀，气势磅礴' },
  { pattern: /凤|凤凰/, expansion: '华美的凤凰，羽翼绚丽，涅槃重生' },
  { pattern: /剑|武侠|侠客/, expansion: '锋利的宝剑，剑气纵横，侠骨柔情' },
  { pattern: /仙|仙人|仙女/, expansion: '飘逸的仙人，衣袂飘飘，超凡脱俗' },
  { pattern: /机甲|机器人|机甲战士/, expansion: '炫酷的机甲，金属质感，科技感十足' },
];

/* ------------------------------------------------------------------ */
/* 默认风格（回退用）                                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_STYLE_ID = 'photography';

/* ------------------------------------------------------------------ */
/* 核心函数                                                             */
/* ------------------------------------------------------------------ */

/**
 * 题材扩充：根据关键词规则追加氛围/环境细节
 */
function expandSubject(raw: string): string {
  const expansions: string[] = [];
  for (const { pattern, expansion } of SUBJECT_EXPANSIONS) {
    if (pattern.test(raw)) {
      expansions.push(expansion);
    }
  }
  return expansions.length > 0 ? expansions.join('，') : '';
}

/**
 * 提取关键词（从原始输入中提取题材词）
 */
function extractKeywords(raw: string): string[] {
  const keywords: string[] = [];
  for (const { pattern } of SUBJECT_EXPANSIONS) {
    const match = raw.match(pattern);
    if (match && !keywords.includes(match[0])) {
      keywords.push(match[0]);
    }
  }
  return keywords;
}

/**
 * 完善提示词
 */
export function enhancePrompt(raw: string, opts?: { styleId?: string; context?: SessionContext }): EnhancedPrompt {
  const trimmed = raw.trim();

  // 输入校验
  if (!trimmed) {
    throw new Error('请输入描述内容');
  }

  // 纯标点校验
  if (/^[，。、；：！？,.;:!?\\s]+$/.test(trimmed)) {
    throw new Error('请输入有效的描述内容，不能仅包含标点符号');
  }

  // 超长截断
  const clamped = trimmed.length > 500 ? trimmed.slice(0, 500) : trimmed;

  // 查找风格模板
  const style = STYLE_PRESETS.find((s) => s.id === opts?.styleId) ?? STYLE_PRESETS.find((s) => s.id === DEFAULT_STYLE_ID)!;

  // 题材扩充
  const expansion = expandSubject(clamped);

  // 拼装提示词
  let enhanced = expansion ? `${expansion}，${clamped}` : clamped;
  enhanced = `${enhanced}，${style.template}`;
  enhanced = `${enhanced}，${style.boosters.join('，')}`;

  // 会话上下文注入
  if (opts?.context && (opts.context.keywords.length > 0 || opts.context.styleId)) {
    const contextParts: string[] = [];
    if (opts.context.keywords.length > 0) {
      contextParts.push(`题材偏好：${opts.context.keywords.join('、')}`);
    }
    if (opts.context.styleId) {
      const ctxStyle = STYLE_PRESETS.find((s) => s.id === opts.context!.styleId);
      if (ctxStyle) {
        contextParts.push(`风格基调：${ctxStyle.label}`);
      }
    }
    if (contextParts.length > 0) {
      enhanced = `${enhanced}，延续此前的风格基调：${contextParts.join('，')}`;
    }
  }

  return {
    raw: clamped,
    enhanced,
    styleId: style.id,
    styleLabel: style.label,
    keywords: extractKeywords(clamped),
    timestamp: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* 编辑史管理                                                           */

const MAX_HISTORY = 10;

export function pushHistory(list: PromptHistoryEntry[], entry: PromptHistoryEntry): PromptHistoryEntry[] {
  const newList = [entry, ...list];
  return newList.slice(0, MAX_HISTORY);
}
