import { useCallback, useEffect, useState } from 'react';
import PromptPanel from './components/PromptPanel';
import GenerateBar from './components/GenerateBar';
import ResultGrid, { type ResultGridItem } from './components/ResultGrid';
import HistoryPanel from './components/HistoryPanel';
import SettingsDialog from './components/SettingsDialog';
import DailyPanel from './components/DailyPanel';
import ImagePreview from './components/ImagePreview';
import {
  getSettings, saveSettings, getScreen, listHistory, deleteHistory,
  setWallpaper, generateImage, onGenerateProgress,
  listDaily, setDailyWallpaper,
} from './ui/ipcClient';
import type {
  AppSettings, GenerateMode, ImageAspectRatio,
  PromptHistoryEntry, WallpaperRecord,
  BingDailyItem, DailyTheme, DailyListResult, GenerateProgress,
} from './types';

const DEFAULT_STYLE_ID = 'photography';
const STYLE_PRESETS = [
  { id: 'masterpiece', label: '名画风格', template: '古典油画构图，大师级笔触，博物馆收藏级光影，细腻的颜料质感与画布纹理', boosters: ['高细节', '8K 分辨率', '专业构图', '艺术光影', '质感丰富'] },
  { id: 'photography', label: '摄影风格', template: '专业摄影作品，浅景深，自然光捕捉，胶片质感，色彩还原精准，杂志封面级画质', boosters: ['高细节', '8K 分辨率', '专业构图', '色彩准确', '光影自然'] },
  { id: 'anime', label: '动漫风格', template: '日系动漫插画，赛璐璐上色，鲜明的轮廓线，柔和的光影过渡，新海诚风格', boosters: ['高细节', '8K 分辨率', '专业构图', '色彩鲜明', '线条清晰'] },
  { id: 'watercolor', label: '水彩插画', template: '水彩画风格，颜料自然晕染，纸张纹理通透，柔和色调，手绘质感', boosters: ['高细节', '8K 分辨率', '专业构图', '色彩柔和', '纹理自然'] },
  { id: 'pixel', label: '8-bit 像素', template: '复古 8-bit 像素艺术，经典游戏风格，色彩块面分明，像素边缘清晰，怀旧游戏画质', boosters: ['像素完美', '复古色调', '游戏风格', '色彩鲜明', '边缘清晰'] },
  { id: 'cyberpunk', label: '赛博朋克', template: '赛博朋克风格，霓虹灯光，未来都市，高科技低生活，雨夜反光，机械义体', boosters: ['高细节', '8K 分辨率', '专业构图', '霓虹光影', '未来感'] },
  { id: 'minimal', label: '极简艺术', template: '极简主义风格，大面积留白，几何构图，色彩克制，包豪斯美学，干净利落', boosters: ['高细节', '8K 分辨率', '专业构图', '色彩克制', '构图简洁'] },
  { id: 'render3d', label: '3D 渲染', template: '3D 渲染艺术，Cinema 4D 风格，光线追踪，材质逼真，Octane 渲染，电影级画质', boosters: ['高细节', '8K 分辨率', '专业构图', '材质逼真', '光影真实'] },
  { id: 'epic', label: '史诗自然', template: '史诗级自然风光，广角视野，壮丽山川，戏剧性光影，国家地理摄影风格', boosters: ['高细节', '8K 分辨率', '专业构图', '戏剧光影', '色彩壮阔'] },
  { id: 'ink', label: '国风水墨', template: '中国传统水墨画，泼墨技法，留白意境，山水画卷，古典东方美学', boosters: ['高细节', '8K 分辨率', '专业构图', '墨色层次', '东方意境'] },
];
const STYLE_LABELS: Record<string, string> = {};
STYLE_PRESETS.forEach((p) => { STYLE_LABELS[p.id] = p.label; });

type TabKey = 'daily' | 'create' | 'history';

interface DailyDataState {
  bing: BingDailyItem[];
  themes: DailyTheme[];
  bingError: string | null;
}

export default function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('daily');
  const [dailyData, setDailyData] = useState<DailyDataState>({ bing: [], themes: [], bingError: null });
  const [bingLoading, setBingLoading] = useState(false);
  const [raw, setRaw] = useState('');
  const [styleId, setStyleId] = useState(DEFAULT_STYLE_ID);
  const [editingText, setEditingText] = useState('');
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('16:9');
  const [generateMode, setGenerateMode] = useState<GenerateMode>('text-to-image');
  const [selectedRefIds, setSelectedRefIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [gridItems, setGridItems] = useState<ResultGridItem[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [toast, setToast] = useState<{ type: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [historyRecords, setHistoryRecords] = useState<WallpaperRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [preview, setPreview] = useState<{ src: string; title: string } | null>(null);

  const showToast = useCallback((type: 'error' | 'success' | 'info', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const hasApiKey = !!settings?.apiKey;

  // 初始化：读取设置 + 屏幕宽高比
  useEffect(() => {
    (async () => {
      try {
        const [settingsData, screenInfo] = await Promise.all([getSettings(), getScreen()]);
        if (settingsData?.settings) setSettings(settingsData.settings);
        if (screenInfo?.aspectRatio) setAspectRatio(screenInfo.aspectRatio);
      } catch (err) {
        console.error('init error', err);
      }
    })();
  }, []);

  // 加载每日图片
  const loadDaily = useCallback(async () => {
    setBingLoading(true);
    try {
      const data: DailyListResult = await listDaily();
      setDailyData({ bing: data.bing, themes: data.themes, bingError: data.bingError });
    } catch (err) {
      setDailyData({ bing: [], themes: [], bingError: '网络错误或服务不可用' });
      showToast('error', '每日数据加载失败');
    } finally {
      setBingLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadDaily(); }, [loadDaily]);

  // 加载历史
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await listHistory();
      if (data?.records) setHistoryRecords(data.records);
    } catch (err) {
      console.error('loadHistory error', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // 订阅生成进度
  useEffect(() => {
    const unsub = onGenerateProgress((p: GenerateProgress) => {
      setGridItems((prev) => {
        const items = [...prev];
        const slot = items[p.index];
        if (slot) items[p.index] = { ...slot, progress: p };
        return items;
      });
      if (p.status === 'done') setDoneCount((c) => c + 1);
      if (p.status === 'failed') setFailedCount((c) => c + 1);
    });
    return unsub;
  }, []);

  // 完善提示词
  const handleEnhance = useCallback(() => {
    if (!raw.trim()) return;
    try {
      const preset = STYLE_PRESETS.find((s) => s.id === styleId) ?? STYLE_PRESETS[0];
      const trimmed = raw.trim().slice(0, 200);
      const enhanced = `${trimmed}，${preset.template}，${preset.boosters.join('，')}`;
      setEditingText(enhanced);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '完善失败';
      showToast('error', msg);
    }
  }, [raw, styleId, showToast]);

  // 生成壁纸（串行）
  const handleGenerate = useCallback(async () => {
    if (!hasApiKey) {
      showToast('error', '请先配置 API Key 后再生成');
      setSettingsOpen(true);
      return;
    }
    if (!editingText.trim() && !raw.trim()) {
      showToast('error', '请输入描述或先完善提示词');
      return;
    }
    const finalPrompt = editingText.trim() || raw.trim();
    const total = count;
    const items: ResultGridItem[] = Array.from({ length: total }, () => ({ record: null, progress: null, selected: false }));
    setGridItems(items);
    setDoneCount(0);
    setFailedCount(0);
    setGenerating(true);
    try {
      for (let i = 0; i < total; i++) {
        setGridItems((prev) => {
          const next = [...prev];
          next[i] = { ...next[i], progress: { index: i, total, status: 'requesting', attempts: 1 } };
          return next;
        });
        const refs = selectedRefIds
          .map((id) => historyRecords.find((r) => r.id === id))
          .filter((r): r is WallpaperRecord => r !== undefined)
          .map((r) => ({ recordId: r.id, filePath: r.filePath }));
        const mode: GenerateMode = refs.length > 0 ? 'image-to-image' : 'text-to-image';
        const res = await generateImage({ prompt: finalPrompt, rawInput: raw, styleId, size: aspectRatio, mode, references: refs });
        if (res.ok && res.localPath) {
          setGridItems((prev) => {
            const next = [...prev];
            const parts = res.localPath!.split(/[/\\]/);
            next[i] = {
              ...next[i],
              record: {
                id: `gen-${Date.now()}-${i}`, fileName: parts.pop() || `${Date.now()}.png`,
                filePath: res.localPath!, prompt: finalPrompt, rawInput: raw,
                styleId, size: aspectRatio, mode, fileSize: 0,
                createdAt: new Date().toISOString(),
              },
              progress: { index: i, total, status: 'done', attempts: res.attempts },
            };
            return next;
          });
          setDoneCount((c) => c + 1);
        } else {
          setGridItems((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], progress: { index: i, total, status: 'failed', attempts: res.attempts, message: res.error } };
            return next;
          });
          setFailedCount((c) => c + 1);
        }
      }
      showToast('success', `完成 ${total} 张壁纸生成`);
      loadHistory();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成失败';
      showToast('error', msg);
    } finally {
      setGenerating(false);
    }
  }, [hasApiKey, editingText, raw, count, styleId, aspectRatio, selectedRefIds, historyRecords, loadHistory, showToast]);

  const handleDeleteHistory = useCallback(async (ids: string[]) => {
    try { await deleteHistory(ids); showToast('info', `已删除 ${ids.length} 条记录`); loadHistory(); }
    catch (err: unknown) { showToast('error', err instanceof Error ? err.message : '删除失败'); }
  }, [loadHistory, showToast]);

  const handleSetWallpaperFromRecord = useCallback(async (record: WallpaperRecord) => {
    try {
      const res = await setWallpaper({ filePath: record.filePath });
      if (res.ok) showToast('success', '壁纸已设置');
      else showToast('error', res.error || '设置失败');
    } catch (err: unknown) { showToast('error', err instanceof Error ? err.message : '设置失败'); }
  }, [showToast]);

  const handleToggleReference = useCallback((record: WallpaperRecord) => {
    setSelectedRefIds((prev) => prev.includes(record.id) ? prev.filter((id) => id !== record.id) : [...prev, record.id]);
    setGenerateMode('image-to-image');
  }, []);

  const handleSetDailyWallpaper = useCallback(async (url: string, fileName: string) => {
    try {
      const res = await setDailyWallpaper({ url, fileName });
      if (res.ok) showToast('success', '壁纸已设置');
      else showToast('error', res.error || '设置失败');
    } catch (err: unknown) { showToast('error', err instanceof Error ? err.message : '设置失败'); }
  }, [showToast]);

  const handleGenerateTheme = useCallback(async (theme: DailyTheme) => {
    if (!hasApiKey) { showToast('error', '请先配置 API Key'); setSettingsOpen(true); return; }
    setRaw(theme.description);
    setStyleId(DEFAULT_STYLE_ID);
    setEditingText(theme.description);
    setActiveTab('create');
    showToast('info', `已切换到创作：${theme.name}`);
  }, [hasApiKey, showToast]);

  const handleEditSave = useCallback(() => {
    if (!editingText.trim()) return;
    setPromptHistory((prev) => [
      { id: `eh-${Date.now()}`, text: editingText, savedAt: new Date().toLocaleString('zh-CN') },
      ...prev,
    ].slice(0, 10));
    showToast('success', '提示词已保存');
  }, [editingText, showToast]);

  const handleHistoryPick = useCallback((entry: PromptHistoryEntry) => { setEditingText(entry.text); }, []);

  const handleClearRefs = useCallback(() => { setSelectedRefIds([]); setGenerateMode('text-to-image'); }, []);

  // 保存设置：落盘到 userData/settings.json（失败时抛错，由 SettingsDialog 保持弹窗打开）
  const handleSaveSettings = useCallback(async (s: AppSettings) => {
    try {
      const res = await saveSettings({ settings: s });
      if (!res.ok) throw new Error('设置保存失败');
      setSettings(res.settings);
      showToast('success', '设置已保存');
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : '设置保存失败');
      throw err;
    }
  }, [showToast]);

  // 大图预览
  const handlePreview = useCallback((src: string, title: string) => { setPreview({ src, title }); }, []);
  const handlePreviewRecord = useCallback((record: WallpaperRecord) => {
    setPreview({ src: record.filePath, title: record.rawInput || record.fileName });
  }, []);
  const closePreview = useCallback(() => { setPreview(null); }, []);

  // 渲染每日
  const renderDaily = () => (
    <DailyPanel
      bing={dailyData.bing} themes={dailyData.themes}
      bingError={dailyData.bingError} bingLoading={bingLoading}
      onRetryBing={loadDaily} onSetDailyWallpaper={handleSetDailyWallpaper}
      onGenerateTheme={handleGenerateTheme}
      onPreview={handlePreview}
    />
  );

  // 渲染创作
  const renderCreate = () => (
    <div className="create-page flex flex-col gap-5">
      <PromptPanel
        raw={raw} styleId={styleId}
        enhanced={editingText
          ? { raw, enhanced: editingText, styleId, styleLabel: STYLE_LABELS[styleId] || styleId, keywords: [], timestamp: new Date().toISOString() }
          : null}
        editingText={editingText} history={promptHistory}
        onRawChange={setRaw} onStyleChange={setStyleId}
        onEnhance={handleEnhance} onEditingChange={setEditingText}
        onEditSave={handleEditSave} onHistoryPick={handleHistoryPick}
      />
      <GenerateBar
        count={count} onCountChange={setCount} mode={generateMode}
        onGenerate={handleGenerate} generating={generating}
        hasReference={selectedRefIds.length > 0} onClearReferences={handleClearRefs}
        batchSize={count} doneCount={doneCount} failedCount={failedCount}
      />
      <ResultGrid
        items={gridItems}
        onSetWallpaper={(id) => { const item = gridItems.find((i) => i.record?.id === id); if (item?.record) handleSetWallpaperFromRecord(item.record); }}
        onToggleReference={handleToggleReference}
        onPreview={handlePreviewRecord}
      />
    </div>
  );

  // 渲染历史
  const renderHistory = () => (
    <HistoryPanel
      records={historyRecords} loading={historyLoading}
      onRefresh={loadHistory} onDelete={handleDeleteHistory}
      onSetWallpaper={handleSetWallpaperFromRecord}
      onToggleReference={handleToggleReference}
      selectedIds={selectedRefIds}
      onPreview={handlePreviewRecord}
    />
  );

  return (
    <div className="app">
      {/* 侧边栏 */}
      <aside className="app__sidebar sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">A</div>
          <span className="sidebar__name">极光壁纸</span>
        </div>
        <nav className="sidebar__nav">
          <button className={activeTab === 'daily' ? 'sidebar__nav-item sidebar__nav-item--active' : 'sidebar__nav-item'} onClick={() => setActiveTab('daily')}>
            <span className="sidebar__nav-icon">🌅</span><span>每日图片</span>
          </button>
          <button className={activeTab === 'create' ? 'sidebar__nav-item sidebar__nav-item--active' : 'sidebar__nav-item'} onClick={() => setActiveTab('create')}>
            <span className="sidebar__nav-icon">✨</span><span>创作</span>
          </button>
          <button className={activeTab === 'history' ? 'sidebar__nav-item sidebar__nav-item--active' : 'sidebar__nav-item'} onClick={() => setActiveTab('history')}>
            <span className="sidebar__nav-icon">🖼️</span><span>历史</span>
          </button>
        </nav>
        <div className="sidebar__footer">
          <button className="sidebar__settings-btn" onClick={() => setSettingsOpen(true)}>
            <span className="sidebar__nav-icon">⚙️</span><span>设置</span>
            {!hasApiKey && <span className="sidebar__settings-dot" />}
          </button>
        </div>
      </aside>

      {/* 主区 */}
      <div className="app__main">
        <header className="app__header">
          <h1 className="header__title">
            {activeTab === 'daily' && '每日图片'}
            {activeTab === 'create' && 'AI 创作'}
            {activeTab === 'history' && '历史图库'}
          </h1>
          <div className="header__actions">
            {!hasApiKey && (
              <div className="banner banner--warning" style={{ padding: '6px 12px' }}>
                <span className="banner__icon">⚠️</span>
                <span className="banner__content">未配置 API Key</span>
              </div>
            )}
          </div>
        </header>
        <main className="app__content">
          {activeTab === 'daily' && renderDaily()}
          {activeTab === 'create' && renderCreate()}
          {activeTab === 'history' && renderHistory()}
        </main>
      </div>

      {/* 设置弹窗 */}
      {settings && (
        <SettingsDialog
          open={settingsOpen} settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* 大图预览 */}
      {preview && <ImagePreview src={preview.src} title={preview.title} onClose={closePreview} />}

      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
