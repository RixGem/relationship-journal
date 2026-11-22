export function renderFrontendHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Relationship Journal · Passkey 量化关系控制台</title>
  <style>
    :root {
      --bg: #0b0f17;
      --panel: #131a27;
      --panel-alt: #192233;
      --border: #263249;
      --text: #e8eef7;
      --muted: #93a3bc;
      --accent: #4f8cff;
      --accent-hover: #3b76e6;
      --ok: #22c55e;
      --warn: #f59e0b;
      --danger: #ef4444;
      --purple: #a855f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(circle at top right, #162238 0%, var(--bg) 65%);
      color: var(--text);
      min-height: 100vh;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 24px;
      border-bottom: 1px solid var(--border);
      background: rgba(19, 26, 39, 0.85);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-ok { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.35); }
    .badge-warn { background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.35); }
    .badge-danger { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.35); }
    .badge-info { background: rgba(79,140,255,0.15); color: #7cacff; border: 1px solid rgba(79,140,255,0.35); }

    .auth-container {
      max-width: 460px;
      margin: 72px auto;
      padding: 28px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.45);
    }
    .auth-container h1 {
      margin: 0 0 8px;
      font-size: 21px;
    }
    .auth-container p {
      margin: 0 0 18px;
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.55;
    }
    .lock-banner {
      padding: 12px 14px;
      border-radius: 10px;
      margin-bottom: 18px;
      font-size: 13px;
      line-height: 1.5;
    }
    .lock-banner.locked {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      color: #86efac;
    }
    .lock-banner.unlocked {
      background: rgba(245, 158, 11, 0.1);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fde68a;
    }

    label {
      display: block;
      font-size: 12.5px;
      color: var(--muted);
      margin-bottom: 5px;
      font-weight: 500;
    }
    input, select, textarea {
      width: 100%;
      padding: 9px 11px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: #0d131f;
      color: var(--text);
      font-size: 13.5px;
      margin-bottom: 12px;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    button {
      cursor: pointer;
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      font-weight: 600;
      font-size: 13.5px;
      transition: all 0.15s ease;
    }
    .btn-primary {
      background: var(--accent);
      color: #fff;
      width: 100%;
    }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
    .btn-secondary {
      background: var(--panel-alt);
      color: var(--text);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover:not(:disabled) { border-color: var(--accent); }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .status-msg {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      display: none;
    }
    .status-msg.error { display: block; background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid rgba(239,68,68,0.35); }
    .status-msg.success { display: block; background: rgba(34,197,94,0.15); color: #86efac; border: 1px solid rgba(34,197,94,0.35); }

    .dashboard {
      display: none;
      max-width: 1320px;
      margin: 0 auto;
      padding: 20px 24px 48px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }
    .stat-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
    }
    .stat-card .k { font-size: 12px; color: var(--muted); }
    .stat-card .v { font-size: 24px; font-weight: 700; margin-top: 4px; }

    .main-grid {
      display: grid;
      grid-template-columns: 340px 1fr 360px;
      gap: 18px;
      align-items: start;
    }
    @media (max-width: 1120px) {
      .main-grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .card h2 {
      margin: 0 0 12px;
      font-size: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .person-item {
      padding: 11px 12px;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--panel-alt);
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .person-item:hover, .person-item.active {
      border-color: var(--accent);
    }
    .person-item .top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      font-size: 14px;
    }
    .person-item .sub {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
      font-size: 12px;
      color: var(--muted);
    }

    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }
    .metric-box {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 10px 12px;
    }
    .metric-box .label { font-size: 11.5px; color: var(--muted); }
    .metric-box .val { font-size: 18px; font-weight: 700; margin-top: 3px; }
    .metric-box .hint { font-size: 11px; color: var(--muted); margin-top: 2px; }

    .hook-list, .signal-list, .event-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .hook-list li, .signal-list li, .event-list li {
      padding: 9px 11px;
      border-radius: 8px;
      background: var(--panel-alt);
      border: 1px solid var(--border);
      margin-bottom: 7px;
      font-size: 13px;
      line-height: 1.45;
    }
    .muted { color: var(--muted); font-size: 12.5px; }
    .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🧭 Relationship Journal</span>
      <span id="headerLockBadge" class="badge badge-info">检查 Passkey 状态...</span>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      <span id="sessionLabel" class="muted"></span>
      <button id="logoutBtn" class="btn-secondary" style="display:none; padding:6px 12px; font-size:12px;">退出登录</button>
    </div>
  </header>

  <!-- Passkey Gate -->
  <section id="authSection" class="auth-container">
    <h1 id="authTitle">Passkey 身份验证</h1>
    <p id="authSubtitle">正在读取服务端单主人 Passkey 锁定状态...</p>

    <div id="lockBanner" class="lock-banner unlocked">正在加载...</div>

    <!-- Enrollment Form (Only visible when enrolled === false) -->
    <div id="enrollBox" style="display:none;">
      <label for="passkeyLabel">Passkey 设备标识名称</label>
      <input id="passkeyLabel" type="text" value="Owner Passkey" maxlength="80" placeholder="例如：MacBook Touch ID / iPhone Face ID" />
      <button id="enrollBtn" class="btn-primary">🔑 录入唯一 Passkey 并永久锁定新注册</button>
    </div>

    <!-- Login Box (Only visible when enrolled === true) -->
    <div id="loginBox" style="display:none;">
      <button id="loginBtn" class="btn-primary">🔐 使用已录入的唯一 Passkey 登录</button>
      <button id="disabledEnrollBtn" class="btn-secondary" disabled style="width:100%; margin-top:10px;">
        🔒 新 Passkey 录入已暂停（仅接受已绑定的 Passkey）
      </button>
    </div>

    <div id="authMsg" class="status-msg"></div>
  </section>

  <!-- Authenticated Dashboard -->
  <main id="dashboardSection" class="dashboard">
    <div class="stats-grid" id="portfolioTotals"></div>

    <div class="main-grid">
      <!-- Left Column: Priority Queue & Contact Directory -->
      <div>
        <div class="card">
          <h2>
            <span>🚨 优先关怀预警队列</span>
            <button id="refreshBtn" class="btn-secondary" style="padding:4px 10px; font-size:12px;">刷新</button>
          </h2>
          <div id="priorityQueueList" class="muted">加载中...</div>
        </div>

        <div class="card">
          <h2><span>👥 联系人目录</span></h2>
          <div id="peopleList" class="muted">加载中...</div>
        </div>

        <div class="card">
          <h2><span>🧩 待消歧隔离队列 (manage_disambiguation_item)</span></h2>
          <div id="disambiguationList" class="muted">加载中...</div>
        </div>
      </div>

      <!-- Center Column: Quantitative Person Inspector -->
      <div>
        <div class="card" id="personDetailCard">
          <h2>
            <span id="detailTitle">选择一个联系人查看量化诊断</span>
            <span id="detailRiskBadge"></span>
          </h2>
          <div id="detailContent" class="muted">点击左侧联系人查看关系衰减分、互动节律 Z-Score、情绪 EMA 动量及双时态偏好变迁。</div>
        </div>
      </div>

      <!-- Right Column: Create Person & Log Interaction / Bitemporal Signal -->
      <div>
        <div class="card">
          <h2><span>➕ 新建联系人 (create_person)</span></h2>
          <form id="createPersonForm">
            <label>称呼 / 别名 (alias)</label>
            <input id="cpAlias" type="text" required placeholder="例如：Alex Chen" />
            <div class="row-2">
              <div>
                <label>关系层级 (决定衰减半衰期 τ)</label>
                <select id="cpState">
                  <option value="close">close (挚友 τ=14d)</option>
                  <option value="active" selected>active (活跃 τ=30d)</option>
                  <option value="reconnect_needed">reconnect_needed (待破冰 τ=14d)</option>
                  <option value="casual">casual (泛交 τ=60d)</option>
                  <option value="archived">archived (归档 τ=180d)</option>
                </select>
              </div>
              <div>
                <label>生日 (YYYY-MM-DD, 可选)</label>
                <input id="cpBirthday" type="text" placeholder="1996-08-15" />
              </div>
            </div>
            <button type="submit" class="btn-primary">创建联系人</button>
            <div id="cpMsg" class="status-msg"></div>
          </form>
        </div>

        <div class="card">
          <h2><span>📝 记录互动与双时态信号</span></h2>
          <form id="insertEventForm">
            <label>归属联系人 (person_id)</label>
            <select id="iePersonId"></select>

            <div class="row-2">
              <div>
                <label>来源 (source)</label>
                <select id="ieSource">
                  <option value="manual">manual (手动记录)</option>
                  <option value="chat_log">chat_log (聊天记录)</option>
                  <option value="voice_note">voice_note (语音笔记)</option>
                </select>
              </div>
              <div>
                <label>指代置信度 (<0.85 进消歧队列)</label>
                <input id="ieConfidence" type="number" step="0.01" min="0" max="1" value="0.95" required />
              </div>
            </div>

            <label>互动内容 (自动脱敏邮箱/电话/卡号)</label>
            <textarea id="ieContent" rows="3" required placeholder="例如：今天一起喝咖啡，她说最近戒咖啡因了，改喝路易波士茶..."></textarea>

            <div class="row-2">
              <div>
                <label>情绪得分 (-1.0 消耗 ~ +1.0 滋养)</label>
                <input id="ieSentiment" type="number" step="0.05" min="-1" max="1" value="0.75" />
              </div>
              <div>
                <label>信号类别 (可选)</label>
                <select id="ieSignalCat">
                  <option value="preference">preference (喜好/习惯)</option>
                  <option value="gift_idea">gift_idea (礼物线索)</option>
                  <option value="boundary">boundary (边界/雷区/忌口)</option>
                </select>
              </div>
            </div>

            <div class="row-2">
              <div>
                <label>信号主题 (snake_case, 可选)</label>
                <input id="ieSignalTopic" type="text" placeholder="beverage_preference" />
              </div>
              <div>
                <label>信号值 (与主题配对, 可选)</label>
                <input id="ieSignalValue" type="text" placeholder="decaf_rooibos_only" />
              </div>
            </div>

            <button type="submit" class="btn-primary">提交事件 & 更新双时态信号</button>
            <div id="ieMsg" class="status-msg"></div>
          </form>
        </div>
      </div>
    </div>
  </main>

  <script>
    let sessionToken = sessionStorage.getItem('rj_session_token') || '';
    let selectedPersonId = null;

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

    function showMsg(el, text, isErr) {
      el.textContent = text;
      el.className = 'status-msg ' + (isErr ? 'error' : 'success');
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
        await checkPasskeyStatus();
        throw new Error('会话已过期，请重新使用 Passkey 登录');
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || 'MCP error');
      if (data.result && data.result.isError) {
        throw new Error((data.result.structuredContent && data.result.structuredContent.error) || 'Tool error');
      }
      return data.result.structuredContent;
    }

    async function checkPasskeyStatus() {
      const res = await fetch('/auth/passkey/status');
      const status = await res.json();
      const badge = document.getElementById('headerLockBadge');
      const banner = document.getElementById('lockBanner');
      const enrollBox = document.getElementById('enrollBox');
      const loginBox = document.getElementById('loginBox');
      const title = document.getElementById('authTitle');
      const subtitle = document.getElementById('authSubtitle');

      if (!status.enrolled) {
        badge.className = 'badge badge-warn';
        badge.textContent = '⚠️ 待录入唯一主人 Passkey';
        title.textContent = '首次初始化：录入唯一主人 Passkey';
        subtitle.textContent = '系统当前尚未绑定 Passkey。首次录入成功后，服务端将自动永久锁定注册通道，仅接受该 Passkey 登录。';
        banner.className = 'lock-banner unlocked';
        banner.textContent = '🔓 注册通道开放（限 1 次）：录入后即刻冻结新 Passkey 注册。';
        enrollBox.style.display = 'block';
        loginBox.style.display = 'none';
      } else {
        badge.className = 'badge badge-ok';
        badge.textContent = '🔒 注册已锁定 · 仅限唯一 Passkey';
        title.textContent = 'Passkey 安全登录';
        subtitle.textContent = '新 Passkey 录入已暂停。请使用已绑定的唯一主人 Passkey 验证身份。';
        banner.className = 'lock-banner locked';
        banner.innerHTML = '🔒 <strong>单设备锁已生效</strong>：已绑定 <b>' +
          escapeHtml(status.credential.label) + '</b>（录入于 ' +
          new Date(status.credential.created_at).toLocaleString() + '）。任何新录入请求均会被拒绝。';
        enrollBox.style.display = 'none';
        loginBox.style.display = 'block';
      }
    }

    function escapeHtml(str) {
      return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    }

    document.getElementById('enrollBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'status-msg';
      try {
        if (!window.PublicKeyCredential) {
          throw new Error('当前浏览器不支持 WebAuthn / Passkey');
        }
        const label = document.getElementById('passkeyLabel').value.trim() || 'Owner Passkey';
        const optRes = await fetch('/auth/passkey/register/options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label })
        });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法获取注册参数');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.user.id = b64urlToBytes(pubKey.user.id);

        const cred = await navigator.credentials.create({ publicKey: pubKey });
        if (!cred || !cred.response.getPublicKey) {
          throw new Error('浏览器未返回 SPKI 公钥，请使用现代浏览器 (Chrome / Safari / Edge)');
        }

        const spkiBuf = cred.response.getPublicKey();
        const authDataBuf = cred.response.getAuthenticatorData();
        const alg = cred.response.getPublicKeyAlgorithm ? cred.response.getPublicKeyAlgorithm() : -7;

        const verifyRes = await fetch('/auth/passkey/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            credentialId: bufToB64url(cred.rawId),
            clientDataJSON: bufToB64url(cred.response.clientDataJSON),
            authenticatorData: bufToB64url(authDataBuf),
            publicKeySpki: bufToB64url(spkiBuf),
            algorithm: alg,
            label
          })
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey 录入验证失败');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await checkPasskeyStatus();
        await enterDashboard(verifyData.credential.label);
      } catch (err) {
        showMsg(authMsg, err.message || String(err), true);
      }
    });

    document.getElementById('loginBtn').addEventListener('click', async () => {
      const authMsg = document.getElementById('authMsg');
      authMsg.className = 'status-msg';
      try {
        const optRes = await fetch('/auth/passkey/login/options', { method: 'POST' });
        const optData = await optRes.json();
        if (!optRes.ok) throw new Error(optData.error || '无法获取登录挑战');

        const pubKey = optData.options;
        pubKey.challenge = b64urlToBytes(pubKey.challenge);
        pubKey.allowCredentials = (pubKey.allowCredentials || []).map((c) => ({
          ...c,
          id: b64urlToBytes(c.id)
        }));

        const assertion = await navigator.credentials.get({ publicKey: pubKey });
        if (!assertion) throw new Error('未获取到 Passkey 签名');

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
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Passkey 登录验证失败');

        sessionToken = verifyData.session_token;
        sessionStorage.setItem('rj_session_token', sessionToken);
        await enterDashboard(verifyData.credential.label);
      } catch (err) {
        showMsg(authMsg, err.message || String(err), true);
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/auth/passkey/logout', { method: 'POST', credentials: 'same-origin' });
      sessionToken = '';
      sessionStorage.removeItem('rj_session_token');
      document.getElementById('dashboardSection').style.display = 'none';
      document.getElementById('authSection').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'none';
      document.getElementById('sessionLabel').textContent = '';
      await checkPasskeyStatus();
    });

    async function enterDashboard(label) {
      document.getElementById('authSection').style.display = 'none';
      document.getElementById('dashboardSection').style.display = 'block';
      document.getElementById('logoutBtn').style.display = 'inline-block';
      document.getElementById('sessionLabel').textContent = '已通过 ' + (label || 'Owner Passkey') + ' 认证';
      await loadPortfolio();
    }

    function riskBadgeHtml(level) {
      if (level === 'healthy') return '<span class="badge badge-ok">healthy 健康</span>';
      if (level === 'attention_needed') return '<span class="badge badge-warn">attention 需关注</span>';
      if (level === 'at_risk') return '<span class="badge badge-danger">at_risk 失联预警</span>';
      return '<span class="badge badge-info">' + escapeHtml(level) + '</span>';
    }

    async function loadPortfolio() {
      const [overview, disambig] = await Promise.all([
        mcpToolCall('analyze_relationship', {}),
        mcpToolCall('manage_disambiguation_item', { action: 'list', status: 'pending' })
      ]);
      const t = overview.totals;
      document.getElementById('portfolioTotals').innerHTML = [
        { k: '联系人总数 (People)', v: t.people },
        { k: '互动时间线事件 (Events)', v: t.timeline_events },
        { k: '当前有效偏好/边界 (Active Signals)', v: t.active_signals },
        { k: '历史已演进信号 (Superseded)', v: t.superseded_signals },
        { k: '待消歧隔离队列 (Disambiguation)', v: t.pending_disambiguation }
      ].map((item) => '<div class="stat-card"><div class="k">' + item.k + '</div><div class="v">' + item.v + '</div></div>').join('');

      const pq = overview.priority_attention_queue || [];
      const pqEl = document.getElementById('priorityQueueList');
      if (pq.length === 0) {
        pqEl.innerHTML = '<div class="muted">🎉 所有联系人状态健康，暂无逾期预警。</div>';
      } else {
        pqEl.innerHTML = pq.map((p) => (
          '<div class="person-item" data-id="' + escapeHtml(p.person_id) + '">' +
            '<div class="top"><span>' + escapeHtml(p.alias) + '</span>' + riskBadgeHtml(p.risk_level) + '</div>' +
            '<div class="sub"><span>综合健康分: <b>' + p.composite_health_score + '</b></span><span>保鲜度: ' + p.freshness_score + '</span><span>断联: ' + (p.days_since_last_interaction ?? '从未') + '天</span></div>' +
          '</div>'
        )).join('');
      }

      const people = overview.people_summary || [];
      const plEl = document.getElementById('peopleList');
      const selectEl = document.getElementById('iePersonId');
      const peopleOptionsHtml = people.map((p) => '<option value="' + escapeHtml(p.person_id) + '">' + escapeHtml(p.alias) + ' (' + escapeHtml(p.relationship_state) + ')</option>').join('');
      selectEl.innerHTML = '<option value="">-- 指代不明 (进入消歧队列) --</option>' + peopleOptionsHtml;

      const dqEl = document.getElementById('disambiguationList');
      const dqItems = (disambig && disambig.items) || [];
      if (dqItems.length === 0) {
        dqEl.innerHTML = '<div class="muted">✅ 队列为空，无待消歧记录。</div>';
      } else {
        dqEl.innerHTML = dqItems.map((item) => (
          '<div style="padding:10px; border:1px solid var(--border); border-radius:8px; background:var(--panel-alt); margin-bottom:8px;">' +
            '<div style="font-size:13px; margin-bottom:6px;"><b>[' + escapeHtml(item.source) + ']</b> ' + escapeHtml(item.sanitizedContent) + '</div>' +
            '<div class="muted" style="margin-bottom:8px;">置信度: ' + item.confidence + (item.signalTopic ? ' · 信号: ' + escapeHtml(item.signalTopic) + '=' + escapeHtml(item.signalValue) : '') + '</div>' +
            '<select class="dq-person-select" data-qid="' + escapeHtml(item.id) + '" style="margin-bottom:6px;">' +
              '<option value="">-- 选择归属联系人 --</option>' + peopleOptionsHtml +
            '</select>' +
            '<div class="row-2">' +
              '<button type="button" class="btn-primary dq-resolve-btn" data-qid="' + escapeHtml(item.id) + '" style="padding:6px 10px; font-size:12px;">🔗 绑定入库 (Link)</button>' +
              '<button type="button" class="btn-secondary dq-dismiss-btn" data-qid="' + escapeHtml(item.id) + '" style="padding:6px 10px; font-size:12px;">🗑️ 忽略 (Dismiss)</button>' +
            '</div>' +
          '</div>'
        )).join('');

        dqEl.querySelectorAll('.dq-resolve-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const qid = btn.getAttribute('data-qid');
            const sel = dqEl.querySelector('.dq-person-select[data-qid="' + qid + '"]');
            const pid = sel ? sel.value : '';
            if (!pid) {
              alert('请先选择要绑定的目标联系人');
              return;
            }
            try {
              await mcpToolCall('manage_disambiguation_item', {
                action: 'link',
                queue_id: qid,
                person_id: pid
              });
              selectedPersonId = pid;
              await loadPortfolio();
            } catch (err) {
              alert(err.message);
            }
          });
        });

        dqEl.querySelectorAll('.dq-dismiss-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const qid = btn.getAttribute('data-qid');
            try {
              await mcpToolCall('manage_disambiguation_item', {
                action: 'dismiss',
                queue_id: qid
              });
              await loadPortfolio();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      }

      if (people.length === 0) {
        plEl.innerHTML = '<div class="muted">暂无联系人，请在右侧创建。</div>';
      } else {
        plEl.innerHTML = people.map((p) => (
          '<div class="person-item ' + (selectedPersonId === p.person_id ? 'active' : '') + '" data-id="' + escapeHtml(p.person_id) + '">' +
            '<div class="top"><span>' + escapeHtml(p.alias) + '</span>' + riskBadgeHtml(p.risk_level) + '</div>' +
            '<div class="sub"><span>健康分: <b>' + p.composite_health_score + '</b></span><span>画像完备度: ' + p.profile_coverage_score + '%</span><span>事件: ' + p.event_count + '</span></div>' +
          '</div>'
        )).join('');
      }

      document.querySelectorAll('.person-item[data-id]').forEach((el) => {
        el.addEventListener('click', () => selectPerson(el.getAttribute('data-id')));
      });

      if (!selectedPersonId && people.length > 0) {
        await selectPerson(people[0].person_id);
      } else if (selectedPersonId) {
        await selectPerson(selectedPersonId);
      }
    }

    async function selectPerson(personId) {
      selectedPersonId = personId;
      document.getElementById('iePersonId').value = personId;
      const [analysis, records] = await Promise.all([
        mcpToolCall('analyze_relationship', { person_id: personId }),
        mcpToolCall('query_relationship_records', { person_id: personId, include_history: true, limit: 15 })
      ]);

      document.getElementById('detailTitle').textContent =
        analysis.person.alias + ' · ' + analysis.person.relationship_state;
      document.getElementById('detailRiskBadge').innerHTML = riskBadgeHtml(analysis.health.risk_level);

      const h = analysis.health;
      const c = analysis.cadence;
      const s = analysis.sentiment;
      const d = analysis.depth_and_volatility;

      const hooksHtml = (analysis.follow_up_hooks || []).length === 0
        ? '<li class="muted">暂无待办跟进建议</li>'
        : analysis.follow_up_hooks.map((hook) => '<li>💡 ' + escapeHtml(hook) + '</li>').join('');

      const activeSignals = [];
      for (const cat of ['preference', 'gift_idea', 'boundary']) {
        for (const sig of (analysis.signals.active_by_category[cat] || [])) {
          activeSignals.push('<li><span class="badge badge-info">' + cat + '</span> <b>' + escapeHtml(sig.topic) + '</b>: ' + escapeHtml(sig.value) + ' <span class="muted">(自 ' + new Date(sig.valid_from).toLocaleDateString() + ')</span></li>');
        }
      }

      const changesHtml = (analysis.signals.preference_changes || []).length === 0
        ? '<li class="muted">暂无偏好覆盖变迁记录</li>'
        : analysis.signals.preference_changes.map((ch) => (
            '<li>🔄 <b>' + escapeHtml(ch.topic) + '</b>: <del class="muted">' + escapeHtml(ch.old_value) + '</del> → <b>' + escapeHtml(ch.new_value) + '</b> <span class="muted">(' + (ch.changed_at ? new Date(ch.changed_at).toLocaleDateString() : '') + ')</span></li>'
          )).join('');

      const eventsHtml = (records.timeline_events || []).length === 0
        ? '<li class="muted">暂无互动记录</li>'
        : records.timeline_events.map((ev) => (
            '<li><div><b>[' + escapeHtml(ev.source) + ']</b> ' + escapeHtml(ev.summary) + '</div>' +
            '<div class="muted" style="margin-top:4px;">时间: ' + new Date(ev.occurredAt).toLocaleString() +
            ' · 情绪: ' + (ev.sentimentScore ?? 'N/A') +
            ((ev.redactedEntities && ev.redactedEntities.length) ? ' · 🛡️ 已脱敏: ' + escapeHtml(ev.redactedEntities.join(', ')) : '') +
            '</div></li>'
          )).join('');

      document.getElementById('detailContent').innerHTML =
        '<div class="metrics-row">' +
          '<div class="metric-box"><div class="label">综合关系健康分</div><div class="val">' + h.composite_health_score + ' / 100</div><div class="hint">保鲜度: ' + h.freshness_score + ' (τ=' + h.target_cadence_days + 'd)</div></div>' +
          '<div class="metric-box"><div class="label">互动节律 & Z-Score</div><div class="val">Z = ' + (c.drift_z_score ?? 'N/A') + '</div><div class="hint">均值间隔: ' + (c.mean_interval_days ?? 'N/A') + 'd · 逾期比: ' + (h.overdue_ratio ?? 'N/A') + '</div></div>' +
          '<div class="metric-box"><div class="label">情绪 EMA & 能量状态</div><div class="val">' + (s.ema ?? 'N/A') + ' (' + escapeHtml(s.energy_state) + ')</div><div class="hint">历史均值: ' + (s.average ?? 'N/A') + ' · 动量斜率: ' + (s.momentum_slope ?? 'N/A') + '</div></div>' +
          '<div class="metric-box"><div class="label">画像完备度 & 信号转化</div><div class="val">' + d.profile_coverage_score + '%</div><div class="hint">沉淀率: ' + d.signal_yield_rate + ' · 90天变迁: ' + d.volatility_90d + '</div></div>' +
        '</div>' +
        '<h3>🎯 主动跟进与行动触发器 (Follow-up Hooks)</h3><ul class="hook-list">' + hooksHtml + '</ul>' +
        '<h3 style="margin-top:16px;">📌 当前有效双时态信号 (Active Bitemporal Signals)</h3><ul class="signal-list">' + (activeSignals.length ? activeSignals.join('') : '<li class="muted">暂无有效信号</li>') + '</ul>' +
        '<h3 style="margin-top:16px;">⏳ 历史偏好/状态演进轨迹 (Bitemporal Evolution)</h3><ul class="signal-list">' + changesHtml + '</ul>' +
        '<h3 style="margin-top:16px;">🗂️ 已脱敏互动时间线 (Timeline Events)</h3><ul class="event-list">' + eventsHtml + '</ul>';
    }

    document.getElementById('refreshBtn').addEventListener('click', () => loadPortfolio());

    document.getElementById('createPersonForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('cpMsg');
      try {
        const alias = document.getElementById('cpAlias').value.trim();
        const state = document.getElementById('cpState').value;
        const bday = document.getElementById('cpBirthday').value.trim();
        const key_dates = {};
        if (bday) key_dates.birthday = bday;
        const res = await mcpToolCall('create_person', {
          alias,
          relationship_state: state,
          key_dates
        });
        showMsg(msg, '已创建联系人: ' + res.person.alias, false);
        document.getElementById('cpAlias').value = '';
        document.getElementById('cpBirthday').value = '';
        selectedPersonId = res.person.id;
        await loadPortfolio();
      } catch (err) {
        showMsg(msg, err.message, true);
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
        const res = await mcpToolCall('insert_relationship_event', payload);
        showMsg(msg, '状态: ' + res.status + (res.redacted_entities?.length ? ' (已脱敏: ' + res.redacted_entities.join(',') + ')' : ''), false);
        document.getElementById('ieContent').value = '';
        document.getElementById('ieSignalTopic').value = '';
        document.getElementById('ieSignalValue').value = '';
        await loadPortfolio();
      } catch (err) {
        showMsg(msg, err.message, true);
      }
    });

    (async () => {
      await checkPasskeyStatus();
      if (sessionToken) {
        try {
          await enterDashboard('Owner Passkey');
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
