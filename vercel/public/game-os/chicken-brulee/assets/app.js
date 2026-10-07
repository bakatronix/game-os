/* Chicken Brûlée — Full App (Auth, Settings, Dashboard) */
(function () {
  "use strict";

  // ── Config (replace with your Supabase project values) ──
  const SUPABASE_URL = "https://ryixbzjnyhjwvojhmdcs.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ5aXhiempueWhqd3ZvamhtZGNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4MDM4MTcsImV4cCI6MjEwMDM3OTgxN30.MOifZtW5xuXBOmnW6wS5jxbjOwylBF1SfPsK5gOEcz4";
  const SCAN_FUNCTION_URL = "https://ryixbzjnyhjwvojhmdcs.supabase.co/functions/v1/scan";

  let supabase = null;
  let session = null;

  // ── Chart.js colors ──
  const C = {
    text:"#ece8f2",mut:"#a99fc0",fnt:"#776c92",grid:"rgba(58,43,80,.55)",border:"#2e2140",
    accent:"#d24bd8",accent2:"#8b5cf6",soft:"#f0a3ff",link:"#6ea8ff",
    crit:"#e0518f",high:"#d9803a",med:"#c9a13a",pres:"#4bb58a",gap:"#6b6188"
  };
  const font = "Inter, system-ui, sans-serif";

  if (window.Chart) {
    Chart.defaults.font.family = font;
    Chart.defaults.color = C.mut;
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = "#1d1428";
    Chart.defaults.plugins.tooltip.borderColor = C.border;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.titleColor = C.text;
    Chart.defaults.plugins.tooltip.bodyColor = C.mut;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
  }

  const $ = s => document.querySelector(s);
  const el = (t, c, h) => { const e = document.createElement(t); if(c)e.className=c; if(h!==undefined)e.innerHTML=h; return e; };

  // ── Auth UI ──
  function showAuth() {
    const app = $("#app-root"); if (!app) return;
    app.innerHTML = `
      <div class="auth-container">
        <div class="auth-card">
          <div class="auth-logo">
            <svg viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="#d24bd8"/><path d="M11 29V11l9 9 9-9v18" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <h2>Chicken Brûlée</h2>
          <p class="auth-sub">Discord Playtest Scanner</p>
          <div id="auth-form"></div>
          <p class="auth-footer">Your data is isolated. Each account sees only their own server.<br><a href="tos.html" style="color:var(--text-mut)">Terms</a> · <a href="privacy.html" style="color:var(--text-mut)">Privacy</a></p>
        </div>
      </div>`;
    showLoginForm();
  }

  function showLoginForm() {
    const f = $("#auth-form"); if (!f) return;
    f.innerHTML = `
      <div class="form-group"><input type="email" id="loginEmail" placeholder="Email" class="form-input"></div>
      <div class="form-group"><input type="password" id="loginPass" placeholder="Password" class="form-input"></div>
      <button class="btn-primary" id="btnLogin">Sign In</button>
      <p class="auth-switch">Don't have an account? <a href="#" id="linkSignup">Sign up</a></p>`;

    $("#btnLogin")?.addEventListener("click", async () => {
      const email = $("#loginEmail")?.value, pass = $("#loginPass")?.value;
      if (!email || !pass) return alert("Enter email and password");
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) alert(error.message);
    });

    $("#linkSignup")?.addEventListener("click", (e) => { e.preventDefault(); showSignupForm(); });
  }

  function showSignupForm() {
    const f = $("#auth-form"); if (!f) return;
    f.innerHTML = `
      <div class="form-group"><input type="email" id="signupEmail" placeholder="Email" class="form-input"></div>
      <div class="form-group"><input type="password" id="signupPass" placeholder="Password (min 6 chars)" class="form-input"></div>
      <button class="btn-primary" id="btnSignup">Create Account</button>
      <p class="auth-switch">Already have an account? <a href="#" id="linkLogin">Sign in</a></p>`;

    $("#btnSignup")?.addEventListener("click", async () => {
      const email = $("#signupEmail")?.value, pass = $("#signupPass")?.value;
      if (!email || !pass) return alert("Enter email and password");
      if (pass.length < 6) return alert("Password must be at least 6 characters");
      const { data, error } = await supabase.auth.signUp({ email, password: pass });
      if (error) { alert(error.message); return; }
      if (data.session) {
        // autoconfirm enabled — logged in immediately
      } else {
        alert("Account created! You'll be logged in automatically.");
      }
    });

    $("#linkLogin")?.addEventListener("click", (e) => { e.preventDefault(); showLoginForm(); });
  }

  // ── App Shell (logged in) ──
  function showApp(user) {
    const app = $("#app-root"); if (!app) return;
    app.innerHTML = `
      <div class="topbar"><div class="wrap">
        <div class="brand">
          <svg viewBox="0 0 30 30" fill="none"><rect width="30" height="30" rx="7" fill="#d24bd8"/><path d="M8 22V8l7 7 7-7v14" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div><span>Chicken Brûlée</span><small id="topEmail">${user.email}</small></div>
        </div>
        <div class="nav"><a href="#" id="navDash">Dashboard</a><a href="#" id="navSettings">Settings</a></div>
        <button class="btn-print" onclick="window.print()">Print / PDF</button>
        <button class="btn-logout" id="btnLogout">Log out</button>
      </div></div>
      <div class="wrap" id="pageContent"></div>
      <footer style="border-top:1px solid var(--border);padding:24px 0;margin-top:40px"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;color:var(--text-fnt);font-size:12px;font-family:var(--font-mono)">
        <span>Chicken Brûlée · Discord Playtest Scanner</span>
        <span><a href="tos.html" style="color:var(--text-mut)">Terms of Service</a> · <a href="privacy.html" style="color:var(--text-mut)">Privacy Policy</a> · <span id="footVersion">—</span></span>
      </div></footer>`;

    $("#btnLogout")?.addEventListener("click", () => supabase.auth.signOut());
    $("#navDash")?.addEventListener("click", (e) => { e.preventDefault(); renderDashboard(user); });
    $("#navSettings")?.addEventListener("click", (e) => { e.preventDefault(); renderSettings(user); });

    renderDashboard(user);
  }

  // ── Settings ──
  async function renderSettings(user) {
    const pc = $("#pageContent"); if (!pc) return;
    const { data: config } = await supabase.from("bot_configs").select("*").eq("user_id", user.id).maybeSingle();
    const token = config?.bot_token || "";
    const channels = config?.channels || [];
    const prefixes = config?.staff_prefixes || "";
    const ctx = config?.game_context || {};
    const roleMap = config?.role_mapping || {};

    pc.innerHTML = `<section><div class="section-head"><span class="eyebrow">SETTINGS</span><h2>Bot Configuration</h2></div>
      <div class="settings-card">
        <div class="form-group"><label>Discord Bot Token</label>
          <input type="password" id="setToken" class="form-input" value="${escAttr(token)}" placeholder="Paste your bot token">
          <p class="form-hint">Create a bot at <a href="https://discord.com/developers/applications" target="_blank">discord.com/developers</a>. Only needs Read Messages + Read Message History.</p>
        </div>
        <div class="form-group"><label>Channel IDs (comma-separated)</label>
          <input type="text" id="setChannels" class="form-input" value="${escAttr(channels.map(function(c) { return c.id; }).join(','))}" placeholder="123456789,987654321">
          <p class="form-hint">Enable Developer Mode in Discord, right-click channels → Copy ID.</p>
        </div>
        <div class="form-group"><label>Role Mapping (Discord role name → category)</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
            <input type="text" id="setRoleName" class="form-input" placeholder="Discord role name" style="font-size:13px">
            <input type="text" id="setRoleCat" class="form-input" placeholder="Category (Staff, Player, Ambassador)" style="font-size:13px">
          </div>
          <button class="btn-secondary" id="btnAddRole" style="font-size:12px;padding:6px 12px">Add Role</button>
          <div id="roleMapList" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px"></div>
          <p class="form-hint">Set Discord role names and what they map to. E.g. "Village Architect" → Staff, "Nomad" → Player. Uses Discord's role list, no extra bot permissions needed.</p>
        </div>
        <div class="form-group"><label>Staff Username Prefixes (fallback, optional)</label>
          <input type="text" id="setPrefixes" class="form-input" value="${escAttr(prefixes)}" placeholder="DSG_, DEV_, Admin">
          <p class="form-hint">Fallback if roles aren't available. Comma-separated.</p>
        </div>
        <div class="form-group"><label>Game Name</label>
          <input type="text" id="setGameName" class="form-input" value="${escAttr(ctx.game_name||'')}" placeholder="e.g. FarHaven, Nomad">
        </div>
        <div class="form-group"><label>Game Description</label>
          <textarea id="setGameDesc" class="form-input" rows="3" style="resize:vertical" placeholder="Brief description of your game, genre, setting, and core loop.">${escAttr(ctx.description||'')}</textarea>
        </div>
        <div class="form-group"><label>Game Mechanics / Systems (one per line)</label>
          <textarea id="setMechanics" class="form-input" rows="4" style="resize:vertical" placeholder="Fishing&#10;Combat&#10;Crafting&#10;Farming&#10;Quest System">${escAttr((ctx.mechanics||[]).join('\n'))}</textarea>
          <p class="form-hint">Each line becomes a theme for classification. Observations are matched against these keywords.</p>
        </div>
        <div class="form-group"><label>Playtest Goals</label>
          <textarea id="setGoals" class="form-input" rows="3" style="resize:vertical" placeholder="What are you testing? What feedback are you looking for?">${escAttr(ctx.goals||'')}</textarea>
        </div>
        <button class="btn-primary" id="btnSaveConfig">Save Configuration</button>
        <span id="cfgStatus" style="margin-left:12px;font-size:13px;color:var(--pres)"></span>
      </div></section>`;

    $("#btnSaveConfig")?.addEventListener("click", async () => {
      const token = $("#setToken")?.value?.trim();
      const chIds = ($("#setChannels")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
      const labels = ($("#setLabels")?.value || "").split(",").map(s => s.trim()).filter(Boolean);
      const prefixes = ($("#setPrefixes")?.value || "").trim();
      const gameName = ($("#setGameName")?.value || "").trim();
      const gameDesc = ($("#setGameDesc")?.value || "").trim();
      const mechanics = ($("#setMechanics")?.value || "").split("\n").map(s=>s.trim()).filter(Boolean);
      const goals = ($("#setGoals")?.value || "").trim();
      if (!token || !chIds.length) return alert("Bot token and at least one channel ID are required.");

      const chArr = chIds.map((id, i) => ({ id, name: labels[i] || id, label: "#" + (labels[i] || id) }));
      const gameContext = { game_name: gameName, description: gameDesc, mechanics, goals };
      const payload = { bot_token: token, channels: chArr, staff_prefixes: prefixes, role_mapping: localRoleMap, game_context: gameContext, updated_at: new Date().toISOString() };

      if (config?.id) {
        await supabase.from("bot_configs").update(payload).eq("id", config.id);
      } else {
        await supabase.from("bot_configs").insert({ user_id: user.id, bot_token: token, channels: chArr, staff_prefixes: prefixes });
      }

      const s = $("#cfgStatus"); if (s) { s.textContent = "Saved."; setTimeout(() => { s.textContent = ""; }, 2000); }
    });

    // Role mapping UI
    let localRoleMap = { ...roleMap };
    function renderRoleList() {
      const list = $("#roleMapList"); if (!list) return;
      list.innerHTML = Object.entries(localRoleMap).map(([name, cat]) => 
        `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface-3);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px"><strong style="color:var(--text)">${escHtml(name)}</strong> → ${escHtml(cat)} <button class="chip" style="padding:2px 6px;font-size:10px;cursor:pointer" data-role="${escAttr(name)}">✕</button></span>`
      ).join("");
      list.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
          delete localRoleMap[btn.dataset.role];
          renderRoleList();
        });
      });
    }
    renderRoleList();
    $("#btnAddRole")?.addEventListener("click", () => {
      const name = ($("#setRoleName")?.value || "").trim();
      const cat = ($("#setRoleCat")?.value || "").trim();
      if (name && cat) { localRoleMap[name] = cat; renderRoleList(); ($("#setRoleName")).value = ""; ($("#setRoleCat")).value = ""; }
    });
  }

  let currentSessions = [];
  let _chartTheme, _chartContrib, _chartTime, _chartSev;

  function computeSessions(allRows, staff) {
    const announcements = allRows.filter(r => {
      const txt = String(r.excerpt || r.paraphrase || r.note || "");
      const isHeading = /^#/.test(txt.trim());
      const hasNumber = /(?:playtest|slice)\s*#?\s*(\d+)/i.test(txt);
      const isBuildNotice = /update is live|go play|deploy|shipped|released|now live|build.*uploaded|build.*ready/i.test(txt);
      return (isHeading && hasNumber) || isBuildNotice;
    }).sort((a,b) => a._ts - b._ts);

    if (!announcements.length && allRows.length) {
      return [{ label: "All activity", rows: allRows, lastTs: allRows[allRows.length-1]?._ts || 0 }];
    }

    // Deduplicate: only keep FIRST occurrence of each playtest/slice number
    const seenNums = new Set();
    const markers = [];
    announcements.forEach(a => {
      const txt = String(a.excerpt || a.paraphrase || a.note || "");
      const numMatch = txt.match(/(?:playtest|slice)\s*#?\s*(\d+)/i);
      let ptNum = numMatch ? parseInt(numMatch[1]) : null;
      if (ptNum && ptNum > 0 && ptNum < 100 && !seenNums.has(ptNum)) {
        seenNums.add(ptNum);
        markers.push({
          _ts: a._ts || new Date(a.timestamp||a.iso||0).getTime(), isMarker: true,
          ptNum, label: txt.slice(0, 60)
        });
      }
    });

    const combined = [...allRows.map(r => ({ ...r, _ts: r._ts || new Date(r.timestamp||r.iso||0).getTime() })), ...markers].sort((a,b) => a._ts - b._ts);

    const raw = [];
    let cur = null;
    combined.forEach(r => {
      if (r.isMarker || !cur) {
        cur = { ptNum: r.isMarker ? r.ptNum : null, rows: [], lastTs: r._ts };
        raw.push(cur);
      }
      if (!r.isMarker) { cur.rows.push(r); cur.lastTs = r._ts; }
    });

    // Merge ALL sessions with same playtest number, anywhere in timeline
    const merged = [];
    raw.forEach(s => {
      if (s.ptNum !== null) {
        const existing = merged.find(m => m.ptNum === s.ptNum);
        if (existing) {
          existing.rows.push(...s.rows);
          if (s.lastTs > existing.lastTs) existing.lastTs = s.lastTs;
          return;
        }
      }
      merged.push(s);
    });
    merged.sort((a,b) => (a.rows[0]?._ts||0) - (b.rows[0]?._ts||0));

    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    merged.forEach(s => {
      const timestamps = s.rows.map(r => r._ts).filter(Boolean);
      const start = new Date(Math.min(...timestamps));
      const end = new Date(Math.max(...timestamps));
      const dr = `${m[start.getMonth()]} ${start.getDate()}–${m[end.getMonth()]} ${end.getDate()}`;
      s.label = s.ptNum !== null ? `Playtest ${s.ptNum} — ${dr}` : `Session — ${dr}`;
    });
    return merged.filter(s => s.rows.length >= 1);
  }

  function renderVariance(idxA, idxB) {
    const vg = $("#varianceGrid"); if (!vg) return;
    if (!idxA || !idxB || !currentSessions.length) {
      vg.innerHTML = '<div class="callout" style="font-size:13px;color:var(--text-mut);text-align:center">Pick two playtests above to see what changed between them.</div>';
      return;
    }
    const a = currentSessions[parseInt(idxA)], b = currentSessions[parseInt(idxB)];
    if (!a || !b) return;
    const aThemes = new Set(a.rows.map(r => r.theme).filter(Boolean));
    const bThemes = new Set(b.rows.map(r => r.theme).filter(Boolean));
    const added = [...bThemes].filter(t => !aThemes.has(t));
    const removed = [...aThemes].filter(t => !bThemes.has(t));
    const aCrit = a.rows.filter(r => r.priority === "Critical" || r.severity === "Critical").length;
    const bCrit = b.rows.filter(r => r.priority === "Critical" || r.severity === "Critical").length;
    const critDelta = bCrit - aCrit;

    vg.innerHTML = `<div class="kpi-grid" style="margin-bottom:16px">
      <div class="kpi"><div class="num">${a.rows.length} → ${b.rows.length}</div><div class="lab">Entries</div><div class="sub">${a.label.split("—")[0] || a.label} vs ${b.label.split("—")[0] || b.label}</div></div>
      <div class="kpi"><div class="num" style="color:${critDelta > 0 ? 'var(--sev-crit)' : critDelta < 0 ? 'var(--sev-pres)' : 'var(--text)'}">${critDelta >= 0 ? '+' : ''}${critDelta}</div><div class="lab">Critical issues</div><div class="sub">${aCrit} → ${bCrit}</div></div>
      <div class="kpi"><div class="num">${added.length}</div><div class="lab">New themes</div><div class="sub">${added.slice(0,3).join(", ") || 'none'}</div></div>
      <div class="kpi"><div class="num">${removed.length}</div><div class="lab">Resolved themes</div><div class="sub">${removed.slice(0,3).join(", ") || 'none'}</div></div>
    </div>
    <div class="chart-grid"><div class="card"><h3>Theme Comparison</h3><p class="chart-note">${a.label.split("—")[0]} vs ${b.label.split("—")[0]}</p><div class="canvas-holder"><canvas id="chVariance"></canvas></div></div></div>`;

    // Chart
    setTimeout(() => {
      const cv = $("#chVariance");
      if (!cv) return;
      const allThemes = [...new Set([...aThemes, ...bThemes])];
      const aCounts = {}, bCounts = {};
      a.rows.forEach(r => { const t = r.theme || "Other"; aCounts[t] = (aCounts[t]||0)+1; });
      b.rows.forEach(r => { const t = r.theme || "Other"; bCounts[t] = (bCounts[t]||0)+1; });
      const labels = allThemes.sort((x,y) => (bCounts[y]||0)+(aCounts[y]||0) - (bCounts[x]||0)-(aCounts[x]||0)).slice(0, 8);
      new Chart(cv, {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: a.label.split("—")[0] || "A", data: labels.map(t => aCounts[t]||0), backgroundColor: C.accent, borderRadius: 4 },
            { label: b.label.split("—")[0] || "B", data: labels.map(t => bCounts[t]||0), backgroundColor: C.link, borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, padding: 14, font: { size: 11 } } } },
          scales: {
            x: { grid: { display: false }, border: { color: C.border }, ticks: { color: C.text, font: { size: 10, weight: "600" } } },
            y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 }, grid: { color: C.grid }, border: { color: C.border } }
          }
        }
      });
    }, 100);
  }

  // ── Dashboard ──
  async function renderDashboard(user) {
    const pc = $("#pageContent"); if (!pc) return;

    // Load config
    const { data: config } = await supabase.from("bot_configs").select("*").eq("user_id", user.id).maybeSingle();
    const channels = config?.channels || [];

    // Load observations
    const { data: obs } = await supabase.from("observations").select("*").eq("user_id", user.id).order("timestamp", { ascending: false });
    const observations = obs || [];
    const staff = observations.filter(o => o.kind === "staff");
    const engagement = observations.filter(o => o.kind === "engagement");
    const playerObs = observations.filter(o => o.kind === "observation");
    // Load scans for summary/insights
    const { data: scans } = await supabase.from("scans").select("summary,insights,recommendations,completed_at").eq("user_id", user.id).order("completed_at", { ascending: false }).limit(1);
    const latestSummary = scans?.[0]?.summary || "";
    const latestInsights = scans?.[0]?.insights || "";
    const latestRecommendations = scans?.[0]?.recommendations || "";
    const lastScan = scans?.[0]?.completed_at ? new Date(scans[0].completed_at).toLocaleDateString() : "—";
    const speakers = [...new Set(playerObs.map(o => o.speaker))];

    // Compute sessions (used by filter, ledger, comparison)
    const allRows = [];
    playerObs.forEach(o => allRows.push({ ...o, kind: "observation" }));
    staff.forEach(s => allRows.push({ ...s, kind: "staff" }));
    engagement.forEach(e => allRows.push({ ...e, kind: "engagement" }));
    allRows.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    currentSessions = computeSessions(allRows, staff);

    const sessionOptions = currentSessions.map((s, i) => `<option value="${i}">${s.label}</option>`).join("");

    pc.innerHTML = `
      <section class="hero"><div class="kicker"><span class="dot"></span> Discord Playtest Scanner</div>
        <h1><span class="grad">${escHtml(user.user_metadata?.server_name || "Your Dashboard")}</span></h1>
        <p class="lede">${observations.length ? `${observations.length} classified messages from ${speakers.length} contributors across ${channels.length} channel${channels.length!==1?'s':''}.` : 'No scan data yet. Configure your bot and run a scan.'}</p>
        <div class="hero-meta">
          <div><span>Contributors</span><strong>${speakers.length || "—"}</strong></div>
          <div><span>Observations</span><strong>${playerObs.length || "—"}</strong></div>
          <div><span>Engagement</span><strong>${engagement.length || "—"}</strong></div>
          <div><span>Last scan</span><strong>${lastScan}</strong></div>
        </div>
        ${channels.length ? `<button class="btn-primary" id="btnScan" style="margin-top:18px">Scan Now</button><span id="scanStatus" style="margin-left:12px;font-size:13px;color:var(--text-mut)"></span>` : ''}
      </section>

      <section style="padding:8px 0 30px"><div style="display:flex;flex-wrap:wrap;gap:16px;align-items:end">
        <div style="flex:1;min-width:140px"><label class="fl">Playtest</label><select id="ptFilter" class="form-input"><option value="all">All playtests</option>${sessionOptions}</select></div>
        <div style="flex:1;min-width:140px"><label class="fl">Channel</label><select id="chFilter" class="form-input"><option value="all">All channels</option>${channels.map((c) => `<option value="${c.id}">${c.label||c.name}</option>`).join("")}</select></div>
        <div style="flex:1;min-width:140px"><label class="fl">Date from (optional)</label><input type="date" id="dFrom" class="form-input"></div>
        <div style="flex:1;min-width:140px"><label class="fl">Date to (optional)</label><input type="date" id="dTo" class="form-input"></div>
        <button id="btnRst" class="btn-secondary">Reset</button>
      </div></section>

      <section style="padding:0 0 36px;border-top:none"><div class="kpi-grid">
        <div class="kpi"><div class="num" id="kp1">${speakers.length||"—"}</div><div class="lab">Contributors</div></div>
        <div class="kpi"><div class="num" id="kp2">${playerObs.length||"—"}</div><div class="lab">Observations</div></div>
        <div class="kpi"><div class="num" id="kp3">${staff.length||"—"}</div><div class="lab">Staff replies</div></div>
        <div class="kpi"><div class="num" id="kp4">${engagement.length||"—"}</div><div class="lab">Engagement</div></div>
      </div></section>

      ${latestSummary ? `<section style="padding:0 0 30px;border-top:none"><div class="section-head"><span class="eyebrow">AI SUMMARY</span><h2>Scan Overview</h2></div><div class="callout" style="font-size:14px;line-height:1.7;white-space:pre-wrap">${escHtml(latestSummary)}</div></section>` : ''}

      <section><div class="chart-grid">
        <div class="card"><h3>By Theme</h3><div class="canvas-holder"><canvas id="chTheme"></canvas></div></div>
        <div class="card"><h3>Contributors</h3><div class="canvas-holder"><canvas id="chContrib"></canvas></div></div>
        <div class="card"><h3>Timeline</h3><div class="canvas-holder"><canvas id="chTime"></canvas></div></div>
        <div class="card"><h3>Severity</h3><div class="canvas-holder"><canvas id="chSev"></canvas></div></div>
      </div></section>

      <section><div class="section-head"><span class="eyebrow">VARIANCE</span><h2>Playtest Comparison</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:end;margin-bottom:16px">
          <div style="flex:1;min-width:160px"><label class="fl">Compare</label><select id="cmpA" class="form-input"><option value="">— select —</option>${sessionOptions}</select></div>
          <div style="flex:0;color:var(--text-fnt);font-size:14px;padding-bottom:10px">vs</div>
          <div style="flex:1;min-width:160px"><label class="fl">With</label><select id="cmpB" class="form-input"><option value="">— select —</option>${sessionOptions}</select></div>
          <button id="cmpClr" class="btn-secondary">Clear</button>
        </div>
        <div id="varianceGrid"><div class="callout" style="font-size:13px;color:var(--text-mut);text-align:center">Pick two playtests above to see what changed between them.</div></div>
      </section>

      <section><div class="section-head"><span class="eyebrow">SENTIMENT</span><h2>Sentiment Analysis</h2><p>Positive → +1, neutral → 0, negative → −1. Tracks mood shifts across playtests.</p></div>
        <div class="kpi-grid" id="sentimentKPIs" style="margin-bottom:16px"></div>
        <div class="chart-grid">
          <div class="card"><h3>Overall Sentiment</h3><div class="canvas-holder"><canvas id="chSentOverall"></canvas></div></div>
          <div class="card"><h3>Per-Playtest Trend</h3><div class="canvas-holder"><canvas id="chSentTrend"></canvas></div></div>
          <div class="card"><h3>Sentiment by Theme</h3><p class="chart-note">Which features get the most love vs frustration</p><div class="canvas-holder"><canvas id="chSentTheme"></canvas></div></div>
          <div class="card"><h3>Daily Sentiment Line</h3><p class="chart-note">Trend direction over time</p><div class="canvas-holder"><canvas id="chSentLine"></canvas></div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
          <div class="card"><h3>Top Pain Points</h3><div id="painPoints" style="margin-top:10px"></div></div>
          <div class="card"><h3>Resolved Issues</h3><div id="resolvedIssues" style="margin-top:10px"></div></div>
        </div>
        <div class="card" style="margin-top:16px"><h3>Sentiment by Contributor</h3><div style="overflow-x:auto;margin-top:10px"><table class="mini" style="width:100%"><thead><tr><th>Contributor</th><th>Score</th><th>Positive</th><th>Neutral</th><th>Negative</th><th>Total</th></tr></thead><tbody id="sentByContrib"></tbody></table></div></div>
      </section>

      <section><div class="section-head"><span class="eyebrow">LEDGER</span><h2>Evidence</h2></div>
        <div class="filters"><span class="flabel">Contributor</span><div id="fCont"></div><span class="flabel" style="margin-left:8px">Theme</span><div id="fTheme"></div><span class="flabel" style="margin-left:8px">Priority</span><div id="fPrio"></div></div>
        <div class="ledger-wrap"><table class="ledger"><thead><tr><th>Timestamp</th><th>Speaker</th><th>Role</th><th>Evidence</th><th>Theme</th><th>Signal</th><th>Priority</th></tr></thead><tbody id="ledBody"></tbody></table></div>
      </section>

      <section><div class="section-head"><span class="eyebrow">COVERAGE</span><h2>Feature Coverage</h2><p>Promoted systems mapped against visible player feedback. Silence is not approval.</p></div>
        <div style="overflow-x:auto"><table class="matrix"><thead><tr><th>Theme</th><th>Status</th><th>Feedback</th></tr></thead><tbody id="matrixBody"></tbody></table></div>
      </section>

      <section><div class="section-head"><span class="eyebrow">INSIGHTS</span><h2>Key Insights</h2></div>
        <div class="insights" id="insightGrid"></div>
      </section>

      <section><div class="section-head"><span class="eyebrow">ACTIONS</span><h2>Recommendations</h2></div>
        <div class="action-cols">
          <div class="action-group"><h3><span class="tag">Immediate</span></h3><ol class="action-list" id="actImm"></ol></div>
          <div class="action-group"><h3><span class="tag near">Near term</span></h3><ol class="action-list" id="actNear"></ol></div>
        </div>
        <div class="survey" style="margin-top:20px"><h3>Suggested Survey Questions</h3><ol id="surveyList"></ol></div>
      </section>
    `;

    // Bind scan button
    $("#btnScan")?.addEventListener("click", async () => {
      const btn = $("#btnScan");
      const st = $("#scanStatus"); if (btn) btn.disabled = true; if (st) st.textContent = "Scanning Discord...";

      try {
        const { data: { session: s } } = await supabase.auth.getSession();
        const res = await fetch(SCAN_FUNCTION_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.access_token}` },
          body: JSON.stringify({ channelIds: channels.map((c) => c.id) })
        });
        const result = await res.json();
        if (result.error) { if (st) st.textContent = result.error; }
        else { if (st) st.textContent = `Done: ${result.observations_found} observations, ${result.total_classified} total classified.`; }
      } catch (e) {
        if (st) st.textContent = "Scan failed: " + e.message;
      } finally {
        if (btn) btn.disabled = false;
        setTimeout(() => renderDashboard(user), 2000);
      }
    });

    // Bind filters
    bindDashboardFilters(playerObs, staff, engagement, channels, latestInsights, latestRecommendations);
    renderCharts(playerObs, staff, engagement);
    renderLedger(playerObs, staff, engagement);
    renderMatrix(playerObs);
    renderInsightsFromData(latestInsights, playerObs);
    renderActionsFromAI(latestRecommendations, playerObs);
    renderSentiment(playerObs, currentSessions);
    renderVariance("all");
  }

  function renderCharts(playerObs, staff, engagement) {
    [_chartTheme, _chartContrib, _chartTime, _chartSev].forEach(c => { if (c) c.destroy(); });
    _chartTheme = _chartContrib = _chartTime = _chartSev = null;

    const themeC = {};
    playerObs.forEach((o) => { themeC[o.theme] = (themeC[o.theme]||0)+1; });
    const tl = Object.keys(themeC).sort();
    const palette = ["#d24bd8","#8b5cf6","#a86fdf","#6ea8ff","#4bb58a","#e0518f","#d9803a","#c9a13a","#6b6188"];

    const c1 = $("#chTheme");
    if (c1 && tl.length) {
      _chartTheme = new Chart(c1, { type:"bar", data:{ labels:tl, datasets:[{ label:"Obs", data:tl.map(k=>themeC[k]), backgroundColor:palette, borderRadius:6, barThickness:20 }] },
        options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
          scales:{ x:{ beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } }, y:{ grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:11 } } } } } });
    }

    const cmap = {};
    playerObs.forEach((o) => { if(!cmap[o.speaker]) cmap[o.speaker]={obs:0,staff:0,eng:0,role:o.role}; cmap[o.speaker].obs++; });
    staff.forEach((s) => { if(!cmap[s.speaker]) cmap[s.speaker]={obs:0,staff:0,eng:0,role:s.role}; cmap[s.speaker].staff++; });
    engagement.forEach((e) => { if(!cmap[e.speaker]) cmap[e.speaker]={obs:0,staff:0,eng:0,role:"Player"}; cmap[e.speaker].eng++; });
    const cn = Object.keys(cmap);
    const c2 = $("#chContrib");
    if (c2 && cn.length) {
      _chartContrib = new Chart(c2, { type:"bar", data:{ labels:cn, datasets:[
        { label:"Obs", data:cn.map(n=>cmap[n].obs), backgroundColor:C.accent, borderRadius:4, stack:"s" },
        { label:"Staff", data:cn.map(n=>cmap[n].staff), backgroundColor:C.link, borderRadius:4, stack:"s" },
        { label:"Engage", data:cn.map(n=>cmap[n].eng), backgroundColor:C.accent2, borderRadius:4, stack:"s" }
      ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12, boxHeight:12, padding:14, font:{ size:11 } } } },
        scales:{ x:{ stacked:true, grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:11 } } }, y:{ stacked:true, beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } } } } });
    }

    // Timeline
    const db = {};
    playerObs.forEach((o) => { const d = o.timestamp?.slice(0,10); if(d){ if(!db[d]) db[d]={o:0,s:0,e:0}; db[d].o++; } });
    staff.forEach((s) => { const d = s.timestamp?.slice(0,10); if(d){ if(!db[d]) db[d]={o:0,s:0,e:0}; db[d].s++; } });
    engagement.forEach((e) => { const d = e.timestamp?.slice(0,10); if(d){ if(!db[d]) db[d]={o:0,s:0,e:0}; db[d].e++; } });
    const tdates = Object.keys(db).sort();
    const mo = {"01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun","07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec"};
    const tl2 = tdates.map(d => { const p=d.split("-"); return (mo[p[1]]||p[1])+" "+p[2]; });
    const c3 = $("#chTime");
    if (c3 && tdates.length) {
      _chartTime = new Chart(c3, { type:"bar", data:{ labels:tl2, datasets:[
        { label:"Obs", data:tdates.map(d=>db[d].o), backgroundColor:C.accent, borderRadius:4, stack:"d" },
        { label:"Staff", data:tdates.map(d=>db[d].s), backgroundColor:C.link, borderRadius:4, stack:"d" },
        { label:"Engage", data:tdates.map(d=>db[d].e), backgroundColor:C.accent2, borderRadius:4, stack:"d" }
      ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12, boxHeight:12, padding:14, font:{ size:11 } } } },
        scales:{ x:{ stacked:true, grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text } }, y:{ stacked:true, beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } } } } });
    }

    // Severity
    const sc = {};
    playerObs.forEach((o) => { sc[o.severity] = (sc[o.severity]||0)+1; });
    const svC = { Critical:C.crit, High:C.high, Medium:C.med, Preserve:C.pres };
    const sl = ["Critical","High","Medium","Preserve"].filter(s => sc[s]);
    const c4 = $("#chSev");
    if (c4 && sl.length) {
      _chartSev = new Chart(c4, { type:"bar", data:{ labels:sl, datasets:[{ label:"Obs", data:sl.map(s=>sc[s]), backgroundColor:sl.map(s=>svC[s]), borderRadius:6, barThickness:40 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
          scales:{ x:{ grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:12 } } }, y:{ beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } } } } });
    }
  }

  function renderLedger(playerObs, staff, engagement) {
    const rows = [];
    playerObs.forEach((o) => rows.push({ ts:fmtTs(o.timestamp), iso:o.timestamp, speaker:o.speaker, role:o.role, excerpt:o.paraphrase||o.excerpt, theme:o.theme, signal:o.signal, priority:o.severity, _ts:new Date(o.timestamp).getTime() }));
    staff.forEach((s) => rows.push({ ts:fmtTs(s.timestamp), iso:s.timestamp, speaker:s.speaker, role:s.role, excerpt:s.paraphrase||s.excerpt, theme:s.theme, signal:s.signal, priority:"Context", _ts:new Date(s.timestamp).getTime() }));
    engagement.forEach((e) => rows.push({ ts:fmtTs(e.timestamp), iso:e.timestamp, speaker:e.speaker, role:"Player", excerpt:e.excerpt||e.paraphrase||"", theme:"Engagement", signal:"Engagement", priority:"Context", _ts:new Date(e.timestamp).getTime() }));
    rows.sort((a,b) => a._ts - b._ts);

    // Use global session detection (announcement-based, same as filters)
    const sessions = computeSessions(rows, staff);

    const allC = [...new Set(rows.map(r => r.speaker))];
    const allT = [...new Set(rows.map(r => r.theme))];
    buildChips("fCont", allC, "contrib", sessions);
    buildChips("fTheme", allT, "theme", sessions);
    buildChips("fPrio", ["Critical","High","Medium","Preserve","Context"], "priority", sessions);

    function buildChips(containerId, values, key, sessions) {
      const cont = document.getElementById(containerId); if(!cont) return; cont.innerHTML = "";
      let active = "All";
      ["All", ...values].forEach(v => {
        const chip = el("button", "chip" + (v==="All"?" active":""), v);
        chip.addEventListener("click", () => {
          cont.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
          chip.classList.add("active");
          active = v;
          renderTable();
        });
        cont.appendChild(chip);
      });

      function renderTable() {
        const tb = $("#ledBody"); if(!tb) return; tb.innerHTML = "";
        let anyVisible = false;
        const totalSessions = sessions.length;
        sessions.forEach(session => {
          const filtered = session.rows.filter(r => (active==="All"||r[key]===active));
          if (!filtered.length) return;
          anyVisible = true;
          
          const sessionId = "sess-" + Math.random().toString(36).slice(2,8);

          // Session header — all collapsed by default
          const hr = el("tr");
          const critCount = filtered.filter(r => r.priority === "Critical").length;
          hr.style.cursor = "pointer";
          hr.innerHTML = `<td colspan="7" style="background:var(--surface-3);color:var(--accent-soft);font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:10px 13px;border-bottom:2px solid var(--border-2)">
            <span id="${sessionId}-icon" style="margin-right:6px">▶</span>${session.label} · ${filtered.length} entries${critCount ? ` · ${critCount} critical` : ''}
          </td>`;
          tb.appendChild(hr);

          // Session rows
          const rowEls = [];
          filtered.forEach(r => {
            const tr = el("tr");
            tr.classList.add(sessionId + "-row");
            const summary = r.excerpt || "";
            const ex = `<div style="color:var(--text)">${escHtml(summary.slice(0, 150))}${summary.length > 150 ? '...' : ''}</div>`;
            const pc = r.priority==="Context" ? `<span style="color:var(--text-fnt);font-size:11.5px;font-family:mono">Context</span>` : `<span class="sev ${r.priority}">${r.priority}</span>`;
            tr.innerHTML = `<td class="ts">${r.ts}</td><td class="speaker">${r.speaker}</td><td><span class="badge role-${r.role}">${r.role}</span></td><td style="min-width:280px;max-width:360px">${ex}</td><td>${r.theme}</td><td style="white-space:nowrap;font-size:12px">${r.signal}</td><td>${pc}</td>`;
            tb.appendChild(tr);
            tr.style.display = "none";
            rowEls.push(tr);
          });

          // Toggle collapse/expand
          hr.addEventListener("click", () => {
            const icon = document.getElementById(sessionId + "-icon");
            const collapsed = rowEls[0]?.style.display === "none";
            rowEls.forEach(tr => { tr.style.display = collapsed ? "" : "none"; });
            if (icon) icon.textContent = collapsed ? "▼" : "▶";
          });
        });
        if (!anyVisible) tb.innerHTML = `<tr><td colspan="7"><div class="ledger-empty">No entries match.</div></td></tr>`;
      }
      renderTable();
    }
  }

  function renderMatrix(playerObs) {
    const mb = $("#matrixBody"); if (!mb) return;
    const themes = {};
    playerObs.forEach(o => { if (!themes[o.theme]) themes[o.theme] = { pos: 0, neg: 0, crit: 0, detail: [] }; if (o.severity === "Preserve") themes[o.theme].pos++; else if (o.severity === "Critical") themes[o.theme].crit++; else themes[o.theme].neg++; themes[o.theme].detail.push(o.speaker); });
    const rows = Object.entries(themes).sort((a,b) => (b[1].crit + b[1].neg) - (a[1].crit + a[1].neg));
    mb.innerHTML = rows.map(([theme, t]) => {
      const status = t.crit > 0 ? "Critical" : t.neg >= 2 ? "Friction" : t.pos >= 2 ? "Positive" : "Mixed";
      const tone = status === "Critical" ? "negative" : status === "Friction" ? "neutral" : "positive";
      return `<tr><td class="feat">${escHtml(theme)}</td><td><span class="pill ${tone}">${status}</span></td><td>${t.crit} crit, ${t.neg} issue${t.neg!==1?'s':''}, ${t.pos} positive · ${[...new Set(t.detail)].slice(0,3).join(", ")}</td></tr>`;
    }).join("") || '<tr><td colspan="3" style="text-align:center;color:var(--text-fnt);padding:20px">No data yet</td></tr>';
  }

  function renderInsightsFromData(insightsJson, playerObs) {
    const ig = $("#insightGrid"); if (!ig) return;
    
    // Try to parse stored insights from scan
    if (insightsJson) {
      try {
        const clean = insightsJson.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length) {
          ig.innerHTML = parsed.map((ins, i) => 
            `<div class="insight${i===0?' wide':''}"><span class="p">${ins.priority||"Info"}</span><h3>${escHtml(ins.title||"")}</h3><p>${escHtml(ins.body||"")}</p></div>`
          ).join("");
          return;
        }
      } catch (_) {}
    }

    // Fallback: basic stats
    if (!playerObs.length) {
      ig.innerHTML = '<div class="insight wide"><span class="p">Info</span><h3>No feedback yet</h3><p>Run a scan to generate insights.</p></div>';
      return;
    }
    ig.innerHTML = `<div class="insight wide"><span class="p">Info</span><h3>Scan complete</h3><p>${playerObs.length} observations across ${new Set(playerObs.map(o=>o.theme)).size} themes. ${playerObs.filter(o=>o.severity==='Critical').length} critical, ${playerObs.filter(o=>o.severity==='High').length} high priority. Run a new scan to generate AI insights.</p></div>`;
  }

  function getSentiment(o) {
    const excerpt = (o.excerpt || "").toLowerCase();

    // Explicit positive phrases that override classification
    if (/can't wait|looking forward|love |enjoy|awesome|amazing|great |excited|much better|fantastic|brilliant/i.test(excerpt)) return 1;

    const s = o.signal || "";
    if (/positive/i.test(s) || o.severity === "Preserve") return 1;
    if (/negative|blocker|defect|friction/i.test(s) || o.severity === "Critical" || o.severity === "High") return -1;
    return 0;
  }

  function renderSentiment(playerObs, sessions) {
    const sk = $("#sentimentKPIs"), so = $("#chSentOverall"), st = $("#chSentTrend"),
          sth = $("#chSentTheme"), sln = $("#chSentLine"), pp = $("#painPoints"),
          ri = $("#resolvedIssues"), sc = $("#sentByContrib");
    if (!sk || !so) return;

    const sentiments = playerObs.map(o => getSentiment(o));
    const pos = sentiments.filter(s => s > 0).length;
    const neg = sentiments.filter(s => s < 0).length;
    const neu = sentiments.filter(s => s === 0).length;
    const avg = sentiments.length ? (sentiments.reduce((a,b) => a+b, 0) / sentiments.length).toFixed(2) : "0";

    // KPIs
    sk.innerHTML = `<div class="kpi"><div class="num">${avg}</div><div class="lab">Net sentiment</div><div class="sub">−1 to +1 scale</div></div>
      <div class="kpi"><div class="num" style="color:var(--sev-pres)">${pos}</div><div class="lab">Positive</div><div class="sub">${sentiments.length ? (pos/sentiments.length*100).toFixed(0) : 0}%</div></div>
      <div class="kpi"><div class="num">${neu}</div><div class="lab">Neutral</div><div class="sub">${sentiments.length ? (neu/sentiments.length*100).toFixed(0) : 0}%</div></div>
      <div class="kpi"><div class="num" style="color:var(--sev-crit)">${neg}</div><div class="lab">Negative</div><div class="sub">${sentiments.length ? (neg/sentiments.length*100).toFixed(0) : 0}%</div></div>`;

    // Overall doughnut
    [window._sentO, window._sentT, window._sentTh, window._sentL].forEach(c => { if (c) c.destroy(); });
    if (sentiments.length && so) {
      window._sentO = new Chart(so, { type:"doughnut", data:{ labels:["Positive","Neutral","Negative"], datasets:[{ data:[pos,neu,neg], backgroundColor:[C.pres,C.gap,C.crit], borderColor:"transparent", borderRadius:4 }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12,boxHeight:12,padding:14,font:{ size:11 },color:C.mut } } } } });
    }

    // Per-playtest bar chart with net score overlay
    if (sessions && sessions.length && st) {
      const labels = sessions.map(s => s.label.split("—")[0] || s.label);
      const pData = sessions.map(s => { const r = s.rows.filter(x => x.priority !== "Context"); return r.filter(x => getSentiment(x) > 0).length; });
      const nData = sessions.map(s => { const r = s.rows.filter(x => x.priority !== "Context"); return r.filter(x => getSentiment(x) < 0).length; });
      const uData = sessions.map(s => { const r = s.rows.filter(x => x.priority !== "Context"); return r.filter(x => getSentiment(x) === 0).length; });
      const netData = sessions.map(s => { const r = s.rows.filter(x => x.priority !== "Context"); const sents = r.map(x => getSentiment(x)); return sents.length ? (sents.reduce((a,b)=>a+b,0)).toFixed(1) : 0; });
      window._sentT = new Chart(st, { type:"bar", data:{ labels, datasets:[
        { label:"Positive", data:pData, backgroundColor:C.pres, borderRadius:4, stack:"sent" },
        { label:"Neutral", data:uData, backgroundColor:C.gap, borderRadius:4, stack:"sent" },
        { label:"Negative", data:nData, backgroundColor:C.crit, borderRadius:4, stack:"sent" }
      ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12,boxHeight:12,padding:14,font:{ size:11 },color:C.mut } } },
        scales:{ x:{ stacked:true, grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:10 } } }, y:{ stacked:true, beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } } } } });
    }

    // Sentiment by theme
    if (sth && playerObs.length) {
      const themeSent = {};
      playerObs.forEach(o => {
        const t = o.theme || "Other";
        if (!themeSent[t]) themeSent[t] = { pos:0, neg:0, neu:0 };
        const s = getSentiment(o);
        if (s > 0) themeSent[t].pos++;
        else if (s < 0) themeSent[t].neg++;
        else themeSent[t].neu++;
      });
      const entries = Object.entries(themeSent).sort((a,b) => (b[1].neg - b[1].pos) - (a[1].neg - a[1].pos)).slice(0, 8);
      window._sentTh = new Chart(sth, { type:"bar", data:{ labels:entries.map(e=>e[0]), datasets:[
        { label:"Positive", data:entries.map(e=>e[1].pos), backgroundColor:C.pres, borderRadius:4 },
        { label:"Negative", data:entries.map(e=>e[1].neg), backgroundColor:C.crit, borderRadius:4 }
      ] }, options:{ indexAxis:"y", responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom", labels:{ boxWidth:12,boxHeight:12,padding:14,font:{ size:11 },color:C.mut } } },
        scales:{ x:{ stacked:false, beginAtZero:true, ticks:{ stepSize:1 }, grid:{ color:C.grid }, border:{ color:C.border } }, y:{ grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:10 } } } } } });
    }

    // Daily sentiment line chart
    if (sln && playerObs.length) {
      const dayMap = {};
      playerObs.forEach(o => {
        const d = (o.timestamp || "").slice(0, 10);
        if (d) { if (!dayMap[d]) dayMap[d] = []; dayMap[d].push(getSentiment(o)); }
      });
      const days = Object.keys(dayMap).sort();
      if (days.length > 1) {
        const dayAvgs = days.map(d => (dayMap[d].reduce((a,b)=>a+b,0) / dayMap[d].length).toFixed(2));
        window._sentL = new Chart(sln, { type:"line", data:{ labels:days.map(d => { const p=d.split("-"); return p[1]+"/"+p[2]; }), datasets:[
          { label:"Daily avg", data:dayAvgs, borderColor:C.accent, backgroundColor:"rgba(210,75,216,.1)", fill:true, tension:.3, pointRadius:3, pointBackgroundColor:C.accent }
        ] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
          scales:{ x:{ grid:{ display:false }, border:{ color:C.border }, ticks:{ color:C.text, font:{ size:10 } } }, y:{ min:-1, max:1, ticks:{ stepSize:.5 }, grid:{ color:C.grid }, border:{ color:C.border } } } } });
      }
    }

    // Top pain points
    if (pp && playerObs.length) {
      const themeNeg = {};
      playerObs.filter(o => getSentiment(o) < 0).forEach(o => {
        if (!themeNeg[o.theme]) themeNeg[o.theme] = { count:0, examples:[] };
        themeNeg[o.theme].count++;
        if (themeNeg[o.theme].examples.length < 2) themeNeg[o.theme].examples.push(o.excerpt.slice(0, 80));
      });
      const top = Object.entries(themeNeg).sort((a,b) => b[1].count - a[1].count).slice(0, 5);
      pp.innerHTML = top.length ? top.map(([t, d]) => `<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)"><strong style="color:var(--text)">${escHtml(t)}</strong> <span style="color:var(--sev-crit);font-size:12px">${d.count} neg</span><div style="color:var(--text-mut);font-size:12px;margin-top:3px">${d.examples.map(e => `"${escHtml(e)}"`).join("<br>")}</div></div>`).join("") : '<div style="color:var(--text-mut);font-size:13px">No pain points detected.</div>';
    }

    // Resolved issues: compare each playtest against the NEXT one
    if (ri && sessions && sessions.length > 1) {
      let html = "";
      for (let i = 0; i < sessions.length - 1; i++) {
        const curr = sessions[i], next = sessions[i+1];
        const currCrit = curr.rows.filter(r => (r.priority||r.severity) === "Critical" || (r.priority||r.severity) === "High");
        const nextIds = new Set(next.rows.map(r => r.id || r.message_id));
        const resolved = currCrit.filter(r => !nextIds.has(r.id||r.message_id) && r.excerpt);
        if (resolved.length) {
          html += `<div style="margin-bottom:8px"><strong style="color:var(--sev-pres);font-size:12px">${resolved.length} issue${resolved.length>1?'s':''} from ${curr.label.split("—")[0]} not seen in ${next.label.split("—")[0]}</strong>`;
          resolved.slice(0,3).forEach(r => { html += `<div style="color:var(--text-mut);font-size:12px;margin:4px 0 0 12px">· ${escHtml((r.excerpt||"").slice(0,100))}</div>`; });
          html += `</div>`;
        }
      }
      ri.innerHTML = html || '<div style="color:var(--text-mut);font-size:13px">No resolved issues detected. Run more playtests to compare.</div>';
    }

    // Sentiment by contributor
    if (sc && playerObs.length) {
      const contrib = {};
      playerObs.forEach(o => {
        if (!contrib[o.speaker]) contrib[o.speaker] = { pos:0, neg:0, neu:0 };
        const s = getSentiment(o);
        if (s > 0) contrib[o.speaker].pos++;
        else if (s < 0) contrib[o.speaker].neg++;
        else contrib[o.speaker].neu++;
      });
      const entries = Object.entries(contrib).sort((a,b) => {
        const sa = a[1].pos - a[1].neg, sb = b[1].pos - b[1].neg;
        return sb - sa;
      });
      sc.innerHTML = entries.map(([name, d]) => {
        const total = d.pos + d.neu + d.neg;
        const net = d.pos - d.neg;
        return `<tr><td style="color:var(--text);font-weight:600">${escHtml(name)}</td><td style="color:${net>=0?'var(--sev-pres)':'var(--sev-crit)'};font-weight:600">${net>=0?'+':''}${net}</td><td>${d.pos}</td><td>${d.neu}</td><td>${d.neg}</td><td>${total}</td></tr>`;
      }).join("") || '<tr><td colspan="6" style="color:var(--text-mut);text-align:center;padding:12px">No data</td></tr>';
    }
  }

  function renderActionsFromAI(recJson, playerObs) {
    const actI = $("#actImm"), actN = $("#actNear"), sl = $("#surveyList");
    if (!actI || !actN) return;
    actI.innerHTML = ""; actN.innerHTML = "";

    // Try to parse AI-generated recommendations
    let actions = [];
    if (recJson) {
      try {
        const clean = recJson.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length) actions = parsed;
      } catch (_) {}
    }

    // Fallback: auto-generate from critical/high observations
    if (!actions.length && playerObs.length) {
      playerObs.filter(o => o.severity === "Critical").forEach(o => actions.push({ priority: "Immediate", text: `Investigate: ${o.excerpt.slice(0, 150)}`, theme: o.theme }));
      playerObs.filter(o => o.severity === "High").slice(0, 5).forEach(o => actions.push({ priority: "Near term", text: `Address: ${o.excerpt.slice(0, 150)}`, theme: o.theme }));
    }
    if (!actions.length) actions.push({ priority: "Near term", text: "No issues to action yet. Run a scan first.", theme: "Setup" });

    let iN = 0, nN = 0;
    actions.forEach(a => {
      const li = el("li", "", `${a.text}<span class="th">${a.theme||""}</span>`);
      if (a.priority === "Immediate") { li.dataset.n = (++iN); actI.appendChild(li); }
      else { li.dataset.n = (++nN); actN.appendChild(li); }
    });

    if (sl) {
      const qs = [];
      const themes = new Set(playerObs.map(o => o.theme));
      if (themes.has("Onboarding & Quest Sequencing")) qs.push("Was the tutorial clear? Did you know what to do at the start?");
      if (themes.has("Progression & Resources")) qs.push("How did the resource and leveling pace feel?");
      if (themes.has("Combat & Equipment")) qs.push("How did combat feel once properly equipped?");
      if (themes.has("Inventory & Placement")) qs.push("Did any items get stuck or were unplaceable?");
      if (themes.has("Bugs & Polish")) qs.push("What was the most disruptive bug you encountered?");
      if (playerObs.some(o => o.severity === "Critical")) qs.push("What prevented you from progressing the most?");
      sl.innerHTML = qs.length ? qs.map(q => `<li>${q}</li>`).join("") : "<li>Run a scan to generate targeted survey questions.</li>";
    }
  }

  function bindDashboardFilters(playerObs, staff, engagement, channels, latestInsights, latestRecommendations) {
    const ptFilter = $("#ptFilter"), chFilter = $("#chFilter"), dFrom = $("#dFrom"), dTo = $("#dTo"), btnRst = $("#btnRst");

    function applyAndRender() {
      const ptVal = ptFilter?.value || "all";
      const chVal = chFilter?.value || "all";
      const from = dFrom?.value || "";
      const to = dTo?.value || "";

      let fObs = playerObs, fStaff = staff, fEng = engagement;

      // Save unfiltered for ledger
      const fObsRaw = fObs, fStaffRaw = fStaff, fEngRaw = fEng;

      // Playtest filter — filter by whether row is in the session
      if (ptVal !== "all" && currentSessions[parseInt(ptVal)]) {
        const session = currentSessions[parseInt(ptVal)];
        const sessionIds = new Set(session.rows.map(r => r.id || r.message_id).filter(Boolean));
        if (sessionIds.size > 0) {
          fObs = fObs.filter(o => sessionIds.has(o.id || o.message_id));
          fStaff = fStaff.filter(s => sessionIds.has(s.id || s.message_id));
          fEng = fEng.filter(e => sessionIds.has(e.id || e.message_id));
        } else {
          // Fallback: timestamp range
          const sStart = new Date(session.rows[0]?._ts || 0);
          const sEnd = new Date(session.lastTs);
          fObs = fObs.filter(o => { const t = new Date(o.timestamp); return t >= sStart && t <= sEnd; });
          fStaff = fStaff.filter(s => { const t = new Date(s.timestamp); return t >= sStart && t <= sEnd; });
          fEng = fEng.filter(e => { const t = new Date(e.timestamp); return t >= sStart && t <= sEnd; });
        }
      }

      // Channel/date filter
      fObs = fObs.filter(o => {
        if (chVal !== "all" && o.channel_id !== chVal) return false;
        if (from && o.timestamp < from + "T00:00:00Z") return false;
        if (to && o.timestamp > to + "T23:59:59Z") return false;
        return true;
      });
      fStaff = fStaff.filter(s => {
        if (chVal !== "all" && s.channel_id !== chVal) return false;
        if (from && s.timestamp < from + "T00:00:00Z") return false;
        if (to && s.timestamp > to + "T23:59:59Z") return false;
        return true;
      });
      fEng = fEng.filter(e => {
        if (chVal !== "all" && e.channel_id !== chVal) return false;
        if (from && e.timestamp < from + "T00:00:00Z") return false;
        if (to && e.timestamp > to + "T23:59:59Z") return false;
        return true;
      });

      const sp = new Set(fObs.map(o => o.speaker));
      const kp1 = $("#kp1"); if (kp1) kp1.textContent = sp.size || "—";
      const kp2 = $("#kp2"); if (kp2) kp2.textContent = fObs.length || "—";
      const kp3 = $("#kp3"); if (kp3) kp3.textContent = fStaff.length || "—";
      const kp4 = $("#kp4"); if (kp4) kp4.textContent = fEng.length || "—";

      // Ledger gets only channel/date filtered data (not playtest-filtered)
      const ledgerObs = fObsRaw.filter(o => { if (chVal !== "all" && o.channel_id !== chVal) return false; if (from && o.timestamp < from + "T00:00:00Z") return false; if (to && o.timestamp > to + "T23:59:59Z") return false; return true; });
      const ledgerStaff = fStaffRaw.filter(s => { if (chVal !== "all" && s.channel_id !== chVal) return false; if (from && s.timestamp < from + "T00:00:00Z") return false; if (to && s.timestamp > to + "T23:59:59Z") return false; return true; });
      const ledgerEng = fEngRaw.filter(e => { if (chVal !== "all" && e.channel_id !== chVal) return false; if (from && e.timestamp < from + "T00:00:00Z") return false; if (to && e.timestamp > to + "T23:59:59Z") return false; return true; });

      renderCharts(fObs, fStaff, fEng);
      renderLedger(ledgerObs, ledgerStaff, ledgerEng);
      renderMatrix(fObs);
      renderInsightsFromData(latestInsights, fObs);
      renderActionsFromAI(latestRecommendations, fObs);
      renderSentiment(fObs, currentSessions);
      renderVariance("all");
    }

    ptFilter?.addEventListener("change", applyAndRender);
    chFilter?.addEventListener("change", applyAndRender);
    dFrom?.addEventListener("change", applyAndRender);
    dTo?.addEventListener("change", applyAndRender);
    btnRst?.addEventListener("click", () => {
      if (ptFilter) ptFilter.value = "all";
      if (chFilter) chFilter.value = "all";
      if (dFrom) dFrom.value = "";
      if (dTo) dTo.value = "";
      applyAndRender();
    });

    // Comparison pickers (independent of main filters)
    const cmpA = $("#cmpA"), cmpB = $("#cmpB"), cmpClr = $("#cmpClr");
    cmpA?.addEventListener("change", () => { renderVariance(cmpA.value, cmpB?.value || ""); });
    cmpB?.addEventListener("change", () => { renderVariance(cmpA?.value || "", cmpB.value); });
    cmpClr?.addEventListener("click", () => {
      if (cmpA) cmpA.value = "";
      if (cmpB) cmpB.value = "";
      renderVariance("", "");
    });
  }

  function fmtTs(iso) {
    const d = new Date(iso);
    const m = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d.getUTCDate()} ${m[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}`;
  }

  function escHtml(s) { const d = el("div"); d.textContent = s; return d.innerHTML; }
  function escAttr(s) { return s.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // ── Init ──
  window.addEventListener("DOMContentLoaded", () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      const app = $("#app-root"); if (app) app.innerHTML = `<div class="auth-container"><div class="auth-card"><h2>Configuration Required</h2><p>Set SUPABASE_URL and SUPABASE_ANON_KEY in assets/app.js to connect to your Supabase project.</p></div></div>`;
      return;
    }

    supabase = (window).supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!supabase) {
      console.error("Supabase client not loaded. Add <script src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js'> to index.html");
      return;
    }

    // Listen for auth changes
    supabase.auth.onAuthStateChange((_event, s) => {
      session = s;
      if (s?.user) {
        showApp(s.user);
      } else {
        showAuth();
      }
    });

    // Check initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      session = s;
      if (s?.user) showApp(s.user);
      else showAuth();
    });
  });
})();
