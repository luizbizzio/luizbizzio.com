// Discover and cache real README artwork before deployment. Visitors never
// fetch images, metadata or API responses directly from GitHub.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const coverRoot = path.join(publicRoot, 'previews/covers');
const owner = 'luizbizzio';
const curated = [
  ['mypixel.jpg','mypixel/main/screenshots/desktop-screenshot.jpg'],
  ['refreshrate.png','refreshrate/main/refreshrate.png'],
  ['silent-chipolo.jpg','silent-chipolo/main/images/04-disc-removed.jpg'],
  ['solis-inverter-exporter.png','solis-inverter-exporter/main/images/metrics.png'],
  ['tailscale-control.webp','tailscale-control/main/assets/demo/demo.webp'],
  ['capybara.jpg','capybara/main/public/social-preview.jpg'],
  ['siteguard.jpg','siteguard/main/demo/social-preview.jpg'],
  ['BannerlordFG.png','BannerlordFG/main/assets/heading.png'],
  ['archive-preview.png','archive-preview/main/assets/archive-preview-cover.png'],
  ['taskbar-zones.png','taskbar-zones/main/assets/taskbar-zones-cover.png'],
  ['task-manager-pause-button.png','task-manager-pause-button/main/assets/task-manager-pause-button-cover.png'],
  ['recycle-bin-file-preview.png','recycle-bin-file-preview/main/assets/recycle-bin-file-preview-comparison.png']
];
const screenshotRepos = new Set(['git-history-reset','local-https']);
const skipWords = /(?:badge|shields|license|donate|sponsor|avatar|emoji|favicon|spinner|button|icon|logo|workflow|status)/i;
const desiredWords = /(?:screenshot|screen[-_ ]?shot|preview|cover|hero|banner|demo|showcase|gallery|interface|sample|example|heading)/i;
const availableHosts = new Set([
  'raw.githubusercontent.com','github.com','user-images.githubusercontent.com',
  'githubusercontent.com','objects.githubusercontent.com','opengraph.githubassets.com'
]);
const safeRepo = value => /^[a-z0-9._-]+$/i.test(value);
await fs.mkdir(coverRoot, {recursive:true});

async function request(url, maxBytes = 9 * 1024 * 1024) {
  const response = await fetch(url, {signal:AbortSignal.timeout(9000),
    headers:{'User-Agent':'LuizBizzio-Hub-Asset-Cache/1.0'}});
  if (!response.ok) throw Error('HTTP ' + response.status);
  const len = Number(response.headers.get('content-length') || '0');
  if (len > maxBytes) throw Error('Image too large');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw Error('Image too large');
  return buffer;
}
function formatOf(body) {
  const png = body.length > 24 && body.subarray(0,8)
    .equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (png) return body.readUInt32BE(16) >= 320 &&
    body.readUInt32BE(20) >= 170 ? 'png' : '';
  const jpg = body.length > 1500 && body[0] === 0xff &&
    body[1] === 0xd8 && body[2] === 0xff;
  if (jpg) return 'jpg';
  const webp = body.length > 1500 &&
    body.toString('ascii',0,4) === 'RIFF' &&
    body.toString('ascii',8,12) === 'WEBP';
  return webp ? 'webp' : '';
}
function repoImageUrl(value, repo, branch) {
  if (!value || /^(?:data:|javascript:|#)/i.test(value)) return '';
  try {
    const decoded = value.replace(/&amp;/g,'&').trim();
    const base = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/' + branch + '/';
    const url = new URL(decoded, base);
    if (url.protocol !== 'https:' || !availableHosts.has(url.hostname)) return '';
    if (url.hostname === 'github.com') {
      const prefix = '/' + owner + '/' + repo + '/';
      if (url.pathname.startsWith(prefix + 'blob/')) {
        return 'https://raw.githubusercontent.com' +
          url.pathname.replace(prefix + 'blob/',prefix) + url.search;
      }
    }
    return url.href;
  } catch { return ''; }
}
function readmeCandidates(markdown, repo, branch) {
  const matches = [];
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g))
    matches.push(match[1] || match[2]);
  for (const match of markdown.matchAll(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi))
    matches.push(match[1] || match[2] || match[3]);
  return [...new Set(matches)].filter(v => /\.(?:png|jpe?g|webp)(?:[?#]|$)/i.test(v) ||
    /user-attachments\/assets|githubusercontent\.com/i.test(v))
    .filter(v => !skipWords.test(v))
    .sort((a,b) => Number(desiredWords.test(b)) - Number(desiredWords.test(a)))
    .map(v => repoImageUrl(v,repo,branch)).filter(Boolean).slice(0,8);
}
async function artworkFromReadme(repo) {
  for (const branch of ['main','master']) {
    for (const name of ['README.md','readme.md']) {
      let markdown;
      try {
        markdown = (await request('https://raw.githubusercontent.com/' + owner +
          '/' + repo + '/' + branch + '/' + name, 900000)).toString('utf8');
      } catch { continue; }
      for (const url of readmeCandidates(markdown,repo,branch)) {
        try {
          const body = await request(url);
          const ext = formatOf(body);
          if (ext && body.length >= 6000) return {body,ext,source:'README'};
        } catch {}
      }
      // A README was found but had no usable illustration. Try the next branch.
      break;
    }
  }
  return null;
}
async function githubCard(repo) {
  // GitHub's real repository Open Graph card is a last resort, not made-up artwork.
  const body = await request('https://opengraph.githubassets.com/1/' + owner + '/' + repo);
  const ext = formatOf(body);
  if (!ext || body.length < 6000) throw Error('No valid GitHub preview');
  return {body,ext,source:'GitHub repository card'};
}
async function githubScreenshot(repo) {
  // Only used if the repository has no usable README image and GitHub's
  // Open Graph image is rate-limited. This is a real captured GitHub page.
  const {chromium} = await import('playwright');
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const page = await browser.newPage({
      viewport:{width:1600,height:950},deviceScaleFactor:2,colorScheme:'dark'
    });
    const response = await page.goto('https://github.com/' + owner + '/' + repo,
      {waitUntil:'domcontentloaded',timeout:22000});
    if (!response?.ok()) throw Error('GitHub screenshot HTTP ' + response?.status());
    await page.locator('main').first().waitFor({timeout:7000});
    if (!(await page.title()).toLowerCase().includes(repo.toLowerCase()))
      throw Error('Unexpected GitHub page');
    await page.waitForTimeout(750);
    const body = await page.screenshot({
      type:'jpeg',quality:94,animations:'disabled',caret:'hide',fullPage:false
    });
    return {body,ext:'jpg',source:'GitHub page screenshot'};
  } finally {
    await browser.close();
  }
}
async function saveCover(repo, art) {
  const filename = repo + '.' + art.ext;
  const full = path.join(coverRoot,filename);
  const previous = await fs.readFile(full).catch(()=>null);
  if (!previous || !previous.equals(art.body)) await fs.writeFile(full,art.body);
  return './previews/covers/' + filename;
}
const covers = {};
for (const [file,remote] of curated) {
  const name = file.slice(0,file.lastIndexOf('.'));
  const full = path.join(coverRoot,file);
  try {
    const isDemo = name === 'tailscale-control';
    const original = await request('https://raw.githubusercontent.com/' + owner +
      '/' + remote, isDemo ? 24 * 1024 * 1024 : 9 * 1024 * 1024);
    let body = original;
    if (isDemo) {
      // The original is a 16 MB animation. Preserve its actual first frame
      // as a lightweight, high-quality local still for fast gallery loading.
      const sharp = (await import('sharp')).default;
      body = await sharp(original, {pages:1})
        .resize({width:1800,withoutEnlargement:true})
        .webp({quality:94,effort:5}).toBuffer();
      console.log('[OPTIMIZED]', name, original.length, '->', body.length);
    }
    if (!formatOf(body) || body.length < 6000) throw Error('Invalid original cover');
    const existing = await fs.readFile(full).catch(()=>null);
    if (!existing || !existing.equals(body)) await fs.writeFile(full,body);
    console.log('[CURATED]',name,body.length);
  } catch(e) {
    console.warn('[CURATED-KEPT]',name,e.message);
  }
  if (await fs.stat(full).catch(()=>null)) covers[name] = './previews/covers/' + file;
}
const catalog = JSON.parse(await fs.readFile(path.join(publicRoot,'project-metadata.json'),'utf8'));
const repos = Object.keys(catalog.repos).filter(safeRepo);
let next = 0, readmeFound = 0, cardsFound = 0, skipped = 0;
await Promise.all(Array.from({length:3},async()=>{
  while (next < repos.length) {
    const repo = repos[next++];
    if (covers[repo]) continue;
    // Two tools are intentionally shown as genuine GitHub page captures,
    // rather than README graphics or Open Graph placeholder cards.
    if (screenshotRepos.has(repo)) {
      try {
        const screenshot = await githubScreenshot(repo);
        covers[repo] = await saveCover(repo,screenshot);
        cardsFound++;
        console.log('[GITHUB-SCREENSHOT]',repo,screenshot.body.length);
        continue;
      } catch(error) {
        console.warn('[SCREENSHOT-KEPT]',repo,error.message);
      }
    }
    // Preserve previously verified local art during transient GitHub outages.
    const existing = (await fs.readdir(coverRoot)).find(name =>
      name.startsWith(repo + '.') && /\.(png|jpg|webp)$/i.test(name));
    if (existing) {
      covers[repo] = './previews/covers/' + existing;
      continue;
    }
    try {
      let art = await artworkFromReadme(repo);
      if (!art) {
        try { art = await githubCard(repo); }
        catch (error) {
          console.warn('[CARD-UNAVAILABLE]',repo,error.message);
          art = await githubScreenshot(repo);
        }
      }
      covers[repo] = await saveCover(repo,art);
      if (art.source === 'README') readmeFound++;
      else cardsFound++;
      console.log('[COVER]',repo,art.source,art.body.length);
    } catch(e) {
      skipped++;
      console.warn('[MISSING]',repo,e.message);
    }
  }
}));
const ordered = Object.fromEntries(Object.entries(covers).sort((a,b) => a[0].localeCompare(b[0])));
await fs.writeFile(path.join(coverRoot,'index.json'),
  JSON.stringify({version:1,source:'Self-hosted README and GitHub artwork',covers:ordered},null,2) + '\n');
console.log('Cover cache: ' + Object.keys(covers).length + '/' + repos.length +
  ' repos, new README images: ' + readmeFound + ', GitHub cards: ' + cardsFound +
  ', unavailable: ' + skipped);
