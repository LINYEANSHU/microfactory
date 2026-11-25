import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // 桌面打包测试由 Windows 工作流使用 node:test 运行。
    exclude: [...configDefaults.exclude, 'desktop/**'],
    // 模拟类测试含 900s / 2400s 连续运行，放宽单测超时（CI 机器可能较慢）
    testTimeout: 120_000,
  },
});
