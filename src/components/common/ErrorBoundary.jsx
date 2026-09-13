import React from 'react';

/**
 * 全局错误边界（G7）：捕获子树在渲染期抛出的异常，避免任一处渲染错误导致整页白屏。
 * 兜底 UI 提供：中文说明、「数据未丢失」安抚、刷新重试按钮、可展开的错误详情（便于复制反馈）。
 * 颜色统一使用主题变量（暖黑金 --bg/--text/--accent 等），不硬编码色值，随主题自动切换。
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetail: false };
  }

  /** 渲染期异常：切换到兜底 UI */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /** 提交期捕获：记录堆栈，保留完整信息便于用户复制反馈 */
  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] 渲染异常：', error, errorInfo);
    this.setState({ errorInfo });
  }

  /** 刷新整页重试 */
  handleReload = () => {
    window.location.reload();
  };

  /** 仅重置错误态，尝试重新渲染子树 */
  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetail: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo, showDetail } = this.state;
    const detail = [
      error && (error.stack || error.message || String(error)),
      errorInfo && errorInfo.componentStack,
    ].filter(Boolean).join('\n\n');

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: 24,
      }}>
        <div style={{
          width: 560,
          maxWidth: '92vw',
          background: 'var(--bg-elev)',
          border: '1px solid var(--border-strong)',
          borderRadius: 16,
          padding: '28px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', marginBottom: 10 }}>
            页面出现异常，已为你拦截以避免整页崩溃
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.9, marginBottom: 18 }}>
            你的<span style={{ color: 'var(--text)', fontWeight: 700 }}>数据没有丢失</span>——异常仅发生在界面渲染层，
            未对数据库产生任何写入。你可以点击「刷新页面」重试；若反复出现，请展开下方错误详情并复制反馈给开发者。
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid var(--accent-soft-2)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: '1px solid var(--border-weak)',
                background: 'transparent',
                color: 'var(--text-2)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              仅重试渲染
            </button>
          </div>

          <button
            type="button"
            onClick={() => this.setState(prev => ({ showDetail: !prev.showDetail }))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showDetail ? '▼ 收起错误详情' : '▶ 展开错误详情（复制反馈）'}
          </button>

          {showDetail && (
            <pre
              className="custom-scrollbar"
              style={{
                marginTop: 10,
                maxHeight: 240,
                overflow: 'auto',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-weak)',
                borderRadius: 8,
                padding: 12,
                fontSize: 11.5,
                lineHeight: 1.6,
                color: 'var(--text-2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {detail || '（无堆栈信息）'}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
