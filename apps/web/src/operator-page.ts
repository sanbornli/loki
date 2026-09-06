import {
  type ProductPageConfig,
  renderProductPage,
} from "./product-theme.js";

const pageStyles = `
  .operator-shell { min-height: 100vh; }
  .wordmark { font-weight: 760; letter-spacing: -.03em; text-decoration: none; }
  .operator-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2rem;
    padding: 1.25rem var(--space);
    border-bottom: 1px solid var(--line);
  }
  .operator-header-actions { display: flex; align-items: center; gap: 1rem; }
  .operator-role {
    color: var(--amber);
    font-size: .72rem;
    letter-spacing: .14em;
    text-transform: uppercase;
  }
  .auth-layout {
    display: grid;
    min-height: calc(100vh - 7rem);
    grid-template-columns: minmax(0, 1.2fr) minmax(21rem, .8fr);
    gap: clamp(2.5rem, 5vw, 5rem);
    align-items: center;
    min-height: calc(100vh - 6rem);
    padding-block: clamp(3rem, 7vw, 6rem);
  }
  .auth-intro h1 {
    max-width: 9ch;
    margin: .4rem 0 1.5rem;
    font-size: clamp(2.8rem, 5.5vw, 5.4rem);
    font-weight: 470;
    letter-spacing: -.06em;
    line-height: 1;
  }
  .auth-intro p:last-child { max-width: 34rem; color: var(--muted); line-height: 1.65; }
  .auth-card { padding: clamp(1.5rem, 4vw, 2.5rem); border: 1px solid var(--line); background: var(--ink-raised); }
  .auth-card h2 { margin: 0 0 .6rem; font-weight: 520; }
  .auth-card > p { margin: 0 0 2rem; color: var(--muted); line-height: 1.55; }
  .form-stack { display: grid; gap: 1.1rem; }
  .form-stack label {
    display: block;
    margin-bottom: .55rem;
    color: var(--muted);
    font-size: .72rem;
    font-weight: 680;
    letter-spacing: .07em;
    text-transform: uppercase;
  }
  .form-stack input {
    width: 100%;
    min-height: 3.15rem;
    padding: .72rem .82rem;
    border: 1px solid var(--line-strong);
    border-radius: 0;
    background: #0c0c09;
    color: var(--paper);
  }
  .form-stack input:focus { border-color: var(--amber); outline: 1px solid var(--amber); }
  .form-stack button { margin-top: .5rem; }
  .form-message { min-height: 1.5rem; margin: 1rem 0 0; color: var(--danger); line-height: 1.5; }
  .access-denied {
    max-width: 44rem;
    margin: clamp(5rem, 15vh, 10rem) auto;
    padding: clamp(2rem, 5vw, 4rem);
    border: 1px solid var(--danger);
    background: var(--ink-raised);
  }
  .access-denied h1 { margin: .4rem 0 1rem; font-size: clamp(2.4rem, 5vw, 4.6rem); font-weight: 480; }
  .access-denied p { color: var(--muted); line-height: 1.65; }
  .console { padding-block: clamp(3rem, 7vw, 6rem); }
  .console-intro {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 2rem;
    margin-bottom: clamp(3rem, 8vw, 7rem);
  }
  .console-intro h1 {
    max-width: 12ch;
    margin: .4rem 0 0;
    font-size: clamp(2.75rem, 5vw, 5rem);
    font-weight: 470;
    letter-spacing: -.06em;
    line-height: 1;
  }
  .console-status { max-width: 26rem; color: var(--muted); line-height: 1.55; }
  .console-section { padding-block: clamp(2.5rem, 6vw, 5rem); border-top: 1px solid var(--line); }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 2rem;
    margin-bottom: 2rem;
  }
  .section-heading h2 { margin: 0; font-size: 1.45rem; font-weight: 520; }
  .section-heading p { margin: 0; color: var(--muted); }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    border: 1px solid var(--line);
    background: var(--line);
  }
  .metric {
    min-height: 10rem;
    padding: 1.4rem;
    background: var(--ink-raised);
  }
  .metric dt { color: var(--muted); font-size: .8rem; text-transform: uppercase; letter-spacing: .1em; }
  .metric dd { margin: 2rem 0 0; font-size: clamp(1.7rem, 3vw, 2.6rem); letter-spacing: -.035em; }
  .data-list { border: 1px solid var(--line); }
  .data-row {
    display: grid;
    grid-template-columns: minmax(13rem, 1.4fr) minmax(8rem, .7fr) minmax(11rem, 1fr) auto;
    gap: 1.5rem;
    align-items: center;
    min-height: 5.5rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--line);
  }
  .data-row:first-child { border-top: 0; }
  .data-row h3 { margin: 0 0 .35rem; font-size: 1rem; font-weight: 520; }
  .data-row p, .data-row time { margin: 0; color: var(--muted); font-size: .88rem; }
  .state {
    width: fit-content;
    padding: .32rem .55rem;
    border: 1px solid var(--line-strong);
    font-size: .72rem;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .state-suspended { border-color: var(--danger); color: var(--danger); }
  .provider-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--line); background: var(--line); }
  .provider { min-height: 8rem; padding: 1.25rem; background: var(--ink-raised); }
  .provider h3 { margin: 0 0 1.5rem; font-size: 1rem; font-weight: 520; }
  .provider p { margin: 0; color: var(--muted); }
  .empty-state, .loading-state {
    min-height: 8rem;
    margin: 0;
    padding: 1.5rem;
    color: var(--muted);
    border: 1px solid var(--line);
    line-height: 1.6;
  }
  .error-banner {
    margin-bottom: 2rem;
    padding: 1rem 1.25rem;
    border: 1px solid var(--danger);
    color: var(--danger);
  }
  @media (max-width: 900px) {
    .auth-layout {
      grid-template-columns: 1fr;
      gap: 2.5rem;
      min-height: auto;
      padding-block: 3rem;
    }
    .auth-intro h1 {
      font-size: clamp(2.75rem, 9vw, 3.8rem);
      line-height: 1.02;
    }
    .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .provider-grid { grid-template-columns: 1fr; }
    .data-row { grid-template-columns: 1fr auto; }
    .data-row > :nth-child(3) { grid-column: 1 / -1; }
  }
  @media (max-width: 560px) {
    .operator-header, .console-intro, .section-heading { align-items: flex-start; flex-direction: column; }
    .operator-header-actions { width: 100%; justify-content: space-between; }
    .metric-grid { grid-template-columns: 1fr; }
    .data-row { grid-template-columns: 1fr; }
  }
`;

const body = `
  <div class="operator-shell">
    <header class="operator-header">
      <a class="wordmark" href="/" aria-label="Loki home">LOKI</a>
      <div class="operator-header-actions">
        <span class="operator-role">Operator console</span>
        <button class="button button-quiet" id="logout" type="button" hidden>Log out</button>
      </div>
    </header>

    <main class="page-shell">
      <section class="auth-layout" id="auth-view" aria-labelledby="auth-title">
        <div class="auth-intro">
          <p class="eyebrow">Internal operations</p>
          <h1 id="auth-title">Platform truth, clearly stated.</h1>
          <p>Restricted access for Loki operators. Provider status and operational records appear only when reported by the control plane.</p>
        </div>
        <div class="auth-card">
          <h2>Operator sign in</h2>
          <p>Use your authorized Supabase account.</p>
          <form class="form-stack" id="login-form">
            <div>
              <label for="operator-email">Email</label>
              <input id="operator-email" name="email" type="email" autocomplete="username" required>
            </div>
            <div>
              <label for="operator-password">Password</label>
              <input id="operator-password" name="password" type="password" autocomplete="current-password" required>
            </div>
            <button class="button button-primary" id="login-submit" type="submit">Sign in</button>
          </form>
          <p class="form-message" id="login-message" role="alert"></p>
        </div>
      </section>

      <section class="access-denied" id="denied-view" hidden aria-labelledby="denied-title">
        <p class="eyebrow">Access denied</p>
        <h1 id="denied-title">This account is not an operator.</h1>
        <p>Your authentication succeeded, but the Loki API did not authorize access to operator data. No platform information has been shown.</p>
        <button class="button button-primary" id="denied-logout" type="button">Return to sign in</button>
      </section>

      <div class="console" id="console-view" hidden>
        <div class="console-intro">
          <div>
            <p class="eyebrow">Operations / Overview</p>
            <h1>System state, without assumptions.</h1>
          </div>
          <p class="console-status" id="overview-status" role="status">Loading operator overview…</p>
        </div>
        <div class="error-banner" id="console-error" role="alert" hidden></div>

        <section class="console-section" aria-labelledby="metrics-title">
          <div class="section-heading">
            <h2 id="metrics-title">Platform metrics</h2>
            <p>Values reported by the API.</p>
          </div>
          <dl class="metric-grid" id="metrics-grid">
            <div class="loading-state">Loading metrics…</div>
          </dl>
        </section>

        <section class="console-section" id="providers-section" hidden aria-labelledby="providers-title">
          <div class="section-heading">
            <h2 id="providers-title">Provider health</h2>
            <p>Reported checks only.</p>
          </div>
          <div class="provider-grid" id="providers-grid"></div>
        </section>

        <section class="console-section" aria-labelledby="projects-title">
          <div class="section-heading">
            <h2 id="projects-title">Projects and states</h2>
            <p>Suspension controls are audited server-side.</p>
          </div>
          <div class="data-list" id="projects-list" aria-live="polite" aria-busy="true">
            <p class="loading-state">Loading projects…</p>
          </div>
        </section>

        <section class="console-section" aria-labelledby="audit-title">
          <div class="section-heading"><h2 id="audit-title">Audit events</h2></div>
          <div class="data-list" id="audit-list"></div>
        </section>

        <section class="console-section" aria-labelledby="moderation-title">
          <div class="section-heading"><h2 id="moderation-title">Moderation queue</h2></div>
          <div class="data-list" id="moderation-list"></div>
        </section>

        <section class="console-section" aria-labelledby="incidents-title">
          <div class="section-heading"><h2 id="incidents-title">Incidents</h2></div>
          <div class="data-list" id="incidents-list"></div>
        </section>
      </div>
    </main>
  </div>
`;

const script = `
  const config = productConfig;
  const apiOrigin = String(config?.apiOrigin || "").replace(/\\/$/, "");
  const supabaseUrl = String(config?.supabaseUrl || "").replace(/\\/$/, "");
  const supabaseAnonKey = String(config?.supabaseAnonKey || "");
  const sessionKey = "loki.operator.session.v1";

  const authView = document.querySelector("#auth-view");
  const deniedView = document.querySelector("#denied-view");
  const consoleView = document.querySelector("#console-view");
  const logoutButton = document.querySelector("#logout");
  const loginForm = document.querySelector("#login-form");
  const loginSubmit = document.querySelector("#login-submit");
  const loginMessage = document.querySelector("#login-message");
  const overviewStatus = document.querySelector("#overview-status");
  const consoleError = document.querySelector("#console-error");
  const metricsGrid = document.querySelector("#metrics-grid");
  const providersSection = document.querySelector("#providers-section");
  const providersGrid = document.querySelector("#providers-grid");
  const projectsList = document.querySelector("#projects-list");
  const auditList = document.querySelector("#audit-list");
  const moderationList = document.querySelector("#moderation-list");
  const incidentsList = document.querySelector("#incidents-list");

  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function display(value, fallback = "Not reported") {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return fallback;
  }

  function label(value) {
    return String(value)
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  function empty(message) {
    const element = document.createElement("p");
    element.className = "empty-state";
    element.textContent = message;
    return element;
  }

  function readSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      return session && typeof session.access_token === "string" ? session : null;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    sessionStorage.setItem(sessionKey, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type
    }));
  }

  function clearSession() {
    sessionStorage.removeItem(sessionKey);
  }

  function showAuth() {
    authView.hidden = false;
    deniedView.hidden = true;
    consoleView.hidden = true;
    logoutButton.hidden = true;
  }

  function showDenied() {
    authView.hidden = true;
    deniedView.hidden = false;
    consoleView.hidden = true;
    logoutButton.hidden = false;
  }

  function showConsole() {
    authView.hidden = true;
    deniedView.hidden = true;
    consoleView.hidden = false;
    logoutButton.hidden = false;
  }

  async function api(path, options = {}) {
    const session = readSession();
    if (!session) throw new Error("Authentication required");
    const response = await fetch(apiOrigin + path, {
      ...options,
      headers: {
        accept: "application/json",
        authorization: "Bearer " + session.access_token,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    if (response.status === 401 || response.status === 403) {
      const error = new Error("Access denied");
      error.accessDenied = true;
      throw error;
    }
    if (!response.ok) {
      let message = "Request failed";
      try { message = display((await response.json()).error, message); } catch {}
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function renderMetrics(value) {
    const metrics = record(value);
    const entries = Object.entries(metrics).filter(([, metric]) =>
      ["string", "number", "boolean"].includes(typeof metric)
    );
    metricsGrid.replaceChildren();
    if (!entries.length) {
      metricsGrid.append(empty("No platform metrics were reported."));
      return;
    }
    for (const [name, value] of entries) {
      const item = document.createElement("div");
      item.className = "metric";
      const term = document.createElement("dt");
      term.textContent = label(name);
      const detail = document.createElement("dd");
      detail.textContent = display(value);
      item.append(term, detail);
      metricsGrid.append(item);
    }
  }

  function providerEntries(value) {
    if (Array.isArray(value)) {
      return value.map((item) => {
        const entry = record(item);
        return [display(entry.name, display(entry.provider, "Provider")), entry];
      });
    }
    return Object.entries(record(value));
  }

  function renderProviders(value) {
    const entries = providerEntries(value);
    providersGrid.replaceChildren();
    providersSection.hidden = entries.length === 0;
    for (const [name, providerValue] of entries) {
      const provider = record(providerValue);
      const card = document.createElement("article");
      card.className = "provider";
      const title = document.createElement("h3");
      title.textContent = label(name);
      const status = document.createElement("p");
      status.textContent = display(provider.status,
        display(provider.state, display(providerValue)));
      card.append(title, status);
      providersGrid.append(card);
    }
  }

  function projectArray(payload) {
    if (Array.isArray(payload)) return payload;
    const data = record(payload);
    return list(data.projects).length ? list(data.projects) : list(data.items);
  }

  function renderProjects(items) {
    projectsList.replaceChildren();
    projectsList.setAttribute("aria-busy", "false");
    if (!items.length) {
      projectsList.append(empty("No projects were returned."));
      return;
    }
    for (const raw of items) {
      const project = record(raw);
      const id = display(project.id, display(project.projectId, ""));
      const stateValue = display(project.state, "unknown").toLowerCase();
      const row = document.createElement("article");
      row.className = "data-row";

      const identity = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = display(project.name, "Untitled project");
      const identifier = document.createElement("p");
      identifier.textContent = id || "Project ID not reported";
      identity.append(name, identifier);

      const state = document.createElement("span");
      state.className = "state" + (stateValue === "suspended" ? " state-suspended" : "");
      state.textContent = stateValue;

      const detail = document.createElement("p");
      const organization = record(project.organization);
      detail.textContent = display(
        organization.name,
        display(project.organizationName, display(project.ownerEmail, "Ownership not reported"))
      );

      const control = document.createElement("button");
      control.className = stateValue === "suspended" ? "button button-primary" : "button button-quiet";
      control.type = "button";
      control.textContent = stateValue === "suspended" ? "Restore to private" : "Suspend";
      control.disabled = !id;
      control.addEventListener("click", () =>
        changeProjectState(id, stateValue === "suspended" ? "private" : "suspended", control)
      );
      row.append(identity, state, detail, control);
      projectsList.append(row);
    }
  }

  function eventArray(overview, ...keys) {
    for (const key of keys) {
      if (Array.isArray(overview[key])) return overview[key];
    }
    return [];
  }

  function renderEvents(container, items, emptyMessage) {
    container.replaceChildren();
    if (!items.length) {
      container.append(empty(emptyMessage));
      return;
    }
    for (const raw of items) {
      const event = record(raw);
      const row = document.createElement("article");
      row.className = "data-row";
      const identity = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = display(event.action,
        display(event.title, display(event.type, "Event")));
      const subject = document.createElement("p");
      subject.textContent = display(event.projectName,
        display(event.projectId, display(event.id, "No subject reported")));
      identity.append(title, subject);
      const status = document.createElement("span");
      status.className = "state";
      status.textContent = display(event.status, display(event.severity, "recorded"));
      const detail = document.createElement("p");
      detail.textContent = display(event.summary, display(event.description, "No detail reported"));
      const time = document.createElement("time");
      const timestamp = display(event.occurredAt,
        display(event.createdAt, display(event.updatedAt, "")));
      time.textContent = timestamp ? new Date(timestamp).toLocaleString() : "Time not reported";
      if (timestamp) time.dateTime = timestamp;
      row.append(identity, status, detail, time);
      container.append(row);
    }
  }

  async function changeProjectState(id, state, button) {
    if (!id) return;
    button.disabled = true;
    consoleError.hidden = true;
    try {
      await api("/v1/operator/projects/" + encodeURIComponent(id) + "/state", {
        method: "PATCH",
        body: JSON.stringify({ state })
      });
      await loadOperatorData();
    } catch (error) {
      if (error.accessDenied) {
        showDenied();
        return;
      }
      consoleError.textContent = error instanceof Error ? error.message : "State change failed.";
      consoleError.hidden = false;
      button.disabled = false;
    }
  }

  async function loadOperatorData() {
    showConsole();
    overviewStatus.textContent = "Loading operator overview…";
    consoleError.hidden = true;
    projectsList.setAttribute("aria-busy", "true");
    try {
      const [overviewPayload, projectsPayload] = await Promise.all([
        api("/v1/operator/overview"),
        api("/v1/operator/projects")
      ]);
      const overview = record(overviewPayload);
      const metrics = { ...record(overview.counts || overview.metrics) };
      for (const stateCount of list(overview.projectsByState)) {
        const entry = record(stateCount);
        if (typeof entry.state === "string") {
          metrics["projects " + entry.state] = entry.count;
        }
      }
      renderMetrics(metrics);
      renderProviders(overview.providerHealth || overview.providers);
      renderProjects(projectArray(projectsPayload));
      renderEvents(auditList, eventArray(overview, "recentAudits", "auditEvents", "audit"),
        "No audit events were returned.");
      renderEvents(moderationList, eventArray(overview, "moderation", "moderationQueue", "reports"),
        "No moderation items were returned.");
      renderEvents(incidentsList, eventArray(overview, "incidents"),
        "No incidents were returned.");
      overviewStatus.textContent = "Operator data loaded.";
    } catch (error) {
      if (error.accessDenied) {
        overviewStatus.textContent = "";
        showDenied();
        return;
      }
      overviewStatus.textContent = "Operator data unavailable.";
      consoleError.textContent = error instanceof Error ? error.message : "The operator console could not be loaded.";
      consoleError.hidden = false;
      renderMetrics(null);
      renderProviders(null);
      projectsList.replaceChildren(empty("Projects could not be loaded."));
      projectsList.setAttribute("aria-busy", "false");
      renderEvents(auditList, [], "Audit events could not be loaded.");
      renderEvents(moderationList, [], "Moderation data could not be loaded.");
      renderEvents(incidentsList, [], "Incident data could not be loaded.");
    }
  }

  async function login(email, password) {
    const response = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        apikey: supabaseAnonKey
      },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || typeof payload.access_token !== "string") {
      throw new Error(display(payload.error_description,
        display(payload.msg, "Unable to sign in with those credentials.")));
    }
    saveSession(payload);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Signing in…";
    const data = new FormData(loginForm);
    try {
      await login(String(data.get("email") || ""), String(data.get("password") || ""));
      loginForm.reset();
      await loadOperatorData();
    } catch (error) {
      clearSession();
      loginMessage.textContent = error instanceof Error ? error.message : "Unable to sign in.";
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Sign in";
    }
  });

  function logout() {
    clearSession();
    consoleError.hidden = true;
    loginMessage.textContent = "";
    showAuth();
    document.querySelector("#operator-email").focus();
  }

  logoutButton.addEventListener("click", logout);
  document.querySelector("#denied-logout").addEventListener("click", logout);

  if (readSession()) {
    loadOperatorData();
  } else {
    showAuth();
  }
`;

export function renderOperatorPage(config: ProductPageConfig): string {
  return renderProductPage({
    config,
    title: "Operator console",
    description:
      "Restricted Loki operations console for projects, audit records, moderation, incidents, and reported provider health.",
    body,
    styles: pageStyles,
    moduleScript: script,
  });
}
