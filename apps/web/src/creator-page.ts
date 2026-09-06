import {
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

const creatorStyles = `
.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(18rem, 0.7fr);
  gap: clamp(2rem, 4vw, 4rem);
  align-items: center;
  min-height: calc(100vh - 5.25rem);
  padding: clamp(3rem, 7vh, 5.5rem) 0;
}

.auth-copy {
  align-self: center;
}

.auth-copy .display {
  max-width: 10ch;
  font-size: clamp(3rem, 6vw, 6rem);
  line-height: 1;
}

.auth-index {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  max-width: 43rem;
  margin-top: clamp(2rem, 5vh, 4rem);
  border: 1px solid var(--line);
  background: var(--line);
}

.auth-index div {
  min-height: 6.8rem;
  padding: 1rem;
  background: var(--ink);
}

.auth-index strong {
  display: block;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.67rem;
  letter-spacing: 0.1em;
}

.auth-index span {
  display: block;
  margin-top: 2rem;
  color: var(--muted);
  font-size: 0.76rem;
}

.auth-panel {
  padding: clamp(1.25rem, 3vw, 2.2rem);
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
}

.auth-panel h2 {
  margin: 0 0 0.45rem;
  font-size: 1.6rem;
  font-weight: 590;
  letter-spacing: -0.045em;
}

.auth-panel > p {
  margin: 0 0 1.8rem;
  color: var(--muted);
  font-size: 0.82rem;
}

.auth-panel .notice {
  margin-bottom: 1rem;
}

.dashboard-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(15rem, 0.65fr);
  gap: 3rem;
  align-items: end;
  min-height: 28rem;
  padding: clamp(4rem, 9vw, 9rem) 0 clamp(3rem, 6vw, 5rem);
  border-bottom: 1px solid var(--line);
}

.dashboard-hero h1 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(2.75rem, 5.5vw, 5.5rem);
  font-weight: 580;
  letter-spacing: -0.075em;
  line-height: 1;
}

.dashboard-summary {
  display: grid;
  gap: 1rem;
  align-content: end;
}

.metric {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  padding: 0.85rem 0;
  border-bottom: 1px solid var(--line);
}

.metric span {
  color: var(--muted);
  font-size: 0.73rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.metric strong {
  font-family: var(--mono);
  font-size: 1rem;
  font-weight: 500;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(16rem, 0.62fr) minmax(0, 1.75fr);
  gap: clamp(2rem, 6vw, 7rem);
  padding-top: clamp(3rem, 7vw, 6rem);
}

.workspace-aside {
  align-self: start;
  position: sticky;
  top: 2rem;
}

.workspace-aside h2 {
  max-width: 11ch;
  margin: 0;
  font-size: clamp(2rem, 3.5vw, 3.8rem);
  font-weight: 570;
  letter-spacing: -0.055em;
  line-height: 1;
}

.workspace-aside p {
  max-width: 25rem;
  margin: 1.2rem 0 1.8rem;
  color: var(--muted);
}

.workspace-main {
  min-width: 0;
}

.onboarding-card {
  max-width: 42rem;
  padding: clamp(1.5rem, 4vw, 3rem);
  border: 1px solid var(--amber);
}

.onboarding-card h2 {
  margin: 0;
  font-size: clamp(1.8rem, 4vw, 3.5rem);
  font-weight: 570;
  letter-spacing: -0.055em;
  line-height: 1;
}

.onboarding-card > p {
  max-width: 32rem;
  margin: 1rem 0 2rem;
  color: var(--muted);
}

.create-project {
  margin-bottom: clamp(3rem, 7vw, 6rem);
  padding: clamp(1.2rem, 3vw, 2rem);
  border: 1px solid var(--line);
}

.create-project summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 720;
  letter-spacing: 0.09em;
  list-style: none;
  text-transform: uppercase;
}

.create-project summary::-webkit-details-marker {
  display: none;
}

.create-project summary::after {
  color: var(--amber);
  content: "+";
  font-family: var(--mono);
  font-size: 1.3rem;
  font-weight: 400;
}

.create-project[open] summary::after {
  content: "−";
}

.create-project form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
}

.create-project .field:first-child,
.create-project .form-actions,
.create-project .notice {
  grid-column: 1 / -1;
}

.project-list {
  display: grid;
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.project-card {
  min-width: 0;
  padding: clamp(1.25rem, 3vw, 2.1rem);
  background: var(--ink);
}

.project-topline {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: start;
}

.project-kicker {
  margin: 0 0 0.6rem;
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.64rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.project-name {
  overflow-wrap: anywhere;
  margin: 0;
  font-size: clamp(1.7rem, 3.3vw, 3.1rem);
  font-weight: 570;
  letter-spacing: -0.055em;
  line-height: 1;
}

.project-slug {
  overflow-wrap: anywhere;
  margin: 0.7rem 0 0;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.72rem;
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.2rem;
  margin: 1.8rem 0 0;
  padding: 1rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  color: var(--quiet);
  font-size: 0.69rem;
}

.project-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.25rem;
}

.project-tools {
  display: grid;
  gap: 1.5rem;
  margin-top: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line-strong);
}

.integration-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 0.55fr);
  gap: 2rem;
  padding: clamp(1rem, 2.5vw, 1.6rem);
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
}

.integration-copy h4 {
  margin: 0 0 0.35rem;
  color: var(--amber);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.integration-copy h5 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 590;
  letter-spacing: -0.035em;
}

.integration-copy > p {
  max-width: 40rem;
  margin: 0.65rem 0 1rem;
  color: var(--muted);
  font-size: 0.74rem;
}

.integration-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.integration-status {
  display: grid;
  gap: 0.7rem;
  align-content: start;
  margin: 0;
}

.integration-status div {
  display: grid;
  gap: 0.2rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--line);
}

.integration-status dt {
  color: var(--quiet);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.integration-status dd {
  overflow-wrap: anywhere;
  margin: 0;
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.69rem;
}

.integration-status a {
  color: var(--amber);
}

.tool-panel {
  min-width: 0;
}

.tool-panel h4 {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.tool-panel > p {
  margin: 0 0 1.2rem;
  color: var(--quiet);
  font-size: 0.73rem;
}

.deployment-list {
  display: grid;
  gap: 0;
  margin: 1rem 0 0;
  padding: 0;
  border-top: 1px solid var(--line);
  list-style: none;
}

.deployment {
  display: grid;
  gap: 0.45rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--line);
}

.deployment-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.deployment-id {
  overflow-wrap: anywhere;
  color: var(--paper);
  font-family: var(--mono);
  font-size: 0.69rem;
}

.deployment-meta,
.deployment-hash {
  overflow-wrap: anywhere;
  margin: 0;
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.63rem;
}

.finding-list {
  display: grid;
  gap: 0.35rem;
  margin: 0.4rem 0 0;
  padding-left: 1.1rem;
  color: var(--muted);
  font-size: 0.7rem;
}

@media (max-width: 55rem) {
  .auth-layout {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 2.5rem;
    min-height: auto;
    padding: 3rem 0;
  }

  .auth-copy .display {
    font-size: clamp(2.75rem, 9vw, 3.8rem);
    line-height: 1.02;
  }

  .auth-index {
    display: none;
  }

  .auth-panel {
    max-width: 34rem;
  }

  .dashboard-hero,
  .workspace {
    grid-template-columns: 1fr;
  }

  .dashboard-hero {
    gap: 2rem;
  }

  .dashboard-summary {
    max-width: 30rem;
  }

  .workspace-aside {
    position: static;
  }
}

@media (max-width: 43rem) {
  .auth-index,
  .create-project form,
  .integration-panel {
    grid-template-columns: 1fr;
  }

  .create-project .field:first-child,
  .create-project .form-actions,
  .create-project .notice {
    grid-column: auto;
  }

  .project-topline {
    grid-template-columns: 1fr;
  }
}
`;

const pageBody = `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="/" aria-label="Loki home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span>Loki / Creator</span>
    </a>
    <p class="header-note">Independent games, released with intent</p>
    <div class="header-actions">
      <span class="account-label muted" id="account-label" hidden></span>
      <button class="button button-quiet" id="logout-button" type="button" hidden>Log out</button>
    </div>
  </header>

  <main class="page-shell" id="main-content">
    <section class="auth-layout" id="auth-view" aria-labelledby="auth-title">
      <div class="auth-copy">
        <p class="eyebrow">Editorial Studio / 03</p>
        <h1 class="display" id="auth-title">Ship the world you made.</h1>
        <p class="lede">A focused release desk for finished browser games. Create a project, connect your coding agent, and share a playable release.</p>
        <div class="auth-index" aria-label="Creator workflow">
          <div><strong>01</strong><span>Create</span></div>
          <div><strong>02</strong><span>Deploy</span></div>
          <div><strong>03</strong><span>Release</span></div>
        </div>
      </div>

      <section class="auth-panel" aria-labelledby="auth-panel-title">
        <p class="eyebrow" id="auth-mode-label">Creator access</p>
        <h2 id="auth-panel-title">Sign in</h2>
        <p id="auth-panel-copy">Continue to your projects and release history.</p>
        <div class="notice" id="auth-notice" role="status" aria-live="polite" hidden></div>
        <form class="form-grid" id="auth-form">
          <div class="field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" inputmode="email" required>
          </div>
          <div class="field">
            <label for="auth-password">Password</label>
            <input id="auth-password" name="password" type="password" autocomplete="current-password" minlength="8" required>
          </div>
          <div class="form-actions">
            <button class="button button-primary" id="auth-submit" type="submit">Sign in</button>
            <button class="text-button" id="auth-mode-button" type="button">Create account</button>
            <button class="text-button" id="resend-button" type="button">Resend confirmation</button>
          </div>
        </form>
      </section>
    </section>

    <section id="dashboard-view" hidden aria-labelledby="dashboard-title">
      <div class="dashboard-hero">
        <div>
          <p class="eyebrow">Creator desk / Live workspace</p>
          <h1 id="dashboard-title">Your release room.</h1>
        </div>
        <div class="dashboard-summary" aria-label="Workspace summary">
          <div class="metric"><span>Organizations</span><strong id="organization-count">0</strong></div>
          <div class="metric"><span>Projects</span><strong id="project-count">0</strong></div>
          <div class="metric"><span>Playable</span><strong id="playable-count">0</strong></div>
        </div>
      </div>

      <div class="status-line" id="global-status" role="status" aria-live="polite" hidden></div>
      <section class="workspace">
        <aside class="workspace-aside">
          <p class="eyebrow">Workspace</p>
          <h2>Builds become releases here.</h2>
          <p>Every deployment is preserved as an immutable record. Activation changes the live release, never its history.</p>
        </aside>

        <div class="workspace-main">
          <section class="onboarding-card" id="onboarding-view" aria-labelledby="onboarding-title" hidden>
            <p class="eyebrow">First step</p>
            <h2 id="onboarding-title">Name your studio.</h2>
            <p>Create an organization to hold projects, collaborators, and release history.</p>
            <form class="form-grid" id="organization-form">
              <div class="field">
                <label for="organization-name">Organization name</label>
                <input id="organization-name" name="name" maxlength="80" autocomplete="organization" placeholder="Studio name" required>
              </div>
              <div class="notice" id="organization-notice" role="status" aria-live="polite" hidden></div>
              <div class="form-actions">
                <button class="button button-primary" type="submit">Create organization</button>
              </div>
            </form>
          </section>

          <div id="projects-view" hidden>
            <details class="create-project" id="create-project">
              <summary>Create a new project</summary>
              <form id="project-form">
                <div class="field">
                  <label for="project-organization">Organization</label>
                  <select id="project-organization" name="organizationId" required></select>
                </div>
                <div class="field">
                  <label for="project-name">Project name</label>
                  <input id="project-name" name="name" maxlength="80" placeholder="Game title" required>
                </div>
                <div class="field">
                  <label for="project-slug">Project slug</label>
                  <input id="project-slug" name="slug" minlength="3" maxlength="48" pattern="[a-z0-9-]{3,48}" placeholder="game-title" required>
                  <p class="field-help">3–48 lowercase letters, numbers, and hyphens.</p>
                </div>
                <div class="notice" id="project-notice" role="status" aria-live="polite" hidden></div>
                <div class="form-actions">
                  <button class="button button-primary" type="submit">Create project</button>
                </div>
              </form>
            </details>

            <div class="section-label">
              <h2>Projects</h2>
              <span id="project-list-count">00 entries</span>
            </div>
            <div class="project-list" id="project-list"></div>
            <div class="empty-state" id="project-empty" hidden>
              <strong>No projects on the desk.</strong>
              <p>Create your first project, then copy its agent prompt to integrate and ship the browser build.</p>
            </div>
          </div>
        </div>
      </section>
    </section>
  </main>
`;

const creatorScript = String.raw`
    const TOKEN_KEY = "loki.creator.access-token";
    const allowedTransitions = {
      draft: ["private"],
      private: ["draft", "unlisted", "review_requested"],
      unlisted: ["private", "review_requested"],
      review_requested: ["private"],
      published: ["unlisted"],
      suspended: []
    };
    const playableStates = new Set(["private", "unlisted", "published"]);
    const state = {
      authMode: "signin",
      token: readToken(),
      overview: null,
      projects: [],
      organizations: [],
      deployments: new Map()
    };

    const byId = (id) => document.getElementById(id);
    const authView = byId("auth-view");
    const dashboardView = byId("dashboard-view");
    const logoutButton = byId("logout-button");
    const accountLabel = byId("account-label");
    const globalStatus = byId("global-status");
    const onboardingView = byId("onboarding-view");
    const projectsView = byId("projects-view");
    const projectList = byId("project-list");

    function readToken() {
      try {
        return sessionStorage.getItem(TOKEN_KEY) || "";
      } catch {
        return "";
      }
    }

    function writeToken(token) {
      state.token = token;
      try {
        if (token) sessionStorage.setItem(TOKEN_KEY, token);
        else sessionStorage.removeItem(TOKEN_KEY);
      } catch {
        // The current page can still use the in-memory session.
      }
    }

    function text(value, fallback) {
      return typeof value === "string" && value.trim() ? value : fallback;
    }

    function array(value) {
      return Array.isArray(value) ? value : [];
    }

    function element(tag, options) {
      const node = document.createElement(tag);
      if (!options) return node;
      if (options.className) node.className = options.className;
      if (options.text !== undefined) node.textContent = String(options.text);
      if (options.type) node.type = options.type;
      if (options.hidden) node.hidden = true;
      return node;
    }

    function clear(node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    }

    function showNotice(node, message, tone) {
      node.textContent = message;
      node.dataset.tone = tone || "";
      node.hidden = !message;
    }

    function setGlobalStatus(message, loading) {
      globalStatus.textContent = message;
      globalStatus.dataset.loading = loading ? "true" : "false";
      globalStatus.hidden = !message;
    }

    function setFormBusy(form, busy) {
      for (const control of form.elements) control.disabled = busy;
      form.setAttribute("aria-busy", busy ? "true" : "false");
    }

    async function responseError(response) {
      const fallback = "Request failed (" + response.status + ").";
      try {
        const data = await response.json();
        return text(data && (data.error || data.message || data.msg), fallback);
      } catch {
        return fallback;
      }
    }

    async function api(path, init) {
      if (!state.token) throw new Error("Your session has ended. Sign in again.");
      const options = Object.assign({}, init || {});
      const headers = new Headers(options.headers || {});
      headers.set("authorization", "Bearer " + state.token);
      if (options.body && !(options.body instanceof Blob) && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      options.headers = headers;
      const response = await fetch(new URL(path, productConfig.apiOrigin), options);
      if (response.status === 401 || response.status === 403) {
        signOut("Your session expired. Sign in to continue.");
        throw new Error("Your session expired.");
      }
      if (!response.ok) throw new Error(await responseError(response));
      if (response.status === 204) return null;
      return response.json();
    }

    async function supabase(path, init) {
      const options = Object.assign({}, init || {});
      const headers = new Headers(options.headers || {});
      headers.set("apikey", productConfig.supabaseAnonKey);
      headers.set("content-type", "application/json");
      options.headers = headers;
      const response = await fetch(new URL(path, productConfig.supabaseUrl), options);
      if (!response.ok) throw new Error(await responseError(response));
      return response.json();
    }

    function signOut(message) {
      writeToken("");
      state.overview = null;
      state.projects = [];
      state.organizations = [];
      state.deployments.clear();
      clear(projectList);
      dashboardView.hidden = true;
      authView.hidden = false;
      logoutButton.hidden = true;
      accountLabel.hidden = true;
      setGlobalStatus("", false);
      if (message) showNotice(byId("auth-notice"), message, "error");
      byId("auth-email").focus();
    }

    function normalizeOverview(data) {
      const organizations = array(data && data.organizations);
      if (!organizations.length && data && data.organization) organizations.push(data.organization);
      let projects = array(data && data.projects);
      if (!projects.length) {
        projects = organizations.flatMap((organization) => array(organization && organization.projects));
      }
      return {
        account: data && (data.account || data.user || data.creator),
        organizations,
        projects
      };
    }

    async function loadOverview(options) {
      const quiet = options && options.quiet;
      if (!quiet) setGlobalStatus("Loading creator workspace…", true);
      try {
        const data = await api("/v1/creator/overview");
        state.overview = normalizeOverview(data || {});
        state.organizations = state.overview.organizations;
        state.projects = state.overview.projects;
        renderDashboard();
        setGlobalStatus("", false);
      } catch (error) {
        if (!state.token) return;
        setGlobalStatus(error instanceof Error ? error.message : "Could not load the workspace.", false);
        globalStatus.dataset.tone = "error";
      }
    }

    function renderDashboard() {
      authView.hidden = true;
      dashboardView.hidden = false;
      logoutButton.hidden = false;
      const account = state.overview && state.overview.account;
      const email = text(account && account.email, "Creator account");
      accountLabel.textContent = email;
      accountLabel.hidden = false;

      byId("organization-count").textContent = String(state.organizations.length).padStart(2, "0");
      byId("project-count").textContent = String(state.projects.length).padStart(2, "0");
      byId("playable-count").textContent = String(
        state.projects.filter((project) => playableStates.has(project && project.state) && project.activeDeploymentId).length
      ).padStart(2, "0");

      const hasOrganizations = state.organizations.length > 0;
      onboardingView.hidden = hasOrganizations;
      projectsView.hidden = !hasOrganizations;
      if (!hasOrganizations) {
        byId("organization-name").focus();
        return;
      }

      renderOrganizationOptions();
      renderProjects();
    }

    function renderOrganizationOptions() {
      const select = byId("project-organization");
      const selected = select.value;
      clear(select);
      for (const organization of state.organizations) {
        const option = document.createElement("option");
        option.value = text(organization && organization.id, "");
        option.textContent = text(organization && organization.name, "Untitled organization");
        select.appendChild(option);
      }
      if ([...select.options].some((option) => option.value === selected)) {
        select.value = selected;
      }
    }

    function renderProjects() {
      clear(projectList);
      byId("project-list-count").textContent =
        String(state.projects.length).padStart(2, "0") +
        (state.projects.length === 1 ? " entry" : " entries");
      byId("project-empty").hidden = state.projects.length !== 0;
      projectList.hidden = state.projects.length === 0;
      for (const project of state.projects) {
        projectList.appendChild(createProjectCard(project));
      }
    }

    function organizationName(id) {
      const organization = state.organizations.find((item) => item && item.id === id);
      return text(organization && organization.name, "Organization");
    }

    function createProjectCard(project) {
      const projectId = text(project && project.id, "");
      const card = element("article", { className: "project-card" });
      card.dataset.projectId = projectId;

      const top = element("div", { className: "project-topline" });
      const titleGroup = element("div");
      titleGroup.appendChild(element("p", {
        className: "project-kicker",
        text: organizationName(project && project.organizationId)
      }));
      titleGroup.appendChild(element("h3", {
        className: "project-name",
        text: text(project && project.name, "Untitled project")
      }));
      titleGroup.appendChild(element("p", {
        className: "project-slug",
        text: "/" + text(project && project.slug, "project")
      }));
      const pill = element("span", {
        className: "pill",
        text: text(project && project.state, "draft").replaceAll("_", " ")
      });
      pill.dataset.state = text(project && project.state, "draft");
      top.append(titleGroup, pill);
      card.appendChild(top);

      const meta = element("div", { className: "project-meta" });
      meta.appendChild(element("span", {
        text: "Created " + formatDate(project && project.createdAt)
      }));
      meta.appendChild(element("span", {
        text: project && project.activeDeploymentId
          ? "Active release " + shortId(project.activeDeploymentId)
          : "No active release"
      }));
      card.appendChild(meta);

      const actions = element("div", { className: "project-actions" });
      const transitions = allowedTransitions[text(project && project.state, "draft")] || [];
      for (const next of transitions) {
        const button = element("button", {
          className: next === "private" && project.state === "draft"
            ? "button button-primary"
            : "button button-quiet",
          text: transitionLabel(next),
          type: "button"
        });
        button.addEventListener("click", () => transitionProject(projectId, next, button));
        actions.appendChild(button);
      }
      if (playableStates.has(project && project.state) && project && project.activeDeploymentId) {
        const link = element("a", { className: "button button-quiet", text: "Open playable release" });
        link.href = "/play/" + encodeURIComponent(projectId);
        link.target = "_blank";
        link.rel = "noopener";
        actions.appendChild(link);
      }
      const detailsButton = element("button", {
        className: "button button-quiet",
        text: "Release history",
        type: "button"
      });
      actions.appendChild(detailsButton);
      card.appendChild(actions);

      const tools = createProjectTools(project, detailsButton);
      card.appendChild(tools);
      return card;
    }

    function createProjectTools(project, detailsButton) {
      const projectId = text(project && project.id, "");
      const tools = element("div", { className: "project-tools" });
      const integrationPanel = element("section", { className: "integration-panel" });
      integrationPanel.setAttribute("aria-label", "Theme 03 integration");

      const integrationCopy = element("div", { className: "integration-copy" });
      integrationCopy.appendChild(element("h4", { text: "Theme 03 / Integration" }));
      integrationCopy.appendChild(element("h5", { text: "Connect an agent. Ship from the repository." }));
      integrationCopy.appendChild(element("p", {
        text: "The project-specific prompt gives your coding agent the official packages, platform constraints, build checks, and exact connect and ship commands."
      }));
      const integrationActions = element("div", { className: "integration-actions" });
      const promptButton = element("button", {
        className: "button button-primary",
        text: "Copy agent prompt",
        type: "button"
      });
      const idButton = element("button", {
        className: "button button-quiet",
        text: "Copy project ID",
        type: "button"
      });
      const githubButton = element("button", {
        className: "button button-quiet",
        text: "Connect GitHub",
        type: "button"
      });
      const integrationNotice = element("div", { className: "notice", hidden: true });
      integrationNotice.setAttribute("role", "status");
      integrationNotice.setAttribute("aria-live", "polite");
      promptButton.addEventListener("click", () =>
        copyWithStatus(agentPrompt(project), promptButton, integrationNotice, "Agent prompt copied.")
      );
      idButton.addEventListener("click", () =>
        copyWithStatus(projectId, idButton, integrationNotice, "Project ID copied.")
      );
      githubButton.addEventListener("click", () =>
        connectGithub(projectId, githubButton, integrationNotice)
      );
      integrationActions.append(promptButton, idButton, githubButton);
      integrationCopy.append(integrationActions, integrationNotice);

      const statusList = element("dl", { className: "integration-status" });
      appendStatus(statusList, "Integration", integrationStatus(project));
      appendStatus(statusList, "Deployment", deploymentStatus(project));
      appendStatus(statusList, "Project ID", projectId || "Unavailable");
      const playableUrl = latestPlayableUrl(project);
      const playableRow = element("div");
      playableRow.appendChild(element("dt", { text: "Latest playable URL" }));
      const playableValue = element("dd");
      if (playableUrl) {
        const playableLink = element("a", { text: playableUrl });
        playableLink.href = playableUrl;
        playableLink.target = "_blank";
        playableLink.rel = "noopener";
        playableValue.appendChild(playableLink);
      } else {
        playableValue.textContent = "Not deployed";
      }
      playableRow.appendChild(playableValue);
      statusList.appendChild(playableRow);
      integrationPanel.append(integrationCopy, statusList);

      const historyPanel = element("section", { className: "tool-panel", hidden: true });
      historyPanel.appendChild(element("h4", { text: "Immutable history" }));
      historyPanel.appendChild(element("p", {
        text: "Past releases remain unchanged when a new deployment becomes active."
      }));
      const historyStatus = element("div", { className: "status-line", hidden: true });
      historyStatus.setAttribute("role", "status");
      const history = element("div");
      historyPanel.append(historyStatus, history);
      tools.append(integrationPanel, historyPanel);

      detailsButton.addEventListener("click", async () => {
        historyPanel.hidden = !historyPanel.hidden;
        detailsButton.textContent = historyPanel.hidden ? "Release history" : "Close releases";
        detailsButton.setAttribute("aria-expanded", historyPanel.hidden ? "false" : "true");
        if (!historyPanel.hidden && !state.deployments.has(projectId)) {
          await loadDeployments(projectId, history, historyStatus);
        } else if (!historyPanel.hidden) {
          renderDeployments(project, history, state.deployments.get(projectId) || []);
        }
      });
      return tools;
    }

    function appendStatus(list, label, value) {
      const row = element("div");
      row.appendChild(element("dt", { text: label }));
      row.appendChild(element("dd", { text: value }));
      list.appendChild(row);
    }

    function integrationStatus(project) {
      return text(
        project && (
          project.integrationStatus ||
          (project.integration && project.integration.status) ||
          (project.github && project.github.status)
        ),
        "Ready to connect"
      ).replaceAll("_", " ");
    }

    function deploymentStatus(project) {
      return text(
        project && (
          project.deploymentStatus ||
          (project.latestDeployment && project.latestDeployment.status)
        ),
        project && project.activeDeploymentId ? "Active" : "Not deployed"
      ).replaceAll("_", " ");
    }

    function latestPlayableUrl(project) {
      const supplied = text(
        project && (project.latestPlayableUrl || project.playableUrl),
        ""
      );
      if (supplied) return supplied;
      if (!project || !project.activeDeploymentId || !playableStates.has(project.state)) return "";
      return new URL(
        "/play/" + encodeURIComponent(text(project.id, "")),
        window.location.origin
      ).toString();
    }

    function configuredPackageVersion() {
      return text(
        productConfig && (
          productConfig.lokiplayVersion ||
          productConfig.packageVersion
        ),
        "0.1.1"
      );
    }

    function agentPrompt(project) {
      const projectId = text(project && project.id, "");
      const projectName = text(project && project.name, "Untitled project");
      const projectSlug = text(project && project.slug, "project");
      const version = configuredPackageVersion();
      const apiUrl = String(productConfig.apiOrigin || "").replace(/\/+$/, "");
      const playerUrl = new URL(
        "/play/" + encodeURIComponent(projectId),
        window.location.origin
      ).toString();

      return [
        "Integrate and ship this repository to Loki.",
        "",
        "Project",
        "- Name: " + projectName,
        "- Slug: " + projectSlug,
        "- Project ID: " + projectId,
        "- Loki package version: " + version,
        "- Canonical API URL: " + apiUrl,
        "- Canonical player URL: " + playerUrl,
        "",
        "Use only the official packages and pin the exact version shown above:",
        "- CLI: lokiplay@" + version,
        "- Runtime SDK: @lokiplay/sdk@" + version,
        "- Optional web UI: @lokiplay/ui-web@" + version,
        "- Protocol package: @lokiplay/protocol@" + version + " (only if the SDK or existing repository directly requires it)",
        "- Agent instructions: @lokiplay/agent-instructions@" + version,
        "- MCP package: @lokiplay/mcp@" + version + " (tooling only; never ship it in the game bundle)",
        "Do not install or import @loki/*, any unofficial package named loki, or @heroiclabs/nakama-js.",
        "",
        "Repository inspection and implementation",
        "1. Inspect the repository before changing it: identify its package manager, framework, entry points, existing multiplayer/game-state architecture, scripts, and browser production output directory.",
        "2. Preserve the existing stack and UI. Add the smallest complete Loki integration using @lokiplay/sdk; add @lokiplay/ui-web only when the repository needs Loki-provided UI.",
        "3. Ensure the finished browser build contains game.json, index.html, and all required static assets. Do not ship source-only output, backend processes, secrets, creator ad scripts, or localhost dependencies.",
        "4. Use the repository's own install, typecheck, test, lint, and production-build commands. Fix integration-caused failures and verify the built output, not only source code.",
        "5. Connect this exact project, then ship from the repository:",
        "   npx lokiplay@" + version + " connect --project " + projectId,
        "   npx lokiplay@" + version + " ship",
        "",
        "Host-authoritative requirements",
        "- Loki owns identity, project and tenant boundaries, room membership, matchmaking, event sequencing, snapshots, and host migration.",
        "- Never trust, replace, or override the projectId, player identity, membership, host assignment, sequence, or snapshots returned by Loki.",
        "- Clients submit intents; the current host validates and applies authoritative state changes. Do not create a parallel authoritative backend or direct Nakama integration.",
        "- Keep replicated state JSON-compatible and use finite safe integers.",
        "- Handle reconnect snapshots, host changes, stale-update errors, disconnects, and focus release when the Loki overlay opens.",
        "- Production multiplayer must run from a Loki-hosted finished browser build.",
        "",
        "Security and approval",
        "- Do not put credentials, access tokens, deployment secrets, private keys, or environment-secret values in code, game.json, logs, commits, this prompt, or the final report.",
        "- Before any browser action that requires login, OAuth, permissions, external account access, or a deployment confirmation, pause and ask the user for explicit approval. Continue only after approval.",
        "",
        "Final report",
        "- List files changed and summarize the Loki integration.",
        "- Report the exact package versions and commands used.",
        "- Report typecheck, test, lint, production-build, connect, and ship results separately, including any command that was unavailable or skipped.",
        "- Provide the deployment ID, integration/deployment status, and latest playable URL when returned by Loki.",
        "- Call out remaining blockers or manual approval steps without exposing credentials."
      ].join("\n");
    }

    async function copyWithStatus(value, button, notice, successMessage) {
      const originalLabel = button.textContent;
      button.disabled = true;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(value);
        } else {
          const fallback = document.createElement("textarea");
          fallback.value = value;
          fallback.setAttribute("readonly", "");
          fallback.style.position = "fixed";
          fallback.style.opacity = "0";
          document.body.appendChild(fallback);
          fallback.select();
          const copied = document.execCommand("copy");
          fallback.remove();
          if (!copied) throw new Error("Copy was not available.");
        }
        button.textContent = "Copied";
        showNotice(notice, successMessage, "success");
      } catch {
        showNotice(
          notice,
          "Could not copy automatically. Check browser clipboard permission and try again.",
          "error"
        );
      } finally {
        window.setTimeout(() => {
          button.textContent = originalLabel;
          button.disabled = false;
        }, 1800);
      }
    }

    async function connectGithub(projectId, button, notice) {
      button.disabled = true;
      showNotice(notice, "Starting GitHub connection…", "");
      try {
        const path = "/v1/projects/" + encodeURIComponent(projectId) + "/github/connect";
        const response = await fetch(new URL(path, productConfig.apiOrigin), {
          method: "POST",
          headers: {
            "authorization": "Bearer " + state.token,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            returnUrl: window.location.href
          })
        });
        if (response.status === 401 || response.status === 403) {
          signOut("Your session expired. Sign in to continue.");
          return;
        }
        if (response.status === 404 || response.status === 501) {
          showNotice(notice, "GitHub connection is not configured for this Loki environment.", "error");
          return;
        }
        if (!response.ok) throw new Error(await responseError(response));
        const result = response.status === 204 ? null : await response.json();
        const authorizationUrl = text(
          result && (result.authorizationUrl || result.url),
          ""
        );
        if (authorizationUrl) {
          showNotice(notice, "Continue in GitHub to approve the connection.", "success");
          window.location.assign(authorizationUrl);
          return;
        }
        showNotice(notice, "GitHub connected.", "success");
        await loadOverview({ quiet: true });
      } catch (error) {
        showNotice(
          notice,
          error instanceof Error ? error.message : "Could not connect GitHub.",
          "error"
        );
      } finally {
        button.disabled = false;
      }
    }

    async function loadDeployments(projectId, container, status) {
      status.textContent = "Loading immutable releases…";
      status.dataset.loading = "true";
      status.hidden = false;
      try {
        const result = await api("/v1/projects/" + encodeURIComponent(projectId) + "/deployments");
        const deployments = Array.isArray(result) ? result : array(result && result.deployments);
        state.deployments.set(projectId, deployments);
        const project = state.projects.find((item) => item && item.id === projectId) || {};
        renderDeployments(project, container, deployments);
        status.hidden = true;
      } catch (error) {
        status.dataset.loading = "false";
        status.textContent = error instanceof Error ? error.message : "Could not load releases.";
      }
    }

    function renderDeployments(project, container, deployments) {
      clear(container);
      if (!deployments.length) {
        container.appendChild(element("div", {
          className: "notice",
          text: "No deployments yet. Use the project agent prompt to integrate and ship the first immutable release."
        }));
        return;
      }
      const list = element("ol", { className: "deployment-list" });
      for (const deployment of deployments) {
        const item = element("li", { className: "deployment" });
        const heading = element("div", { className: "deployment-heading" });
        const id = text(deployment && deployment.id, "unknown");
        heading.appendChild(element("span", {
          className: "deployment-id",
          text: shortId(id)
        }));
        const status = element("span", {
          className: "pill",
          text: text(deployment && deployment.status, "unknown").replaceAll("_", " ")
        });
        status.dataset.state = text(deployment && deployment.status, "unknown");
        heading.appendChild(status);
        item.appendChild(heading);
        item.appendChild(element("p", {
          className: "deployment-meta",
          text: formatDate(deployment && deployment.createdAt) +
            (project && project.activeDeploymentId === id ? " · ACTIVE RELEASE" : " · IMMUTABLE")
        }));
        item.appendChild(element("p", {
          className: "deployment-hash",
          text: "SHA-256 " + text(deployment && deployment.contentHash, "unavailable")
        }));

        const findings = array(deployment && deployment.findings);
        if (findings.length) {
          const findingList = element("ul", { className: "finding-list" });
          for (const finding of findings) {
            findingList.appendChild(element("li", {
              text: text(finding && finding.severity, "notice").toUpperCase() +
                " · " + text(finding && finding.message, "Validation finding")
            }));
          }
          item.appendChild(findingList);
        }
        if (
          project &&
          project.activeDeploymentId !== id &&
          deployment &&
          deployment.status !== "blocked"
        ) {
          const activateButton = element("button", {
            className: "button button-quiet",
            text: "Activate this release",
            type: "button"
          });
          activateButton.addEventListener("click", () =>
            activateDeployment(project.id, id, activateButton)
          );
          item.appendChild(activateButton);
        }
        list.appendChild(item);
      }
      container.appendChild(list);
    }

    async function activateDeployment(projectId, deploymentId, button) {
      button.disabled = true;
      setGlobalStatus("Activating immutable release…", true);
      try {
        await api(
          "/v1/projects/" + encodeURIComponent(projectId) +
            "/deployments/" + encodeURIComponent(deploymentId) + "/activate",
          { method: "POST" }
        );
        state.deployments.delete(projectId);
        await loadOverview({ quiet: true });
        setGlobalStatus("Release activated.", false);
        window.setTimeout(() => setGlobalStatus("", false), 2400);
      } catch (error) {
        button.disabled = false;
        setGlobalStatus(
          error instanceof Error ? error.message : "Could not activate release.",
          false
        );
      }
    }

    async function transitionProject(projectId, next, button) {
      button.disabled = true;
      setGlobalStatus("Updating project state…", true);
      try {
        await api("/v1/projects/" + encodeURIComponent(projectId) + "/state", {
          method: "PATCH",
          body: JSON.stringify({ state: next })
        });
        await loadOverview({ quiet: true });
        setGlobalStatus("Project state updated.", false);
        window.setTimeout(() => setGlobalStatus("", false), 2400);
      } catch (error) {
        button.disabled = false;
        setGlobalStatus(error instanceof Error ? error.message : "Could not update project state.", false);
      }
    }

    function shortId(value) {
      const id = text(value, "unknown");
      return id.length > 12 ? id.slice(0, 8) + "…" + id.slice(-4) : id;
    }

    function formatDate(value) {
      if (typeof value !== "string") return "date unavailable";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "date unavailable";
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
    }

    function transitionLabel(next) {
      const labels = {
        draft: "Return to draft",
        private: "Make private",
        unlisted: "Make unlisted",
        review_requested: "Request review",
        published: "Publish"
      };
      return labels[next] || next.replaceAll("_", " ");
    }

    function slugify(value) {
      return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
    }

    function setAuthMode(mode) {
      state.authMode = mode;
      const signup = mode === "signup";
      byId("auth-panel-title").textContent = signup ? "Create account" : "Sign in";
      byId("auth-panel-copy").textContent = signup
        ? "Start a private creator workspace with your email."
        : "Continue to your projects and release history.";
      byId("auth-submit").textContent = signup ? "Create account" : "Sign in";
      byId("auth-mode-button").textContent = signup ? "Use existing account" : "Create account";
      byId("resend-button").hidden = signup;
      byId("auth-password").autocomplete = signup ? "new-password" : "current-password";
      showNotice(byId("auth-notice"), "", "");
    }

    byId("auth-mode-button").addEventListener("click", () => {
      setAuthMode(state.authMode === "signin" ? "signup" : "signin");
    });

    byId("auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const notice = byId("auth-notice");
      const email = byId("auth-email").value.trim();
      const password = byId("auth-password").value;
      setFormBusy(form, true);
      showNotice(notice, state.authMode === "signup" ? "Creating your account…" : "Signing in…", "");
      try {
        const signup = state.authMode === "signup";
        const redirectTo = new URL("/creator", window.location.origin).toString();
        const result = await supabase(
          signup
            ? "/auth/v1/signup?redirect_to=" + encodeURIComponent(redirectTo)
            : "/auth/v1/token?grant_type=password",
          {
            method: "POST",
            body: JSON.stringify({ email, password })
          }
        );
        if (
          signup &&
          result &&
          result.user &&
          Array.isArray(result.user.identities) &&
          result.user.identities.length === 0
        ) {
          setAuthMode("signin");
          byId("auth-email").value = email;
          showNotice(
            notice,
            "This email is already registered. Sign in, or resend confirmation if it is still unconfirmed.",
            "error"
          );
          return;
        }
        const token = text(result && result.access_token, "");
        if (!token) {
          setAuthMode("signin");
          byId("auth-email").value = email;
          showNotice(
            notice,
            "Check your email to confirm the address. The confirmation link will return here.",
            "success"
          );
          return;
        }
        writeToken(token);
        showNotice(notice, "", "");
        await loadOverview();
      } catch (error) {
        showNotice(notice, error instanceof Error ? error.message : "Authentication failed.", "error");
      } finally {
        setFormBusy(form, false);
      }
    });

    byId("resend-button").addEventListener("click", async () => {
      const button = byId("resend-button");
      const notice = byId("auth-notice");
      const email = byId("auth-email").value.trim();
      if (!email || !byId("auth-email").checkValidity()) {
        showNotice(notice, "Enter the registered email address first.", "error");
        byId("auth-email").focus();
        return;
      }
      button.disabled = true;
      showNotice(notice, "Requesting a new confirmation email…", "");
      try {
        const redirectTo = new URL("/creator", window.location.origin).toString();
        await supabase(
          "/auth/v1/resend?redirect_to=" + encodeURIComponent(redirectTo),
          {
            method: "POST",
            body: JSON.stringify({ type: "signup", email })
          }
        );
        showNotice(
          notice,
          "If this account still needs confirmation, a new email has been sent.",
          "success"
        );
      } catch (error) {
        showNotice(
          notice,
          error instanceof Error ? error.message : "Could not resend confirmation.",
          "error"
        );
      } finally {
        button.disabled = false;
      }
    });

    byId("organization-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const notice = byId("organization-notice");
      const name = byId("organization-name").value.trim();
      setFormBusy(form, true);
      showNotice(notice, "Creating organization…", "");
      try {
        await api("/v1/organizations", {
          method: "POST",
          body: JSON.stringify({ name })
        });
        form.reset();
        await loadOverview({ quiet: true });
      } catch (error) {
        showNotice(notice, error instanceof Error ? error.message : "Could not create organization.", "error");
      } finally {
        setFormBusy(form, false);
      }
    });

    let slugEdited = false;
    byId("project-slug").addEventListener("input", () => {
      slugEdited = byId("project-slug").value.length > 0;
    });
    byId("project-name").addEventListener("input", (event) => {
      if (!slugEdited) byId("project-slug").value = slugify(event.currentTarget.value);
    });

    byId("project-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const notice = byId("project-notice");
      setFormBusy(form, true);
      showNotice(notice, "Creating project…", "");
      try {
        await api("/v1/projects", {
          method: "POST",
          body: JSON.stringify({
            organizationId: byId("project-organization").value,
            name: byId("project-name").value.trim(),
            slug: byId("project-slug").value.trim()
          })
        });
        form.reset();
        slugEdited = false;
        byId("create-project").open = false;
        await loadOverview({ quiet: true });
      } catch (error) {
        showNotice(notice, error instanceof Error ? error.message : "Could not create project.", "error");
      } finally {
        setFormBusy(form, false);
      }
    });

    logoutButton.addEventListener("click", () => signOut(""));

    if (state.token) {
      loadOverview();
    } else {
      authView.hidden = false;
      dashboardView.hidden = true;
    }
`;

export function renderCreatorPage(config: ProductPageConfig): string {
  return renderProductPage({
    config,
    title: "Creator Studio — Loki",
    description:
      "Create, deploy, and activate immutable browser game releases with Loki.",
    body: pageBody,
    moduleScript: creatorScript,
    styles: creatorStyles,
    bodyClass: "creator-product",
  });
}
