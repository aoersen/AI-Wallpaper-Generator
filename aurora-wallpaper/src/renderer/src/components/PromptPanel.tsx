/**
 * Aurora Wallpaper — 提示词面板
 *
 * 三块：① 原始输入 + 风格下拉（10 风格）+「完善提示词」；
 *      ② 完善结果对比（原文 vs 增强）+ 可编辑 textarea +「保存修改」；
 *      ③ 编辑史列表（点击回填到编辑框）。
 */

import type { ChangeEvent } from 'react';
import { STYLE_PRESETS } from '../../../shared/promptEngine';
import type { EnhancedPrompt, PromptHistoryEntry } from '../../../shared/types';

interface PromptPanelProps {
  /** 原始描述（用户输入） */
  raw: string;
  /** 当前风格模板 id */
  styleId: string;
  /** 完善结果（null 表示尚未完善） */
  enhanced: EnhancedPrompt | null;
  /** 编辑框内容（完善结果的可编辑副本，由 App 持有） */
  editingText: string;
  /** 编辑史（新→旧） */
  history: PromptHistoryEntry[];
  onRawChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  /** 触发提示词完善 */
  onEnhance: () => void;
  /** 编辑框内容变化（受控 textarea 必需） */
  onEditingChange: (value: string) => void;
  /** 保存编辑（App 负责写入 enhanced 并追加编辑史） */
  onEditSave: () => void;
  /** 点击编辑史条目，回填到编辑框 */
  onHistoryPick: (entry: PromptHistoryEntry) => void;
}

export default function PromptPanel({
  raw,
  styleId,
  enhanced,
  editingText,
  history,
  onRawChange,
  onStyleChange,
  onEnhance,
  onEditingChange,
  onEditSave,
  onHistoryPick,
}: PromptPanelProps) {
  const handleRawChange = (e: ChangeEvent<HTMLTextAreaElement>): void => onRawChange(e.target.value);
  const handleStyleChange = (e: ChangeEvent<HTMLSelectElement>): void => onStyleChange(e.target.value);
  const handleEditingChange = (e: ChangeEvent<HTMLTextAreaElement>): void => onEditingChange(e.target.value);

  return (
    <section className="prompt-panel">
      {/* ① 原始输入 + 风格 + 完善按钮 */}
      <div className="prompt-panel__section">
        <label className="prompt-panel__label" htmlFor="prompt-raw">
          原始描述
        </label>
        <textarea
          id="prompt-raw"
          className="prompt-panel__textarea"
          rows={3}
          placeholder="用一句话描述你想要的壁纸，如：黄昏的海边小镇"
          value={raw}
          onChange={handleRawChange}
        />
        <div className="prompt-panel__row">
          <label className="prompt-panel__label" htmlFor="prompt-style">
            风格
          </label>
          <select id="prompt-style" className="prompt-panel__select" value={styleId} onChange={handleStyleChange}>
            {STYLE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <button type="button" className="prompt-panel__btn" onClick={onEnhance}>
            完善提示词
          </button>
        </div>
      </div>

      {/* ② 完善结果对比 + 编辑 */}
      <div className="prompt-panel__section">
        <div className="prompt-panel__section-title">完善结果</div>
        {enhanced === null ? (
          <p className="prompt-panel__empty">尚未完善，点击「完善提示词」生成增强提示词</p>
        ) : (
          <>
            <div className="prompt-panel__compare">
              <div className="prompt-panel__compare-item">
                <div className="prompt-panel__compare-label">原文</div>
                <p className="prompt-panel__compare-text">{enhanced.raw}</p>
              </div>
              <div className="prompt-panel__compare-item">
                <div className="prompt-panel__compare-label">增强后（{enhanced.styleLabel}）</div>
                <p className="prompt-panel__compare-text">{enhanced.enhanced}</p>
              </div>
            </div>
            <label className="prompt-panel__label" htmlFor="prompt-editing">
              编辑增强提示词
            </label>
            <textarea
              id="prompt-editing"
              className="prompt-panel__textarea"
              rows={4}
              value={editingText}
              onChange={handleEditingChange}
            />
            <button type="button" className="prompt-panel__btn" onClick={onEditSave}>
              保存修改
            </button>
          </>
        )}
      </div>

      {/* ③ 编辑史 */}
      <div className="prompt-panel__section">
        <div className="prompt-panel__section-title">编辑史</div>
        {history.length === 0 ? (
          <p className="prompt-panel__empty">暂无编辑史</p>
        ) : (
          <ul className="prompt-panel__history">
            {history.map((entry) => (
              <li key={entry.id} className="prompt-panel__history-item">
                <button
                  type="button"
                  className="prompt-panel__history-pick"
                  title={entry.text}
                  onClick={() => onHistoryPick(entry)}
                >
                  {entry.text}
                </button>
                <span className="prompt-panel__history-time">{entry.savedAt}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
