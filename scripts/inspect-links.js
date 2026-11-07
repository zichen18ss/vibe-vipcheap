const s=require('../lib/snapshots.json');
for (const [k,h] of Object.entries(s)) {
  const hrefs=[...h.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  const internal=[...new Set(hrefs.filter(x=>x.startsWith('/')))];
  console.log(k, JSON.stringify(internal));
}
