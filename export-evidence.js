const fs=require('fs');
const e=JSON.parse(fs.readFileSync('evidence-home.json','utf8'));
const r=e.normalized_result;
const step=r.steps[r.steps.length-1];
for(const [kind,file] of [['screenshot','home-viewport.png'],['dom','runtime-dom.html'],['accessibility','runtime-accessibility.txt']]) {
  const a=step.artifacts[kind];
  if(a.state==='captured') {
    if(kind==='screenshot') fs.writeFileSync(file,Buffer.from(a.value.data_base64,'base64'));
    else fs.writeFileSync(file,a.value.text,'utf8');
    console.log(kind,file,a.value.bytes,a.value.sha256);
  }
}
console.log('storage',JSON.stringify(step.artifacts.storage.value,null,2));
console.log('url',step.after_url);
