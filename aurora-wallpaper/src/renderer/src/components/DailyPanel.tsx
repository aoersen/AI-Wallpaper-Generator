import { useEffect, useMemo, useState } from 'react';
import type { BingDailyItem, DailyTheme, WallpaperRecord } from '../types';
import { listHistory, onGenerateProgress } from '../ui/ipcClient';

const ICON_MAP: Record<string, string> = {
  mountain: '⛰️', ocean: '🌊', forest: '🌲', city: '🏙️', space: '🌌', flower: '🌸',
  snow: '❄️', moon: '🌙', river: '💧', cloud: '☁️', bird: '🐦', dragon: '🐉',
  phoenix: '🔥', sword: '⚔️', fairy: '🧚', mecha: '🤖', cat: '🐱', dog: '🐶',
  sunset: '🌅', star: '⭐', rain: '🌧️', wind: '🍃', sun: '☀️', lake: '🏞️',
  /* P2-1：补齐 dailyThemes 实际使用的五个类别 */
  chinese: '🏮', starry: '✨', solar: '🌤️', abstract: '🎨', pet: '🐾',
};

function iconFor(icon: string): string { return ICON_MAP[icon] ?? '🎨'; }

/**
 * C2：主题类别 → 品牌系双色调渐变（浅色简洁风调性下做视觉差异化）。
 *
 * 十个类别各配一组渐变，色相彼此区分、饱和度收敛，与 --brand 品牌蓝紫
 * （#4f7cff → #8a5cf6）同族协调；覆盖 dailyThemes 全部 10 类 icon 键。
 * 未命中时回落品牌渐变本身。
 */
const ICON_GRADIENTS: Record<string, string> = {
  mountain: 'linear-gradient(135deg, #4f7cff, #38d6b4)', // 山川：品牌蓝 → 青绿
  lake: 'linear-gradient(135deg, #38bdf8, #818cf8)', // 湖海：天蓝 → 靛蓝
  starry: 'linear-gradient(135deg, #6366f1, #a855f7)', // 星空：靛紫 → 亮紫
  city: 'linear-gradient(135deg, #8b5cf6, #ec4899)', // 城市：紫 → 品红
  chinese: 'linear-gradient(135deg, #f97316, #ef4444)', // 国风：暖橙 → 中国红
  pet: 'linear-gradient(135deg, #fbbf24, #fb7185)', // 萌宠：暖金 → 珊瑚粉
  solar: 'linear-gradient(135deg, #22c55e, #facc15)', // 节气：新绿 → 明黄
  abstract: 'linear-gradient(135deg, #06b6d4, #8a5cf6)', // 抽象：青 → 品牌紫
  flower: 'linear-gradient(135deg, #f472b6, #fbbf24)', // 花草：樱粉 → 暖金
  forest: 'linear-gradient(135deg, #16a34a, #0d9488)', // 森林：深绿 → 青碧
};

/** 默认渐变：品牌蓝紫本身（icon 键未命中时兜底，与主按钮同源） */
const DEFAULT_ICON_GRADIENT = 'linear-gradient(135deg, #4f7cff, #8a5cf6)';

function gradientFor(icon: string): string { return ICON_GRADIENTS[icon] ?? DEFAULT_ICON_GRADIENT; }

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * P2-2：当日主题是否已生成 —— 从壁纸历史记录推导（可信来源），替代原 setTimeout 盲写 localStorage。
 *
 * 数据链：主题卡片点「生成」→ App.handleGenerateTheme 把 theme.description 填入创作页 →
 * 用户确认后 handleGenerate 调 generateImage → 主进程下载落库（record.prompt =
 * theme.description 或其用户编辑版本）→ 本组件挂载时拉取 listHistory 推导。
 *
 * 匹配规则：record.prompt 描述以 theme.description 开头（用户若在创作页编辑过提示词，
 * 保留前缀即仍可识别；完全改写则不误标——宁可漏标不可误标）。
 */
function isThemeGenerated(theme: DailyTheme, records: WallpaperRecord[]): boolean {
  const today = todayKey();
  return records.some((r) => r.createdAt.slice(0, 10) === today && r.prompt.startsWith(theme.description));
}

interface BingSectionProps { items: BingDailyItem[]; loading: boolean; error: string | null; onRetry: () => void; onSetWallpaper: (url: string, fileName: string) => void; }

function BingSection({ items, loading, error, onRetry, onSetWallpaper }: BingSectionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const active = items[activeIdx] ?? null;

  if (loading) {
    return (<section className="daily-section"><h3 className="daily-section__title">今日壁纸</h3><div className="bing-hero skeleton skeleton--image" /><div className="bing-strip">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="bing-strip__card skeleton skeleton--card" />))}</div></section>);
  }
  if (error) {
    return (<section className="daily-section"><h3 className="daily-section__title">今日壁纸</h3><div className="empty"><span className="empty__icon">⚠️</span><p className="empty__title">壁纸加载失败</p><p className="empty__desc">{error}</p><button className="btn btn--ghost btn--sm" onClick={onRetry}>重试</button></div></section>);
  }
  if (items.length === 0) {
    return (<section className="daily-section"><h3 className="daily-section__title">今日壁纸</h3><div className="empty"><span className="empty__icon">🖼️</span><p className="empty__title">暂无壁纸数据</p></div></section>);
  }

  return (
    <section className="daily-section">
      <div className="daily-section__header"><h3 className="daily-section__title">今日壁纸</h3><span className="badge badge--brand">Bing 每日精选</span></div>
      <div className="bing-hero">
        <img src={active.url} alt={active.title} className="bing-hero__img" />
        <div className="bing-hero__overlay">
          <div className="bing-hero__info"><h4 className="bing-hero__title">{active.title}</h4><p className="bing-hero__copyright">{active.copyright}</p></div>
          <button className="btn btn--primary" onClick={() => onSetWallpaper(active.url, `bing-${active.date}.jpg`)}>设为壁纸</button>
        </div>
      </div>
      <div className="bing-strip">
        {items.map((item, idx) => (
          <button key={item.date} className={idx === activeIdx ? 'bing-strip__card bing-strip__card--active' : 'bing-strip__card'} onClick={() => setActiveIdx(idx)}>
            <img src={item.thumbnailUrl} alt={item.title} className="bing-strip__thumb" />
            <div className="bing-strip__meta"><span className="bing-strip__date">{item.date}</span><span className="bing-strip__name">{item.title}</span></div>
          </button>
        ))}
      </div>
    </section>
  );
}

interface ThemeSectionProps { themes: DailyTheme[]; onGenerate: (theme: DailyTheme) => void; }

function ThemeSection({ themes, onGenerate }: ThemeSectionProps) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [historyRecord, setHistoryRecord] = useState<WallpaperRecord[]>([]);

  // P2-2 可信来源①：挂载 / 生成进度事件驱动拉取最新历史
  useEffect(() => {
    let alive = true;
    const refresh = async (): Promise<void> => {
      try {
        const data = await listHistory();
        if (alive && data?.records) setHistoryRecord(data.records);
      } catch { /* 历史拉取失败时保持现状，不阻塞主流程 */ }
    };
    void refresh();
    // 订阅生成进度：任一图片 done/failed（落库后）即刷新一次
    const unsub = onGenerateProgress((p) => { if (p.status === 'done' || p.status === 'failed') void refresh(); });
    return () => { alive = false; unsub(); };
  }, []);

  // P2-2 可信来源②：已生成集合由历史记录推导，历史变化自动重算
  const generatedIds = useMemo(
    () => new Set(themes.filter((t) => isThemeGenerated(t, historyRecord)).map((t) => t.id)),
    [themes, historyRecord],
  );

  if (themes.length === 0) {
    return (<section className="daily-section"><h3 className="daily-section__title">AI 每日主题</h3><div className="empty"><span className="empty__icon">🎨</span><p className="empty__title">今日主题准备中</p></div></section>);
  }

  const handleGenerate = (theme: DailyTheme): void => {
    setPending((prev) => new Set(prev).add(theme.id));
    onGenerate(theme);
  };
  return (
    <section className="daily-section">
      <div className="daily-section__header"><h3 className="daily-section__title">AI 每日主题</h3><span className="badge badge--success">一键生成</span></div>
      <p className="daily-section__hint">点击主题卡片，使用当日推荐描述一键生成壁纸</p>
      <div className="theme-grid">
        {themes.map((theme) => {
          const done = generatedIds.has(theme.id);
          const isPending = pending.has(theme.id);
          return (
            <div key={theme.id} className="theme-card card card--hover">
              <div className="theme-card__icon" style={{ background: gradientFor(theme.icon) }}>{iconFor(theme.icon)}</div>
              <h4 className="theme-card__name">{theme.name}</h4>
              <p className="theme-card__desc">{theme.description}</p>
              <div className="theme-card__footer">{done && <span className="badge badge--success">已生成</span>}<button className="btn btn--primary btn--sm" disabled={isPending} onClick={() => handleGenerate(theme)}>{isPending ? '生成中…' : done ? '再生成' : '生成'}</button></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface DailyPanelProps {
  bing: BingDailyItem[];
  themes: DailyTheme[];
  bingLoading: boolean;
  bingError: string | null;
  onRetryBing: () => void;
  onSetDailyWallpaper: (url: string, fileName: string) => void;
  onGenerateTheme: (theme: DailyTheme) => void;
}

export default function DailyPanel({ bing, themes, bingLoading, bingError, onRetryBing, onSetDailyWallpaper, onGenerateTheme }: DailyPanelProps) {
  return (
    <div className="daily-panel">
      <BingSection items={bing} loading={bingLoading} error={bingError} onRetry={onRetryBing} onSetWallpaper={onSetDailyWallpaper} />
      <ThemeSection themes={themes} onGenerate={onGenerateTheme} />
    </div>
  );
}
