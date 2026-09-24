import { describe, it, expect } from 'vitest';
import { enhancePrompt, pushHistory, STYLE_PRESETS } from '../src/shared/promptEngine';
import type { PromptHistoryEntry, SessionContext } from '../src/shared/types';

describe('enhancePrompt 输入校验', () => {
  it('空输入抛出中文错误', () => {
    expect(() => enhancePrompt('')).toThrow('请输入描述内容');
  });

  it('纯空白输入抛出中文错误', () => {
    expect(() => enhancePrompt('   \t\n')).toThrow('请输入描述内容');
  });

  it('纯标点符号抛出中文错误', () => {
    expect(() => enhancePrompt('，。！？')).toThrow('请输入有效的描述内容');
    expect(() => enhancePrompt('...!!!???')).toThrow('请输入有效的描述内容');
  });

  it('超长输入（>500 字符）自动截断', () => {
    const longInput = '山'.repeat(600);
    const result = enhancePrompt(longInput);
    expect(result.raw.length).toBe(500);
    expect(result.raw).toBe(longInput.slice(0, 500));
  });
});

describe('enhancePrompt 风格模板', () => {
  it('正常输入包含风格模板内容', () => {
    const result = enhancePrompt('黄昏的海边小镇', { styleId: 'photography' });
    expect(result.styleId).toBe('photography');
    expect(result.enhanced).toContain('专业摄影作品');
    expect(result.enhanced).toContain('黄昏的海边小镇');
  });

  it('10 种风格 id 全部有效且唯一', () => {
    const ids = STYLE_PRESETS.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(10);
    expect(ids.length).toBe(10);

    // 每个风格都能正常生成
    for (const preset of STYLE_PRESETS) {
      const result = enhancePrompt('测试描述', { styleId: preset.id });
      expect(result.styleId).toBe(preset.id);
      expect(result.styleLabel).toBe(preset.label);
      expect(result.enhanced.length).toBeGreaterThan(0);
    }
  });

  it('非法 styleId 回退到 photography', () => {
    const result = enhancePrompt('测试描述', { styleId: 'nonexistent-id' });
    expect(result.styleId).toBe('photography');
    expect(result.enhanced).toContain('专业摄影作品');
  });
});

describe('enhancePrompt 题材扩充', () => {
  it('题材词「猫」触发扩充', () => {
    const result = enhancePrompt('一只可爱的猫在窗台上', { styleId: 'photography' });
    expect(result.enhanced).toContain('毛茸茸的橘色猫咪');
    expect(result.keywords).toContain('猫');
  });

  it('题材词「山」触发扩充', () => {
    const result = enhancePrompt('巍峨的山峰', { styleId: 'photography' });
    expect(result.enhanced).toContain('巍峨的群山');
  });

  it('题材词「海」触发扩充', () => {
    const result = enhancePrompt('大海的波涛', { styleId: 'photography' });
    expect(result.enhanced).toContain('辽阔的大海');
  });

  it('无题材词时不扩充', () => {
    const result = enhancePrompt('抽象几何图形', { styleId: 'minimal' });
    expect(result.keywords.length).toBe(0);
    // 不应包含任何题材扩充词
    expect(result.enhanced).not.toContain('毛茸茸');
    expect(result.enhanced).not.toContain('巍峨');
  });
});

describe('enhancePrompt 会话上下文注入', () => {
  it('有上下文时注入「延续此前的风格基调」', () => {
    const context: SessionContext = { keywords: ['猫', '海'], styleId: 'photography' };
    const result = enhancePrompt('新的描述', { styleId: 'anime', context });
    expect(result.enhanced).toContain('延续此前的风格基调');
    expect(result.enhanced).toContain('题材偏好：猫、海');
    expect(result.enhanced).toContain('风格基调：摄影风格');
  });

  it('空上下文不注入', () => {
    const context: SessionContext = { keywords: [] };
    const result = enhancePrompt('新的描述', { styleId: 'anime', context });
    expect(result.enhanced).not.toContain('延续此前的风格基调');
  });

  it('undefined 上下文不注入', () => {
    const result = enhancePrompt('新的描述', { styleId: 'anime' });
    expect(result.enhanced).not.toContain('延续此前的风格基调');
  });
});

describe('pushHistory 编辑史管理', () => {
  it('新条目在前', () => {
    const entry1: PromptHistoryEntry = { id: '1', text: '第一条', savedAt: '10:00' };
    const entry2: PromptHistoryEntry = { id: '2', text: '第二条', savedAt: '10:01' };
    let list: PromptHistoryEntry[] = [];
    list = pushHistory(list, entry1);
    list = pushHistory(list, entry2);
    expect(list[0].id).toBe('2');
    expect(list[1].id).toBe('1');
  });

  it('超过 10 条时截断最旧条目', () => {
    let list: PromptHistoryEntry[] = [];
    for (let i = 0; i < 12; i++) {
      list = pushHistory(list, { id: `id-${i}`, text: `条目${i}`, savedAt: `10:${i}` });
    }
    expect(list.length).toBe(10);
    // 最新的在前
    expect(list[0].id).toBe('id-11');
    // 最旧的不应存在
    expect(list.find((e) => e.id === 'id-0')).toBeUndefined();
  });

  it('空列表添加首条正常', () => {
    const entry: PromptHistoryEntry = { id: '1', text: '首条', savedAt: '10:00' };
    const list = pushHistory([], entry);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('1');
  });
});
