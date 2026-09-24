/**
 * Aurora Wallpaper — 设置弹窗
 *
 * 受控表单：Base URL / API Key / 重试次数 / 重试间隔 / 超时。
 * 保存前校验（http(s) 校验、数值范围），非法时行内中文错误。
 */

import { useEffect, useState } from 'react';
import type { AppSettings } from '../../../shared/types';
import { DEFAULT_BASE_URL } from '../../../shared/types';

interface SettingsDialogProps {
  open: boolean;
  settings: AppSettings;
  onSave: (settings: AppSettings) => Promise<void> | void;
  onClose: () => void;
}

interface FormErrors {
  baseURL?: string;
  retryLimit?: string;
  retryIntervalMs?: string;
  requestTimeoutMs?: string;
}

function validate(settings: AppSettings): FormErrors {
  const errors: FormErrors = {};
  if (!/^https?:\/\/.+/.test(settings.baseURL)) {
    errors.baseURL = 'Base URL 必须以 http:// 或 https:// 开头';
  }
  if (settings.retryLimit < 0 || settings.retryLimit > 3) {
    errors.retryLimit = '重试次数需在 0~3 之间';
  }
  if (settings.retryIntervalMs < 1500) {
    errors.retryIntervalMs = '重试间隔不能小于 1500ms';
  }
  if (settings.requestTimeoutMs < 60000) {
    errors.requestTimeoutMs = '超时时间不能小于 60000ms';
  }
  return errors;
}

export default function SettingsDialog({ open, settings, onSave, onClose }: SettingsDialogProps) {
  const [form, setForm] = useState<AppSettings>(settings);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [dirty, setDirty] = useState(false);

  // 外部 settings 变化时重置表单（弹窗打开时）
  useEffect(() => {
    if (open) {
      setForm(settings);
      setErrors({});
      setDirty(false);
      setShowKey(false);
    }
  }, [open, settings]);

  const handleChange = (field: keyof AppSettings, value: string | number): void => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSave = async (): Promise<void> => {
    const v = validate(form);
    setErrors(v);
    if (Object.keys(v).length > 0) return;
    setSaving(true);
    try {
      await onSave(form);
      setDirty(false);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (): void => {
    if (dirty && !confirm('有未保存的修改，确定要关闭吗？')) return;
    onClose();
  };

  if (!open) return null;

  return (
    <div className="settings-overlay" onClick={handleClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-dialog__header">
          <h2 className="settings-dialog__title">应用设置</h2>
          <button type="button" className="settings-dialog__close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="settings-dialog__body">
          {/* Base URL */}
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="settings-baseurl">
              Base URL
            </label>
            <input
              id="settings-baseurl"
              className="settings-field__input"
              type="text"
              placeholder={`默认 ${DEFAULT_BASE_URL}`}
              value={form.baseURL}
              onChange={(e) => handleChange('baseURL', e.target.value)}
            />
            {errors.baseURL && <span className="settings-field__error">{errors.baseURL}</span>}
          </div>

          {/* API Key */}
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="settings-apikey">
              API Key
            </label>
            <div className="settings-field__row">
              <input
                id="settings-apikey"
                className="settings-field__input"
                type={showKey ? 'text' : 'password'}
                placeholder="输入你的 API Key（c2a_xxx）"
                value={form.apiKey}
                onChange={(e) => handleChange('apiKey', e.target.value)}
              />
              <button
                type="button"
                className="settings-field__toggle"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {/* 重试次数 */}
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="settings-retry">
              重试次数（0~3）
            </label>
            <input
              id="settings-retry"
              className="settings-field__input"
              type="number"
              min={0}
              max={3}
              value={form.retryLimit}
              onChange={(e) => handleChange('retryLimit', parseInt(e.target.value, 10) || 0)}
            />
            {errors.retryLimit && <span className="settings-field__error">{errors.retryLimit}</span>}
          </div>

          {/* 重试间隔 */}
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="settings-interval">
              重试间隔（ms，≥1500）
            </label>
            <input
              id="settings-interval"
              className="settings-field__input"
              type="number"
              min={1500}
              step={100}
              value={form.retryIntervalMs}
              onChange={(e) => handleChange('retryIntervalMs', parseInt(e.target.value, 10) || 1500)}
            />
            {errors.retryIntervalMs && <span className="settings-field__error">{errors.retryIntervalMs}</span>}
          </div>

          {/* 超时 */}
          <div className="settings-field">
            <label className="settings-field__label" htmlFor="settings-timeout">
              请求超时（ms，≥60000）
            </label>
            <input
              id="settings-timeout"
              className="settings-field__input"
              type="number"
              min={60000}
              step={1000}
              value={form.requestTimeoutMs}
              onChange={(e) => handleChange('requestTimeoutMs', parseInt(e.target.value, 10) || 60000)}
            />
            {errors.requestTimeoutMs && <span className="settings-field__error">{errors.requestTimeoutMs}</span>}
          </div>
        </div>

        <div className="settings-dialog__footer">
          <button type="button" className="btn ghost" onClick={handleClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="btn primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
