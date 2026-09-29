import { useState } from 'react';
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
  onToggleFavorite: (id: string) => void;
  /** 解析渲染源：dev 返回 dataUrl，非 dev 返回 filePath 直读；返回空表示加载中 */
  resolveImgSrc: (filePath: string | undefined) => string;
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
}

function styleLabel(styleId: string): string {
  return STYLE_PRESETS.find((p) => p.id === styleId)?.label ?? styleId;
}

export default function HistoryPanel({
  records, loading, onRefresh, onDelete, onSetWallpaper, onToggleReference, selectedIds, onPreview, onToggleFavorite, resolveImgSrc,
}: HistoryPanelProps) {
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const filteredRecords = favoriteOnly ? records.filter((r) => r.favorite) : records;

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
        <h3 className="history-panel__title">历史图库 <span className="text-sm text-muted font-medium ml-2">{favoriteOnly ? filteredRecords.length : records.length}</span></h3>
        <div className="history-filter">
          <button
            className={favoriteOnly ? 'history-filter__btn is-active' : 'history-filter__btn'}
            onClick={() => setFavoriteOnly(!favoriteOnly)}
          >
            {favoriteOnly ? '❤️ 全部' : '🤍 仅看收藏'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={loading}>{loading ? '加载中…' : '刷新'}</button>
        </div>
      </div>
      {filteredRecords.length === 0 ? (
        <div className="empty"><span className="empty__icon">💝</span><p className="empty__title">暂无收藏</p><p className="empty__desc">点击心形图标收藏喜欢的壁纸</p></div>
      ) : (
        <ul className="history-list">
          {filteredRecords.map((record) => {
            const isSelected = selectedIds.includes(record.id);
            return (
              <li key={record.id} className={isSelected ? 'history-item history-item--selected' : 'history-item'}>
                <div className="history-item__media" style={{ position: 'relative' }}>
                  {(() => {
                    const src = resolveImgSrc(record.filePath);
                    return src ? (
                      <img
                        src={src} alt={record.rawInput || '历史壁纸'} className="history-item__thumb" loading="lazy"
                        role="button" tabIndex={0} aria-label="查看大图"
                        onClick={() => onPreview(record)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(record); } }}
                      />
                    ) : (<div className="history-item__thumb history-item__thumb--placeholder">无图</div>);
                  })()}
                  <button
                    className={record.favorite ? 'history-item__favorite is-active' : 'history-item__favorite'}
                    onClick={() => onToggleFavorite(record.id)}
                    aria-label={record.favorite ? '取消收藏' : '收藏'}
                  >
                    {record.favorite ? '❤️' : '🤍'}
                  </button>
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
      )}
    </div>
  );
}
