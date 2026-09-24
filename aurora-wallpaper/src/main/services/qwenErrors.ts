/**
 * Aurora Wallpaper — Qwen 客户端错误类型
 *
 * 独立成模块：qwenClient（业务封装）与 qwenHttp（HTTP 传输层）都依赖它，
 * 避免两者互相 import 形成循环依赖。
 */

export type QwenErrorCode =
  | 'NO_API_KEY'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE';

export class QwenError extends Error {
  readonly code: QwenErrorCode;

  constructor(code: QwenErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'QwenError';
    this.code = code;
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}
