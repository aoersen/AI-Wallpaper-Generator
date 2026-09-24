/**
 * Aurora Wallpaper — Qwen 图片生成客户端
 *
 * 非流式 POST {baseURL}/chat/completions，model=qwen-image。
 * 文生图 content 为纯字符串；图生图 content 为多模态数组（base64 data URI）。
 * 错误分类：NO_API_KEY / NETWORK_ERROR / HTTP_ERROR / TIMEOUT / INVALID_RESPONSE。
 * 网络请求经 qwenHttp 委托给内置 pq-client 助手（见 qwenHttp.ts 说明），
 * 本模块不直接触碰 HTTP，可在测试中以 mock 传输层覆盖。
 */

import type { AppSettings, ImageAspectRatio, ReferenceImage } from '../../shared/types';
import { QwenError } from './qwenErrors';
import { performRequest } from './qwenHttp';

// 兼容旧引用路径：错误类型仍可从本模块导出
export { QwenError } from './qwenErrors';
export type { QwenErrorCode } from './qwenErrors';

/* ------------------------------------------------------------------ */
/* 请求/响应类型                                                        */
/* ------------------------------------------------------------------ */

export interface GenerateImageParams {
  prompt: string;
  referenceImages?: ReferenceImage[];
  size: ImageAspectRatio;
  settings: AppSettings;
}

export interface GenerateImageResult {
  imageUrl: string;
}

export interface RetryOptions {
  /** 最大尝试次数（默认 3） */
  maxAttempts?: number;
  /** 重试间隔毫秒（默认 1500） */
  intervalMs?: number;
  /** 每次尝试前回调（用于上报进度） */
  onAttempt?: (attempt: number, maxAttempts: number) => void;
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** 按文件扩展名映射 mime 类型，兜底 image/png */
function mimeForPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

/** 本地文件 → base64 data URI */
function fileToDataUri(filePath: string): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const buf = fs.readFileSync(filePath);
  return `data:${mimeForPath(filePath)};base64,${buf.toString('base64')}`;
}

/** 构建 messages content：文生图为纯字符串，图生图为多模态数组 */
function buildContent(prompt: string, referenceImages?: ReferenceImage[]): string | Array<{ type: string; image_url?: { url: string }; text?: string }> {
  if (!referenceImages || referenceImages.length === 0) {
    return prompt;
  }
  const parts: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];
  for (const ref of referenceImages) {
    parts.push({ type: 'image_url', image_url: { url: fileToDataUri(ref.filePath) } });
  }
  parts.push({ type: 'text', text: prompt });
  return parts;
}

/** 从响应中提取图片 URL，非法时抛 INVALID_RESPONSE */
function extractImageUrl(body: unknown): string {
  const content = (body as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new QwenError('INVALID_RESPONSE', '响应内容不是有效的图片 URL');
  }
  const trimmed = content.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new QwenError('INVALID_RESPONSE', '响应内容不是有效的图片 URL');
  }
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* 核心请求                                                            */
/* ------------------------------------------------------------------ */

/** 单次请求（无重试），超时与网络失败由传输层抛 QwenError */
async function requestOnce(params: GenerateImageParams): Promise<GenerateImageResult> {
  const { prompt, referenceImages, size, settings } = params;

  if (!settings.apiKey.trim()) {
    throw new QwenError('NO_API_KEY', '尚未配置 API Key，请先在设置中填写');
  }

  const url = `${settings.baseURL.replace(/\/$/, '')}/chat/completions`;
  const body = {
    model: 'qwen-image',
    stream: false,
    messages: [{ role: 'user', content: buildContent(prompt, referenceImages) }],
    size,
  };
  // 仅当配置非法（<=0）时回退默认超时
  const timeoutMs = settings.requestTimeoutMs > 0 ? settings.requestTimeoutMs : 120_000;

  const { status, bodyText } = await performRequest({
    url,
    apiKey: settings.apiKey.trim(),
    body,
    timeoutMs,
  });

  if (status < 200 || status >= 300) {
    throw new QwenError('HTTP_ERROR', `HTTP 错误 ${status}${bodyText ? `：${bodyText.slice(0, 200)}` : ''}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new QwenError('INVALID_RESPONSE', '响应不是合法的 JSON');
  }

  return { imageUrl: extractImageUrl(json) };
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */

/** 生成图片（单次，无重试） */
export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  return requestOnce(params);
}

/** 生成图片（带重试），NO_API_KEY 不重试直接抛 */
export async function generateImageWithRetry(
  params: GenerateImageParams,
  options: RetryOptions = {},
): Promise<GenerateImageResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const intervalMs = options.intervalMs ?? 1500;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    options.onAttempt?.(attempt, maxAttempts);
    try {
      return await requestOnce(params);
    } catch (err) {
      lastError = err;
      // NO_API_KEY 不重试
      if (err instanceof QwenError && err.code === 'NO_API_KEY') {
        throw err;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }
  throw lastError;
}
