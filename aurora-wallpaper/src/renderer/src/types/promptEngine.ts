/**
 * 渲染进程本地风格预设（对应 src/shared/promptEngine.ts）
 */
export interface StylePreset {
  id: string;
  label: string;
  template: string;
  boosters: string[];
}

export const STYLE_PRESETS: StylePreset[] = [
  { id: 'masterpiece', label: '名画风格', template: '古典油画构图，大师级笔触，博物馆收藏级光影', boosters: ['高细节', '8K', '艺术光影', '质感丰富'] },
  { id: 'photography', label: '摄影风格', template: '专业摄影作品，浅景深，自然光捕捉，杂志封面级画质', boosters: ['高细节', '8K', '色彩准确', '光影自然'] },
  { id: 'anime', label: '动漫风格', template: '日系动漫插画，赛璐璐上色，鲜明轮廓线，新海诚风格', boosters: ['高细节', '色彩鲜明', '线条清晰'] },
  { id: 'watercolor', label: '水彩插画', template: '水彩画风格，颜料自然晕染，纸张纹理通透，手绘质感', boosters: ['色彩柔和', '纹理自然'] },
  { id: 'pixel', label: '8-bit 像素', template: '复古像素艺术，经典游戏风格，色彩块面分明', boosters: ['像素完美', '复古色调', '游戏风格'] },
  { id: 'cyberpunk', label: '赛博朋克', template: '霓虹灯光，未来都市，高科技低生活，雨夜反光', boosters: ['霓虹光影', '未来感'] },
  { id: 'minimal', label: '极简艺术', template: '极简主义风格，大面积留白，几何构图，色彩克制', boosters: ['色彩克制', '构图简洁'] },
  { id: 'render3d', label: '3D 渲染', template: '3D渲染艺术，光线追踪，材质逼真，Octane渲染', boosters: ['材质逼真', '光影真实'] },
  { id: 'epic', label: '史诗自然', template: '史诗级自然风光，广角视野，壮丽山川，戏剧性光影', boosters: ['戏剧光影', '色彩壮阔'] },
  { id: 'ink', label: '国风水墨', template: '中国传统水墨画，泼墨技法，留白意境，山水画卷', boosters: ['墨色层次', '东方意境'] },
];
