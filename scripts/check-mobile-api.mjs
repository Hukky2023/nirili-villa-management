// Read-only mobile API smoke check; does not send credentials or modify bookings.
const base = process.env.NIRILI_BASE_URL || 'https://nirili-villa.nirili-management.workers.dev';
const endpoints = ['/api/mobile/v1/me', '/api/mobile/v1/dashboard'];
let ready = true;
for (const path of endpoints) {
  try {
    const result = await fetch(new URL(path, base), {headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    const kind = result.headers.get('content-type') || '';
    const ok = result.status === 401 && kind.includes('application/json');
    console.log(`${ok?'PASS':'BLOCKED'} ${path} HTTP ${result.status} ${kind}`);
    if (!ok) ready = false;
  } catch(error) {
    console.error(`BLOCKED ${path}: ${String(error)}`);
    ready = false;
  }
}
if (!ready) {
 console.error('Mobile authentication API is not verified. Do not enable production mobile login.');
 process.exitCode = 1;
}
