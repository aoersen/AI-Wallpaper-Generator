/**
 * Aurora Wallpaper — 历史侧栏面板
 *
 * 展示已生成壁纸列表，支持刷新、删除、设为壁纸、选作参考。
 */

import { STYLE_PRESETS } from '../../../shared/promptEngine';
import type { WallpaperRecord } from '../../../shared/types';

interface HistoryPanelProps {
  records: WallpaperRecord[];
  loading: boolean;
  onRefresh: () => void;
  onDelete: (ids: string[]) => void;
  onSetWallpaper: (record: WallpaperRecord) => void;
  onToggleReference: (record: WallpaperRecord) => void;
  selectedIds: string[];
}

export default function HistoryPanel({
  records,
  loading,
  onRefresh,
  onDelete,
  onSetWallpaper,
  onToggleReference,
  selectedIds,
}: HistoryPanelProps) {
  const styleLabel = (styleId: string): string =>
    STYLE_PRESETS.find((p) => p.id === styleId)?.label ?? styleId;

  const formatTime = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <aside className="history-panel">
      <div className="history-panel__header">
        <h2 className="history-panel__title">历史图库</h2>
        <button type="button" className="history-panel__refresh" onClick={onRefresh} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
      </div>

      {records.length === 0 ? (
        <p className="history-panel__empty">暂无历史记录</p>
      ) : (
        <ul className="history-panel__list">
          {records.map((record) => {
            const isSelected = selectedIds.includes(record.id);
            return (
              <li key={record.id} className={isSelected ? 'history-item history-item--selected' : 'history-item'}>
                <div className="history-item__media">
                  {record.filePath ? (
                    <img
                      className="history-item__thumb"
                      src={record.filePath}
                      alt={record.rawInput || '历史壁纸'}
                      loading="lazy"
                    />
                  ) : (
                    <div className="history-item__thumb history-item__thumb--placeholder">无图</div>
                  )}
                </div>
                <div className="history-item__info">
                  <p className="history-item__prompt" title={record.prompt}>
                    {record.prompt.length > 60 ? `${record.prompt.slice(0, 60)}…` : record.prompt}
                  </p>
                  <div className="history-item__meta">
                    <span className="history-item__style">{styleLabel(record.styleId)}</span>
                    <span className="history-item__time">{formatTime(record.createdAt)}</span>
                  </div>
                  <div className="history-item__actions">
                    <button
                      type="button"
                      className="history-item__btn"
                      onClick={() => onSetWallpaper(record)}
                    >
                      设为壁纸
                    </button>
                    <button
                      type="button"
                      className="history-item__btn history-item__btn--danger"
                      onClick={() => onDelete([record.id])}
                    >
                      删除
                    </button>
                    <label className="history-item__check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleReference(record)}
                      />
                      <span>参考</span>
                    </label>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
