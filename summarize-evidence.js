const fs=require('fs');
const e=JSON.parse(fs.readFileSync('evidence-home.json','utf8'));
const r=e.normalized_result||e.raw_result;
console.log('evidence_id',e.evidence_id);
console.log('subject',e.subject);
console.log('operation',e.operation);
console.log('limitations',e.limitations);
console.log('normalized keys',Object.keys(r));
console.log('capture keys',Object.keys(r.capture||{}));
const cap=r.capture||r;
console.log('browser',cap.browser);
console.log('scenario',cap.scenario);
console.log('steps', (cap.steps||[]).map(s=>({i:s.step_index,id:s.step_id,status:s.status,url:s.after_url,artifacts:Object.fromEntries(Object.entries(s.artifacts||{}).map(([k,v])=>[k,v.state]))})));
console.log('events',cap.events?.retained, cap.events?.dropped);
const kinds={}; for(const x of cap.events?.items||[]) kinds[x.kind]=(kinds[x.kind]||0)+1; console.log('kinds',kinds);
const last=cap.steps?.[cap.steps.length-1];
for(const k of ['screenshot','dom','accessibility']) {
 const a=last?.artifacts?.[k];
 console.log('\nARTIFACT',k, a?.state, a?.value?Object.keys(a.value):'');
 if(a?.state==='captured') {
   if(k==='screenshot') console.log(JSON.stringify(a.value,null,2));
   else { fs.writeFileSync(`runtime-${k}.txt`, a.value.text); console.log('text bytes',a.value.bytes,'sha',a.value.sha256); }
 }
}
console.log('\nNETWORK URLS');
for(const x of cap.events?.items||[]) if(x.kind==='request') console.log(x.resource_type, x.method, x.url);
