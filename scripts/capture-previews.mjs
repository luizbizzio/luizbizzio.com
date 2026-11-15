// Capture real, high-resolution website screenshots into the repository.
// No screenshot history or external image service is used by the live website.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const root = process.cwd();
const sites = JSON.parse(await fs.readFile(path.join(root,'public/sites.json'),'utf8'));
const folder = path.join(root,'public/previews');
await fs.mkdir(folder,{recursive:true});
const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
let captured = 0, kept = 0;
try {
  for(const site of sites) {
    const id = String(site.id || '');
    if(!/^[a-z0-9-]+$/.test(id)) continue;
    const target = path.join(folder,id+'.jpg');
    const page = await browser.newPage({
      viewport:{width:1600,height:1000},
      deviceScaleFactor:2,
      colorScheme:'dark',
      reducedMotion:'reduce',
      locale:'en-US'
    });
    try {
      const response = await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:38000});
      if(!response?.ok()) throw Error('HTTP '+response?.status());
      await page.evaluate(() => Promise.race([
        document.fonts?.ready || Promise.resolve(),
        new Promise(resolve => setTimeout(resolve,5000))
      ]));
      await page.waitForTimeout(1900);
      if(id === 'mypixel') {
        try {
          const demo = await page.request.get('https://raw.githubusercontent.com/luizbizzio/mypixel/main/demo/original.png');
          if(demo.ok()) {
            const file = page.locator('#fileInput');
            if(await file.count()) await file.setInputFiles({
              name:'pixel-art-demo.png',mimeType:'image/png',buffer:await demo.body()
            });
          }
          await page.waitForTimeout(500);
        } catch(error) { console.warn('[DEMO-KEPT]',id,error.message); }
      }
      if(id === 'siteguard') {
        await page.evaluate(() => {
          const heading = [...document.querySelectorAll('h2,h3')]
            .find(node => !/secret image/i.test(node.textContent || ''));
          heading?.scrollIntoView({block:'start',behavior:'instant'});
        }).catch(()=>{});
        await page.waitForTimeout(400);
      }
      const validity = await page.evaluate(() => ({
        title:document.title,
        text:(document.body?.innerText || '').slice(0,5000)
      }));
      const signal = (validity.title+' '+validity.text).toLowerCase();
      if(validity.text.trim().length < 20 ||
        (/(just a moment|attention required|error 403|access denied|verify you are human)/.test(signal) &&
          validity.text.length < 1600)) throw Error('Blocked or empty page');
      const jpg = await page.screenshot({
        type:'jpeg',quality:94,animations:'disabled',caret:'hide',fullPage:false
      });
      if(jpg.length < 8000) throw Error('Unexpectedly small capture');
      const previous = await fs.readFile(target).catch(()=>null);
      if(!previous || !previous.equals(jpg)) await fs.writeFile(target,jpg);
      console.log('[CAPTURE]',id, '3200x2000',jpg.length,'bytes');
      captured++;
    } catch(error) {
      console.warn('[PRESERVED]',id,error.message);
      kept++;
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
console.log('Website screenshots:',captured,'captured,',kept,'preserved');
