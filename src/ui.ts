export function renderFrontendHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Relationship Journal</title>
  <style>
    /* ==========================================================================
       Apple Human Interface Guidelines (HIG) Semantic Design System
       ========================================================================== */
    :root {
      --sys-bg-primary: #F2F2F7;
      --sys-bg-secondary: #FFFFFF;
      --sys-bg-tertiary: #E5E5EA;
      --sys-sidebar-bg: rgba(242, 242, 247, 0.85);
      --sys-topbar-bg: rgba(255, 255, 255, 0.82);
      --sys-sheet-bg: #F2F2F7;
      --sys-fill-tertiary: rgba(118, 118, 128, 0.12);
      --sys-fill-quaternary: rgba(116, 116, 128, 0.08);
      --sys-label-primary: #000000;
      --sys-label-secondary: rgba(60, 60, 67, 0.60);
      --sys-label-tertiary: rgba(60, 60, 67, 0.30);
      --sys-separator: rgba(60, 60, 67, 0.14);
      --sys-card-border: rgba(0, 0, 0, 0.04);
      --sys-card-shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.02);
      --sys-seg-track: rgba(118, 118, 128, 0.12);
      --sys-seg-thumb: #FFFFFF;
      --sys-seg-shadow: 0 3px 8px rgba(0, 0, 0, 0.12), 0 3px 1px rgba(0, 0, 0, 0.04);

      /* Apple Semantic Colors */
      --apple-blue: #007AFF;
      --apple-green: #34C759;
      --apple-orange: #FF9500;
      --apple-red: #FF3B30;
      --apple-pink: #FF2D55;
      --apple-purple: #AF52DE;
      --apple-indigo: #5856D6;
      --apple-teal: #30B0C7;

      /* Priority Row Tints */
      --tint-risk-bg: rgba(255, 59, 48, 0.06);
      --tint-warn-bg: rgba(255, 149, 0, 0.05);
      --badge-risk-bg: rgba(255, 59, 48, 0.14);
      --badge-warn-bg: rgba(255, 149, 0, 0.15);
      --badge-ok-bg: rgba(52, 199, 89, 0.14);
    }

    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        --sys-bg-primary: #000000;
        --sys-bg-secondary: #1C1C1E;
        --sys-bg-tertiary: #2C2C2E;
        --sys-sidebar-bg: rgba(28, 28, 30, 0.82);
        --sys-topbar-bg: rgba(28, 28, 30, 0.80);
        --sys-sheet-bg: #1C1C1E;
        --sys-fill-tertiary: rgba(118, 118, 128, 0.24);
        --sys-fill-quaternary: rgba(116, 116, 128, 0.18);
        --sys-label-primary: #FFFFFF;
        --sys-label-secondary: rgba(235, 235, 245, 0.60);
        --sys-label-tertiary: rgba(235, 235, 245, 0.30);
        --sys-separator: rgba(84, 84, 88, 0.48);
        --sys-card-border: rgba(255, 255, 255, 0.07);
        --sys-card-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
        --sys-seg-track: rgba(118, 118, 128, 0.24);
        --sys-seg-thumb: #636366;
        --sys-seg-shadow: 0 3px 8px rgba(0, 0, 0, 0.32);

        --apple-blue: #0A84FF;
        --apple-green: #30D158;
        --apple-orange: #FF9F0A;
        --apple-red: #FF453A;
        --apple-pink: #FF375F;
        --apple-purple: #BF5AF2;
        --apple-indigo: #5E5CE6;
        --apple-teal: #40C8E0;

        --tint-risk-bg: rgba(255, 69, 58, 0.11);
        --tint-warn-bg: rgba(255, 159, 10, 0.09);
        --badge-risk-bg: rgba(255, 69, 58, 0.20);
        --badge-warn-bg: rgba(255, 159, 10, 0.20);
        --badge-ok-bg: rgba(48, 209, 88, 0.18);
      }
    }

    :root[data-theme="dark"] {
      --sys-bg-primary: #000000;
      --sys-bg-secondary: #1C1C1E;
      --sys-bg-tertiary: #2C2C2E;
      --sys-sidebar-bg: rgba(28, 28, 30, 0.82);
      --sys-topbar-bg: rgba(28, 28, 30, 0.80);
      --sys-sheet-bg: #1C1C1E;
      --sys-fill-tertiary: rgba(118, 118, 128, 0.24);
      --sys-fill-quaternary: rgba(116, 116, 128, 0.18);
      --sys-label-primary: #FFFFFF;
      --sys-label-secondary: rgba(235, 235, 245, 0.60);
      --sys-label-tertiary: rgba(235, 235, 245, 0.30);
      --sys-separator: rgba(84, 84, 88, 0.48);
      --sys-card-border: rgba(255, 255, 255, 0.07);
      --sys-card-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
      --sys-seg-track: rgba(118, 118, 128, 0.24);
      --sys-seg-thumb: #636366;
      --sys-seg-shadow: 0 3px 8px rgba(0, 0, 0, 0.32);

      --apple-blue: #0A84FF;
      --apple-green: #30D158;
      --apple-orange: #FF9F0A;
      --apple-red: #FF453A;
      --apple-pink: #FF375F;
      --apple-purple: #BF5AF2;
      --apple-indigo: #5E5CE6;
      --apple-teal: #40C8E0;

      --tint-risk-bg: rgba(255, 69, 58, 0.11);
      --tint-warn-bg: rgba(255, 159, 10, 0.09);
      --badge-risk-bg: rgba(255, 69, 58, 0.20);
      --badge-warn-bg: rgba(255, 159, 10, 0.20);
      --badge-ok-bg: rgba(48, 209, 88, 0.18);
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
      background-color: var(--sys-bg-primary);
      color: var(--sys-label-primary);
      min-height: 100vh;
      font-variant-numeric: tabular-nums;
      transition: background-color 0.2s ease, color 0.2s ease;
    }

    /* ======================== PASSKEY SIGN-IN VIEW ======================== */
    .auth-view {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .auth-sheet {
      width: 100%;
      max-width: 360px;
      background: var(--sys-bg-secondary);
      border-radius: 24px;
      padding: 40px 28px 32px;
      text-align: center;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.08);
      border: 0.5px solid var(--sys-separator);
    }
    .auth-icon-wrap {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      border-radius: 16px;
      background: var(--apple-blue);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 18px rgba(0, 122, 255, 0.25);
    }
    .auth-icon-wrap svg {
      width: 32px;
      height: 32px;
      stroke: #FFFFFF;
      stroke-width: 2;
      fill: none;
    }
    .auth-sheet h1 {
      margin: 0 0 6px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .auth-sheet p {
      margin: 0 0 28px;
      font-size: 14px;
      color: var(--sys-label-secondary);
      line-height: 1.45;
    }
    .hig-btn-primary {
      appearance: none;
      border: none;
      width: 100%;
      padding: 13px 20px;
      border-radius: 12px;
      background: var(--apple-blue);
      color: #FFFFFF;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: opacity 0.15s ease, transform 0.1s ease;
    }
    .hig-btn-primary:hover { opacity: 0.92; }
    .hig-btn-primary:active { transform: scale(0.985); }

    /* SF Symbol Icon Buttons */
    .sf-icon-btn {
      appearance: none;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--sys-fill-tertiary);
      color: var(--apple-blue);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      flex-shrink: 0;
    }
    .sf-icon-btn svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .sf-icon-btn:hover {
      background: var(--sys-fill-quaternary);
    }
    .sf-icon-btn:active {
      transform: scale(0.93);
    }
    .sf-icon-btn.primary {
      background: var(--apple-blue);
      color: #FFFFFF;
    }
    .sf-icon-btn.primary:hover {
      opacity: 0.9;
    }
    .sf-icon-btn.muted {
      color: var(--sys-label-secondary);
    }

    .hig-text-btn {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--apple-blue);
      font-family: inherit;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      padding: 6px 10px;
      border-radius: 8px;
    }
    .hig-text-btn.bold { font-weight: 600; }

    .hig-alert {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: 10px;
      font-size: 13px;
      display: none;
      text-align: left;
    }
    .hig-alert.error {
      display: block;
      background: rgba(255, 59, 48, 0.12);
      color: var(--apple-red);
    }

    /* ======================== UNIFIED TOP NAVIGATION BAR ======================== */
    .app-workspace {
      display: none;
      min-height: 100vh;
      flex-direction: column;
    }

    .global-topbar {
      position: sticky;
      top: 0;
      z-index: 40;
      height: 54px;
      background: var(--sys-topbar-bg);
      backdrop-filter: blur(28px) saturate(180%);
      -webkit-backdrop-filter: blur(28px) saturate(180%);
      border-bottom: 0.5px solid var(--sys-separator);
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .topbar-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .app-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .topbar-metrics {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 13px;
      color: var(--sys-label-secondary);
    }
    .topbar-metrics b {
      color: var(--sys-label-primary);
      font-weight: 600;
    }
    @media (max-width: 640px) {
      .topbar-metrics { display: none; }
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ======================== APPLE SPLIT VIEW ======================== */
    .split-view {
      display: grid;
      grid-template-columns: 320px 1fr;
      flex: 1;
      min-height: calc(100vh - 54px);
    }
    @media (max-width: 860px) {
      .split-view {
        grid-template-columns: 1fr;
        min-height: auto;
      }
    }

    /* Left Sidebar */
    .hig-sidebar {
      background: var(--sys-sidebar-bg);
      border-right: 0.5px solid var(--sys-separator);
      padding: 16px 14px 28px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    @media (max-width: 860px) {
      .hig-sidebar {
        border-right: none;
        border-bottom: 0.5px solid var(--sys-separator);
        padding-bottom: 18px;
      }
    }

    .search-field {
      position: relative;
    }
    .search-field input {
      width: 100%;
      padding: 8px 12px 8px 32px;
      border-radius: 10px;
      border: none;
      background: var(--sys-fill-tertiary);
      color: var(--sys-label-primary);
      font-family: inherit;
      font-size: 14px;
    }
    .search-field input:focus {
      outline: 2px solid var(--apple-blue);
      background: var(--sys-bg-secondary);
    }
    .search-field svg {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      width: 15px;
      height: 15px;
      stroke: var(--sys-label-secondary);
      stroke-width: 2;
      fill: none;
    }

    .sidebar-group-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--sys-label-secondary);
      padding: 0 8px;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .legend-dots {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 500;
    }
    .legend-dots span {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }
    .legend-dots i {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }

    /* Unified Inset Grouped Contact List with Priority Color Coding */
    .inset-group {
      background: var(--sys-bg-secondary);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: var(--sys-card-shadow);
      border: 0.5px solid var(--sys-card-border);
    }
    .contact-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 11px 12px;
      cursor: pointer;
      position: relative;
      transition: background 0.12s ease;
    }
    /* Priority Severity Left Accent & Soft Tint */
    .contact-row.priority-risk {
      background: var(--tint-risk-bg);
      border-left: 3.5px solid var(--apple-red);
      padding-left: 9.5px;
    }
    .contact-row.priority-warn {
      background: var(--tint-warn-bg);
      border-left: 3.5px solid var(--apple-orange);
      padding-left: 9.5px;
    }
    .contact-row:hover {
      background: var(--sys-fill-quaternary);
    }
    .contact-row.selected {
      background: var(--apple-blue) !important;
      border-left-color: transparent !important;
      color: #FFFFFF;
    }
    .contact-row.selected .row-sub,
    .contact-row.selected .priority-pill {
      color: #FFFFFF !important;
      background: rgba(255, 255, 255, 0.22) !important;
    }
    .contact-row:not(:last-child)::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 58px;
      right: 0;
      height: 0.5px;
      background: var(--sys-separator);
    }
    .contact-row.selected::after {
      display: none;
    }

    .monogram {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 15px;
      color: #FFFFFF;
      flex-shrink: 0;
      position: relative;
    }
    .row-main {
      flex: 1;
      min-width: 0;
    }
    .row-title {
      font-size: 15px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .row-sub {
      font-size: 12px;
      color: var(--sys-label-secondary);
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .priority-pill {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 9px;
      border-radius: 999px;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .priority-pill.risk {
      background: var(--badge-risk-bg);
      color: var(--apple-red);
    }
    .priority-pill.warn {
      background: var(--badge-warn-bg);
      color: var(--apple-orange);
    }
    .priority-pill.ok {
      background: var(--badge-ok-bg);
      color: var(--apple-green);
    }
    .priority-pill.muted {
      background: var(--sys-fill-tertiary);
      color: var(--sys-label-secondary);
    }

    /* ======================== DETAIL CANVAS ======================== */
    .detail-stage {
      min-width: 0;
    }
    .detail-container {
      max-width: 960px;
      width: 100%;
      margin: 0 auto;
      padding: 28px 28px 64px;
    }
    @media (max-width: 640px) {
      .detail-container { padding: 20px 16px 48px; }
    }

    /* Apple Contacts Hero Banner */
    .contact-hero {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }
    .hero-left {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }
    .hero-monogram {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 600;
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10);
      flex-shrink: 0;
    }
    .hero-name {
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.022em;
    }
    .hero-badges {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }
    .hig-tag {
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 999px;
      background: var(--sys-fill-tertiary);
      color: var(--sys-label-secondary);
    }

    /* Apple Health Summary Cards */
    .health-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-bottom: 26px;
    }
    @media (max-width: 640px) {
      .health-grid { grid-template-columns: 1fr; }
    }
    .health-card {
      background: var(--sys-bg-secondary);
      border-radius: 16px;
      padding: 16px 18px;
      box-shadow: var(--sys-card-shadow);
      border: 0.5px solid var(--sys-card-border);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .hc-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .hc-category {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .hc-time {
      font-size: 12px;
      color: var(--sys-label-secondary);
    }
    .hc-body {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .hc-metric {
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -0.03em;
      line-height: 1.1;
    }
    .hc-unit {
      font-size: 15px;
      font-weight: 600;
      color: var(--sys-label-secondary);
      margin-left: 3px;
    }
    .hc-caption {
      margin-top: 8px;
      font-size: 13px;
      color: var(--sys-label-secondary);
    }

    /* iOS Sliding Segmented Control */
    .hig-segmented {
      display: inline-flex;
      background: var(--sys-seg-track);
      padding: 2px;
      border-radius: 9px;
      margin-bottom: 20px;
    }
    .hig-seg-item {
      appearance: none;
      border: none;
      background: transparent;
      color: var(--sys-label-primary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 6px 18px;
      border-radius: 7px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .hig-seg-item.active {
      background: var(--sys-seg-thumb);
      font-weight: 600;
      box-shadow: var(--sys-seg-shadow);
    }

    /* Apple Inset Grouped Table View */
    .table-section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--sys-label-secondary);
      text-transform: uppercase;
      letter-spacing: 0.02em;
      margin: 20px 0 8px 14px;
    }
    .hig-table-group {
      background: var(--sys-bg-secondary);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: var(--sys-card-shadow);
      border: 0.5px solid var(--sys-card-border);
      margin-bottom: 18px;
    }
    .hig-table-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 13px 16px;
      position: relative;
    }
    .hig-table-row:not(:last-child)::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 56px;
      right: 0;
      height: 0.5px;
      background: var(--sys-separator);
    }
    .row-icon-badge {
      width: 29px;
      height: 29px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #FFFFFF;
      font-size: 14px;
      flex-shrink: 0;
    }
    .row-content {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .row-label {
      font-size: 15px;
      font-weight: 500;
    }
    .row-value {
      font-size: 15px;
      color: var(--sys-label-secondary);
      text-align: right;
    }

    /* ======================== iOS NAVIGATION SHEET MODALS ======================== */
    .hig-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.40);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 100;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    .hig-backdrop.open { display: flex; }
    .hig-sheet {
      width: 100%;
      max-width: 480px;
      background: var(--sys-sheet-bg);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
      border: 0.5px solid var(--sys-separator);
      animation: higSheetIn 0.22s cubic-bezier(0.32, 0.72, 0, 1);
    }
    @keyframes higSheetIn {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .sheet-navbar {
      background: var(--sys-bg-secondary);
      border-bottom: 0.5px solid var(--sys-separator);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .sheet-title {
      font-size: 17px;
      font-weight: 600;
    }
    .sheet-body {
      padding: 20px 16px 24px;
    }
    .form-group {
      background: var(--sys-bg-secondary);
      border-radius: 12px;
      overflow: hidden;
      border: 0.5px solid var(--sys-card-border);
      margin-bottom: 16px;
    }
    .form-cell {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 16px;
      position: relative;
      gap: 12px;
    }
    .form-cell:not(:last-child)::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 16px;
      right: 0;
      height: 0.5px;
      background: var(--sys-separator);
    }
    .form-cell label {
      font-size: 15px;
      font-weight: 400;
      color: var(--sys-label-primary);
      flex-shrink: 0;
      min-width: 96px;
    }
    .form-cell input,
    .form-cell select,
    .form-cell textarea {
      border: none;
      background: transparent;
      color: var(--sys-label-primary);
      font-family: inherit;
      font-size: 15px;
      width: 100%;
      text-align: right;
    }
    .form-cell textarea {
      text-align: left;
      resize: vertical;
      min-height: 68px;
    }
    .form-cell input:focus,
    .form-cell select:focus,
    .form-cell textarea:focus {
      outline: none;
    }
    .form-caption {
      font-size: 12px;
      color: var(--sys-label-secondary);
      margin: -8px 14px 16px;
      line-height: 1.4;
    }
  </style>
</head>
<body>

  <!-- ======================== PASSKEY SIGN-IN ======================== -->
  <section id="authScreen" class="auth-view">
    <div class="auth-sheet">
      <div class="auth-icon-wrap">
        <svg viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
        </svg>
      </div>
      <h1>Relationship Journal</h1>
      <p id="authSubtitle">私人关系手记</p>

      <!-- Initial Setup (Only shown before first passkey is created) -->
      <div id="enrollBox" style="display:none;">
        <div class="form-group" style="margin-bottom:16px;">
          <div class="form-cell">
            <label for="passkeyLabel">通行密钥名称</label>
            <input id="passkeyLabel" type="text" value="Owner Passkey" maxlength="80" />
          </div>
        </div>
        <button id="enrollBtn" class="hig-btn-primary">创建通行密钥 (Passkey)</button>
      </div>

      <!-- Clean Login (Shown once enrolled) -->
      <div id="loginBox" style="display:none;">
        <button id="loginBtn" class="hig-btn-primary">使用通行密钥登录</button>
      </div>

      <div id="authMsg" class="hig-alert"></div>
    </div>
  </section>

  <!-- ======================== MAIN WORKSPACE ======================== -->
  <main id="appShell" class="app-workspace">

    <!-- Unified Top Navigation Bar (Always at top on both Desktop & Mobile) -->
    <header class="global-topbar">
      <div class="topbar-left">
        <span class="app-title">关系手记</span>
      </div>

      <div class="topbar-metrics" id="islandMetrics"></div>

      <div class="topbar-actions">
        <!-- New Person (SF Symbol: person.badge.plus) -->
        <button id="openCreatePersonBtn" class="sf-icon-btn" title="新建联系人" aria-label="新建联系人">
          <svg viewBox="0 0 24 24">
            <path d="M15 19v-1.5A3.5 3.5 0 0 0 11.5 14h-5A3.5 3.5 0 0 0 3 17.5V19"/>
            <circle cx="9" cy="7" r="3.5"/>
            <path d="M19 8v6M16 11h6"/>
          </svg>
        </button>

        <!-- Compose Note (SF Symbol: square.and.pencil) -->
        <button id="openLogEventBtn" class="sf-icon-btn primary" title="记录互动" aria-label="记录互动">
          <svg viewBox="0 0 24 24">
            <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>

        <!-- Refresh (SF Symbol: arrow.clockwise) -->
        <button id="refreshBtn" class="sf-icon-btn muted" title="刷新" aria-label="刷新">
          <svg viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
            <path d="M21 3v6h-6"/>
          </svg>
        </button>

        <!-- Theme Toggle (SF Symbol: circle.lefthalf.filled / moon.stars) -->
        <button id="themeToggleBtn" class="sf-icon-btn muted" title="切换深浅外观" aria-label="切换深浅外观">
          <svg viewBox="0 0 24 24">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>

        <!-- Lock / Sign Out (SF Symbol: lock.fill) -->
        <button id="logoutBtn" class="sf-icon-btn muted" title="锁定并退出" aria-label="锁定并退出">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="11" width="16" height="10" rx="2"/>
            <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
        </button>
      </div>
    </header>

    <div class="split-view">

      <!-- Left Translucent Sidebar: Single Unified Contact List Sorted by Priority -->
      <aside class="hig-sidebar">
        <div class="search-field">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path stroke-linecap="round" d="M20 20l-3.5-3.5"/></svg>
          <input id="searchInput" type="search" placeholder="搜索联系人" />
        </div>

        <!-- Disambiguation Queue Section (Only visible when pending > 0) -->
        <div id="disambiguationPanel" style="display:none;">
          <div class="sidebar-group-label">
            <span>待消歧笔记</span>
            <span id="disambigCountBadge">0</span>
          </div>
          <div id="disambiguationList"></div>
        </div>

        <!-- Unified Contacts List (Priority-pinned & Color-coded) -->
        <div>
          <div class="sidebar-group-label">
            <span>联系人 (<span id="totalContactsCount">0</span>)</span>
            <span class="legend-dots">
              <span><i style="background:var(--apple-red);"></i>失联</span>
              <span><i style="background:var(--apple-orange);"></i>关注</span>
              <span><i style="background:var(--apple-green);"></i>健康</span>
            </span>
          </div>
          <div class="inset-group" id="peopleList"></div>
        </div>
      </aside>

      <!-- Right Detail Stage -->
      <section class="detail-stage">
        <div class="detail-container" id="inspectorContent">
          <div style="padding: 80px 20px; text-align: center; color: var(--sys-label-secondary);">
            从列表选择一位联系人查看健康摘要，或点击顶部右上角新建联系人。
          </div>
        </div>
      </section>

    </div>
  </main>

  <!-- ======================== SHEET: CREATE PERSON ======================== -->
  <div id="createPersonSheet" class="hig-backdrop">
    <div class="hig-sheet">
      <form id="createPersonForm">
        <div class="sheet-navbar">
          <button type="button" class="hig-text-btn" data-close="createPersonSheet">取消</button>
          <span class="sheet-title">新建联系人</span>
          <button type="submit" class="hig-text-btn bold">完成</button>
        </div>
        <div class="sheet-body">
          <div class="form-group">
            <div class="form-cell">
              <label for="cpAlias">姓名或称呼</label>
              <input id="cpAlias" type="text" required placeholder="必填" />
            </div>
            <div class="form-cell">
              <label for="cpState">关系层级</label>
              <select id="cpState">
                <option value="close">挚友 / 核心 (14天周期)</option>
                <option value="active" selected>活跃朋友 (30天周期)</option>
                <option value="reconnect_needed">待重联 (14天周期)</option>
                <option value="casual">泛交熟人 (60天周期)</option>
                <option value="archived">归档静默 (180天周期)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <div class="form-cell">
              <label for="cpBirthday">生日</label>
              <input id="cpBirthday" type="text" placeholder="YYYY-MM-DD (可选)" />
            </div>
            <div class="form-cell">
              <label for="cpAnniversary">纪念日</label>
              <input id="cpAnniversary" type="text" placeholder="YYYY-MM-DD (可选)" />
            </div>
          </div>
          <div class="form-caption">关系层级决定了健康度半衰期；设置生日与纪念日可在临近 30 天内自动生成提醒。</div>
          <div id="cpMsg" class="hig-alert"></div>
        </div>
      </form>
    </div>
  </div>

  <!-- ======================== SHEET: LOG INTERACTION ======================== -->
  <div id="logEventSheet" class="hig-backdrop">
    <div class="hig-sheet">
      <form id="insertEventForm">
        <div class="sheet-navbar">
          <button type="button" class="hig-text-btn" data-close="logEventSheet">取消</button>
          <span class="sheet-title">记录互动</span>
          <button type="submit" class="hig-text-btn bold">存储</button>
        </div>
        <div class="sheet-body">
          <div class="form-group">
            <div class="form-cell">
              <label for="iePersonId">联系人</label>
              <select id="iePersonId"></select>
            </div>
            <div class="form-cell">
              <label for="ieSource">记录方式</label>
              <select id="ieSource">
                <option value="manual">手动手记</option>
                <option value="chat_log">聊天摘录</option>
                <option value="voice_note">语音速记</option>
              </select>
            </div>
            <div class="form-cell">
              <label for="ieSentiment">情绪感受</label>
              <select id="ieSentiment">
                <option value="0.85">非常愉快 (+0.85 滋养)</option>
                <option value="0.45">轻松正面 (+0.45)</option>
                <option value="0.0">日常平淡 (0.0)</option>
                <option value="-0.4">略感疲惫 (-0.4)</option>
                <option value="-0.8">明显内耗 (-0.8 消耗)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <div class="form-cell" style="display:block;">
              <textarea id="ieContent" rows="3" required placeholder="写下这次互动的细节或聊到的话题（电话、邮箱、卡号会在入库前自动脱敏）..."></textarea>
            </div>
          </div>

          <div class="form-group">
            <div class="form-cell">
              <label for="ieSignalCat">沉淀信号类型</label>
              <select id="ieSignalCat">
                <option value="preference">喜好与习惯</option>
                <option value="gift_idea">礼物线索</option>
                <option value="boundary">边界与忌口</option>
              </select>
            </div>
            <div class="form-cell">
              <label for="ieSignalTopic">信号主题</label>
              <input id="ieSignalTopic" type="text" placeholder="可选，如 coffee_pref" />
            </div>
            <div class="form-cell">
              <label for="ieSignalValue">信号内容</label>
              <input id="ieSignalValue" type="text" placeholder="可选，如 冰燕麦拿铁" />
            </div>
            <div class="form-cell">
              <label for="ieConfidence">归属把握度</label>
              <input id="ieConfidence" type="number" step="0.01" min="0" max="1" value="0.95" required />
            </div>
          </div>
          <div class="form-caption">若填写了相同「信号主题」的新内容，系统会自动将旧偏好归档至双时态历史并更新当前状态。</div>
          <div id="ieMsg" class="hig-alert"></div>
        </div>
      </form>
    </div>
  </div>

  <script>
    let sessionToken = sessionStorage.getItem('rj_session_token') || '';
    let selectedPersonId = null;
    let activeTab = 'signals';
    let lastInspectorData = null;
    let cachedPeople = [];
    let searchQuery = '';

    const AVATAR_GRADIENTS = [
      'linear-gradient(180deg, #5E5CE6 0%, #3634A3 100%)',
      'linear-gradient(180deg, #007AFF 0%, #0051A8 100%)',
      'linear-gradient(180deg, #30B0C7 0%, #1D7A8C 100%)',
      'linear-gradient(180deg, #34C759 0%, #248A3D 100%)',
      'linear-gradient(180deg, #FF9500 0%, #C93400 100%)',
      'linear-gradient(180deg, #FF2D55 0%, #C30F37 100%)',
      'linear-gradient(180deg, #AF52DE 0%, #7D32A8 100%)'
    ];

    function avatarGradient(str) {
      const s = String(str || 'A');
      let hash = 0;
      for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
      return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
    }

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

    function showAlert(el, text) {
      el.textContent = text;
      el.className = 'hig-alert error';
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
        throw new Error('请使用通行密钥登录');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || '请求失败');
      if (data.result && data.result.isError) {
        throw new Error((data.result.structuredContent && data.result.structuredContent.error) || '操作未成功');
      }
      return data.result.structuredContent;
    }

    async function checkPasskeyStatus() {
      const res = await fetch('/auth/passkey/status');
      const status = await res.json();
      const enrollBox = document.getElementById('enrollBox');
      const loginBox = document.getElementById('loginBox');

      if (!status.enrolled) {
        enrollBox.style.display = 'block';
        loginBox.style.display = 'none';
      } else {
        enrollBox.style.display = 'none';
        loginBox.style.display = 'block';
      }
    }

    document.getElementById('enrollBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'hig-alert';
      try {
        if (!window.PublicKeyCredential) throw new Error('当前浏览器不支持 Passkey');
        const label = document.getElementById('passkeyLabel').value.trim() || 'Owner Passkey';
        const optRes = await fetch('/auth/passkey/register/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法创建通行密钥');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.user.id = b64urlToBytes(pubKey.user.id);

        const cred = await navigator.credentials.create({ publicKey: pubKey });
        if (!cred || !cred.response.getPublicKey) throw new Error('浏览器未返回公钥信息');

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
        if (!verifyRes.ok) throw new Error(verifyData.error || '验证失败');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await enterApp();
      } catch (err) {
        showAlert(authMsg, err.message || String(err));
      }
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'hig-alert';
      try {
        const optRes = await fetch('/auth/passkey/login/options', { method: 'POST' });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法发起验证');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.allowCredentials = (pubKey.allowCredentials || []).map((c) => ({
          ...c,
          id: b64urlToBytes(c.id)
        }));

        const assertion = await navigator.credentials.get({ publicKey: pubKey });
        if (!assertion) throw new Error('已取消登录');

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
        if (!verifyRes.ok) throw new Error(verifyData.error || '登录未通过');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await enterApp();
      } catch (err) {
        showAlert(authMsg, err.message || String(err));
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

    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      const root = document.documentElement;
      const curr = root.getAttribute('data-theme');
      const isDark = curr === 'dark' || (!curr && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.setAttribute('data-theme', isDark ? 'light' : 'dark');
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderPeopleSidebar();
    });

    async function enterApp() {
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('appShell').style.display = 'flex';
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

    /* Priority Rank: at_risk (0) -> attention_needed (1) -> healthy (2) -> dormant (3) */
    function priorityWeight(riskLevel) {
      if (riskLevel === 'at_risk') return 0;
      if (riskLevel === 'attention_needed') return 1;
      if (riskLevel === 'healthy') return 2;
      return 3;
    }

    function sortPeopleByPriority(list) {
      return [...list].sort((a, b) => {
        const wa = priorityWeight(a.risk_level);
        const wb = priorityWeight(b.risk_level);
        if (wa !== wb) return wa - wb;
        return (a.composite_health_score ?? 0) - (b.composite_health_score ?? 0);
      });
    }

    function rowPriorityClass(riskLevel) {
      if (riskLevel === 'at_risk') return 'priority-risk';
      if (riskLevel === 'attention_needed') return 'priority-warn';
      return '';
    }

    function rowStatusBadgeHtml(p) {
      const score = Math.round(p.composite_health_score ?? 0);
      if (p.risk_level === 'at_risk') {
        return '<span class="priority-pill risk">待关怀 · ' + score + '</span>';
      }
      if (p.risk_level === 'attention_needed') {
        return '<span class="priority-pill warn">需关注 · ' + score + '</span>';
      }
      if (p.risk_level === 'dormant') {
        return '<span class="priority-pill muted">归档</span>';
      }
      return '<span class="priority-pill ok">' + score + '</span>';
    }

    function renderPeopleSidebar() {
      const plEl = document.getElementById('peopleList');
      const sorted = sortPeopleByPriority(cachedPeople);
      const filtered = sorted.filter((p) =>
        !searchQuery || String(p.alias || '').toLowerCase().includes(searchQuery)
      );
      document.getElementById('totalContactsCount').textContent = String(filtered.length);

      if (filtered.length === 0) {
        plEl.innerHTML = '<div style="padding:18px 14px; font-size:13.5px; color:var(--sys-label-secondary); text-align:center;">暂无联系人，点击顶部右上角人物图标新建</div>';
        return;
      }

      plEl.innerHTML = filtered.map((p) => {
        const gapText = p.days_since_last_interaction !== null && p.days_since_last_interaction !== undefined
          ? (p.days_since_last_interaction === 0 ? '今天已联系' : p.days_since_last_interaction + ' 天前联系')
          : '尚无互动';
        return (
          '<div class="contact-row ' + rowPriorityClass(p.risk_level) + ' ' + (selectedPersonId === p.person_id ? 'selected' : '') + '" data-id="' + escapeHtml(p.person_id) + '">' +
            '<div class="monogram" style="background:' + avatarGradient(p.alias) + ';">' + escapeHtml(p.alias.slice(0, 1)) + '</div>' +
            '<div class="row-main">' +
              '<div class="row-title">' + escapeHtml(p.alias) + '</div>' +
              '<div class="row-sub">' + escapeHtml(stateLabel(p.relationship_state)) + ' · ' + gapText + '</div>' +
            '</div>' +
            rowStatusBadgeHtml(p) +
          '</div>'
        );
      }).join('');

      plEl.querySelectorAll('.contact-row[data-id]').forEach((el) => {
        el.addEventListener('click', () => selectPerson(el.getAttribute('data-id')));
      });
    }

    async function loadPortfolio() {
      const [overview, disambig] = await Promise.all([
        mcpToolCall('analyze_relationship', {}),
        mcpToolCall('manage_disambiguation_item', { action: 'list', status: 'pending' })
      ]);

      cachedPeople = sortPeopleByPriority(
        (overview.people_summary || []).filter((p) => !isTestRecord(p))
      );
      const dqItems = ((disambig && disambig.items) || []).filter(
        (d) => !String(d.sanitizedContent || '').startsWith('[TEST_DATA]')
      );

      const urgentCount = cachedPeople.filter(
        (p) => p.risk_level === 'at_risk' || p.risk_level === 'attention_needed'
      ).length;

      document.getElementById('islandMetrics').innerHTML =
        '<span>联系人 <b>' + cachedPeople.length + '</b></span>' +
        (urgentCount > 0 ? '<span style="color:var(--apple-orange);">优先关怀 <b>' + urgentCount + '</b></span>' : '') +
        '<span>有效信号 <b>' + overview.totals.active_signals + '</b></span>';

      // Populate form dropdown
      const selectEl = document.getElementById('iePersonId');
      const peopleOptionsHtml = cachedPeople.map((p) => (
        '<option value="' + escapeHtml(p.person_id) + '">' + escapeHtml(p.alias) + '</option>'
      )).join('');
      selectEl.innerHTML = peopleOptionsHtml + '<option value="">指代不明 (暂存至待消歧)</option>';

      renderPeopleSidebar();

      // Disambiguation Queue
      const dqPanel = document.getElementById('disambiguationPanel');
      const dqEl = document.getElementById('disambiguationList');
      if (dqItems.length === 0) {
        dqPanel.style.display = 'none';
      } else {
        dqPanel.style.display = 'block';
        document.getElementById('disambigCountBadge').textContent = String(dqItems.length);
        dqEl.innerHTML = dqItems.map((item) => (
          '<div class="inset-group" style="padding:12px; margin-bottom:10px;">' +
            '<div style="font-size:13.5px; line-height:1.45; margin-bottom:10px;">' + escapeHtml(item.sanitizedContent) + '</div>' +
            '<select class="dq-person-select" data-qid="' + escapeHtml(item.id) + '" style="width:100%; padding:7px 10px; border-radius:8px; border:0.5px solid var(--sys-separator); background:var(--sys-fill-quaternary); color:var(--sys-label-primary); font-size:13px; margin-bottom:8px;">' +
              '<option value="">指定归属联系人...</option>' + peopleOptionsHtml +
            '</select>' +
            '<div style="display:flex; gap:8px;">' +
              '<button type="button" class="hig-btn-primary dq-resolve-btn" data-qid="' + escapeHtml(item.id) + '" style="padding:7px 10px; font-size:13px; border-radius:8px;">归属入库</button>' +
              '<button type="button" class="hig-text-btn dq-dismiss-btn" data-qid="' + escapeHtml(item.id) + '" style="flex-shrink:0; font-size:13px; color:var(--sys-label-secondary);">忽略</button>' +
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

      if (!selectedPersonId && cachedPeople.length > 0) {
        await selectPerson(cachedPeople[0].person_id);
      } else if (selectedPersonId && cachedPeople.some((p) => p.person_id === selectedPersonId)) {
        await selectPerson(selectedPersonId);
      }
    }

    async function selectPerson(personId) {
      selectedPersonId = personId;
      document.querySelectorAll('.contact-row[data-id]').forEach((el) => {
        el.classList.toggle('selected', el.getAttribute('data-id') === personId);
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

    function renderActivityRingSvg(score, color) {
      const r = 20;
      const c = 2 * Math.PI * r;
      const pct = Math.max(0, Math.min(100, score));
      const offset = c - (pct / 100) * c;
      return (
        '<svg width="50" height="50" viewBox="0 0 50 50" style="transform:rotate(-90deg); flex-shrink:0;">' +
          '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="var(--sys-fill-tertiary)" stroke-width="5.5" />' +
          '<circle cx="25" cy="25" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5.5" stroke-linecap="round" stroke-dasharray="' + c + '" stroke-dashoffset="' + offset + '" />' +
        '</svg>'
      );
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
        const hooksRows = hooks.length === 0
          ? '<div class="hig-table-row"><div class="row-icon-badge" style="background:var(--apple-green);">✓</div><div class="row-content"><span class="row-label">当前关系状态健康，无紧急跟进提醒</span></div></div>'
          : hooks.map((item) => (
              '<div class="hig-table-row">' +
                '<div class="row-icon-badge" style="background:var(--apple-orange);">★</div>' +
                '<div class="row-content"><span class="row-label">' + escapeHtml(item) + '</span></div>' +
              '</div>'
            )).join('');

        const allActiveSignals = [];
        const pushCat = (cat, badgeColor, icon, label) => {
          for (const sig of (analysis.signals.active_by_category[cat] || [])) {
            allActiveSignals.push(
              '<div class="hig-table-row">' +
                '<div class="row-icon-badge" style="background:' + badgeColor + ';">' + icon + '</div>' +
                '<div class="row-content">' +
                  '<div><div class="row-label">' + escapeHtml(sig.topic) + '</div><div style="font-size:12px; color:var(--sys-label-secondary);">' + label + '</div></div>' +
                  '<div class="row-value" style="color:var(--sys-label-primary); font-weight:500;">' + escapeHtml(sig.value) + '</div>' +
                '</div>' +
              '</div>'
            );
          }
        };
        pushCat('preference', 'var(--apple-blue)', '♥', '喜好与习惯');
        pushCat('gift_idea', 'var(--apple-purple)', '🎁', '礼物灵感');
        pushCat('boundary', 'var(--apple-red)', '!', '边界与忌口');

        tabBodyHtml =
          '<div class="table-section-title">跟进建议</div>' +
          '<div class="hig-table-group">' + hooksRows + '</div>' +
          '<div class="table-section-title">当前有效画像信号</div>' +
          '<div class="hig-table-group">' +
            (allActiveSignals.length > 0
              ? allActiveSignals.join('')
              : '<div class="hig-table-row"><div class="row-icon-badge" style="background:var(--sys-label-tertiary);">—</div><div class="row-content"><span class="row-label" style="color:var(--sys-label-secondary);">尚未沉淀喜好、礼物或边界信号</span></div></div>') +
          '</div>';
      } else if (activeTab === 'evolution') {
        const changes = analysis.signals.preference_changes || [];
        tabBodyHtml =
          '<div class="table-section-title">双时态偏好与状态变迁历史</div>' +
          '<div class="hig-table-group">' +
            (changes.length === 0
              ? '<div class="hig-table-row"><div class="row-icon-badge" style="background:var(--apple-indigo);">⇄</div><div class="row-content"><span class="row-label" style="color:var(--sys-label-secondary);">暂无历史偏好更替记录</span></div></div>'
              : changes.map((ch) => (
                  '<div class="hig-table-row">' +
                    '<div class="row-icon-badge" style="background:var(--apple-indigo);">⇄</div>' +
                    '<div class="row-content">' +
                      '<div>' +
                        '<div class="row-label">' + escapeHtml(ch.topic) + '</div>' +
                        '<div style="font-size:12px; color:var(--sys-label-secondary);">' + (ch.changed_at ? new Date(ch.changed_at).toLocaleDateString() : '') + ' 更新</div>' +
                      '</div>' +
                      '<div class="row-value">' +
                        '<span style="text-decoration:line-through; color:var(--sys-label-tertiary);">' + escapeHtml(ch.old_value) + '</span>' +
                        ' → <b style="color:var(--sys-label-primary);">' + escapeHtml(ch.new_value) + '</b>' +
                      '</div>' +
                    '</div>' +
                  '</div>'
                )).join('')) +
          '</div>';
      } else {
        const events = records.timeline_events || [];
        tabBodyHtml =
          '<div class="table-section-title">互动时间线手记</div>' +
          '<div class="hig-table-group">' +
            (events.length === 0
              ? '<div class="hig-table-row"><div class="row-icon-badge" style="background:var(--apple-teal);">✎</div><div class="row-content"><span class="row-label" style="color:var(--sys-label-secondary);">暂无互动记录</span></div></div>'
              : events.map((ev) => (
                  '<div class="hig-table-row" style="align-items:flex-start;">' +
                    '<div class="row-icon-badge" style="background:var(--apple-teal); margin-top:2px;">✎</div>' +
                    '<div style="flex:1; min-width:0;">' +
                      '<div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">' +
                        '<span style="font-size:13px; font-weight:600; color:var(--sys-label-secondary);">' + escapeHtml(ev.source) + '</span>' +
                        '<span style="font-size:12px; color:var(--sys-label-secondary);">' + new Date(ev.occurredAt).toLocaleString() + '</span>' +
                      '</div>' +
                      '<div style="font-size:15px; margin-top:4px; line-height:1.45;">' + escapeHtml(ev.summary) + '</div>' +
                      ((ev.redactedEntities && ev.redactedEntities.length)
                        ? '<div style="font-size:12px; color:var(--apple-blue); margin-top:4px;">已自动保护隐私实体: ' + escapeHtml(ev.redactedEntities.join(', ')) + '</div>'
                        : '') +
                    '</div>' +
                  '</div>'
                )).join('')) +
          '</div>';
      }

      document.getElementById('inspectorContent').innerHTML =
        '<div class="contact-hero">' +
          '<div class="hero-left">' +
            '<div class="hero-monogram" style="background:' + avatarGradient(analysis.person.alias) + ';">' + escapeHtml(analysis.person.alias.slice(0, 1)) + '</div>' +
            '<div>' +
              '<h2 class="hero-name">' + escapeHtml(analysis.person.alias) + '</h2>' +
              '<div class="hero-badges">' +
                '<span class="hig-tag">' + escapeHtml(stateLabel(analysis.person.relationship_state)) + '</span>' +
                '<span class="hig-tag">周期 ' + h.target_cadence_days + ' 天</span>' +
                rowStatusBadgeHtml({ risk_level: h.risk_level, composite_health_score: h.composite_health_score }) +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button type="button" id="quickLogForPersonBtn" class="sf-icon-btn primary" title="为该联系人记录互动" aria-label="记录互动">' +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>' +
              '<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +

        /* Apple Health Summary Cards */
        '<div class="health-grid">' +
          '<div class="health-card">' +
            '<div class="hc-top">' +
              '<span class="hc-category" style="color:var(--apple-pink);">♥ 关系健康度</span>' +
              '<span class="hc-time">保鲜度 ' + Math.round(h.freshness_score) + '%</span>' +
            '</div>' +
            '<div class="hc-body">' +
              '<div><span class="hc-metric">' + Math.round(h.composite_health_score) + '</span><span class="hc-unit">/ 100</span></div>' +
              renderActivityRingSvg(h.composite_health_score, 'var(--apple-pink)') +
            '</div>' +
            '<div class="hc-caption">' +
              (h.overdue_ratio !== null && h.overdue_ratio >= 1
                ? '已超出建议联系周期 (' + h.overdue_ratio + 'x)，建议近期问候'
                : '当前处于健康联系周期内') +
            '</div>' +
          '</div>' +

          '<div class="health-card">' +
            '<div class="hc-top">' +
              '<span class="hc-category" style="color:var(--apple-blue);">⏱ 互动节律</span>' +
              '<span class="hc-time">Z = ' + (c.drift_z_score !== null ? c.drift_z_score : '—') + '</span>' +
            '</div>' +
            '<div class="hc-body">' +
              '<div><span class="hc-metric">' + (c.days_since_last_interaction !== null ? c.days_since_last_interaction : '—') + '</span><span class="hc-unit">天前</span></div>' +
            '</div>' +
            '<div class="hc-caption">历史平均间隔 ' + (c.mean_interval_days !== null ? c.mean_interval_days + ' 天' : '待积累') + ' · 共 ' + c.total_events + ' 次互动</div>' +
          '</div>' +

          '<div class="health-card">' +
            '<div class="hc-top">' +
              '<span class="hc-category" style="color:var(--apple-orange);">☀ 情绪能量</span>' +
              '<span class="hc-time">' + escapeHtml(energyLabel(s.energy_state)) + '</span>' +
            '</div>' +
            '<div class="hc-body">' +
              '<div><span class="hc-metric">' + (s.ema !== null ? (s.ema > 0 ? '+' + s.ema : s.ema) : '—') + '</span><span class="hc-unit">EMA</span></div>' +
            '</div>' +
            '<div class="hc-caption">历史均值 ' + (s.average !== null ? s.average : '—') + ' · 动量斜率 ' + (s.momentum_slope !== null ? s.momentum_slope : '—') + '</div>' +
          '</div>' +

          '<div class="health-card">' +
            '<div class="hc-top">' +
              '<span class="hc-category" style="color:var(--apple-indigo);">✦ 认知画像完备度</span>' +
              '<span class="hc-time">90天变迁 ' + d.volatility_90d + ' 次</span>' +
            '</div>' +
            '<div class="hc-body">' +
              '<div><span class="hc-metric">' + Math.round(d.profile_coverage_score) + '</span><span class="hc-unit">%</span></div>' +
              renderActivityRingSvg(d.profile_coverage_score, 'var(--apple-indigo)') +
            '</div>' +
            '<div class="hc-caption">' +
              (d.missing_dimensions.length > 0
                ? '待补充维度: ' + escapeHtml(d.missing_dimensions.join(', '))
                : '喜好、礼物、边界与纪念日四大维度均已完备') +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Segmented Control */
        '<div class="hig-segmented">' +
          '<button type="button" class="hig-seg-item ' + (activeTab === 'signals' ? 'active' : '') + '" data-tab="signals">画像与建议</button>' +
          '<button type="button" class="hig-seg-item ' + (activeTab === 'evolution' ? 'active' : '') + '" data-tab="evolution">双时态变迁 (' + (analysis.signals.preference_changes || []).length + ')</button>' +
          '<button type="button" class="hig-seg-item ' + (activeTab === 'timeline' ? 'active' : '') + '" data-tab="timeline">互动手记 (' + c.total_events + ')</button>' +
        '</div>' +

        '<div>' + tabBodyHtml + '</div>';

      document.querySelectorAll('.hig-seg-item[data-tab]').forEach((btn) => {
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
    document.querySelectorAll('.hig-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });

    document.getElementById('refreshBtn').addEventListener('click', () => loadPortfolio());

    document.getElementById('createPersonForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('cpMsg');
      msg.className = 'hig-alert';
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
        showAlert(msg, err.message);
      }
    });

    document.getElementById('insertEventForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('ieMsg');
      msg.className = 'hig-alert';
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
        showAlert(msg, err.message);
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
