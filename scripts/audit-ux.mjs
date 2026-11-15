// Repeatable visual + accessibility audit for the public static portfolio.
// Runs in GitHub Actions with Playwright and axe-core, writes a report and screenshots.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import fs from 'node:fs/promises';
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
    await page.waitForFunction(()=>window.HubDirectory?.sites()?.length===7 &&
      window.HubDirectory?.projects()?.length===28);
    await page.addScriptTag({content:axe.source});
    const scenarios=[
      {tab:'sites',view:'showcase'},{tab:'sites',view:'grid'},
      {tab:'projects',view:'grid'},{tab:'projects',view:'showcase'}
    ];
    for(const scenario of scenarios) {
      await page.locator('#'+(scenario.tab==='sites'?'sitesTab':'projectsTab')).click();
      await page.locator('#'+(scenario.view==='grid'?'viewGrid':'viewAtlas')).click();
      if(scenario.view==='showcase') {
        await page.locator('#atlasCanvas canvas.atlas-webgl')
          .waitFor({state:'visible',timeout:15000});
        await page.waitForFunction(()=>window.HubAtlas.debug().hasTexture,
          null,{timeout:12000}).catch(()=>{});
      } else {
        const gridSelector='#'+(scenario.tab==='sites'?'sitesGrid':'projectsGrid');
        await page.locator(gridSelector+' .work-card').first().waitFor({state:'visible'});
        await page.waitForFunction(selector => {
          const images=[...document.querySelectorAll(selector+' .work-card img[data-sources]')].slice(0,2);
          return images.length>0 && images.every(img =>
            img.complete && img.naturalWidth>0 &&
            img.classList.contains('is-loaded') &&
            Number.parseFloat(getComputedStyle(img).opacity)>=.98);
        },gridSelector,{timeout:15000});
      }
      await page.screenshot({path:new URL(size.name+'-'+scenario.tab+'-'+scenario.view+'.png',output)
        .pathname,animations:'disabled',timeout:15000,fullPage:false});
      const metrics=await page.evaluate(()=>{
        const nodes=[...document.querySelectorAll(
          '.work-card:not([hidden]) .work-content')].filter(el=>el.getClientRects().length);
        const clipped=nodes.filter(el=>{
          const last=el.querySelector('.work-source-row');
          if(!last)return false;
          return last.getBoundingClientRect().bottom > el.getBoundingClientRect().bottom + 2;
        }).length;
        const grid=Array.from(document.querySelectorAll('.sites-grid,.projects-grid'))
          .find(el=>!el.hidden);
        const markers=[...document.querySelectorAll('#atlasPagination .atlas-marker')];
        const smallControls=[...document.querySelectorAll('.work-source-row .forge-link')]
          .filter(el=>el.getClientRects().length).filter(el=>{
            const box=el.getBoundingClientRect();return box.width<24||box.height<24;
          }).length;
        return {
          scrollWidth:document.documentElement.scrollWidth,
          viewportWidth:innerWidth,
          scrollHeight:document.documentElement.scrollHeight,
          columns:grid?getComputedStyle(grid).gridTemplateColumns.split(' ').length:0,
          clippedCardFooters:clipped,
          undersizedForgeLinks:smallControls,
          visibleMarkers:markers.filter(el=>el.getClientRects().length).length,
          textureCount:window.HubAtlas.debug?.().activeTextures??null,
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
      const record={...size,scenario:scenario.tab+'-'+scenario.view,metrics,
        accessibility,errors:[...errors]};
      results.push(record);
      const severe=accessibility.filter(v=>v.impact==='critical'||v.impact==='serious');
      console.log('[AUDIT]',size.name,record.scenario,
        'overflow='+Math.max(0,metrics.scrollWidth-metrics.viewportWidth),
        'clipped='+metrics.clippedCardFooters,
        'smallLinks='+metrics.undersizedForgeLinks,
        'verticalScroll='+(scenario.view==='showcase'?
          Math.max(0,metrics.scrollHeight-size.height):'n/a'),
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
  // The expanded 3D and larger typography allow natural vertical scroll.
  (r.scenario.endsWith('-showcase') &&
    r.metrics.scrollHeight>r.height+440) ||
  r.metrics.clippedCardFooters>0 || r.metrics.undersizedForgeLinks>0 || r.errors.length ||
  r.accessibility.some(v=>v.impact==='critical'||v.impact==='serious'));
if(failures.length) {
  throw new Error('[AUDIT-FAIL] '+failures.map(r=>r.name+':'+r.scenario+
    (r.metrics.clippedCardFooters?' (clipped '+r.metrics.clippedCardFooters+')':'')).join(', '));
}
