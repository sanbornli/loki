import {
  brandMarkHtml,
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

const creatorStyles = `
body.creator-auth {
  overflow: hidden;
}

body.creator-auth .site-header,
body.creator-dashboard .site-header {
  display: none;
}

body.creator-auth .page-shell,
body.creator-dashboard .page-shell {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
}

.auth-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
  gap: 0;
  align-items: stretch;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 0;
}

.auth-hero {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: clamp(1.5rem, 3.5vw, 2.75rem);
  overflow: hidden;
  border-right: 1px solid var(--line-strong);
  background:
    radial-gradient(ellipse 70% 50% at 12% 88%, color-mix(in srgb, var(--amber) 16%, transparent), transparent 58%),
    linear-gradient(160deg, #12110d 0%, var(--ink) 46%, #060605 100%);
}

.auth-hero::before {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      -28deg,
      transparent 0 46px,
      color-mix(in srgb, var(--paper) 4%, transparent) 46px 47px
    );
  content: "";
  pointer-events: none;
}

.auth-hero .brand {
  position: absolute;
  top: clamp(1.5rem, 3.5vw, 2.75rem);
  left: clamp(1.5rem, 3.5vw, 2.75rem);
  z-index: 1;
}

.auth-copy {
  position: relative;
  z-index: 1;
  max-width: 28rem;
}

.auth-copy .display {
  max-width: 10ch;
  font-size: clamp(3.1rem, 5.6vw, 5.8rem);
  line-height: 0.92;
}

.auth-steps {
  margin: 1.75rem 0 0;
  color: var(--paper);
  font-size: 1rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.6;
}

.auth-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  padding: clamp(1.5rem, 4vw, 3rem);
  overflow: hidden;
  background:
    radial-gradient(circle at 80% 18%, color-mix(in srgb, var(--amber) 10%, transparent), transparent 36%),
    linear-gradient(180deg, #16150f 0%, var(--ink-raised) 100%);
}

.auth-stage::before {
  position: absolute;
  inset: 18% 16% auto;
  height: 42%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.45), transparent 70%);
  content: "";
  pointer-events: none;
}

.auth-panel {
  position: relative;
  z-index: 1;
  width: min(100%, 24.5rem);
  padding: clamp(1.6rem, 3vw, 2.3rem);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--paper) 16%, transparent);
  border-radius: 1.5rem;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--paper) 8%, transparent),
      color-mix(in srgb, var(--ink-raised) 42%, transparent) 28%,
      color-mix(in srgb, #0b0b08 68%, transparent)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--paper) 22%, transparent),
    inset 0 -1px 0 rgba(0, 0, 0, 0.35),
    0 2px 3px rgba(0, 0, 0, 0.18),
    0 18px 28px -18px rgba(0, 0, 0, 0.72),
    0 42px 64px -28px rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(22px) saturate(1.25);
  -webkit-backdrop-filter: blur(22px) saturate(1.25);
  transform: perspective(1400px) translateY(-0.35rem) rotateX(4deg);
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

.auth-panel .form-actions {
  display: grid;
  justify-items: start;
  gap: 1rem;
  margin-top: 0.65rem;
}

.auth-panel .form-actions .button {
  width: 100%;
}

.dashboard-shell {
  display: grid;
  grid-template-columns: 15.5rem minmax(0, 1fr);
  align-items: start;
  min-height: 100vh;
  min-height: 100dvh;
}

.dashboard-shell.sidebar-collapsed {
  grid-template-columns: 4.75rem minmax(0, 1fr);
}

.dashboard-sidebar {
  position: sticky;
  top: 0;
  display: flex;
  height: 100vh;
  height: 100dvh;
  flex-direction: column;
  gap: 2.25rem;
  padding: 1.75rem 1.25rem;
  border-right: 1px solid var(--line-strong);
  background: var(--ink-raised);
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--line);
}

.dashboard-sidebar .brand {
  min-width: 0;
}

.sidebar-toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
}

.sidebar-toggle svg {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
}

.dashboard-shell.sidebar-collapsed .sidebar-head {
  justify-content: center;
}

.dashboard-shell.sidebar-collapsed .brand {
  display: none;
}

.dashboard-shell.sidebar-collapsed .brand-word,
.dashboard-shell.sidebar-collapsed .nav-label,
.dashboard-shell.sidebar-collapsed .account-label,
.dashboard-shell.sidebar-collapsed .logout-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.dashboard-shell.sidebar-collapsed .sidebar-toggle svg {
  transform: scaleX(-1);
}

.dashboard-shell.sidebar-collapsed .nav-item {
  justify-content: center;
  padding-right: 0.55rem;
  padding-left: 0.55rem;
}

.dashboard-shell.sidebar-collapsed .sidebar-account {
  justify-items: center;
}

.sidebar-nav {
  display: grid;
  gap: 0.15rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.75rem 0.75rem;
  border: 1px solid transparent;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  font-size: 0.74rem;
  font-weight: 720;
  letter-spacing: 0.08em;
  text-align: left;
  text-transform: uppercase;
}

.nav-item svg {
  flex: none;
  width: 1.05rem;
  height: 1.05rem;
  stroke: currentColor;
}

.nav-item:hover:not(:disabled) {
  border-color: var(--line);
  background: var(--ink);
  color: var(--paper);
}

.nav-item[aria-current="page"] {
  border-left-color: var(--amber);
  background: var(--ink);
  color: var(--amber);
}

.sidebar-account {
  display: grid;
  gap: 0.5rem;
  margin-top: auto;
  padding-top: 1.5rem;
  border-top: 1px solid var(--line);
}

.sidebar-account .account-label {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-size: 0.72rem;
}

.sidebar-account .text-button {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0.45rem;
  width: calc(100% + 1.3rem);
  margin-left: -0.65rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid transparent;
  text-decoration: none;
}

.sidebar-account .text-button:hover {
  border-color: var(--line);
  background: var(--ink);
  color: var(--paper);
}

.dashboard-shell.sidebar-collapsed .sidebar-account .text-button {
  justify-content: center;
  width: 2rem;
  margin-left: 0;
  padding: 0.55rem;
}

.sidebar-toggle .icon-menu,
.sidebar-toggle .icon-close {
  display: none;
}

.sidebar-account .text-button svg {
  flex: none;
}

.dashboard-content {
  min-width: 0;
  padding: clamp(1.5rem, 3vw, 3rem);
}

.panel-header {
  margin-bottom: 2rem;
}

.panel-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 580;
  letter-spacing: -0.06em;
  line-height: 1;
}

.nav-panel {
  display: grid;
  gap: 2rem;
}

.dashboard-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--line);
  background: var(--line);
}

.metric {
  display: grid;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  background: var(--ink);
  border-top: 2px solid var(--amber);
}

.metric span {
  color: var(--muted);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.metric strong {
  font-family: var(--mono);
  font-size: 1.6rem;
  font-weight: 500;
}

.instruction-callout {
  padding: clamp(1.25rem, 3vw, 2rem);
  border: 1px solid var(--line-strong);
  border-left: 3px solid var(--amber);
  background: var(--ink-raised);
}

.instruction-callout h2 {
  margin: 0;
  font-size: clamp(1.4rem, 2.6vw, 2rem);
  font-weight: 580;
  letter-spacing: -0.045em;
  line-height: 1.1;
}

.instruction-callout > p {
  max-width: 44rem;
  margin: 0.65rem 0 0;
  color: var(--muted);
}

.instruction-steps {
  display: grid;
  gap: 1.1rem;
  margin: 1.5rem 0 0;
  padding: 1.5rem 0 0;
  border-top: 1px solid var(--line);
  list-style: none;
}

.instruction-steps li {
  display: grid;
  grid-template-columns: 1.6rem 1fr;
  gap: 0.85rem;
  align-items: baseline;
}

.instruction-steps .step-number {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.8rem;
  font-weight: 700;
}

.instruction-steps strong {
  display: block;
  margin-bottom: 0.2rem;
  color: var(--paper);
  font-size: 0.92rem;
}

.instruction-steps p {
  margin: 0;
  color: var(--muted);
  font-size: 0.83rem;
}

.instruction-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 1.5rem;
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

.field {
  align-content: start;
}

.field select {
  appearance: none;
  padding-right: 2.75rem;
  background-color: #0c0c09;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23f4efe3' d='M6 8 0 0h12z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 1.05rem center;
  background-size: 0.7rem 0.48rem;
}

.project-focus {
  display: grid;
  width: 100%;
  justify-items: start;
  gap: 1.25rem;
}

#project-detail {
  width: 100%;
  min-width: 0;
}

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--amber);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.create-project {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 1rem 1.25rem;
  width: min(100%, 46rem);
  padding: clamp(1.2rem, 3vw, 2rem);
  border: 1px solid var(--line);
}

.create-project .field:first-child,
.create-project .form-actions,
.create-project .notice {
  grid-column: 1 / -1;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13.5rem, 1fr));
  gap: 1rem;
}

.project-tile {
  display: flex;
  aspect-ratio: 1;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 0.45rem;
  min-width: 0;
  padding: 1.15rem;
  border: 1px solid var(--line-strong);
  background: var(--ink-raised);
  color: var(--paper);
  text-align: left;
}

.project-tile:hover {
  border-color: var(--amber);
}

.project-tile-name {
  overflow-wrap: anywhere;
  margin-top: auto;
  font-size: 1.35rem;
  font-weight: 570;
  letter-spacing: -0.04em;
  line-height: 1.05;
}

.project-tile-slug {
  overflow-wrap: anywhere;
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.68rem;
}

.project-tile-create {
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  border-style: dashed;
  background: transparent;
  color: var(--muted);
}

.project-tile-plus {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 2.6rem;
  font-weight: 400;
  line-height: 1;
}

.project-tile-create-label {
  max-width: 10rem;
  font-size: 0.78rem;
  font-weight: 680;
  letter-spacing: 0.04em;
  line-height: 1.35;
  text-align: center;
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

.integration-prompt {
  grid-column: 1 / -1;
  min-width: 0;
  padding-top: 1.4rem;
  border-top: 1px solid var(--line);
}

.integration-prompt h6 {
  margin: 0 0 0.65rem;
  color: var(--quiet);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.integration-prompt pre {
  overflow-x: auto;
  margin: 0;
  padding: clamp(0.9rem, 2vw, 1.25rem);
  border: 1px solid var(--line);
  background: var(--ink);
  color: var(--muted);
  font: 0.68rem/1.65 var(--mono);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
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
  body.creator-auth {
    overflow: auto;
  }

  .auth-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .auth-hero {
    min-height: auto;
    justify-content: flex-start;
    padding-top: 5.5rem;
    padding-bottom: 2rem;
    border-right: 0;
    border-bottom: 1px solid var(--line-strong);
  }

  .auth-copy {
    padding: 1.5rem 0 0;
  }

  .auth-copy .display {
    font-size: clamp(2.75rem, 9vw, 3.8rem);
    line-height: 1.02;
  }

  .auth-stage {
    padding: 2rem var(--space) 3rem;
  }

  .auth-panel {
    width: min(100%, 26rem);
    transform: none;
  }

  .dashboard-metrics {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 75rem) {
  .dashboard-shell,
  .dashboard-shell.sidebar-collapsed {
    grid-template-columns: 1fr;
  }

  .dashboard-sidebar {
    position: sticky;
    top: 0;
    z-index: 5;
    height: auto;
    gap: 0;
    padding: 0.9rem 1rem;
  }

  .sidebar-head {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .sidebar-nav,
  .sidebar-account {
    display: none;
  }

  .dashboard-shell.sidebar-menu-open .sidebar-nav,
  .dashboard-shell.sidebar-menu-open .sidebar-account {
    display: grid;
  }

  .dashboard-shell.sidebar-menu-open .sidebar-nav {
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .dashboard-shell.sidebar-menu-open .sidebar-account {
    margin-top: 0.35rem;
    padding-top: 0.9rem;
    border-top: 1px solid var(--line);
  }

  .sidebar-toggle .icon-collapse {
    display: none;
  }

  .sidebar-toggle .icon-menu {
    display: block;
  }

  .dashboard-shell.sidebar-menu-open .sidebar-toggle .icon-menu {
    display: none;
  }

  .dashboard-shell.sidebar-menu-open .sidebar-toggle .icon-close {
    display: block;
  }

  .dashboard-shell.sidebar-collapsed .brand {
    display: inline-flex;
  }

  .dashboard-shell.sidebar-collapsed .brand-word,
  .dashboard-shell.sidebar-collapsed .nav-label,
  .dashboard-shell.sidebar-collapsed .account-label,
  .dashboard-shell.sidebar-collapsed .logout-label {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    overflow: visible;
    clip: auto;
    white-space: normal;
  }

  .dashboard-shell.sidebar-collapsed .nav-item,
  .dashboard-shell.sidebar-collapsed .sidebar-head {
    justify-content: flex-start;
  }

  .dashboard-shell.sidebar-collapsed .nav-item {
    padding: 0.75rem;
  }

  .dashboard-shell.sidebar-collapsed .sidebar-account {
    justify-items: stretch;
  }

  .dashboard-shell.sidebar-collapsed .sidebar-account .text-button {
    justify-content: flex-start;
    width: calc(100% + 1.3rem);
    margin-left: -0.65rem;
    padding: 0.45rem 0.65rem;
  }

  .nav-item {
    border-bottom: 0;
    white-space: normal;
  }

  .nav-item[aria-current="page"] {
    border-bottom-color: transparent;
    border-left-color: var(--amber);
  }
}

@media (max-width: 43rem) {
  .create-project,
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

@media (prefers-reduced-motion: reduce) {
  .auth-panel {
    transform: none;
  }
}
`;

const pageBody = `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <a class="brand" href="https://lokiplay.cc/" aria-label="Loki home">
      ${brandMarkHtml()}
      <span>LOKI</span>
    </a>
    <p class="header-note">Independent games, released with intent</p>
    <div class="header-actions"></div>
  </header>

  <main class="page-shell" id="main-content">
    <section class="auth-layout" id="auth-view" aria-labelledby="auth-title">
      <div class="auth-hero">
        <a class="brand" href="https://lokiplay.cc/" aria-label="Loki home">
          ${brandMarkHtml()}
          <span>LOKI</span>
        </a>
        <div class="auth-copy">
          <h1 class="display" id="auth-title">Ship the world you made.</h1>
          <p class="lede">A focused release desk for finished browser games. Create a project, connect your coding agent, and share a playable release.</p>
          <p class="auth-steps">Create. Deploy. Multiplayer.</p>
        </div>
      </div>

      <div class="auth-stage">
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
      </div>
    </section>

    <div class="dashboard-shell" id="dashboard-view" hidden>
      <aside class="dashboard-sidebar">
        <div class="sidebar-head">
          <a class="brand" href="https://lokiplay.cc/" aria-label="Loki home">
            ${brandMarkHtml()}
            <span class="brand-word">LOKI</span>
          </a>
          <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-expanded="true" aria-controls="dashboard-sidebar-nav" aria-label="Collapse sidebar">
            <svg class="icon-collapse" viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M15 6 9 12l6 6"></path></svg>
            <svg class="icon-menu" viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
            <svg class="icon-close" viewBox="0 0 24 24" fill="none" stroke-width="1.6" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
          </button>
        </div>
        <nav class="sidebar-nav" id="dashboard-sidebar-nav" aria-label="Dashboard navigation">
          <button class="nav-item" type="button" data-nav-target="nav-dashboard" aria-current="page" title="Dashboard">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><rect x="3" y="3" width="8" height="8"></rect><rect x="13" y="3" width="8" height="8"></rect><rect x="3" y="13" width="8" height="8"></rect><rect x="13" y="13" width="8" height="8"></rect></svg>
            <span class="nav-label">Dashboard</span>
          </button>
          <button class="nav-item" type="button" data-nav-target="nav-projects" aria-current="false" title="Projects">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"></path></svg>
            <span class="nav-label">Projects</span>
          </button>
          <button class="nav-item" type="button" data-nav-target="nav-earn" aria-current="false" title="Earn">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 2.5-1.5c1.4 0 2.5.7 2.5 1.8 0 2.3-5 1.6-5 4 0 1.1 1.1 1.8 2.5 1.8s2.5-.6 2.5-1.5"></path></svg>
            <span class="nav-label">Earn</span>
          </button>
          <button class="nav-item" type="button" data-nav-target="nav-analytics" aria-current="false" title="Analytics">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6"><path d="M4 20V10M12 20V4M20 20v-7"></path></svg>
            <span class="nav-label">Analytics</span>
          </button>
        </nav>
        <div class="sidebar-account">
          <span class="account-label" id="account-label" hidden></span>
          <button class="text-button" id="logout-button" type="button" hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" width="16" height="16"><path d="M9 6H5v12h4M10 12h9M15 8l4 4-4 4"></path></svg>
            <span class="logout-label">Log out</span>
          </button>
        </div>
      </aside>

      <div class="dashboard-content">
        <div class="status-line" id="global-status" role="status" aria-live="polite" hidden></div>

        <section class="nav-panel" id="nav-dashboard">
          <div class="panel-header">
            <p class="eyebrow">Creator desk</p>
            <h1 id="dashboard-title">Dashboard</h1>
          </div>

          <div class="dashboard-metrics" aria-label="Workspace summary">
            <div class="metric"><span>Organizations</span><strong id="organization-count">0</strong></div>
            <div class="metric"><span>Projects</span><strong id="project-count">0</strong></div>
            <div class="metric"><span>Playable</span><strong id="playable-count">0</strong></div>
          </div>

          <section class="instruction-callout" aria-labelledby="instruction-title">
            <p class="eyebrow">Getting your game online</p>
            <h2 id="instruction-title">Install Loki with your coding agent.</h2>
            <p>No manual setup. Create a project, then hand its prompt to the coding agent that already works on your game's repository.</p>
            <ol class="instruction-steps">
              <li>
                <span class="step-number">01</span>
                <div>
                  <strong>Create a project</strong>
                  <p>Open Projects and create a project for your game. Each project gets its own agent prompt and release history.</p>
                </div>
              </li>
              <li>
                <span class="step-number">02</span>
                <div>
                  <strong>Copy the agent prompt</strong>
                  <p>On the project card, click "Copy agent prompt" to copy the full integration prompt for that project.</p>
                </div>
              </li>
              <li>
                <span class="step-number">03</span>
                <div>
                  <strong>Paste it into your game agent</strong>
                  <p>Paste the prompt into your coding agent's chat (Cursor, Claude Code, or similar) inside your game's repository.</p>
                </div>
              </li>
              <li>
                <span class="step-number">04</span>
                <div>
                  <strong>Let it run</strong>
                  <p>The agent will install the official Loki packages, connect this project, and ship the build.</p>
                </div>
              </li>
            </ol>
            <div class="instruction-actions">
              <button class="button button-primary" type="button" data-nav-link="nav-projects">Go to projects</button>
            </div>
          </section>
        </section>

        <section class="nav-panel" id="nav-projects" hidden>
          <div class="panel-header" id="projects-heading">
            <p class="eyebrow">Creator desk</p>
            <h1>Projects</h1>
          </div>

          <section class="onboarding-card" id="onboarding-view" aria-labelledby="onboarding-title" hidden>
            <p class="eyebrow">First step</p>
            <h2 id="onboarding-title">Name your studio.</h2>
            <p>Create an organization to hold projects, collaborators, and release history.</p>
            <form class="form-grid" id="organization-form">
              <div class="field">
                <label for="organization-name">Organization name</label>
                <input id="organization-name" name="name" maxlength="80" autocomplete="organization" placeholder="Studio name" required>
              </div>
              <div class="field">
                <label for="organization-slug">Studio slug</label>
                <input id="organization-slug" name="slug" minlength="3" maxlength="48" pattern="[a-z0-9-]{3,48}" placeholder="studio-name" required>
                <p class="field-help">Public path prefix. 3–48 lowercase letters, numbers, and hyphens.</p>
              </div>
              <div class="notice" id="organization-notice" role="status" aria-live="polite" hidden></div>
              <div class="form-actions">
                <button class="button button-primary" type="submit">Create organization</button>
              </div>
            </form>
          </section>

          <div id="projects-view" hidden>
            <div id="project-browser">
              <div class="project-grid" id="project-grid"></div>
            </div>

            <section class="project-focus" id="project-create-view" hidden>
              <button class="back-button" id="project-create-back" type="button">← Back</button>
              <form class="create-project" id="project-form">
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
            </section>

            <section class="project-focus" id="project-detail-view" hidden>
              <button class="back-button" id="project-detail-back" type="button">← Back</button>
              <div id="project-detail"></div>
            </section>
          </div>
        </section>

        <section class="nav-panel" id="nav-earn" hidden>
          <div class="panel-header">
            <p class="eyebrow">Creator desk</p>
            <h1>Earn</h1>
          </div>
          <div class="empty-state">
            <strong>Earnings are coming soon.</strong>
            <p>Revenue and payout tools for published releases will appear here.</p>
          </div>
        </section>

        <section class="nav-panel" id="nav-analytics" hidden>
          <div class="panel-header">
            <p class="eyebrow">Creator desk</p>
            <h1>Analytics</h1>
          </div>
          <div class="empty-state">
            <strong>Analytics are coming soon.</strong>
            <p>Player and session insights for your releases will appear here.</p>
          </div>
        </section>
      </div>
    </div>
  </main>
`;

const creatorScript = String.raw`
    const TOKEN_KEY = "loki.creator.access-token";
    const allowedTransitions = {
      draft: ["private"],
      private: ["draft", "unlisted"],
      unlisted: ["private"],
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
      deployments: new Map(),
      projectPane: "grid",
      selectedProjectId: ""
    };

    const byId = (id) => document.getElementById(id);
    const authView = byId("auth-view");
    const dashboardView = byId("dashboard-view");
    const logoutButton = byId("logout-button");
    const accountLabel = byId("account-label");
    const globalStatus = byId("global-status");
    const onboardingView = byId("onboarding-view");
    const projectsView = byId("projects-view");
    const projectGrid = byId("project-grid");

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

    function syncAuthLayout() {
      document.body.classList.toggle("creator-auth", !authView.hidden);
      document.body.classList.toggle("creator-dashboard", !dashboardView.hidden);
    }

    const navItems = Array.from(document.querySelectorAll(".nav-item"));
    const navPanels = Array.from(document.querySelectorAll(".nav-panel"));

    function setActiveNav(target) {
      for (const item of navItems) {
        item.setAttribute("aria-current", item.dataset.navTarget === target ? "page" : "false");
      }
      for (const panel of navPanels) {
        panel.hidden = panel.id !== target;
      }
    }

    for (const item of navItems) {
      item.addEventListener("click", () => setActiveNav(item.dataset.navTarget));
    }

    for (const link of document.querySelectorAll("[data-nav-link]")) {
      link.addEventListener("click", () => setActiveNav(link.dataset.navLink));
    }

    const SIDEBAR_KEY = "loki.creator.sidebar-collapsed";
    const compactNavQuery = window.matchMedia("(max-width: 75rem)");

    function isCompactNav() {
      return compactNavQuery.matches;
    }

    function syncSidebarToggle() {
      const toggle = byId("sidebar-toggle");
      if (isCompactNav()) {
        const open = dashboardView.classList.contains("sidebar-menu-open");
        toggle.setAttribute("aria-expanded", open ? "true" : "false");
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        return;
      }
      const collapsed = dashboardView.classList.contains("sidebar-collapsed");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    }

    function setSidebarCollapsed(collapsed) {
      dashboardView.classList.toggle("sidebar-collapsed", collapsed);
      try {
        sessionStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
      } catch {
        // The layout still updates for this page view.
      }
      syncSidebarToggle();
    }

    function setMenuOpen(open) {
      dashboardView.classList.toggle("sidebar-menu-open", open);
      syncSidebarToggle();
    }

    byId("sidebar-toggle").addEventListener("click", () => {
      if (isCompactNav()) {
        setMenuOpen(!dashboardView.classList.contains("sidebar-menu-open"));
        return;
      }
      setSidebarCollapsed(!dashboardView.classList.contains("sidebar-collapsed"));
    });

    for (const item of navItems) {
      item.addEventListener("click", () => {
        if (isCompactNav()) setMenuOpen(false);
      });
    }

    compactNavQuery.addEventListener("change", () => {
      if (!isCompactNav()) dashboardView.classList.remove("sidebar-menu-open");
      syncSidebarToggle();
    });

    try {
      if (sessionStorage.getItem(SIDEBAR_KEY) === "1") setSidebarCollapsed(true);
    } catch {
      // Leave the sidebar expanded when storage is unavailable.
    }
    syncSidebarToggle();

    function signOut(message) {
      writeToken("");
      state.overview = null;
      state.projects = [];
      state.organizations = [];
      state.deployments.clear();
      state.projectPane = "grid";
      state.selectedProjectId = "";
      clear(projectGrid);
      clear(byId("project-detail"));
      dashboardView.hidden = true;
      authView.hidden = false;
      syncAuthLayout();
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
      syncAuthLayout();
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
        setActiveNav("nav-projects");
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
      clear(projectGrid);
      for (const project of state.projects) {
        projectGrid.appendChild(createProjectTile(project));
      }
      projectGrid.appendChild(createNewProjectTile());
      showProjectScreen();
    }

    function showProjectScreen() {
      const pane = state.projectPane === "detail" && state.selectedProjectId ? "detail" : state.projectPane;
      byId("projects-heading").hidden = pane !== "grid";
      byId("project-browser").hidden = pane !== "grid";
      byId("project-create-view").hidden = pane !== "create";
      byId("project-detail-view").hidden = pane !== "detail";
      if (pane !== "detail") return;
      const project = state.projects.find((item) => item && item.id === state.selectedProjectId);
      const detail = byId("project-detail");
      clear(detail);
      if (!project) {
        state.projectPane = "grid";
        state.selectedProjectId = "";
        byId("projects-heading").hidden = false;
        byId("project-browser").hidden = false;
        byId("project-detail-view").hidden = true;
        return;
      }
      detail.appendChild(createProjectCard(project));
    }

    function createProjectTile(project) {
      const projectId = text(project && project.id, "");
      const tile = element("button", { className: "project-tile", type: "button" });
      tile.appendChild(element("span", {
        className: "project-kicker",
        text: organizationName(project && project.organizationId)
      }));
      const pill = element("span", {
        className: "pill",
        text: projectStateLabel(project && project.state)
      });
      pill.dataset.state = text(project && project.state, "draft");
      tile.appendChild(pill);
      tile.appendChild(element("span", {
        className: "project-tile-name",
        text: text(project && project.name, "Untitled project")
      }));
      tile.appendChild(element("span", {
        className: "project-tile-slug",
        text: playPathForProject(project)
      }));
      tile.addEventListener("click", () => {
        state.projectPane = "detail";
        state.selectedProjectId = projectId;
        showProjectScreen();
      });
      return tile;
    }

    function createNewProjectTile() {
      const tile = element("button", {
        className: "project-tile project-tile-create",
        type: "button"
      });
      tile.appendChild(element("span", { className: "project-tile-plus", text: "+" }));
      tile.appendChild(element("span", {
        className: "project-tile-create-label",
        text: "Create a new project"
      }));
      tile.addEventListener("click", () => {
        state.projectPane = "create";
        state.selectedProjectId = "";
        showProjectScreen();
        byId("project-name").focus();
      });
      return tile;
    }

    function organizationRecord(id) {
      return state.organizations.find((item) => item && item.id === id) || {};
    }

    function organizationName(id) {
      return text(organizationRecord(id).name, "Organization");
    }

    function playPathForProject(project) {
      const orgSlug = text(organizationRecord(project && project.organizationId).slug, "");
      const gameSlug = text(project && project.slug, "");
      if (orgSlug && gameSlug) {
        return "/play/" + encodeURIComponent(orgSlug) + "/" + encodeURIComponent(gameSlug);
      }
      return "/play/" + encodeURIComponent(text(project && project.id, ""));
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
        text: playPathForProject(project)
      }));
      const pill = element("span", {
        className: "pill",
        text: projectStateLabel(project && project.state)
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
        link.href = playPathForProject(project);
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
      integrationCopy.appendChild(element("h4", { text: "Install via your coding agent" }));
      integrationCopy.appendChild(element("h5", { text: "Copy the prompt. Paste it into your game agent." }));
      integrationCopy.appendChild(element("p", {
        text: "Click \"Copy agent prompt\", then paste it directly into your game's coding agent chat (Cursor, Claude Code, or similar) inside your game's repository. The agent will install the official Loki packages, connect this project, and ship a playable build for you."
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

      const promptPreview = element("section", { className: "integration-prompt" });
      promptPreview.setAttribute("aria-label", "Full agent prompt");
      promptPreview.appendChild(element("h6", { text: "Full agent prompt" }));
      promptPreview.appendChild(element("pre", { text: agentPrompt(project) }));
      integrationPanel.append(integrationCopy, statusList, promptPreview);

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
      const deployment = project && project.latestDeployment;
      if (deployment) return securityReviewStatus(deployment, project);
      return text(
        project && project.deploymentStatus,
        project && project.activeDeploymentId ? "Active" : "Not deployed"
      ).replaceAll("_", " ");
    }

    function securityReviewStatus(deployment, project) {
      const reviewState = text(
        deployment && deployment.securityReview && deployment.securityReview.state,
        ""
      );
      if (reviewState === "pending") return "Security scan queued";
      if (reviewState === "running") return "Security scan in progress";
      if (reviewState === "needs_operator") {
        return "Needs an operator; approval will activate it automatically";
      }
      if (reviewState === "failed") return "Security scan is retrying";
      if (
        reviewState === "quarantined" ||
        (deployment && deployment.status === "quarantined") ||
        (deployment && deployment.status === "blocked")
      ) {
        return "Rejected by security review";
      }
      if (
        reviewState === "approved" ||
        (deployment && ["ready", "ready_with_warnings"].includes(deployment.status))
      ) {
        return project && project.activeDeploymentId === deployment.id
          ? "Passed and publicly playable"
          : "Passed security review";
      }
      return "Security review status unavailable";
    }

    function latestPlayableUrl(project) {
      const supplied = text(
        project && (project.latestPlayableUrl || project.playableUrl),
        ""
      );
      if (supplied) return supplied;
      if (!project || !project.activeDeploymentId || !playableStates.has(project.state)) return "";
      return new URL(playPathForProject(project), window.location.origin).toString();
    }

    function configuredPackageVersion() {
      return text(
        productConfig && (
          productConfig.lokiplayVersion ||
          productConfig.packageVersion
        ),
        "0.4.0"
      );
    }

    function configuredCliVersion() {
      return text(productConfig && productConfig.cliVersion, "0.4.0");
    }

    function agentPrompt(project) {
      const projectId = text(project && project.id, "");
      const projectName = text(project && project.name, "Untitled project");
      const projectSlug = text(project && project.slug, "project");
      const organizationSlug = text(
        organizationRecord(project && project.organizationId).slug,
        ""
      );
      const version = configuredPackageVersion();
      const cliVersion = configuredCliVersion();
      const apiUrl = String(productConfig.apiOrigin || "").replace(/\/+$/, "");
      const playerUrl = new URL(
        playPathForProject(project),
        window.location.origin
      ).toString();

      return [
        "Integrate and ship this repository to Loki.",
        "",
        "Project",
        "- Name: " + projectName,
        "- Studio slug: " + (organizationSlug || "Unavailable"),
        "- Game slug: " + projectSlug,
        "- Project ID: " + projectId,
        "- Loki package version: " + version,
        "- Loki CLI version: " + cliVersion,
        "- Canonical API URL: " + apiUrl,
        "- Canonical player URL: " + playerUrl,
        "",
        "Package installation and creator authentication are separate. Package installation is public and must not require Loki credentials. Creator authentication happens only through the Loki CLI device flow.",
        "",
        "Use only the official public packages and pin the exact version shown above:",
        "- CLI: lokiplay@" + cliVersion,
        "- Runtime SDK: @lokiplay/sdk@" + version,
        "- Optional web UI: @lokiplay/ui-web@" + version,
        "- Protocol package: @lokiplay/protocol@" + version + " (only if the SDK or existing repository directly requires it)",
        "- MCP package: @lokiplay/mcp@" + version + " (tooling only; never ship it in the game bundle)",
        "Do not install or import @loki/*, any unofficial package named loki, or @heroiclabs/nakama-js.",
        "Before implementation, verify the required public packages are available from the registry:",
        "   npm view @lokiplay/sdk@" + version + " version",
        "   npm view lokiplay@" + cliVersion + " version",
        "Stop and report the failing command if either exact version is unavailable. Do not substitute a local workspace, git dependency, tarball, unpublished package, or different version.",
        "",
        "Repository inspection and implementation",
        "1. Inspect the repository before changing it: identify its package manager, framework, entry points, existing multiplayer/game-state architecture, scripts, and browser production output directory.",
        "2. Preserve the existing stack and UI. Install the exact public @lokiplay/sdk version with the repository's package manager and add the smallest complete Loki integration; add @lokiplay/ui-web only when the repository needs Loki-provided UI.",
        "3. Ensure the finished browser build contains game.json, index.html, and all required static assets. Do not ship source-only output, backend processes, secrets, creator ad scripts, or localhost dependencies.",
        "4. Use the repository's own install, typecheck, test, lint, and production-build commands. Fix integration-caused failures and verify the built output, not only source code.",
        "5. Before connecting or shipping, ask the user to authorize creator access. After approval, run the device login command and give the user its displayed URL and code so they can sign in and approve this terminal:",
        "   LOKI_API_URL=" + apiUrl + " npx lokiplay@" + cliVersion + " login",
        "6. After the CLI reports \"Logged in\", connect this exact project. This verifies that the authenticated creator can access the project and writes only the non-secret project link to the repository:",
        "   npx lokiplay@" + cliVersion + " connect --project " + projectId,
        "7. Ship the finished build:",
        "   npx lokiplay@" + cliVersion + " ship",
        "Never ask the user to paste an access token or deployment credential. If login, ownership verification, or deployment fails, report the exact non-secret error and stop rather than bypassing authentication.",
        "",
        "Host-authoritative requirements",
        "- Loki owns identity, project and tenant boundaries, room membership, matchmaking, event sequencing, snapshots, and host migration.",
        "- Never trust, replace, or override the projectId, player identity, membership, host assignment, sequence, or snapshots returned by Loki.",
        "- Create rooms with createRoom() and join with joinRoom({ inviteCode }). Do not invent Loki room keys or pass player-typed codes to createRoom. create() stays invite-only unless the game explicitly passes { visibility: \"public\" }. Do not make every room public. Confirm for each mode whether entry is private invites, public room browsing (listPublicRooms + joinPublic), automatic matchmaking, or a combination. Loki's SDK does not add a public lobby screen. If public-room discovery is enabled, the game agent must build the room browser and all loading, empty, joining, full-room, waiting, readiness, and error states. The Loki overlay does not list, create, or join public rooms.",
        "- Installing the SDK does not add a create/join screen. If the game has no usable room-entry flow, add one before shipping: a minimal lobby (create room, join with invite, copy invite, start when ready) or an automatic flow (plain URL creates a room; invite or deep-link URL joins it). The Loki overlay shows room status, players, invite copy, and chat only; it does not create or join rooms. Players still need loading, waiting, and error states.",
        "- Before configuring Loki multiplayer, inspect the game's source, existing UI, configuration, documentation, tests, and finished build. Locate its game modes, seats, local-player handling, AI opponents, teams, start conditions, turn or update loop, win conditions, reconnect behavior, and existing networking code.",
        "- Do not infer multiplayer requirements from the game's name, genre, appearance, or common rules. A chess, pool, racing, or strategy game may support different player and team arrangements.",
        "- Determine requirements separately for every supported game mode. Do not collapse multiple modes into one profile.",
        "- Record evidence for each conclusion and distinguish observed facts from creator decisions. If any material field is ambiguous, stop and ask the creator. Never silently choose a player count, team arrangement, simulation model, authority model, update frequency, persistence policy, or matchmaking flow.",
        "- Determine and confirm for each mode: minimum, recommended, and maximum players; number of teams, team size, and whether players share control; private invite, public room browsing, automatic matchmaking, a combination, or asynchronous entry; whether late joining and spectators are allowed; turn-based, event-driven, continuous realtime, or hybrid simulation; sequential or simultaneous input; required authoritative update frequency and latency sensitivity; session duration and persistence requirements; host-authoritative trust tolerance or server-authority requirement.",
        "- Classify simulation from how authoritative state progresses, not from visual animation. A game animated at 60 FPS may still be turn-based or event-driven.",
        "- Preserve existing game modes and rules. Add online settings and entry UI from the confirmed profile, including mode selection, team or seat selection, readiness, player limits, invite and join behavior, waiting states, and start conditions.",
        "- Do not invent new game.json fields. Current manifests accept only enabled, authority, maxPlayers, and tickRate. Report the richer profile in the final report: values, supporting evidence, and creator-confirmed decisions.",
        "- After confirming each mode's profile, choose createSynchronizedRoom() for turn-based or event-driven state, or createRealtimeRoom() for continuous host-authoritative simulation. Choose by how authoritative state actually progresses, not by genre or animation smoothness. Do not run both room types for the same mode.",
        "- createSynchronizedRoom(): define this repository's state and actions, then provide a reducer. Loki owns authority checks, state versions, snapshots, retries, and membership.",
        "- Clients dispatch actions through the synchronized room. Do not create a parallel authoritative backend or direct Nakama integration.",
        "- Keep replicated state JSON-compatible and use finite safe integers. Reducers must be synchronous, deterministic, and fast, with no rendering, timers, network calls, or other I/O.",
        "- Subscribe to synchronized snapshots for state, members, authority, connection status, and rejected actions. Keep the same LokiClient and synchronized-room instance while interrupted.",
        "- createRealtimeRoom(): integrate the game's existing simulation through its predict/interpolate/extrapolate/blendCorrection callbacks instead of writing a parallel input queue, RTT estimator, snapshot pacer, stale-round rejection, input ledger, interpolation buffer, or reconnect netcode; the SDK already owns all of that, including per-submission in-flight accounting and setInput() network pacing. Keep one game-owned render loop, keep authoritative snapshots compact and self-contained. snapshotHz (default/cap 30) is a ceiling, not a delivery guarantee: start conservative with adaptiveRate: true and a low initialSnapshotHz, or use calibrateRealtimeRoom() against a real two-player pair (fixed snapshotHz per candidate) to pick the highest delivered rate without a transport/hold/ack cliff and write only that RealtimeProfile into createRealtimeRoom(); game.json tickRate is a separate Nakama room-loop setting and must not be copied from snapshotHz. Use createHostedLokiClient() to own the hosted-shell session handshake at page boot instead of hand-writing it. Report the selected snapshot/input rates and observed diagnostics (RTT, jitter, acceptance/rejection ratios, reconnect/migration duration, dropped/coalesced frames, held authoritative frames) as evidence.",
        "- Do not claim Loki supplies game physics, collision resolution, rendering optimization, or competitive/anti-cheat integrity for createRealtimeRoom() games. Loki owns transport, sequencing, fencing, and delivery only; the game owns simulation and rendering.",
        "- createRealtimeRoom() requires every present room member to be realtime-capable before it activates; a legacy or non-realtime-capable client blocks activation and cannot join an already-active realtime room. Native clients cannot join realtime-mode rooms until a later parity release; do not offer createRealtimeRoom() for cross-client modes yet.",
        "- Let the SDK own lifecycle detection, socket replacement, reconnect retries, snapshot recovery, and pending-action replay. Do not add competing visibilitychange, pagehide, pageshow, blur, focus, online, or offline reconnect logic.",
        "- Never call leave(), close(), transport disconnect, reload, or create a replacement room because the page became hidden, blurred, offline, or unloaded. Call leave() only from a deliberate Leave/End Game action.",
        "- Call dispatch() only while connection is connected. Treat suspended, reconnecting, and resynchronizing as recoverable connection states, not a leave.",
        "- While interrupted, lock authoritative input, preserve the last rendered state, show a temporary Reconnecting message, and wait for an authoritative snapshot. Do not assume the player remains host.",
        "- Do not repeat an unresolved action under a new action ID. Treat indeterminate or authoritative confirmation timed out as an unknown outcome, not proof of failure. Treat room_closed as terminal and resolve leave_failed before starting another room with that client.",
        "- Production multiplayer must run from a Loki-hosted finished browser build.",
        "- Hosted games run in a sandbox iframe with a strict CSP. Do not use inline <script> tags, inline event handlers, Google Fonts or other remote stylesheets, or <form> submissions. Bundle JavaScript and fonts as same-origin files and use <button type=\"button\"> for create/join controls.",
        "",
        "Mobile browser requirements",
        "- Include <meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">. Do not globally disable browser zoom.",
        "- Make the game root width: 100%, height: 100vh followed by height: 100dvh, and overflow: hidden. Account for env(safe-area-inset-*). Gameplay must not require document scrolling, though internal menus may scroll.",
        "- Recalculate layout from the game container on resize, visualViewport.resize when available, and orientation changes. Preserve logical coordinates and fit them to the available area instead of hard-coding desktop pixels.",
        "- Support both orientations unless the game clearly explains a required orientation. Keep critical controls inside safe-area boundaries.",
        "- For canvas games, separate CSS size from backing resolution, scale by devicePixelRatio with a reasonable cap such as 2, and resize and redraw after viewport changes without replacing the canvas node.",
        "- Use Pointer Events for touch, mouse, pen, and trackpad. Restrict touch-action: none to direct-manipulation playfields, use pointer capture for dragging or aiming, handle pointercancel and lost capture, provide primary targets of at least 44x44 CSS pixels, and do not rely on hover.",
        "- Use one controlled requestAnimationFrame loop. Pause or throttle rendering while hidden without leaving the Loki room, then render the latest authoritative snapshot. Keep transient visual state out of synchronized state, cap canvas resolution, and avoid large per-frame allocations.",
        "- Report whether mobile Safari and Android Chrome were tested. Never claim real-device testing unless it actually occurred. When supported by the available environment, exercise resize, orientation changes, interrupted gestures, hide/restore, temporary offline recovery, host migration, and return after extended backgrounding.",
        "",
        "Security and approval",
        "- Do not put credentials, access tokens, deployment secrets, private keys, or environment-secret values in code, game.json, logs, commits, this prompt, or the final report.",
        "- Before any browser action that requires login, OAuth, permissions, external account access, or a deployment confirmation, pause and ask the user for explicit approval. Continue only after approval.",
        "",
        "Final report",
        "- List files changed and summarize the Loki integration.",
        "- Report the confirmed multiplayer profile for each mode, the evidence that established it, and any creator-confirmed decisions.",
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
          text: securityReviewStatus(deployment, project)
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
          className: "deployment-meta",
          text: securityReviewStatus(deployment, project)
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
        list.appendChild(item);
      }
      container.appendChild(list);
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
        unlisted: "Make public",
        review_requested: "Request review",
        published: "Publish"
      };
      return labels[next] || next.replaceAll("_", " ");
    }

    function projectStateLabel(value) {
      const projectState = text(value, "draft");
      if (projectState === "unlisted") return "Public";
      return projectState.replaceAll("_", " ");
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

    let organizationSlugEdited = false;
    byId("organization-slug").addEventListener("input", () => {
      organizationSlugEdited = byId("organization-slug").value.length > 0;
    });
    byId("organization-name").addEventListener("input", (event) => {
      if (!organizationSlugEdited) {
        byId("organization-slug").value = slugify(event.currentTarget.value);
      }
    });

    byId("organization-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const notice = byId("organization-notice");
      const name = byId("organization-name").value.trim();
      const slug = byId("organization-slug").value.trim();
      setFormBusy(form, true);
      showNotice(notice, "Creating organization…", "");
      try {
        await api("/v1/organizations", {
          method: "POST",
          body: JSON.stringify({ name, slug })
        });
        form.reset();
        organizationSlugEdited = false;
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

    byId("project-create-back").addEventListener("click", () => {
      state.projectPane = "grid";
      state.selectedProjectId = "";
      showProjectScreen();
    });

    byId("project-detail-back").addEventListener("click", () => {
      state.projectPane = "grid";
      state.selectedProjectId = "";
      showProjectScreen();
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
        state.projectPane = "grid";
        state.selectedProjectId = "";
        await loadOverview({ quiet: true });
      } catch (error) {
        showNotice(notice, error instanceof Error ? error.message : "Could not create project.", "error");
      } finally {
        setFormBusy(form, false);
      }
    });

    logoutButton.addEventListener("click", () => signOut(""));

    if (window.location.pathname === "/signup") {
      setAuthMode("signup");
    }

    if (state.token) {
      loadOverview();
    } else {
      authView.hidden = false;
      dashboardView.hidden = true;
    }
    syncAuthLayout();
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
