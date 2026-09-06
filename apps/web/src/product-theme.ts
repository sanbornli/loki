export interface ProductPageConfig {
  apiOrigin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface ProductPageInput {
  config: ProductPageConfig;
  title: string;
  body: string;
  moduleScript: string;
  description?: string;
  bodyClass?: string;
  styles?: string;
}

export type ProductPageContent = Omit<
  ProductPageInput,
  "config" | "moduleScript"
> & {
  script: string;
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/**
 * Serializes server-owned configuration into an inline script without allowing
 * values such as "</script>" to escape the JavaScript context.
 */
export function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export const productThemeCss = `
:root {
  color-scheme: dark;
  --ink: #080806;
  --ink-raised: #11110e;
  --paper: #f4efe3;
  --muted: #a9a397;
  --quiet: #747068;
  --amber: #f0a72e;
  --amber-bright: #ffc35c;
  --danger: #f06f5d;
  --success: #8ebf70;
  --line: #302f29;
  --line-strong: #535047;
  --space: clamp(1rem, 2vw, 2rem);
  --sans: Geist, "Geist Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: var(--ink);
  font-family: var(--sans);
  font-synthesis: none;
  line-height: 1.45;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

html {
  min-width: 20rem;
  background: var(--ink);
  scroll-behavior: smooth;
}

body {
  min-height: 100vh;
  margin: 0;
  background: var(--ink);
  color: var(--paper);
}

body::before {
  position: fixed;
  z-index: 20;
  inset: 0 0 auto;
  height: 2px;
  background: var(--amber);
  content: "";
}

button,
input,
select {
  font: inherit;
}

button,
a,
input,
select {
  -webkit-tap-highlight-color: transparent;
}

a {
  color: inherit;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

button {
  color: inherit;
}

button:not(:disabled),
select:not(:disabled) {
  cursor: pointer;
}

button:disabled,
input:disabled,
select:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

:focus-visible {
  outline: 2px solid var(--amber-bright);
  outline-offset: 3px;
}

[hidden] {
  display: none !important;
}

.skip-link {
  position: fixed;
  z-index: 100;
  top: 0.75rem;
  left: 0.75rem;
  padding: 0.75rem 1rem;
  transform: translateY(-150%);
  background: var(--paper);
  color: var(--ink);
}

.skip-link:focus {
  transform: translateY(0);
}

.site-header {
  display: grid;
  grid-template-columns: minmax(12rem, 1fr) minmax(14rem, 2fr) auto;
  align-items: center;
  min-height: 5.25rem;
  padding: 0 var(--space);
  border-bottom: 1px solid var(--line);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  width: fit-content;
  color: var(--paper);
  font-size: 1rem;
  font-weight: 760;
  letter-spacing: -0.03em;
  text-decoration: none;
}

.brand-mark {
  width: 0.72rem;
  height: 0.72rem;
  border: 2px solid var(--amber);
  transform: rotate(45deg);
}

.header-note {
  margin: 0;
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.page-shell {
  width: min(100%, 112rem);
  margin: 0 auto;
  padding: 0 var(--space) 5rem;
}

.eyebrow {
  margin: 0 0 0.9rem;
  color: var(--amber);
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.display {
  max-width: 13ch;
  margin: 0;
  font-size: clamp(3rem, 7.3vw, 8.4rem);
  font-weight: 590;
  letter-spacing: -0.075em;
  line-height: 0.89;
}

.lede {
  max-width: 38rem;
  margin: 1.6rem 0 0;
  color: var(--muted);
  font-size: clamp(1rem, 1.4vw, 1.2rem);
  line-height: 1.6;
}

.section-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line-strong);
}

.section-label h2,
.section-label h3 {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 720;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.section-label span {
  color: var(--quiet);
  font-family: var(--mono);
  font-size: 0.68rem;
}

.button {
  display: inline-flex;
  min-height: 2.8rem;
  align-items: center;
  justify-content: center;
  padding: 0.7rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  background: transparent;
  color: var(--paper);
  font-size: 0.76rem;
  font-weight: 720;
  letter-spacing: 0.075em;
  line-height: 1;
  text-decoration: none;
  text-transform: uppercase;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}

.button:hover:not(:disabled) {
  border-color: var(--paper);
  background: var(--paper);
  color: var(--ink);
}

.button-primary {
  border-color: var(--amber);
  background: var(--amber);
  color: #161109;
}

.button-primary:hover:not(:disabled) {
  border-color: var(--amber-bright);
  background: var(--amber-bright);
  color: #161109;
}

.button-quiet {
  min-height: 2.25rem;
  padding: 0.5rem 0.75rem;
  color: var(--muted);
  font-size: 0.67rem;
}

.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--amber);
  font-size: 0.73rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-decoration: underline;
  text-underline-offset: 0.25em;
  text-transform: uppercase;
}

.field {
  display: grid;
  gap: 0.55rem;
}

.field label,
.field-label {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 680;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.field input,
.field select {
  width: 100%;
  min-height: 3.15rem;
  padding: 0.72rem 0.82rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  background: #0c0c09;
  color: var(--paper);
  outline: none;
}

.field input::placeholder {
  color: #625f57;
}

.field input:focus,
.field select:focus {
  border-color: var(--amber);
  box-shadow: 0 0 0 1px var(--amber);
}

.field-help {
  margin: 0;
  color: var(--quiet);
  font-size: 0.72rem;
  line-height: 1.5;
}

.form-grid {
  display: grid;
  gap: 1rem;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.8rem;
  margin-top: 0.35rem;
}

.notice {
  padding: 0.9rem 1rem;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.55;
}

.notice[data-tone="error"] {
  border-color: color-mix(in srgb, var(--danger) 65%, var(--line));
  color: #ffafa3;
}

.notice[data-tone="success"] {
  border-color: color-mix(in srgb, var(--success) 60%, var(--line));
  color: #bde3a5;
}

.status-line {
  display: flex;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.75rem;
  color: var(--muted);
  font-size: 0.78rem;
}

.status-line::before {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border: 1px solid var(--amber);
  content: "";
}

.status-line[data-loading="true"]::before {
  animation: status-pulse 800ms steps(2, end) infinite;
  background: var(--amber);
}

@keyframes status-pulse {
  50% { opacity: 0.2; }
}

.pill {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  padding: 0.36rem 0.52rem;
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-family: var(--mono);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  line-height: 1;
  text-transform: uppercase;
}

.pill[data-state="published"],
.pill[data-state="ready"] {
  border-color: #49613a;
  color: #bde3a5;
}

.pill[data-state="blocked"],
.pill[data-state="suspended"] {
  border-color: #714139;
  color: #ffafa3;
}

.pill[data-state="review_requested"],
.pill[data-state="ready_with_warnings"] {
  border-color: #80602c;
  color: var(--amber-bright);
}

.empty-state {
  min-height: 15rem;
  padding: clamp(1.5rem, 4vw, 4rem);
  border: 1px solid var(--line);
}

.empty-state strong {
  display: block;
  max-width: 18ch;
  font-size: clamp(1.7rem, 3vw, 3.25rem);
  font-weight: 570;
  letter-spacing: -0.045em;
  line-height: 1.05;
}

.empty-state p {
  max-width: 34rem;
  margin: 1rem 0 0;
  color: var(--muted);
}

.mono {
  font-family: var(--mono);
}

.muted {
  color: var(--muted);
}

.sr-only {
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

@media (max-width: 52rem) {
  .site-header {
    grid-template-columns: 1fr auto;
  }

  .header-note {
    display: none;
  }
}

@media (max-width: 38rem) {
  .site-header {
    min-height: 4.5rem;
  }

  .header-actions .account-label {
    display: none;
  }

  .button {
    min-height: 2.65rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }

  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
`;

export function renderProductPage(input: ProductPageInput): string;
export function renderProductPage(
  config: ProductPageConfig,
  content: ProductPageContent,
): string;
export function renderProductPage(
  inputOrConfig: ProductPageInput | ProductPageConfig,
  content?: ProductPageContent,
): string {
  const input: ProductPageInput = content
    ? {
        ...content,
        config: inputOrConfig as ProductPageConfig,
        moduleScript: content.script,
      }
    : (inputOrConfig as ProductPageInput);
  const description =
    input.description ??
    "Loki creator tools for deploying and publishing finished browser games.";
  const bodyClass = input.bodyClass
    ? ` class="${escapeHtml(input.bodyClass)}"`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#080806">
  <title>${escapeHtml(input.title)}</title>
  <style>${productThemeCss}${input.styles ?? ""}</style>
</head>
<body${bodyClass}>
${input.body}
  <script type="module">
    const productConfig = Object.freeze(${serializeInlineJson(input.config)});
${input.moduleScript}
  </script>
</body>
</html>`;
}
