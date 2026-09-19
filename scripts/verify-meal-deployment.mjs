// Read-only production smoke check. Never reads accounts or creates orders/bills.
import assert from 'node:assert/strict';
const base = process.env.NIRILI_SITE_URL || 'https://nirili-villa.nirili-management.workers.dev';
const attempts = Number(process.env.MEAL_VERIFY_ATTEMPTS || 36);
for (let attempt = 1; attempt <= attempts; attempt++) {
  try {
    const response = await fetch(new URL('/api/meal-schedule?verify=' + Date.now(), base), {
      headers: {'Cache-Control': 'no-cache'}, signal: AbortSignal.timeout(15000)
    });
    assert.equal(response.status, 200, 'Meal schedule endpoint HTTP status');
    const data = await response.json();
    assert.equal(data.version, 'half-board-daily-v1');
    assert.equal(data.timeZone, 'Indian/Maldives');
    assert.deepEqual(data.regular, {breakfast: ['07:00','09:00'], lunch: ['12:00','15:00'], dinner: ['18:00','21:00']});
    assert.deepEqual(data.friday, {breakfast: ['07:00','09:00'], lunch: ['13:30','15:00'], dinner: ['18:00','21:00']});
    console.log('LIVE VERIFIED: ' + base + ' serves ' + data.version + ' with the confirmed Maldives meal hours.');
    process.exit(0);
  } catch (error) {
    console.log('Verification attempt ' + attempt + '/' + attempts + ': ' + error.message);
    if (attempt === attempts) throw Error('The new meal rules could not be verified on the production site. Check the Cloudflare deployment.');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}
