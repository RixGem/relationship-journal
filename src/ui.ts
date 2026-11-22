export function renderFrontendHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Relationship Journal</title>
  <style>
    :root {
      --bg-deep: #05070e;
      --glass-bg: rgba(255, 255, 255, 0.055);
      --glass-bg-elevated: rgba(255, 255, 255, 0.085);
      --glass-bg-hover: rgba(255, 255, 255, 0.11);
      --glass-border: rgba(255, 255, 255, 0.13);
      --glass-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.24);
      --text-primary: rgba(255, 255, 255, 0.96);
      --text-secondary: rgba(235, 240, 255, 0.62);
      --text-tertiary: rgba(235, 240, 255, 0.40);
      --ios-blue: #0a84ff;
      --ios-indigo: #5e5ce6;
      --ios-green: #30d158;
      --ios-amber: #ff9f0a;
      --ios-red: #ff453a;
      --ios-purple: #bf5af2;
      --ios-teal: #64d2ff;
      --radius-xl: 28px;
      --radius-lg: 22px;
      --radius-md: 16px;
      --radius-pill: 999px;
      --blur-glass: blur(48px) saturate(200%);
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif;
      background-color: var(--bg-deep);
      color: var(--text-primary);
      min-height: 100vh;
      overflow-x: hidden;
      font-variant-numeric: tabular-nums;
    }

    /* iOS 27 Spatial Ambient Aurora Mesh */
    .ambient-canvas {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      pointer-events: none;
      background: radial-gradient(circle at 50% 0%, #0d152c 0%, var(--bg-deep) 75%);
    }
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(95px);
      opacity: 0.42;
      animation: floatOrb 22s ease-in-out infinite alternate;
    }
    .orb-1 {
      width: 520px;
      height: 520px;
      background: radial-gradient(circle, #3b82f6 0%, transparent 70%);
      top: -160px;
      left: -120px;
    }
    .orb-2 {
      width: 480px;
      height: 480px;
      background: radial-gradient(circle, #6366f1 0%, transparent 70%);
      top: 15%;
      right: -140px;
      animation-delay: -7s;
    }
    .orb-3 {
      width: 440px;
      height: 440px;
      background: radial-gradient(circle, #0ea5e9 0%, transparent 70%);
      bottom: -140px;
      left: 28%;
      animation-delay: -13s;
    }
    @keyframes floatOrb {
      0% { transform: translate3d(0, 0, 0) scale(1); }
      100% { transform: translate3d(28px, -24px, 0) scale(1.07); }
    }

    /* Liquid Glass Surface Primitive */
    .liquid-glass {
      background: var(--glass-bg);
      backdrop-filter: var(--blur-glass);
      -webkit-backdrop-filter: var(--blur-glass);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-highlight), 0 24px 60px rgba(0, 0, 0, 0.38);
    }

    /* ======================== PASSKEY LOCK SCREEN ======================== */
    .auth-screen {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .auth-card {
      width: 100%;
      max-width: 390px;
      padding: 40px 32px 34px;
      border-radius: 34px;
      text-align: center;
      position: relative;
    }
    .auth-glyph {
      width: 72px;
      height: 72px;
      margin: 0 auto 22px;
      border-radius: 22px;
      background: linear-gradient(145deg, rgba(10, 132, 255, 0.28), rgba(94, 92, 230, 0.22));
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 12px 30px rgba(10, 132, 255, 0.22);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .auth-glyph svg {
      width: 34px;
      height: 34px;
      stroke: #fff;
      stroke-width: 1.8;
      fill: none;
    }
    .auth-card h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .auth-card p {
      margin: 0 0 28px;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.5;
    }

    /* Buttons & Inputs */
    .ios-btn {
      appearance: none;
      border: none;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
      font-size: 15px;
      letter-spacing: -0.01em;
      border-radius: var(--radius-pill);
      padding: 13px 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), background 0.16s ease, opacity 0.16s ease;
    }
    .ios-btn:active:not(:disabled) {
      transform: scale(0.97);
    }
    .ios-btn-primary {
      background: linear-gradient(180deg, #2492ff 0%, #007aff 100%);
      color: #fff;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 8px 24px rgba(10, 132, 255, 0.38);
      width: 100%;
    }
    .ios-btn-primary:hover:not(:disabled) {
      background: linear-gradient(180deg, #3aa0ff 0%, #0a84ff 100%);
    }
    .ios-btn-glass {
      background: var(--glass-bg-elevated);
      color: var(--text-primary);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-highlight);
      padding: 9px 16px;
      font-size: 13.5px;
    }
    .ios-btn-glass:hover:not(:disabled) {
      background: var(--glass-bg-hover);
    }
    .ios-btn-accent-pill {
      background: rgba(10, 132, 255, 0.22);
      color: #64d2ff;
      border: 1px solid rgba(10, 132, 255, 0.42);
      padding: 9px 16px;
      font-size: 13.5px;
    }
    .ios-btn-accent-pill:hover:not(:disabled) {
      background: rgba(10, 132, 255, 0.32);
    }

    .ios-input, .ios-select, .ios-textarea {
      width: 100%;
      padding: 12px 15px;
      border-radius: 15px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      background: rgba(0, 0, 0, 0.26);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 14px;
      margin-bottom: 14px;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    .ios-input:focus, .ios-select:focus, .ios-textarea:focus {
      outline: none;
      border-color: var(--ios-blue);
      background: rgba(0, 0, 0, 0.38);
    }
    .field-label {
      display: block;
      text-align: left;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 6px;
      padding-left: 4px;
    }

    .toast-msg {
      margin-top: 14px;
      padding: 11px 14px;
      border-radius: 14px;
      font-size: 13px;
      display: none;
      text-align: left;
    }
    .toast-msg.error {
      display: block;
      background: rgba(255, 69, 58, 0.16);
      border: 1px solid rgba(255, 69, 58, 0.38);
      color: #ff9f98;
    }
    .toast-msg.success {
      display: block;
      background: rgba(48, 209, 88, 0.16);
      border: 1px solid rgba(48, 209, 88, 0.38);
      color: #87f5a3;
    }

    /* ======================== MAIN APP SHELL ======================== */
    .app-shell {
      display: none;
      max-width: 1380px;
      margin: 0 auto;
      padding: 18px 24px 56px;
    }

    /* Floating Dynamic Island Top Bar */
    .top-island {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 18px;
      border-radius: var(--radius-pill);
      margin-bottom: 22px;
      position: sticky;
      top: 14px;
      z-index: 30;
    }
    .island-brand {
      display: flex;
      align-items: center;
      gap: 11px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.02em;
    }
    .brand-dot {
      width: 30px;
      height: 30px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0a84ff, #5e5ce6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      box-shadow: 0 4px 14px rgba(10, 132, 255, 0.4);
    }
    .island-metrics {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .metric-pill {
      padding: 5px 12px;
      border-radius: var(--radius-pill);
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.09);
      font-size: 12.5px;
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .metric-pill b {
      color: var(--text-primary);
      font-weight: 600;
    }
    .island-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* Spatial Split View */
    .split-layout {
      display: grid;
      grid-template-columns: 350px 1fr;
      gap: 22px;
      align-items: start;
    }
    @media (max-width: 980px) {
      .split-layout { grid-template-columns: 1fr; }
      .island-metrics { display: none; }
    }

    .glass-panel {
      border-radius: var(--radius-xl);
      padding: 20px;
      margin-bottom: 18px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
    }

    /* Contact Cells */
    .contact-cell {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.07);
      margin-bottom: 9px;
      cursor: pointer;
      transition: all 0.16s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .contact-cell:hover {
      background: rgba(255, 255, 255, 0.08);
      transform: translateY(-1px);
    }
    .contact-cell.active {
      background: rgba(10, 132, 255, 0.16);
      border-color: rgba(10, 132, 255, 0.52);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 8px 24px rgba(10, 132, 255, 0.18);
    }
    .contact-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .avatar-circle {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(10, 132, 255, 0.35), rgba(191, 90, 242, 0.35));
      border: 1px solid rgba(255, 255, 255, 0.22);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 15px;
      flex-shrink: 0;
    }
    .contact-meta {
      min-width: 0;
    }
    .contact-name {
      font-weight: 600;
      font-size: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .contact-sub {
      font-size: 12px;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    /* Status & Score Pills */
    .score-pill {
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }
    .tone-ok { background: rgba(48, 209, 88, 0.16); color: #47e56c; border: 1px solid rgba(48, 209, 88, 0.34); }
    .tone-warn { background: rgba(255, 159, 10, 0.16); color: #ffb946; border: 1px solid rgba(255, 159, 10, 0.34); }
    .tone-danger { background: rgba(255, 69, 58, 0.16); color: #ff6961; border: 1px solid rgba(255, 69, 58, 0.34); }
    .tone-info { background: rgba(100, 210, 255, 0.15); color: #70d7ff; border: 1px solid rgba(100, 210, 255, 0.32); }

    /* Hero Inspector Header */
    .hero-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
      padding-bottom: 20px;
      margin-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.09);
    }
    .hero-identity {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .hero-avatar {
      width: 58px;
      height: 58px;
      border-radius: 20px;
      background: linear-gradient(135deg, #0a84ff, #5e5ce6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 23px;
      font-weight: 700;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 12px 28px rgba(10, 132, 255, 0.35);
    }
    .hero-title h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .hero-tags {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
    }

    /* Bento Quantitative Grid */
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 22px;
    }
    @media (max-width: 1180px) {
      .bento-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 600px) {
      .bento-grid { grid-template-columns: 1fr; }
    }
    .bento-card {
      padding: 16px;
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, 0.045);
      border: 1px solid rgba(255, 255, 255, 0.09);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .bento-label {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .bento-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.03em;
      margin: 8px 0 4px;
    }
    .bento-sub {
      font-size: 12px;
      color: var(--text-tertiary);
      line-height: 1.4;
    }

    /* Progress Bar */
    .ios-progress-track {
      height: 6px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
      margin: 8px 0 6px;
    }
    .ios-progress-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #0a84ff, #64d2ff);
    }

    /* iOS 27 Segmented Control */
    .segmented-bar {
      display: inline-flex;
      padding: 4px;
      border-radius: var(--radius-pill);
      background: rgba(0, 0, 0, 0.32);
      border: 1px solid rgba(255, 255, 255, 0.09);
      margin-bottom: 18px;
      gap: 4px;
    }
    .seg-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 7px 16px;
      border-radius: var(--radius-pill);
      cursor: pointer;
      transition: all 0.16s ease;
    }
    .seg-btn.active {
      background: rgba(255, 255, 255, 0.14);
      color: var(--text-primary);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 4px 12px rgba(0, 0, 0, 0.25);
    }

    /* Content Lists */
    .ios-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .ios-list-item {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 14px;
      line-height: 1.5;
    }

    .signal-columns {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-top: 14px;
    }
    @media (max-width: 900px) {
      .signal-columns { grid-template-columns: 1fr; }
    }
    .signal-bucket {
      padding: 15px;
      border-radius: var(--radius-lg);
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    .signal-bucket h4 {
      margin: 0 0 10px;
      font-size: 13px;
      color: var(--text-secondary);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* ======================== iOS 27 MODAL SHEETS ======================== */
    .sheet-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(3, 5, 12, 0.62);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .sheet-backdrop.open {
      display: flex;
    }
    .sheet-modal {
      width: 100%;
      max-width: 480px;
      border-radius: 30px;
      padding: 26px 26px 24px;
      animation: sheetPop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
    }
    @keyframes sheetPop {
      from { opacity: 0; transform: scale(0.95) translateY(12px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .sheet-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 18px;
    }
    .sheet-header h3 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .close-circle {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .close-circle:hover {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
  </style>
</head>
<body>
  <div class="ambient-canvas">
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>
  </div>

  <!-- ======================== PASSKEY SCREEN ======================== -->
  <section id="authScreen" class="auth-screen">
    <div class="auth-card liquid-glass">
      <div class="auth-glyph">
        <svg viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      </div>
      <h1>Relationship Journal</h1>
      <p id="authSubtitle">私人关系量化引擎</p>

      <!-- First-time Enrollment (Only shown before any passkey exists) -->
      <div id="enrollBox" style="display:none;">
        <label class="field-label" for="passkeyLabel">设备名称</label>
        <input id="passkeyLabel" class="ios-input" type="text" value="Owner Passkey" maxlength="80" placeholder="例如：iPhone / Mac" />
        <button id="enrollBtn" class="ios-btn ios-btn-primary">创建 Passkey</button>
      </div>

      <!-- Clean Login (Shown once enrolled — zero metadata or lock prompts) -->
      <div id="loginBox" style="display:none;">
        <button id="loginBtn" class="ios-btn ios-btn-primary">使用 Passkey 登录</button>
      </div>

      <div id="authMsg" class="toast-msg"></div>
    </div>
  </section>

  <!-- ======================== MAIN APPLICATION ======================== -->
  <main id="appShell" class="app-shell">
    <!-- Floating Dynamic Island Header -->
    <nav class="top-island liquid-glass">
      <div class="island-brand">
        <div class="brand-dot">✦</div>
        <span>Relationship Journal</span>
      </div>

      <div class="island-metrics" id="islandMetrics"></div>

      <div class="island-actions">
        <button id="openCreatePersonBtn" class="ios-btn ios-btn-glass">+ 联系人</button>
        <button id="openLogEventBtn" class="ios-btn ios-btn-accent-pill">+ 记录互动</button>
        <button id="logoutBtn" class="ios-btn ios-btn-glass" title="退出登录">退出</button>
      </div>
    </nav>

    <div class="split-layout">
      <!-- Left Sidebar -->
      <aside>
        <!-- Priority Attention Queue -->
        <div class="glass-panel liquid-glass" id="priorityPanel" style="display:none;">
          <div class="section-header">
            <span class="section-title">优先关怀预警</span>
            <span class="score-pill tone-warn" id="priorityCountBadge">0</span>
          </div>
          <div id="priorityQueueList"></div>
        </div>

        <!-- Disambiguation Queue (Only visible when pending > 0) -->
        <div class="glass-panel liquid-glass" id="disambiguationPanel" style="display:none;">
          <div class="section-header">
            <span class="section-title">待消歧笔记</span>
            <span class="score-pill tone-info" id="disambigCountBadge">0</span>
          </div>
          <div id="disambiguationList"></div>
        </div>

        <!-- Contacts List -->
        <div class="glass-panel liquid-glass">
          <div class="section-header">
            <span class="section-title">联系人</span>
            <button id="refreshBtn" class="ios-btn ios-btn-glass" style="padding:4px 11px; font-size:12px;">刷新</button>
          </div>
          <div id="peopleList"></div>
        </div>
      </aside>

      <!-- Main Detail Inspector -->
      <section class="glass-panel liquid-glass" id="inspectorPanel">
        <div id="inspectorContent" style="padding: 36px 12px; text-align: center; color: var(--text-secondary);">
          选择左侧联系人或点击右上角「+ 联系人」开始记录。
        </div>
      </section>
    </div>
  </main>

  <!-- ======================== SHEET: CREATE PERSON ======================== -->
  <div id="createPersonSheet" class="sheet-backdrop">
    <div class="sheet-modal liquid-glass">
      <div class="sheet-header">
        <h3>新建联系人</h3>
        <button type="button" class="close-circle" data-close="createPersonSheet">✕</button>
      </div>
      <form id="createPersonForm">
        <label class="field-label">姓名或称呼</label>
        <input id="cpAlias" class="ios-input" type="text" required placeholder="例如：林夏 / Alex" />

        <div class="grid-2">
          <div>
            <label class="field-label">关系层级 (半衰期 τ)</label>
            <select id="cpState" class="ios-select">
              <option value="close">挚友 / 核心 (14天)</option>
              <option value="active" selected>活跃朋友 (30天)</option>
              <option value="reconnect_needed">待破冰重联 (14天)</option>
              <option value="casual">泛交熟人 (60天)</option>
              <option value="archived">归档静默 (180天)</option>
            </select>
          </div>
          <div>
            <label class="field-label">生日 (YYYY-MM-DD)</label>
            <input id="cpBirthday" class="ios-input" type="text" placeholder="1997-05-20" />
          </div>
        </div>

        <label class="field-label">纪念日 / 相识日 (YYYY-MM-DD, 可选)</label>
        <input id="cpAnniversary" class="ios-input" type="text" placeholder="2024-10-01" />

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:6px;">保存联系人</button>
        <div id="cpMsg" class="toast-msg"></div>
      </form>
    </div>
  </div>

  <!-- ======================== SHEET: LOG INTERACTION ======================== -->
  <div id="logEventSheet" class="sheet-backdrop">
    <div class="sheet-modal liquid-glass">
      <div class="sheet-header">
        <h3>记录互动与双时态信号</h3>
        <button type="button" class="close-circle" data-close="logEventSheet">✕</button>
      </div>
      <form id="insertEventForm">
        <label class="field-label">归属联系人</label>
        <select id="iePersonId" class="ios-select"></select>

        <div class="grid-2">
          <div>
            <label class="field-label">记录渠道</label>
            <select id="ieSource" class="ios-select">
              <option value="manual">手动记录</option>
              <option value="chat_log">聊天摘录</option>
              <option value="voice_note">语音速记</option>
            </select>
          </div>
          <div>
            <label class="field-label">情绪体验 (-1 ~ +1)</label>
            <input id="ieSentiment" class="ios-input" type="number" step="0.05" min="-1" max="1" value="0.8" />
          </div>
        </div>

        <label class="field-label">互动内容 (敏感信息将在入库前自动 HMAC 脱敏)</label>
        <textarea id="ieContent" class="ios-textarea" rows="3" required placeholder="记录一次见面、通话或新发现的对方偏好..."></textarea>

        <div class="grid-2">
          <div>
            <label class="field-label">信号类型 (可选)</label>
            <select id="ieSignalCat" class="ios-select">
              <option value="preference">喜好 / 习惯 (preference)</option>
              <option value="gift_idea">礼物灵感 (gift_idea)</option>
              <option value="boundary">个人边界 / 忌口 (boundary)</option>
            </select>
          </div>
          <div>
            <label class="field-label">指代置信度 (0~1)</label>
            <input id="ieConfidence" class="ios-input" type="number" step="0.01" min="0" max="1" value="0.95" required />
          </div>
        </div>

        <div class="grid-2">
          <div>
            <label class="field-label">信号主题 (如 coffee_pref)</label>
            <input id="ieSignalTopic" class="ios-input" type="text" placeholder="beverage_preference" />
          </div>
          <div>
            <label class="field-label">信号内容 (如 燕麦拿铁)</label>
            <input id="ieSignalValue" class="ios-input" type="text" placeholder="iced_oat_latte" />
          </div>
        </div>

        <button type="submit" class="ios-btn ios-btn-primary" style="margin-top:6px;">写入时间线并演进信号</button>
        <div id="ieMsg" class="toast-msg"></div>
      </form>
    </div>
  </div>

  <script>
    let sessionToken = sessionStorage.getItem('rj_session_token') || '';
    let selectedPersonId = null;
    let activeTab = 'signals';
    let lastInspectorData = null;

    function isTestRecord(item) {
      if (!item) return false;
      const alias = String(item.alias || '');
      if (alias.startsWith('[TEST_DATA]')) return true;
      if (item.key_dates && item.key_dates.is_test === true) return true;
      if (item.keyDates && item.keyDates.is_test === true) return true;
      return false;
    }

    function b64urlToBytes(b64url) {
      const norm = b64url.replace(/-/g, '+').replace(/_/g, '/');
      const pad = '='.repeat((4 - (norm.length % 4)) % 4);
      const bin = atob(norm + pad);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }

    function bufToB64url(buf) {
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    }

    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    function showToast(el, text, isErr) {
      el.textContent = text;
      el.className = 'toast-msg ' + (isErr ? 'error' : 'success');
    }

    async function mcpToolCall(name, args) {
      const headers = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = 'Bearer ' + sessionToken;
      const res = await fetch('/mcp', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name, arguments: args || {} }
        })
      });
      if (res.status === 401) {
        sessionStorage.removeItem('rj_session_token');
        sessionToken = '';
        document.getElementById('appShell').style.display = 'none';
        document.getElementById('authScreen').style.display = 'flex';
        await checkPasskeyStatus();
        throw new Error('请使用 Passkey 登录');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || '请求异常');
      if (data.result && data.result.isError) {
        throw new Error((data.result.structuredContent && data.result.structuredContent.error) || '操作失败');
      }
      return data.result.structuredContent;
    }

    async function checkPasskeyStatus() {
      const res = await fetch('/auth/passkey/status');
      const status = await res.json();
      const enrollBox = document.getElementById('enrollBox');
      const loginBox = document.getElementById('loginBox');
      const subtitle = document.getElementById('authSubtitle');

      if (!status.enrolled) {
        subtitle.textContent = '创建 Passkey 以开启私人关系空间';
        enrollBox.style.display = 'block';
        loginBox.style.display = 'none';
      } else {
        subtitle.textContent = '私人关系量化引擎';
        enrollBox.style.display = 'none';
        loginBox.style.display = 'block';
      }
    }

    document.getElementById('enrollBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'toast-msg';
      try {
        if (!window.PublicKeyCredential) {
          throw new Error('当前浏览器不支持 Passkey');
        }
        const label = document.getElementById('passkeyLabel').value.trim() || 'Owner Passkey';
        const optRes = await fetch('/auth/passkey/register/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法初始化 Passkey');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.user.id = b64urlToBytes(pubKey.user.id);

        const cred = await navigator.credentials.create({ publicKey: pubKey });
        if (!cred || !cred.response.getPublicKey) {
          throw new Error('请使用支持 WebAuthn Level 2 的现代浏览器');
        }

        const verifyRes = await fetch('/auth/passkey/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            credentialId: bufToB64url(cred.rawId),
            clientDataJSON: bufToB64url(cred.response.clientDataJSON),
            authenticatorData: bufToB64url(cred.response.getAuthenticatorData()),
            publicKeySpki: bufToB64url(cred.response.getPublicKey()),
            algorithm: cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : -7,
            label
          })
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey 验证未通过');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await enterApp();
      } catch (err) {
        showToast(authMsg, err.message || String(err), true);
      }
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'toast-msg';
      try {
        const optRes = await fetch('/auth/passkey/login/options', { method: 'POST' });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法发起 Passkey 验证');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.allowCredentials = (pubKey.allowCredentials || []).map((c) => ({
          ...c,
          id: b64urlToBytes(c.id)
        }));

        const assertion = await navigator.credentials.get({ publicKey: pubKey });
        if (!assertion) throw new Error('已取消 Passkey 验证');

        const verifyRes = await fetch('/auth/passkey/login/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            credentialId: bufToB64url(assertion.rawId),
            clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
            authenticatorData: bufToB64url(assertion.response.authenticatorData),
            signature: bufToB64url(assertion.response.signature)
          })
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey 登录失败');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await enterApp();
      } catch (err) {
        showToast(authMsg, err.message || String(err), true);
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/auth/passkey/logout', { method: 'POST', credentials: 'same-origin' });
      sessionToken = '';
      sessionStorage.removeItem('rj_session_token');
      document.getElementById('appShell').style.display = 'none';
      document.getElementById('authScreen').style.display = 'flex';
      await checkPasskeyStatus();
    });

    async function enterApp() {
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('appShell').style.display = 'block';
      await loadPortfolio();
    }

    function stateLabel(state) {
      const map = {
        close: '挚友',
        active: '活跃',
        reconnect_needed: '待重联',
        casual: '泛交',
        archived: '归档'
      };
      return map[state] || state;
    }

    function riskPillHtml(level) {
      if (level === 'healthy') return '<span class="score-pill tone-ok">健康</span>';
      if (level === 'attention_needed') return '<span class="score-pill tone-warn">需关注</span>';
      if (level === 'at_risk') return '<span class="score-pill tone-danger">失联预警</span>';
      return '<span class="score-pill tone-info">' + escapeHtml(level) + '</span>';
    }

    function scoreToneClass(score) {
      if (score >= 70) return 'tone-ok';
      if (score >= 45) return 'tone-warn';
      return 'tone-danger';
    }

    function energyLabel(state) {
      const map = {
        nourishing: '滋养型',
        neutral: '平稳',
        cooling_warning: '降温预警',
        draining: '消耗型',
        insufficient_data: '待积累'
      };
      return map[state] || state;
    }

    async function loadPortfolio() {
      const [overview, disambig] = await Promise.all([
        mcpToolCall('analyze_relationship', {}),
        mcpToolCall('manage_disambiguation_item', { action: 'list', status: 'pending' })
      ]);

      const people = (overview.people_summary || []).filter((p) => !isTestRecord(p));
      const pq = (overview.priority_attention_queue || []).filter((p) => !isTestRecord(p));
      const dqItems = ((disambig && disambig.items) || []).filter(
        (d) => !String(d.sanitizedContent || '').startsWith('[TEST_DATA]')
      );

      document.getElementById('islandMetrics').innerHTML =
        '<span class="metric-pill">联系人 <b>' + people.length + '</b></span>' +
        '<span class="metric-pill">有效信号 <b>' + overview.totals.active_signals + '</b></span>' +
        '<span class="metric-pill">已演进 <b>' + overview.totals.superseded_signals + '</b></span>' +
        (dqItems.length > 0 ? '<span class="metric-pill">待消歧 <b>' + dqItems.length + '</b></span>' : '');

      // Priority Attention Queue
      const priorityPanel = document.getElementById('priorityPanel');
      if (pq.length === 0) {
        priorityPanel.style.display = 'none';
      } else {
        priorityPanel.style.display = 'block';
        document.getElementById('priorityCountBadge').textContent = String(pq.length);
        document.getElementById('priorityQueueList').innerHTML = pq.map((p) => (
          '<div class="contact-cell" data-id="' + escapeHtml(p.person_id) + '">' +
            '<div class="contact-left">' +
              '<div class="avatar-circle">' + escapeHtml(p.alias.slice(0, 1)) + '</div>' +
              '<div class="contact-meta">' +
                '<div class="contact-name">' + escapeHtml(p.alias) + '</div>' +
                '<div class="contact-sub">断联 ' + (p.days_since_last_interaction ?? '—') + ' 天 · 保鲜度 ' + Math.round(p.freshness_score) + '</div>' +
              '</div>' +
            '</div>' +
            riskPillHtml(p.risk_level) +
          '</div>'
        )).join('');
      }

      // Contacts Directory
      const plEl = document.getElementById('peopleList');
      const selectEl = document.getElementById('iePersonId');
      const peopleOptionsHtml = people.map((p) => (
        '<option value="' + escapeHtml(p.person_id) + '">' + escapeHtml(p.alias) + ' (' + escapeHtml(stateLabel(p.relationship_state)) + ')</option>'
      )).join('');
      selectEl.innerHTML = peopleOptionsHtml + '<option value="">指代不明 (暂存至待消歧)</option>';

      if (people.length === 0) {
        plEl.innerHTML = '<div style="padding:18px 4px; text-align:center; color:var(--text-secondary); font-size:13.5px;">暂无私人联系人，点击右上角「+ 联系人」创建。</div>';
      } else {
        plEl.innerHTML = people.map((p) => (
          '<div class="contact-cell ' + (selectedPersonId === p.person_id ? 'active' : '') + '" data-id="' + escapeHtml(p.person_id) + '">' +
            '<div class="contact-left">' +
              '<div class="avatar-circle">' + escapeHtml(p.alias.slice(0, 1)) + '</div>' +
              '<div class="contact-meta">' +
                '<div class="contact-name">' + escapeHtml(p.alias) + '</div>' +
                '<div class="contact-sub">' + escapeHtml(stateLabel(p.relationship_state)) + ' · ' + p.event_count + ' 次互动</div>' +
              '</div>' +
            '</div>' +
            '<span class="score-pill ' + scoreToneClass(p.composite_health_score) + '">' + Math.round(p.composite_health_score) + '</span>' +
          '</div>'
        )).join('');
      }

      // Disambiguation Queue
      const dqPanel = document.getElementById('disambiguationPanel');
      const dqEl = document.getElementById('disambiguationList');
      if (dqItems.length === 0) {
        dqPanel.style.display = 'none';
      } else {
        dqPanel.style.display = 'block';
        document.getElementById('disambigCountBadge').textContent = String(dqItems.length);
        dqEl.innerHTML = dqItems.map((item) => (
          '<div class="ios-list-item" style="margin-bottom:8px;">' +
            '<div style="font-size:13px; margin-bottom:8px;">' + escapeHtml(item.sanitizedContent) + '</div>' +
            '<select class="ios-select dq-person-select" data-qid="' + escapeHtml(item.id) + '" style="margin-bottom:8px; padding:8px 11px; font-size:12.5px;">' +
              '<option value="">选择归属联系人...</option>' + peopleOptionsHtml +
            '</select>' +
            '<div class="grid-2">' +
              '<button type="button" class="ios-btn ios-btn-accent-pill dq-resolve-btn" data-qid="' + escapeHtml(item.id) + '" style="padding:7px 10px; font-size:12px;">绑定入库</button>' +
              '<button type="button" class="ios-btn ios-btn-glass dq-dismiss-btn" data-qid="' + escapeHtml(item.id) + '" style="padding:7px 10px; font-size:12px;">忽略</button>' +
            '</div>' +
          '</div>'
        )).join('');

        dqEl.querySelectorAll('.dq-resolve-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const qid = btn.getAttribute('data-qid');
            const sel = dqEl.querySelector('.dq-person-select[data-qid="' + qid + '"]');
            const pid = sel ? sel.value : '';
            if (!pid) return;
            await mcpToolCall('manage_disambiguation_item', { action: 'link', queue_id: qid, person_id: pid });
            selectedPersonId = pid;
            await loadPortfolio();
          });
        });

        dqEl.querySelectorAll('.dq-dismiss-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const qid = btn.getAttribute('data-qid');
            await mcpToolCall('manage_disambiguation_item', { action: 'dismiss', queue_id: qid });
            await loadPortfolio();
          });
        });
      }

      document.querySelectorAll('.contact-cell[data-id]').forEach((el) => {
        el.addEventListener('click', () => selectPerson(el.getAttribute('data-id')));
      });

      if (!selectedPersonId && people.length > 0) {
        await selectPerson(people[0].person_id);
      } else if (selectedPersonId && people.some((p) => p.person_id === selectedPersonId)) {
        await selectPerson(selectedPersonId);
      }
    }

    async function selectPerson(personId) {
      selectedPersonId = personId;
      document.querySelectorAll('.contact-cell[data-id]').forEach((el) => {
        el.classList.toggle('active', el.getAttribute('data-id') === personId);
      });
      const selectEl = document.getElementById('iePersonId');
      if (selectEl) selectEl.value = personId;

      const [analysis, records] = await Promise.all([
        mcpToolCall('analyze_relationship', { person_id: personId }),
        mcpToolCall('query_relationship_records', { person_id: personId, include_history: true, limit: 25 })
      ]);

      lastInspectorData = { analysis, records };
      renderInspector();
    }

    function renderInspector() {
      if (!lastInspectorData) return;
      const { analysis, records } = lastInspectorData;
      const h = analysis.health;
      const c = analysis.cadence;
      const s = analysis.sentiment;
      const d = analysis.depth_and_volatility;

      let tabBodyHtml = '';
      if (activeTab === 'signals') {
        const hooks = analysis.follow_up_hooks || [];
        const hooksHtml = hooks.length === 0
          ? '<li class="ios-list-item" style="color:var(--text-secondary);">当前状态良好，暂无紧急跟进事项。</li>'
          : hooks.map((item) => '<li class="ios-list-item">✦ ' + escapeHtml(item) + '</li>').join('');

        const renderBucket = (title, items) => {
          const list = items || [];
          return (
            '<div class="signal-bucket">' +
              '<h4><span>' + title + '</span><span>' + list.length + '</span></h4>' +
              (list.length === 0
                ? '<div style="font-size:12.5px; color:var(--text-tertiary);">暂未记录</div>'
                : '<ul class="ios-list">' + list.map((sig) => (
                    '<li class="ios-list-item" style="padding:10px 12px;">' +
                      '<div style="font-weight:600; font-size:13px;">' + escapeHtml(sig.topic) + '</div>' +
                      '<div style="color:var(--text-secondary); font-size:13px; margin-top:2px;">' + escapeHtml(sig.value) + '</div>' +
                    '</li>'
                  )).join('') + '</ul>') +
            '</div>'
          );
        };

        tabBodyHtml =
          '<div class="section-title" style="margin-bottom:10px;">主动关怀与行动建议</div>' +
          '<ul class="ios-list" style="margin-bottom:20px;">' + hooksHtml + '</ul>' +
          '<div class="section-title">当前有效双时态画像</div>' +
          '<div class="signal-columns">' +
            renderBucket('喜好与习惯', analysis.signals.active_by_category.preference) +
            renderBucket('礼物灵感', analysis.signals.active_by_category.gift_idea) +
            renderBucket('边界与忌口', analysis.signals.active_by_category.boundary) +
          '</div>';
      } else if (activeTab === 'evolution') {
        const changes = analysis.signals.preference_changes || [];
        tabBodyHtml = changes.length === 0
          ? '<div class="ios-list-item" style="color:var(--text-secondary);">暂无偏好或边界的历史更替记录。当同一主题出现新值时，系统会自动闭合旧区间并在此展示演进轨迹。</div>'
          : '<ul class="ios-list">' + changes.map((ch) => (
              '<li class="ios-list-item">' +
                '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                  '<b>' + escapeHtml(ch.topic) + '</b>' +
                  '<span style="font-size:12px; color:var(--text-tertiary);">' + (ch.changed_at ? new Date(ch.changed_at).toLocaleDateString() : '') + '</span>' +
                '</div>' +
                '<div style="margin-top:6px; font-size:13.5px;">' +
                  '<span style="color:var(--text-tertiary); text-decoration:line-through;">' + escapeHtml(ch.old_value) + '</span>' +
                  ' <span style="color:var(--ios-teal); margin:0 6px;">→</span> ' +
                  '<span style="color:var(--text-primary); font-weight:600;">' + escapeHtml(ch.new_value) + '</span>' +
                '</div>' +
              '</li>'
            )).join('') + '</ul>';
      } else {
        const events = records.timeline_events || [];
        tabBodyHtml = events.length === 0
          ? '<div class="ios-list-item" style="color:var(--text-secondary);">暂无互动记录。</div>'
          : '<ul class="ios-list">' + events.map((ev) => (
              '<li class="ios-list-item">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
                  '<span class="score-pill tone-info" style="font-size:11px; padding:2px 9px;">' + escapeHtml(ev.source) + '</span>' +
                  '<span style="font-size:12px; color:var(--text-tertiary);">' + new Date(ev.occurredAt).toLocaleString() + '</span>' +
                '</div>' +
                '<div style="font-size:14px;">' + escapeHtml(ev.summary) + '</div>' +
                '<div style="margin-top:6px; font-size:12px; color:var(--text-secondary); display:flex; gap:12px;">' +
                  '<span>情绪值: <b>' + (ev.sentimentScore ?? '—') + '</b></span>' +
                  ((ev.redactedEntities && ev.redactedEntities.length)
                    ? '<span style="color:var(--ios-teal);">已脱敏: ' + escapeHtml(ev.redactedEntities.join(', ')) + '</span>'
                    : '') +
                '</div>' +
              '</li>'
            )).join('') + '</ul>';
      }

      document.getElementById('inspectorContent').style.textAlign = 'left';
      document.getElementById('inspectorContent').style.padding = '4px';
      document.getElementById('inspectorContent').innerHTML =
        '<div class="hero-header">' +
          '<div class="hero-identity">' +
            '<div class="hero-avatar">' + escapeHtml(analysis.person.alias.slice(0, 1)) + '</div>' +
            '<div class="hero-title">' +
              '<h2>' + escapeHtml(analysis.person.alias) + '</h2>' +
              '<div class="hero-tags">' +
                '<span class="score-pill tone-info">' + escapeHtml(stateLabel(analysis.person.relationship_state)) + '</span>' +
                riskPillHtml(h.risk_level) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" id="quickLogForPersonBtn" class="ios-btn ios-btn-accent-pill">+ 记一笔互动</button>' +
        '</div>' +

        '<div class="bento-grid">' +
          '<div class="bento-card">' +
            '<div class="bento-label">综合关系健康分</div>' +
            '<div class="bento-value">' + Math.round(h.composite_health_score) + '<span style="font-size:14px; color:var(--text-secondary); font-weight:500;"> / 100</span></div>' +
            '<div class="ios-progress-track"><div class="ios-progress-fill" style="width:' + Math.min(100, Math.round(h.composite_health_score)) + '%"></div></div>' +
            '<div class="bento-sub">保鲜度 ' + Math.round(h.freshness_score) + ' · 目标周期 ' + h.target_cadence_days + ' 天</div>' +
          '</div>' +

          '<div class="bento-card">' +
            '<div class="bento-label">互动节律偏离 (Z-Score)</div>' +
            '<div class="bento-value">' + (c.drift_z_score !== null ? c.drift_z_score : '—') + '</div>' +
            '<div class="bento-sub">距上次 ' + (c.days_since_last_interaction ?? '—') + ' 天 · 平均间隔 ' + (c.mean_interval_days ?? '—') + ' 天</div>' +
          '</div>' +

          '<div class="bento-card">' +
            '<div class="bento-label">情绪能量 (EMA)</div>' +
            '<div class="bento-value">' + (s.ema !== null ? s.ema : '—') + '</div>' +
            '<div class="bento-sub">' + escapeHtml(energyLabel(s.energy_state)) + ' · 动量斜率 ' + (s.momentum_slope ?? '—') + '</div>' +
          '</div>' +

          '<div class="bento-card">' +
            '<div class="bento-label">画像完备度</div>' +
            '<div class="bento-value">' + Math.round(d.profile_coverage_score) + '%</div>' +
            '<div class="ios-progress-track"><div class="ios-progress-fill" style="width:' + Math.min(100, Math.round(d.profile_coverage_score)) + '%"></div></div>' +
            '<div class="bento-sub">信号沉淀率 ' + d.signal_yield_rate + ' · 90天变迁 ' + d.volatility_90d + ' 次</div>' +
          '</div>' +
        '</div>' +

        '<div class="segmented-bar">' +
          '<button type="button" class="seg-btn ' + (activeTab === 'signals' ? 'active' : '') + '" data-tab="signals">画像与跟进</button>' +
          '<button type="button" class="seg-btn ' + (activeTab === 'evolution' ? 'active' : '') + '" data-tab="evolution">双时态变迁 (' + (analysis.signals.preference_changes || []).length + ')</button>' +
          '<button type="button" class="seg-btn ' + (activeTab === 'timeline' ? 'active' : '') + '" data-tab="timeline">互动时间线 (' + c.total_events + ')</button>' +
        '</div>' +
        '<div>' + tabBodyHtml + '</div>';

      document.querySelectorAll('.seg-btn[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeTab = btn.getAttribute('data-tab');
          renderInspector();
        });
      });

      const quickBtn = document.getElementById('quickLogForPersonBtn');
      if (quickBtn) {
        quickBtn.addEventListener('click', () => {
          document.getElementById('iePersonId').value = analysis.person.id;
          openSheet('logEventSheet');
        });
      }
    }

    /* Sheet Modal Controls */
    function openSheet(id) {
      document.getElementById(id).classList.add('open');
    }
    function closeSheet(id) {
      document.getElementById(id).classList.remove('open');
    }
    document.getElementById('openCreatePersonBtn').addEventListener('click', () => openSheet('createPersonSheet'));
    document.getElementById('openLogEventBtn').addEventListener('click', () => openSheet('logEventSheet'));
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeSheet(btn.getAttribute('data-close')));
    });
    document.querySelectorAll('.sheet-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });

    document.getElementById('refreshBtn').addEventListener('click', () => loadPortfolio());

    document.getElementById('createPersonForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('cpMsg');
      try {
        const alias = document.getElementById('cpAlias').value.trim();
        const state = document.getElementById('cpState').value;
        const bday = document.getElementById('cpBirthday').value.trim();
        const anniv = document.getElementById('cpAnniversary').value.trim();
        const key_dates = {};
        if (bday) key_dates.birthday = bday;
        if (anniv) key_dates.anniversary = anniv;

        const res = await mcpToolCall('create_person', {
          alias,
          relationship_state: state,
          key_dates
        });
        document.getElementById('cpAlias').value = '';
        document.getElementById('cpBirthday').value = '';
        document.getElementById('cpAnniversary').value = '';
        closeSheet('createPersonSheet');
        selectedPersonId = res.person.id;
        await loadPortfolio();
      } catch (err) {
        showToast(msg, err.message, true);
      }
    });

    document.getElementById('insertEventForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('ieMsg');
      try {
        const personIdVal = document.getElementById('iePersonId').value;
        const payload = {
          person_id: personIdVal ? personIdVal : null,
          source: document.getElementById('ieSource').value,
          content: document.getElementById('ieContent').value.trim(),
          confidence: Number(document.getElementById('ieConfidence').value),
          sentiment_score: Number(document.getElementById('ieSentiment').value)
        };
        const topic = document.getElementById('ieSignalTopic').value.trim();
        const val = document.getElementById('ieSignalValue').value.trim();
        if (topic && val) {
          payload.signal_topic = topic;
          payload.signal_value = val;
          payload.signal_category = document.getElementById('ieSignalCat').value;
        }
        await mcpToolCall('insert_relationship_event', payload);
        document.getElementById('ieContent').value = '';
        document.getElementById('ieSignalTopic').value = '';
        document.getElementById('ieSignalValue').value = '';
        closeSheet('logEventSheet');
        await loadPortfolio();
      } catch (err) {
        showToast(msg, err.message, true);
      }
    });

    (async () => {
      await checkPasskeyStatus();
      if (sessionToken) {
        try {
          await enterApp();
        } catch {
          sessionToken = '';
          sessionStorage.removeItem('rj_session_token');
        }
      }
    })();
  </script>
</body>
</html>`;
}
