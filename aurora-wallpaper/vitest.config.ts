import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.test.{ts,tsx}'],
    // 仅让 renderer 组件测试进 jsdom，其余保持 node 环境
    environmentMatchGlobs: [
      ['tests/renderer/**', 'jsdom'],
    ],
  },
});
