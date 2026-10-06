import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Contract for the hosted browser SDK. Games import `@lokiplay/sdk` and leave
 * it out of their zip; the Loki web server serves one same-origin copy at
 * HOSTED_SDK_PATH on the game host and injects an import map that points the
 * bare import at it.
 *
 * Compatibility version 1: every runtime export of `@lokiplay/sdk` stays.
 * Adding an export is allowed. Removing or renaming one needs version 2 and
 * a game rebuild.
 */
export const HOSTED_SDK_COMPATIBILITY = 1;
export const HOSTED_SDK_PATH = "/loki/sdk.js";
export const HOSTED_SDK_SUPPORT_PATH = "/loki/support.js";
/**
 * Present in every build of the SDK (hosted or copied into a game). The CLI
 * looks for it in a finished zip to warn when the SDK was bundled in.
 */
export const HOSTED_SDK_BUILD_MARKER = "lokiplay-sdk-build-marker-v1";
/** Exact bytes of the injected import map. The CSP hash covers these bytes. */
export const HOSTED_SDK_IMPORT_MAP = `{"imports":{"@lokiplay/sdk":"${HOSTED_SDK_PATH}"}}`;

export const HOSTED_SDK_BANNER_PREFIX = "/*lokiplay-hosted-sdk ";

export function hostedSdkBanner(version: string): string {
  return `${HOSTED_SDK_BANNER_PREFIX}version=${version} compatibility=${HOSTED_SDK_COMPATIBILITY}*/`;
}

export function parseHostedSdkBanner(
  source: string,
): { version: string; compatibility: number } | undefined {
  const firstLine = source.slice(0, 200);
  const match = /^\/\*lokiplay-hosted-sdk version=([0-9A-Za-z.+-]{1,32}) compatibility=(\d{1,3})\*\//.exec(
    firstLine,
  );
  if (!match) return undefined;
  return { version: match[1]!, compatibility: Number(match[2]) };
}

/** CSP script-src token for the injected import map. */
export function hostedSdkImportMapCspSource(): string {
  return `'sha256-${createHash("sha256").update(HOSTED_SDK_IMPORT_MAP, "utf8").digest("base64")}'`;
}

const SUPPORT_TAG = `<script src="${HOSTED_SDK_SUPPORT_PATH}"></script>`;
const IMPORT_MAP_TAG = `<script type="importmap">${HOSTED_SDK_IMPORT_MAP}</script>`;
// The import map must be registered before any module is fetched, so it goes
// first; the support script's dynamic import of the SDK comes after it.
const INJECTED = `${IMPORT_MAP_TAG}${SUPPORT_TAG}`;
const MODULE_SCRIPT = /<script\b[^>]*\btype\s*=\s*["']?module["']?[^>]*>/i;

/**
 * Insert the import map and support script before the first module script.
 * Without one, insert at the end of <head>, creating <head> when absent.
 * Already-injected documents are returned unchanged.
 */
export function injectHostedSdkHtml(html: string): string {
  if (html.includes(SUPPORT_TAG)) return html;
  const module = MODULE_SCRIPT.exec(html);
  if (module) {
    return `${html.slice(0, module.index)}${INJECTED}${html.slice(module.index)}`;
  }
  const headClose = /<\/head\s*>/i.exec(html);
  if (headClose) {
    return `${html.slice(0, headClose.index)}${INJECTED}${html.slice(headClose.index)}`;
  }
  const headOpen = /<head\b[^>]*>/i.exec(html);
  if (headOpen) {
    const end = headOpen.index + headOpen[0].length;
    return `${html.slice(0, end)}${INJECTED}${html.slice(end)}`;
  }
  const htmlOpen = /<html\b[^>]*>/i.exec(html);
  if (htmlOpen) {
    const end = htmlOpen.index + htmlOpen[0].length;
    return `${html.slice(0, end)}<head>${INJECTED}</head>${html.slice(end)}`;
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const end = doctype[0].length;
    return `${html.slice(0, end)}<head>${INJECTED}</head>${html.slice(end)}`;
  }
  return `<head>${INJECTED}</head>${html}`;
}

export const RuntimeReportKindSchema = z.enum([
  "browser-unsupported",
  "load-failed",
  "init-failed",
]);

export const RuntimeReportSchema = z
  .object({
    projectId: z.string().uuid(),
    kind: RuntimeReportKindSchema,
    compatibility: z.number().int().min(0).max(999),
    sdkVersion: z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/),
  })
  .strict();

export type RuntimeReport = z.infer<typeof RuntimeReportSchema>;

/**
 * Classic (non-module) script served at HOSTED_SDK_SUPPORT_PATH. It runs
 * without an import map. If the browser cannot use one, or the hosted SDK
 * fails to load, it tells the play shell (parent frame) and sends a report.
 */
export function renderHostedSdkSupportScript(input: {
  apiOrigin: string;
  sdkVersion: string;
}): string {
  const config = JSON.stringify({
    api: input.apiOrigin.replace(/\/+$/, ""),
    sdk: HOSTED_SDK_PATH,
    version: input.sdkVersion,
    compatibility: HOSTED_SDK_COMPATIBILITY,
  });
  return `(function () {
  var config = ${config};
  var projectId = String(location.hostname).split(".")[0];
  var sent = {};
  function tell(type, kind) {
    try { window.parent.postMessage({ type: type }, "*"); } catch (error) {}
    if (sent[kind] || !/^[0-9a-f-]{36}$/i.test(projectId)) return;
    sent[kind] = true;
    try {
      var body = JSON.stringify({
        projectId: projectId,
        kind: kind,
        compatibility: config.compatibility,
        sdkVersion: config.version
      });
      navigator.sendBeacon(config.api + "/v1/runtime-reports", new Blob([body], { type: "text/plain" }));
    } catch (error) {}
  }
  var supported = typeof HTMLScriptElement !== "undefined" &&
    typeof HTMLScriptElement.supports === "function" &&
    HTMLScriptElement.supports("importmap");
  if (!supported) {
    tell("loki:browser-unsupported", "browser-unsupported");
    return;
  }
  import(config.sdk).catch(function () {
    tell("loki:runtime-unavailable", "load-failed");
  });
})();
`;
}
