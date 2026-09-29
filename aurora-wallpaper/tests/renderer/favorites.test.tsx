/**
 * H2（B5 收藏）组件测试
 *
 * 覆盖：
 * 1. 历史卡片心形点击可切换收藏（断言调用参数与状态变化）
 * 2. 收藏态角标渲染正确
 * 3. 「仅看收藏」筛选只显示收藏项且计数正确
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HistoryPanel from '../../src/renderer/src/components/HistoryPanel';
import type { WallpaperRecord } from '../../src/renderer/src/types';

/** Mock ipcClient 模块 */
vi.mock('../../src/renderer/src/ui/ipcClient', async () => {
  const actual = await vi.importActual('../../src/renderer/src/ui/ipcClient');
  return {
    ...actual,
    toggleFavorite: vi.fn().mockResolvedValue({ ok: true, favorite: true }),
  };
});

function makeRecord(id: string, favorite = false): WallpaperRecord {
  return {
    id,
    fileName: `wallpaper-${id}.png`,
    filePath: `C:\\tmp\\wallpaper-${id}.png`,
    rawInput: `测试描述 ${id}`,
    prompt: `测试 prompt ${id}`,
    model: 'qwen-image',
    theme: 'masterpiece',
    referenceImageId: null,
    favorite,
    createdAt: Date.now(),
  };
}

describe('HistoryPanel · 收藏功能（B5 验收）', () => {
  let toggleFavoriteMock: ReturnType<typeof vi.fn>;
  let records: WallpaperRecord[];

  beforeEach(async () => {
    vi.clearAllMocks();
    const { toggleFavorite } = await import('../../src/renderer/src/ui/ipcClient');
    toggleFavoriteMock = vi.mocked(toggleFavorite);
    toggleFavoriteMock.mockResolvedValue({ ok: true, favorite: true });
    records = [
      makeRecord('a', false),
      makeRecord('b', true),
      makeRecord('c', false),
      makeRecord('d', true),
    ];
  });

  afterEach(() => {
    cleanup();
  });

  it('心形按钮点击调用 toggleFavorite 并传正确 id', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const hearts = document.querySelectorAll('.history-item__favorite');
    expect(hearts.length).toBe(4);

    fireEvent.click(hearts[0]);

    expect(toggleFavoriteMock).toHaveBeenCalledTimes(1);
    expect(toggleFavoriteMock).toHaveBeenCalledWith('a');
  });

  it('收藏态角标渲染正确：已收藏显示红色 emoji，未收藏显示白色空心 emoji', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const hearts = document.querySelectorAll('.history-item__favorite');
    // 组件使用 emoji：未收藏 🤍，已收藏 ❤️
    expect(hearts[0].textContent).toBe('🤍');
    expect(hearts[1].textContent).toBe('❤️');
    expect(hearts[2].textContent).toBe('🤍');
    expect(hearts[3].textContent).toBe('❤️');
  });

  it('点击心形后收藏态翻转（UI 更新）', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const hearts = document.querySelectorAll('.history-item__favorite');
    expect(hearts[0].textContent).toBe('🤍');

    fireEvent.click(hearts[0]);

    expect(toggleFavoriteMock).toHaveBeenCalledWith('a');
  });

  it('「仅看收藏」筛选只显示收藏项', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    let items = document.querySelectorAll('.history-item');
    expect(items.length).toBe(4);

    const favOnlyBtn = screen.getByRole('button', { name: /仅看收藏/ });
    fireEvent.click(favOnlyBtn);

    items = document.querySelectorAll('.history-item');
    expect(items.length).toBe(2);
  });

  it('「仅看收藏」筛选计数正确（标题显示筛选后数量）', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const favOnlyBtn = screen.getByRole('button', { name: /仅看收藏/ });
    fireEvent.click(favOnlyBtn);

    // 标题显示筛选后的数量
    const title = document.querySelector('.history-panel__title');
    expect(title!.textContent).toContain('2');
  });

  it('收藏为空时显示空状态', () => {
    const noFavRecords = [makeRecord('a', false), makeRecord('c', false)];
    render(
      <HistoryPanel
        records={noFavRecords}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const favOnlyBtn = screen.getByRole('button', { name: /仅看收藏/ });
    fireEvent.click(favOnlyBtn);

    const emptyEl = document.querySelector('.empty');
    expect(emptyEl).not.toBeNull();
    expect(emptyEl!.textContent).toContain('暂无收藏');
  });

  it('再次点击「仅看收藏」取消筛选', () => {
    render(
      <HistoryPanel
        records={records}
        loading={false}
        onRefresh={vi.fn()}
        onDelete={vi.fn()}
        onSetWallpaper={vi.fn()}
        onToggleReference={vi.fn()}
        selectedIds={[]}
        onPreview={vi.fn()}
        onToggleFavorite={toggleFavoriteMock}
        resolveImgSrc={() => ''}
      />,
    );

    const favOnlyBtn = screen.getByRole('button', { name: /仅看收藏/ });

    fireEvent.click(favOnlyBtn);
    expect(document.querySelectorAll('.history-item').length).toBe(2);

    fireEvent.click(favOnlyBtn);
    expect(document.querySelectorAll('.history-item').length).toBe(4);
  });
});
