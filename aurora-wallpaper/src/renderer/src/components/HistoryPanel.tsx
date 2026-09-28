import { STYLE_PRESETS } from '../types/promptEngine';
import type { WallpaperRecord } from '../types';

interface HistoryPanelProps {
  records: WallpaperRecord[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (ids: string[]) => void;
  onSetWallpaper: (record: WallpaperRecord) => void;
  onToggleReference: (record: WallpaperRecord) => void;
  selectedIds: string[];
  onPreview: (record: WallpaperRecord) => void;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function styleLabel(styleId: string): string {
  return STYLE_PRESETS.find((p) => p.id === styleId)?.label ?? styleId;
}

export default function HistoryPanel({
  records, loading, onRefresh, onDelete, onSetWallpaper, onToggleReference, selectedIds, onPreview,
}: HistoryPanelProps) {
  if (loading && records.length === 0) {
    return (
      <div className="history-panel">
        <div className="history-panel__header"><h3 className="history-panel__title">历史图库</h3><button className="btn btn--ghost btn--sm" disabled>加载中…</button></div>
        <div className="flex flex-col gap-3">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="history-item skeleton" style={{ height: '96px' }} />))}</div>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="history-panel">
        <div className="history-panel__header"><h3 className="history-panel__title">历史图库</h3><button className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={loading}>{loading ? '加载中…' : '刷新'}</button></div>
        <div className="empty"><span className="empty__icon">🖼️</span><p className="empty__title">暂无历史记录</p><p className="empty__desc">创作壁纸后会自动保存在这里</p></div>
      </div>
    );
  }

  return (
    <div className="history-panel">
      <div className="history-panel__header">
        <h3 className="history-panel__title">历史图库 <span className="text-sm text-muted font-medium ml-2">{records.length}</span></h3>
        <button className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
      </div>
      <ul className="history-list">
        {records.map((record) => {
          const isSelected = selectedIds.includes(record.id);
          return (
            <li key={record.id} className={isSelected ? 'history-item history-item--selected' : 'history-item'}>
              <div className="history-item__media">
                {record.filePath ? (
                  <img
                    src={record.filePath} alt={record.rawInput || '历史壁纸'} className="history-item__thumb" loading="lazy"
                    role="button" tabIndex={0} aria-label="查看大图"
                    onClick={() => onPreview(record)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(record); } }}
                  />
                ) : (<div className="history-item__thumb history-item__thumb--placeholder">无图</div>)}
              </div>
              <div className="history-item__info">
                <p className="history-item__prompt" title={record.rawInput}>{record.rawInput.length > 60 ? `${record.rawInput.slice(0, 60)}…` : record.rawInput}</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge badge--brand">{styleLabel(record.styleId)}</span>
                  <span className="text-xs text-muted">{formatTime(record.createdAt)}</span>
                </div>
                <div className="history-item__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => onSetWallpaper(record)}>设为壁纸</button>
                  <button className="btn btn--danger btn--sm" onClick={() => onDelete([record.id])}>删除</button>
                  <label className="history-item__check">
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleReference(record)} /><span>参考</span>
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
