const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
const p=await b.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
await p.goto('http://localhost:8910/final.html'); await p.waitForTimeout(1500);
await p.locator('#og').screenshot({path:'/tmp/og/og.png'});
await b.close(); console.log('rendered');})();
