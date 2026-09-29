/**
 * H1（A8 设置弹窗轮换区）组件测试
 *
 * 覆盖：
 * 1. 开关/间隔/来源/顺序四项控件按现有 settings 值渲染
 * 2. 改值后保存会把新值交给 onSave
 * 3. 有未保存修改时点「立即换一张」先落盘再轮换（A9）
 * 4. 轮换倒计时文案存在
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SettingsDialog from '../../src/renderer/src/components/SettingsDialog';
import type { AppSettings } from '../../src/renderer/src/types';

/** Mock ipcClient 模块（rotateNow 走的路径） */
vi.mock('../../src/renderer/src/ui/ipcClient', async () => {
  const actual = await vi.importActual('../../src/renderer/src/ui/ipcClient');
  return {
    ...actual,
    rotateNow: vi.fn().mockResolvedValue(true),
  };
});

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    baseURL: 'https://www.likegpt.top/v1',
    apiKey: 'c2a_test',
    retryLimit: 2,
    retryIntervalMs: 2000,
    requestTimeoutMs: 120000,
    model: 'qwen-image',
    rotation: {
      enabled: false,
      intervalMinutes: 60,
      source: 'bing',
      order: 'random',
    },
    ...overrides,
  };
}

describe('SettingsDialog · 定时轮换区（A8 验收）', () => {
  let onSaveMock: ReturnType<typeof vi.fn>;
  let onCloseMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    onSaveMock = vi.fn().mockResolvedValue(undefined);
    onCloseMock = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('四项轮换控件按 settings 初始值渲染', () => {
    const settings = makeSettings({ rotation: { enabled: true, intervalMinutes: 30, source: 'history', order: 'newest' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const switchInput = document.querySelector('.rotation-section__switch input[type="checkbox"]') as HTMLInputElement;
    expect(switchInput).not.toBeNull();
    expect(switchInput.checked).toBe(true);

    const intervalSelect = document.getElementById('rotation-interval') as HTMLSelectElement;
    expect(intervalSelect).not.toBeNull();
    expect(intervalSelect.value).toBe('30');

    const sourceSelect = document.getElementById('rotation-source') as HTMLSelectElement;
    expect(sourceSelect).not.toBeNull();
    expect(sourceSelect.value).toBe('history');

    const orderSelect = document.getElementById('rotation-order') as HTMLSelectElement;
    expect(orderSelect).not.toBeNull();
    expect(orderSelect.value).toBe('newest');
  });

  it('开关关闭时子控件 disabled', () => {
    const settings = makeSettings({ rotation: { enabled: false, intervalMinutes: 60, source: 'bing', order: 'random' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const intervalSelect = document.getElementById('rotation-interval') as HTMLSelectElement;
    const sourceSelect = document.getElementById('rotation-source') as HTMLSelectElement;
    const orderSelect = document.getElementById('rotation-order') as HTMLSelectElement;
    expect(intervalSelect.disabled).toBe(true);
    expect(sourceSelect.disabled).toBe(true);
    expect(orderSelect.disabled).toBe(true);
  });

  it('改值后点保存，把新 rotation 交给 onSave（落盘链路）', async () => {
    const settings = makeSettings({ rotation: { enabled: false, intervalMinutes: 60, source: 'bing', order: 'random' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const switchInput = document.querySelector('.rotation-section__switch input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(switchInput);

    const intervalSelect = document.getElementById('rotation-interval') as HTMLSelectElement;
    fireEvent.change(intervalSelect, { target: { value: '120' } });

    const sourceSelect = document.getElementById('rotation-source') as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: 'favorites' } });

    // 让 React 处理完状态更新
    await new Promise((r) => setTimeout(r, 0));

    const saveBtn = screen.getAllByRole('button', { name: '保存' })[0];
    fireEvent.click(saveBtn);

    expect(onSaveMock).toHaveBeenCalledTimes(1);
    const savedArg = onSaveMock.mock.calls[0][0] as AppSettings;
    expect(savedArg.rotation.enabled).toBe(true);
    expect(savedArg.rotation.intervalMinutes).toBe(120);
    expect(savedArg.rotation.source).toBe('favorites');
  });

  it('有未保存修改时点「立即换一张」先落盘再轮换（A9 语义）', async () => {
    const settings = makeSettings({ rotation: { enabled: true, intervalMinutes: 60, source: 'bing', order: 'random' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const sourceSelect = document.getElementById('rotation-source') as HTMLSelectElement;
    fireEvent.change(sourceSelect, { target: { value: 'favorites' } });

    const rotateBtn = screen.getAllByRole('button', { name: /立即换一张/ })[0];
    fireEvent.click(rotateBtn);

    await vi.waitFor(() => {
      expect(onSaveMock).toHaveBeenCalledTimes(1);
    });

    const savedArg = onSaveMock.mock.calls[0][0] as AppSettings;
    expect(savedArg.rotation.source).toBe('favorites');

    const { rotateNow } = await import('../../src/renderer/src/ui/ipcClient');
    expect(vi.mocked(rotateNow)).toHaveBeenCalledTimes(1);
  });

  it('轮换区倒计时文案存在', () => {
    const settings = makeSettings({ rotation: { enabled: true, intervalMinutes: 60, source: 'bing', order: 'random' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const countdownEl = document.getElementById('rotation-next');
    expect(countdownEl).not.toBeNull();
    expect(countdownEl!.textContent).toBeTruthy();
    expect(countdownEl!.textContent).toMatch(/约\s*\d+\s*分钟后/);
  });

  it('轮换关闭时显示「已停用」', () => {
    const settings = makeSettings({ rotation: { enabled: false, intervalMinutes: 60, source: 'bing', order: 'random' } });
    render(<SettingsDialog open={true} settings={settings} onSave={onSaveMock} onClose={onCloseMock} />);

    const countdownEl = document.getElementById('rotation-next');
    expect(countdownEl!.textContent).toBe('已停用');
  });
});
