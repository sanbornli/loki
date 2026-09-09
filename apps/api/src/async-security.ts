import { literalOutboundUrls } from "./network-scan.js";

export type AsyncSecurityCategory =
  | "malware"
  | "phishing"
  | "credential_theft"
  | "mining"
  | "prohibited_ads"
  | "allowlist";

export type AsyncSecurityFinding = {
  category: AsyncSecurityCategory;
  confidence: "high" | "uncertain";
  code: string;
  file: string;
  message: string;
};

export type AsyncSecurityDecision = "approved" | "quarantined" | "needs_operator";

const textFile = /\.(html|js|mjs|css|json|txt|svg)$/i;
const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const mining =
  /coinhive|cryptonight|webminer|cryptoloot|minergate|nicehash|wasmminer/i;
const ads =
  /googlesyndication|pagead2\.googlesyndication|doubleclick\.net|adsbygoogle|adservice\.google|carbonads\.net/i;
const cookieExfil =
  /(?:document\.cookie[\s\S]{0,200}(?:fetch|XMLHttpRequest|navigator\.sendBeacon)|(?:fetch|XMLHttpRequest|navigator\.sendBeacon)[\s\S]{0,200}document\.cookie)/i;
const passwordForm =
  /<input[^>]+type=["']password["'][^>]*>[\s\S]{0,800}<form[^>]+action=["']https?:\/\//i;
const phishingCopy =
  /verify (?:your )?(?:account|password|wallet)|seed phrase|connect your wallet/i;
const secretHarvest =
  /localStorage\.(?:getItem|setItem)[\s\S]{0,160}(?:fetch|XMLHttpRequest)/i;

function allowedOrigins(allowlist: string[]): Set<string> {
  return new Set(
    allowlist.flatMap((value) => {
      try {
        return [new URL(value).origin];
      } catch {
        return [];
      }
    }),
  );
}

function decodeText(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

export function reviewDeploymentFiles(
  files: Map<string, Uint8Array>,
  networkAllowlist: string[] = [],
): {
  decision: AsyncSecurityDecision;
  findings: AsyncSecurityFinding[];
  evidenceRefs: string[];
} {
  const findings: AsyncSecurityFinding[] = [];
  const origins = allowedOrigins(networkAllowlist);

  for (const [file, bytes] of files) {
    if (bytes.byteLength >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) {
      findings.push({
        category: "malware",
        confidence: "high",
        code: "PE_EXECUTABLE",
        file,
        message: "Windows PE executable is not a hosted game asset",
      });
    }
    if (!textFile.test(file) || bytes.byteLength > 2_000_000) continue;
    const source = decodeText(bytes);
    if (source.includes(eicar)) {
      findings.push({
        category: "malware",
        confidence: "high",
        code: "EICAR",
        file,
        message: "EICAR test signature",
      });
    }
    if (mining.test(source)) {
      findings.push({
        category: "mining",
        confidence: "high",
        code: "CRYPTO_MINER",
        file,
        message: "Cryptocurrency miner reference",
      });
    }
    if (ads.test(source)) {
      findings.push({
        category: "prohibited_ads",
        confidence: "high",
        code: "THIRD_PARTY_AD_TAG",
        file,
        message: "Third-party ad network tag is not allowed",
      });
    }
    if (cookieExfil.test(source)) {
      findings.push({
        category: "credential_theft",
        confidence: "high",
        code: "COOKIE_EXFIL",
        file,
        message: "Browser cookies are sent to a remote endpoint",
      });
    }
    if (passwordForm.test(source)) {
      findings.push({
        category: "phishing",
        confidence: "high",
        code: "PASSWORD_FORM_POST",
        file,
        message: "Password form posts to a remote action",
      });
    } else if (phishingCopy.test(source)) {
      findings.push({
        category: "phishing",
        confidence: "uncertain",
        code: "PHISHING_COPY",
        file,
        message: "Copy asks for account, wallet, or seed-phrase verification",
      });
    }
    if (secretHarvest.test(source)) {
      findings.push({
        category: "credential_theft",
        confidence: "uncertain",
        code: "LOCALSTORAGE_EXFIL",
        file,
        message: "localStorage is read and sent remotely",
      });
    }
    for (const outboundUrl of literalOutboundUrls(source)) {
      try {
        const url = new URL(outboundUrl);
        if (
          !["localhost", "127.0.0.1"].includes(url.hostname) &&
          !origins.has(url.origin)
        ) {
          findings.push({
            category: "allowlist",
            confidence: "high",
            code: "UNAPPROVED_NETWORK",
            file,
            message: `Outbound origin ${url.origin} is not declared`,
          });
        }
      } catch {
        // Ignore invalid URL tokens.
      }
    }
  }

  const decision: AsyncSecurityDecision = findings.some(
    (finding) => finding.confidence === "high",
  )
    ? "quarantined"
    : findings.some((finding) => finding.confidence === "uncertain")
      ? "needs_operator"
      : "approved";

  return {
    decision,
    findings,
    evidenceRefs: findings.map(
      (finding) => `async-scan:${finding.category}:${finding.code}:${finding.file}`,
    ),
  };
}
