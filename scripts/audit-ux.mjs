// Repeatable visual + accessibility audit for the public static portfolio.
// Runs in GitHub Actions with Playwright and axe-core, writes a report and screenshots.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import axe from 'axe-core';

const origin = 'http://127.0.0.1:8124';
const output = new URL('../audit-output/',import.meta.url);
await fs.mkdir(output,{recursive:true});
const server = spawn('python3', ['-m','http.server','8124','--bind','127.0.0.1',
  '--directory','public'], {cwd:process.cwd(),stdio:'ignore'});
let browser;
const results = [];
try {
  let ready=false;
  for(let i=0;i<50;i++) {
    try {const r=await fetch(origin+'/sites.json');if(r.ok){ready=true;break;}}
    catch {}
    await delay(150);
  }
  if(!ready)throw Error('Audit server not available');
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const sizes=[
    {name:'desktop',width:1440,height:900},
    {name:'tablet',width:768,height:1024},
    {name:'mobile',width:390,height:844},
    {name:'small-mobile',width:320,height:700}
  ];
  for(const size of sizes) {
    const page=await browser.newPage({viewport:{width:size.width,height:size.height},
      colorScheme:'dark',deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://api.github.com/**',r=>r.abort());
    await page.route('https://raw.githubusercontent.com/**',r=>r.abort());
    await page.route('https://cdn.jsdelivr.net/**',r=>r.abort());
    await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.HubDirectory?.sites()?.length===8 &&
      window.HubDirectory?.projects()?.length===32);
    await page.addScriptTag({content:axe.source});
    for (const tab of ['projects', 'sites']) {
      await page.locator(tab === 'sites' ? '#sitesTab' : '#projectsTab').click();
      await page.locator('#projectsList .repository-entry').first().waitFor({state:'visible'});
      await page.locator('#recentReleases').waitFor({state:'visible'});
      await page.locator('.repository-preview img').first().evaluate(img => img.decode());
      await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
      const screenshotPath = fileURLToPath(new URL(size.name + '-' + tab + '-list.png',output));
      await page.screenshot({path:screenshotPath,animations:'disabled',timeout:15000,fullPage:false});
      const metrics=await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll(
          '.repository-entry')].filter(el=>el.getClientRects().length);
        const clipped=nodes.filter(el=>{
          const last=el.querySelector('.repository-sources');
          if(!last)return false;
          return last.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 2;
        }).length;
        const smallControls=[...document.querySelectorAll('a.source-link')]
          .filter(el=>el.getClientRects().length).filter(el=>{
            const box=el.getBoundingClientRect();return box.width<24||box.height<24;
          }).length;
        return {
          scrollWidth:document.documentElement.scrollWidth,
          viewportWidth:innerWidth,
          scrollHeight:document.documentElement.scrollHeight,
          clippedCardFooters:clipped,
          undersizedForgeLinks:smallControls,
          cardCount:nodes.length
        };
      });
      const accessibility=await page.evaluate(async()=> {
        const audit=await window.axe.run(document,{
          runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}
        });
        return audit.violations.map(v=>({
          id:v.id,impact:v.impact,help:v.help,affected:v.nodes.length,
          examples:v.nodes.slice(0,3).map(n=>n.target.join(' '))
        }));
      });
      const record={...size,scenario:tab,metrics,
        accessibility,errors:[...errors]};
      results.push(record);
      const severe=accessibility.filter(v=>v.impact==='critical'||v.impact==='serious');
      console.log('[AUDIT]',size.name,record.scenario,
        'overflow='+Math.max(0,metrics.scrollWidth-metrics.viewportWidth),
        'clipped='+metrics.clippedCardFooters,
        'smallLinks='+metrics.undersizedForgeLinks,
        'severe='+severe.map(v=>v.id+'('+v.affected+')').join(','));
    }
    await page.close();
  }
} finally {
  await fs.writeFile(new URL('report.json',output),
    JSON.stringify({generatedAt:new Date().toISOString(),results},null,2)+'\n');
  await browser?.close();
  server.kill('SIGTERM');
}
const failures=results.filter(r=>r.metrics.scrollWidth>r.metrics.viewportWidth+2 ||
  r.metrics.clippedCardFooters>0 || r.metrics.undersizedForgeLinks>0 || r.errors.length ||
  r.accessibility.some(v=>v.impact==='critical'||v.impact==='serious'));
if(failures.length) {
  throw new Error('[AUDIT-FAIL] '+failures.map(r=>r.name+':'+r.scenario+
    (r.metrics.clippedCardFooters?' (clipped '+r.metrics.clippedCardFooters+')':'')).join(', '));
}
