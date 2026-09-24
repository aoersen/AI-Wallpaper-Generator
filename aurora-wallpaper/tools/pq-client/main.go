// pq-client — 极简 HTTP POST 助手
//
// 背景：Electron 主进程的 TLS 栈（BoringSSL / Node 20）不支持 X25519MLKEM768
// 后量子密钥交换，而业务服务器只接受携带该 keyshare 的 TLS 1.3 ClientHello，
// 不带就直接 RST。Go 的 crypto/tls 从 1.24 起默认在 ClientHello 中发送
// X25519MLKEM768 keyshare，因此将本程序编译为独立二进制（仅标准库，约 8MB），
// 由主进程以子进程方式委托真实 HTTP 请求。
//
// 协议（stdin/stdout，每行一个 JSON 对象）：
//
//	输入（stdin 整体）: {"url":"...","apiKey":"...","body":{...},"timeoutMs":120000}
//	输出（stdout 恰好一行）:
//	  {"ok":true,"status":200,"bodyText":"..."}
//	  {"ok":false,"code":"TIMEOUT","message":"..."}        // code ∈ TIMEOUT | NETWORK_ERROR
//
// 退出码：请求执行完成（无论成功失败）恒为 0；仅协议错误（stdin 无法解析、
// URL 非法）为非 0。
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// maxResponseBytes 限制响应体读取上限，防止异常大响应撑爆内存。
const maxResponseBytes = 64 << 20 // 64MB

type requestPayload struct {
	URL       string          `json:"url"`
	APIKey    string          `json:"apiKey"`
	Body      json.RawMessage `json:"body"`
	TimeoutMs int             `json:"timeoutMs"`
}

type resultPayload struct {
	OK       bool   `json:"ok"`
	Status   int    `json:"status,omitempty"`
	BodyText string `json:"bodyText,omitempty"`
	Code     string `json:"code,omitempty"`
	Message  string `json:"message,omitempty"`
}

// emit 输出协议结果并保证进程退出码为 0（业务结果通过 JSON 表达）。
func emit(res resultPayload) {
	out, err := json.Marshal(res)
	if err != nil {
		fmt.Fprintln(os.Stderr, "marshal result:", err)
		os.Exit(2)
	}
	fmt.Println(string(out))
}

func main() {
	in, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read stdin:", err)
		os.Exit(2)
	}
	var req requestPayload
	if err := json.Unmarshal(in, &req); err != nil {
		fmt.Fprintln(os.Stderr, "parse request:", err)
		os.Exit(2)
	}
	if !strings.HasPrefix(req.URL, "http://") && !strings.HasPrefix(req.URL, "https://") {
		fmt.Fprintln(os.Stderr, "invalid url:", req.URL)
		os.Exit(2)
	}

	timeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if timeout <= 0 {
		timeout = 120 * time.Second
	}
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, req.URL, strings.NewReader(string(req.Body)))
	if err != nil {
		emit(resultPayload{OK: false, Code: "NETWORK_ERROR", Message: err.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("User-Agent", "Aurora-Wallpaper/0.1.0 pq-client")
	if req.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
	}

	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(httpReq)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			emit(resultPayload{OK: false, Code: "TIMEOUT", Message: "request timeout"})
		} else {
			emit(resultPayload{OK: false, Code: "NETWORK_ERROR", Message: err.Error()})
		}
		return
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			emit(resultPayload{OK: false, Code: "TIMEOUT", Message: "read response body timeout"})
		} else {
			emit(resultPayload{OK: false, Code: "NETWORK_ERROR", Message: "read response body: " + err.Error()})
		}
		return
	}
	emit(resultPayload{OK: true, Status: resp.StatusCode, BodyText: string(bodyBytes)})
}
