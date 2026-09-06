import {
  escapeHtml,
  renderProductPage,
  type ProductPageConfig,
} from "./product-theme.js";

export function renderDevicePage(
  config: ProductPageConfig,
  userCode = "",
): string {
  return renderProductPage({
    config,
    title: "Authorize Loki CLI",
    description: "Authorize the Loki CLI for your creator account.",
    bodyClass: "device-page",
    styles: `
      .device-shell { width: min(100% - 2rem, 42rem); margin: 0 auto; padding: 4rem 0; }
      .device-card { border: 1px solid var(--line); background: var(--ink-raised); padding: clamp(1.25rem, 4vw, 2.5rem); }
      .device-kicker { color: var(--amber); font: 700 .75rem/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
      .device-title { max-width: 12ch; margin: 1rem 0 .75rem; font-size: clamp(2rem, 7vw, 4rem); line-height: .95; letter-spacing: -.05em; }
      .device-copy { max-width: 34rem; margin: 0 0 2rem; color: var(--muted); }
      .device-form { display: grid; gap: 1rem; }
      .device-label { display: grid; gap: .5rem; color: var(--muted); font-size: .85rem; }
      .device-input { width: 100%; border: 1px solid var(--line-strong); background: var(--ink); color: var(--paper); padding: .9rem 1rem; }
      .device-code { font: 700 1.15rem/1 var(--mono); letter-spacing: .12em; text-transform: uppercase; }
      .device-button { border: 1px solid var(--amber); background: var(--amber); color: var(--ink); padding: .9rem 1rem; font-weight: 750; }
      .device-button:disabled { opacity: .5; }
      .device-status { min-height: 1.5rem; margin: .25rem 0 0; color: var(--muted); }
      .device-status[data-kind="error"] { color: var(--danger); }
      .device-status[data-kind="success"] { color: var(--success); }
      .device-signin { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
      .device-signin[hidden] { display: none; }
    `,
    body: `
      <main class="device-shell">
        <section class="device-card" aria-labelledby="device-title">
          <p class="device-kicker">CLI authorization</p>
          <h1 class="device-title" id="device-title">Connect this terminal.</h1>
          <p class="device-copy">Confirm the code shown by the Loki CLI. Only approve a code you requested yourself.</p>
          <form class="device-form" id="device-form">
            <label class="device-label">Device code
              <input class="device-input device-code" id="device-code" name="userCode" value="${escapeHtml(userCode)}" maxlength="9" autocomplete="one-time-code" required>
            </label>
            <button class="device-button" id="approve-button" type="submit">Approve CLI access</button>
            <p class="device-status" id="device-status" role="status"></p>
          </form>
          <form class="device-form device-signin" id="signin-form" hidden>
            <p class="device-copy">Sign in before approving this terminal.</p>
            <label class="device-label">Email
              <input class="device-input" id="signin-email" type="email" autocomplete="email" required>
            </label>
            <label class="device-label">Password
              <input class="device-input" id="signin-password" type="password" autocomplete="current-password" required>
            </label>
            <button class="device-button" type="submit">Sign in</button>
          </form>
        </section>
      </main>
    `,
    moduleScript: String.raw`
      const TOKEN_KEY = "loki.creator.access-token";
      const deviceForm = document.getElementById("device-form");
      const signinForm = document.getElementById("signin-form");
      const status = document.getElementById("device-status");

      function token() {
        try { return sessionStorage.getItem(TOKEN_KEY) || ""; }
        catch { return ""; }
      }

      function setStatus(message, kind = "") {
        status.textContent = message;
        status.dataset.kind = kind;
      }

      function showSignin() {
        signinForm.hidden = false;
        document.getElementById("approve-button").disabled = true;
      }

      if (!token()) showSignin();

      signinForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setStatus("Signing in…");
        const response = await fetch(
          productConfig.supabaseUrl + "/auth/v1/token?grant_type=password",
          {
            method: "POST",
            headers: {
              apikey: productConfig.supabaseAnonKey,
              "content-type": "application/json"
            },
            body: JSON.stringify({
              email: document.getElementById("signin-email").value.trim(),
              password: document.getElementById("signin-password").value
            })
          }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.access_token) {
          setStatus(result.error_description || result.msg || "Sign in failed.", "error");
          return;
        }
        sessionStorage.setItem(TOKEN_KEY, result.access_token);
        signinForm.hidden = true;
        document.getElementById("approve-button").disabled = false;
        setStatus("Signed in. Confirm the device code.");
      });

      deviceForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const accessToken = token();
        if (!accessToken) {
          showSignin();
          setStatus("Sign in before approving.", "error");
          return;
        }
        const button = document.getElementById("approve-button");
        button.disabled = true;
        setStatus("Approving…");
        const response = await fetch(productConfig.apiOrigin + "/v1/cli/device/approve", {
          method: "POST",
          headers: {
            authorization: "Bearer " + accessToken,
            "content-type": "application/json"
          },
          body: JSON.stringify({ userCode: document.getElementById("device-code").value })
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({}));
          button.disabled = false;
          if (response.status === 401) showSignin();
          setStatus(result.error || "Could not approve this device.", "error");
          return;
        }
        setStatus("Approved. You can return to your terminal.", "success");
      });
    `,
  });
}
