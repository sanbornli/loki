const version = process.argv[2];
const commit = process.argv[3];
if (!version || !commit) {
  throw new Error("usage: verify-deployed-health.mjs <version> <commit>");
}

const urls = ["https://api.lokiplay.cc/health", "https://play.lokiplay.cc/health"];

async function check(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const body = await response.json();
  if (body.version !== version || body.commit !== commit) {
    throw new Error(
      `${url} reported ${body.version} ${body.commit}, expected ${version} ${commit}`,
    );
  }
}

for (let attempt = 1; attempt <= 20; attempt += 1) {
  try {
    for (const url of urls) await check(url);
    console.log(`deployed ${version} ${commit}`);
    process.exit(0);
  } catch (error) {
    if (attempt === 20) throw error;
    console.log(`${error instanceof Error ? error.message : error}; retry ${attempt}/20`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}
