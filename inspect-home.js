const fs=require('fs');
const html=fs.readFileSync('homepage.html','utf8');
const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
const srcs=[...html.matchAll(/src="([^"]+)"/g)].map(m=>m[1]);
console.log('LINKS'); console.log([...new Set(links)].join('\n'));
console.log('\nSRCS'); console.log([...new Set(srcs)].join('\n'));
console.log('\nHTML LENGTH',html.length);
