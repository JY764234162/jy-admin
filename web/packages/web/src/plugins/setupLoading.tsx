export function setupLoading() {
  const loading = `
<div style="
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(8px);
  z-index: 9999;
">
  <style>
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .loading-spinner {
      width: 56px;
      height: 56px;
      position: relative;
      animation: spin 1s linear infinite;
    }
    .loading-spinner::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 4px solid rgba(100, 108, 255, 0.2);
      border-top-color: #646cff;
      border-radius: 50%;
      box-sizing: border-box;
    }
    .loading-dots {
      display: flex;
      gap: 8px;
      margin-top: 24px;
    }
    .loading-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #646cff;
      animation: pulse 1.4s ease-in-out infinite;
    }
    .loading-dot:nth-child(1) { animation-delay: 0s; }
    .loading-dot:nth-child(2) { animation-delay: 0.2s; }
    .loading-dot:nth-child(3) { animation-delay: 0.4s; }
    .loading-text {
      margin-top: 16px;
      color: #646cff;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.5px;
    }
    @media (prefers-color-scheme: dark) {
      div[style*="background: rgba(255, 255, 255, 0.95)"] {
        background: rgba(36, 36, 36, 0.95) !important;
      }
      .loading-text {
        color: #818cf8;
      }
    }
  </style>
  <div class="loading-spinner"></div>
  <div class="loading-dots">
    <div class="loading-dot"></div>
    <div class="loading-dot"></div>
    <div class="loading-dot"></div>
  </div>
  <div class="loading-text">加载中...</div>
</div>`;

  const app = document.getElementById("root");

  if (app) {
    app.innerHTML = loading;
  }
}
