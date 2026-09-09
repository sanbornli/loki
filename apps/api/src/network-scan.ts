const literalUrl = String.raw`(https?:\/\/[^\s"'<>\\\)\`]+)`;

const outboundLiteralPatterns = [
  new RegExp(
    String.raw`\b(?:fetch|import|WebSocket|EventSource|importScripts)\s*\(\s*["'\`]${literalUrl}["'\`]`,
    "gi",
  ),
  new RegExp(
    String.raw`\bnavigator\s*\.\s*sendBeacon\s*\(\s*["'\`]${literalUrl}["'\`]`,
    "gi",
  ),
  new RegExp(
    String.raw`\.open\s*\(\s*["'\`][A-Z]+["'\`]\s*,\s*["'\`]${literalUrl}["'\`]`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:axios\s*\.\s*)?(?:get|post|put|patch|delete|head|options)\s*\(\s*["'\`]${literalUrl}["'\`]`,
    "gi",
  ),
  new RegExp(
    String.raw`\b(?:src|href|action|srcset|formaction|poster)\s*=\s*["']${literalUrl}["']`,
    "gi",
  ),
  new RegExp(
    String.raw`\.\s*(?:src|href|action)\s*=\s*["'\`]${literalUrl}["'\`]`,
    "gi",
  ),
  new RegExp(
    String.raw`@import\s+(?:url\s*\(\s*)?["']?${literalUrl}`,
    "gi",
  ),
  new RegExp(
    String.raw`\burl\s*\(\s*["']?${literalUrl}["']?\s*\)`,
    "gi",
  ),
];

export function literalOutboundUrls(source: string): string[] {
  const urls = new Set<string>();
  for (const pattern of outboundLiteralPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const url = match[1];
      if (url) urls.add(url);
    }
  }
  return [...urls];
}
