/**
 * Aurora Wallpaper — 渲染进程根组件（phase-3 Part-B 完整接线）
 *
 * 状态管理 + 批量生成串行流程 + 历史/设置弹窗 + 会话上下文。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import PromptPanel from './components/PromptPanel';
import GenerateBar from './components/GenerateBar';
import ResultGrid, { type ResultGridItem } from './components/ResultGrid';
import HistoryPanel from './components/HistoryPanel';
import SettingsDialog from './components/SettingsDialog';
import { enhancePrompt, pushHistory } from '../../shared/promptEngine';
import type {
  AppSettings,
  EnhancedPrompt,
  GenerateMode,
  GenerateProgress,
  GenerateResult,
  PlatformInfo,
  PromptHistoryEntry,
  ScreenInfo,
  SessionContext,
  WallpaperRecord,
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import * as ipc from './ui/ipcClient';

/** 简单自增 id（用于编辑史条目） */
let historyIdCounter = 0;
function nextHistoryId(): string {
  historyIdCounter += 1;
  return `hist-${Date.now()}-${historyIdCounter}`;
}

export default function App() {
  /* ---------------- 提示词面板状态 ---------------- */
  const [raw, setRaw] = useState('');
  const [styleId, setStyleId] = useState('photography');
  const [enhanced, setEnhanced] = useState<EnhancedPrompt | null>(null);
  const [editingText, setEditingText] = useState('');
  const [promptHistory, setPromptHistory] = useState<PromptHistoryEntry[]>([]);

  /* ---------------- 生成状态 ---------------- */
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [batchItems, setBatchItems] = useState<ResultGridItem[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  /* ---------------- 参考图 / 会话上下文 ---------------- */
  const [references, setReferences] = useState<WallpaperRecord[]>([]);
  const [sessionContext, setSessionContext] = useState<SessionContext>({ keywords: [] });

  /* ---------------- 历史 / 设置 ---------------- */
  const [history, setHistory] = useState<WallpaperRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ---------------- 环境信息 ---------------- */
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [screenInfo, setScreenInfo] = useState<ScreenInfo | null>(null);

  /* ---------------- Toast ---------------- */
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const toastTimer = useMemo(() => ({ current: null as ReturnType<typeof setTimeout> | null }), []);
  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, [toastTimer]);

  /* ---------------- 模式 ---------------- */
  const mode: GenerateMode = references.length > 0 ? 'image-to-image' : 'text-to-image';

  /* ---------------- 挂载：加载设置/屏幕/平台/历史 + 订阅进度 ---------------- */
  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const payload = await ipc.listHistory();
      setHistory(payload.records);
    } catch {
      // 主进程未实现时静默忽略
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void ipc.getSettings().then((p) => setSettings(p.settings)).catch(() => { /* 使用默认值 */ });
    void ipc.getScreen().then(setScreenInfo).catch(() => { /* 忽略 */ });
    void ipc.getPlatform().then(setPlatformInfo).catch(() => { /* 忽略 */ });
    void refreshHistory();

    const unsub = ipc.onGenerateProgress((progress: GenerateProgress) => {
      setBatchItems((prev) => {
        const next = [...prev];
        const idx = progress.index;
        if (idx >= 0 && idx < next.length) {
          next[idx] = { ...next[idx], progress };
        }
        return next;
      });
      // 计数更新
      if (progress.status === 'done') {
        setDoneCount((c) => c + 1);
      } else if (progress.status === 'failed') {
        setFailedCount((c) => c + 1);
      }
    });

    return () => {
      unsub();
    };
  }, [refreshHistory]);

  /* ---------------- 完善提示词 ---------------- */
  const handleEnhance = useCallback(() => {
    try {
      const result = enhancePrompt(raw, { styleId, context: sessionContext });
      setEnhanced(result);
      setEditingText(result.enhanced);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '完善提示词失败';
      showToast(msg);
    }
  }, [raw, styleId, sessionContext, showToast]);

  /* ---------------- 保存编辑 ---------------- */
  const handleEditSave = useCallback(() => {
    if (enhanced === null) return;
    const entry: PromptHistoryEntry = {
      id: nextHistoryId(),
      text: editingText,
      savedAt: new Date().toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    };
    setPromptHistory((prev) => pushHistory(prev, entry));
    setEnhanced({ ...enhanced, enhanced: editingText });
  }, [enhanced, editingText]);

  /* ---------------- 编辑史回填 ---------------- */
  const handleHistoryPick = useCallback((entry: PromptHistoryEntry) => {
    setEditingText(entry.text);
  }, []);

  /* ---------------- 开始生成（串行） ---------------- */
  const handleGenerate = useCallback(async () => {
    if (!settings.apiKey) {
      showToast('尚未配置 API Key，请先在设置中填写');
      setSettingsOpen(true);
      return;
    }

    const prompt = editingText || raw;
    if (!prompt.trim()) {
      showToast('请先输入描述或完善提示词');
      return;
    }

    setGenerating(true);
    setDoneCount(0);
    setFailedCount(0);

    // 初始化占位槽位
    const slots: ResultGridItem[] = Array.from({ length: count }, () => ({
      record: null,
      progress: { index: 0, total: count, status: 'pending', attempts: 0 },
      selected: false,
    }));
    // 修正 index
    slots.forEach((s, i) => {
      if (s.progress) s.progress.index = i;
    });
    setBatchItems(slots);

    const size = screenInfo?.aspectRatio ?? '16:9';

    for (let i = 0; i < count; i++) {
      try {
        const result: GenerateResult = await ipc.generateImage({
          prompt,
          rawInput: raw,
          styleId,
          size,
          mode,
          references: references.map((r) => ({ recordId: r.id, filePath: r.filePath })),
        });

        if (result.ok && result.localPath) {
          // 构造 WallpaperRecord（主进程返回 localPath，这里用占位 record 展示）
          const record: WallpaperRecord = {
            id: `batch-${Date.now()}-${i}`,
            fileName: result.localPath.split(/[/\\]/).pop() ?? `wallpaper-${i}.png`,
            filePath: result.localPath,
            prompt,
            rawInput: raw,
            styleId,
            size,
            mode,
            fileSize: 0,
            createdAt: new Date().toISOString(),
          };
          setBatchItems((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], record };
            return next;
          });
        } else {
          // 失败：通过 progress 事件已更新状态，这里补 record=null
          setBatchItems((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              record: null,
              progress: {
                index: i,
                total: count,
                status: 'failed',
                attempts: result.attempts,
                message: result.error ?? '生成失败',
              },
            };
            return next;
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '生成异常';
        setBatchItems((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            record: null,
            progress: {
              index: i,
              total: count,
              status: 'failed',
              attempts: 1,
              message: msg,
            },
          };
          return next;
        });
      }
    }

    setGenerating(false);
    // 更新会话上下文
    setSessionContext({
      keywords: enhanced?.keywords ?? [],
      styleId,
    });
    // 刷新历史
    void refreshHistory();
  }, [settings.apiKey, editingText, raw, count, screenInfo, styleId, mode, references, enhanced, showToast, refreshHistory]);

  /* ---------------- 设为壁纸 ---------------- */
  const handleSetWallpaper = useCallback(async (record: WallpaperRecord) => {
    try {
      const result = await ipc.setWallpaper({ filePath: record.filePath });
      if (!result.ok) {
        showToast(result.error ?? '设置壁纸失败');
      } else {
        showToast('壁纸设置成功');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '设置壁纸失败');
    }
  }, [showToast]);

  /* ---------------- 历史操作 ---------------- */
  const handleDeleteHistory = useCallback(async (ids: string[]) => {
    try {
      await ipc.deleteHistory(ids);
      void refreshHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败');
    }
  }, [refreshHistory, showToast]);

  const handleToggleReference = useCallback((record: WallpaperRecord) => {
    setReferences((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      return exists ? prev.filter((r) => r.id !== record.id) : [...prev, record];
    });
  }, []);

  const handleClearReferences = useCallback(() => {
    setReferences([]);
  }, []);

  /* ---------------- 设置保存 ---------------- */
  const handleSaveSettings = useCallback(async (newSettings: AppSettings) => {
    const result = await ipc.saveSettings({ settings: newSettings });
    setSettings(result.settings);
  }, []);

  /* ---------------- 渲染 ---------------- */
  const selectedIds = useMemo(() => references.map((r) => r.id), [references]);

  return (
    <div className="app">
      {/* 顶栏 */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <h1 className="brand-name">Aurora Wallpaper · AI 壁纸工坊</h1>
        </div>
        <nav className="topbar-actions">
          <button type="button" className="btn ghost" onClick={() => void refreshHistory()}>
            历史图库
          </button>
          <button type="button" className="btn ghost" onClick={() => setSettingsOpen(true)}>
            设置
          </button>
        </nav>
      </header>

      {/* 主布局 */}
      <main className="layout">
        <div className="main-col">
          <PromptPanel
            raw={raw}
            styleId={styleId}
            enhanced={enhanced}
            editingText={editingText}
            history={promptHistory}
            onRawChange={setRaw}
            onStyleChange={setStyleId}
            onEnhance={handleEnhance}
            onEditingChange={setEditingText}
            onEditSave={handleEditSave}
            onHistoryPick={handleHistoryPick}
          />

          <GenerateBar
            count={count}
            onCountChange={setCount}
            mode={mode}
            onGenerate={handleGenerate}
            generating={generating}
            hasReference={references.length > 0}
            onClearReferences={handleClearReferences}
            batchSize={count}
            doneCount={doneCount}
            failedCount={failedCount}
          />

          <ResultGrid
            items={batchItems}
            onSetWallpaper={(id) => {
              const record = batchItems.find((it) => it.record?.id === id)?.record;
              if (record) void handleSetWallpaper(record);
            }}
            onToggleReference={handleToggleReference}
          />
        </div>

        <HistoryPanel
          records={history}
          loading={historyLoading}
          onRefresh={() => void refreshHistory()}
          onDelete={(ids) => void handleDeleteHistory(ids)}
          onSetWallpaper={(record) => void handleSetWallpaper(record)}
          onToggleReference={handleToggleReference}
          selectedIds={selectedIds}
        />
      </main>

      {/* 底部状态栏 */}
      <footer className="statusbar">
        <span>
          {platformInfo
            ? `${platformInfo.platform}${platformInfo.supported ? '（已支持）' : '（未支持）'}`
            : '检测中…'}
        </span>
        <span>
          {screenInfo
            ? `${screenInfo.width} × ${screenInfo.height}（${screenInfo.aspectRatio}）`
            : '检测中…'}
        </span>
        <span>深色主题 · 全中文界面</span>
      </footer>

      {/* 设置弹窗 */}
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onSave={handleSaveSettings}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Toast */}
      {toast && <div className="toast">{toast.text}</div>}
    </div>
  );
}
