import { STYLE_PRESETS } from '../types/promptEngine';
import type { EnhancedPrompt, PromptHistoryEntry } from '../types';

interface PromptPanelProps {
  raw: string;
  styleId: string;
  enhanced: EnhancedPrompt | null;
  editingText: string;
  history: PromptHistoryEntry[];
  onRawChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onEnhance: () => void;
  onEditingChange: (value: string) => void;
  onEditSave: () => void;
  onHistoryPick: (entry: PromptHistoryEntry) => void;
}

export default function PromptPanel({
  raw, styleId, enhanced, editingText, history, onRawChange, onStyleChange, onEnhance, onEditingChange, onEditSave, onHistoryPick,
}: PromptPanelProps) {
  return (
    <div className="prompt-panel card">
      <div className="card__body">
        <div className="prompt-panel__section">
          <label className="field__label" htmlFor="prompt-raw">描述你想要的壁纸</label>
          <textarea id="prompt-raw" className="prompt-panel__textarea" rows={3} placeholder="用一句话描述你想要的壁纸，如：黄昏的海边小镇，金色光洒在沙滩上" value={raw} onChange={(e) => onRawChange(e.target.value)} />
          <div className="prompt-panel__controls">
            <div className="prompt-panel__style">
              <label className="field__label" htmlFor="prompt-style">风格预设</label>
              <select id="prompt-style" className="prompt-panel__select" value={styleId} onChange={(e) => onStyleChange(e.target.value)}>
                {STYLE_PRESETS.map((preset) => (<option key={preset.id} value={preset.id}>{preset.label}</option>))}
              </select>
            </div>
            <button type="button" className="btn btn--primary" onClick={onEnhance} disabled={!raw.trim()}>完善提示词</button>
          </div>
        </div>

        <div className="prompt-panel__section">
          <h4 className="prompt-panel__section-title">完善结果</h4>
          {!enhanced ? (
            <div className="prompt-panel__empty"><p className="text-muted text-sm">点击「完善提示词」获得 AI 优化的详细提示词</p></div>
          ) : (
            <>
              <div className="prompt-panel__compare">
                <div className="prompt-panel__compare-item">
                  <span className="prompt-panel__compare-label">原文</span>
                  <p className="prompt-panel__compare-text">{enhanced.raw}</p>
                </div>
                <div className="prompt-panel__compare-item prompt-panel__compare-item--enhanced">
                  <span className="prompt-panel__compare-label">增强后 <span className="badge badge--brand">{enhanced.styleLabel}</span></span>
                  <p className="prompt-panel__compare-text">{enhanced.enhanced}</p>
                </div>
              </div>
              <label className="field__label" htmlFor="prompt-editing">编辑提示词</label>
              <textarea id="prompt-editing" className="prompt-panel__textarea" rows={4} value={editingText} onChange={(e) => onEditingChange(e.target.value)} />
              <div className="flex items-center gap-3 mt-3">
                <button type="button" className="btn btn--ghost btn--sm" onClick={onEditSave}>保存修改</button>
                {enhanced.keywords.length > 0 && (<div className="flex gap-2">{enhanced.keywords.map((kw) => (<span key={kw} className="badge badge--brand">{kw}</span>))}</div>)}
              </div>
            </>
          )}
        </div>

        {history.length > 0 && (
          <div className="prompt-panel__section">
            <h4 className="prompt-panel__section-title">编辑史</h4>
            <ul className="prompt-panel__history">
              {history.map((entry) => (
                <li key={entry.id} className="prompt-panel__history-item">
                  <button type="button" className="prompt-panel__history-pick" onClick={() => onHistoryPick(entry)}>{entry.text}</button>
                  <span className="text-xs text-muted">{entry.savedAt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
