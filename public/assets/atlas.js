/* THE PROJECT ROOM
   A spatial, screenshot-first catalogue of real work.
   Three.js r187 is self-hosted and loaded only when this view is used.
   No tracking, randomized layouts, external image services or continuous idle render. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = {
    root: $('atlasView'), host: $('atlasCanvas'), stage: $('atlasStage'),
    count: $('atlasCount'), status: $('atlasStatus'), index: $('atlasSelectedIndex'),
    category: $('atlasCategory'), title: $('atlasTitle'),
    description: $('atlasDescription'), created: $('atlasCreated'),
    updated: $('atlasUpdated'), favicon: $('atlasFavicon'), identity: $('atlasIdentityForges'),
    explore: $('atlasExplore'), quickExplore: $('atlasQuickExplore'),
    visit: $('atlasVisit'), select: $('atlasSelect'), prev: $('atlasPrev'),
    next: $('atlasNext'), pagination: $('atlasPagination'),
    progress: $('atlasProgress'), collection: $('atlasCollection')
  };
  const COLORS = {
    Games: '#e5b38d', Tools: '#bbd1ba', Windhawk: '#aabfd5',
    Hardware: '#d5be9c', Experiments: '#c9b6d8', Other: '#c7c9c0'
  };
  const state = {
    items: [], selected: 0, active: false, signature: '', tab: 'sites',
    generation: 0, THREE: null, promise: null, scene: null, camera: null,
    renderer: null, cards: [], collections:new Map(), currentCollection:null,
    requestedTab:'', switchSerial:0, shadowMap:null, reflectionMask:null,
    prewarmStarted:false, raf: 0, raycaster: null, pointer: null,
    stageWidth: 0, stageHeight: 0, pointerDown: null, moved: false,
    fallback: false, textures: [], drag: 0, wheelAt: 0,
    motion: {position: 0, target: 0, velocity: 0, lastTime: 0}
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const compactPagination = matchMedia('(max-width:700px)');
  const source = () => window.HubDirectory;
  const safe = text => String(text ?? '').replace(/[&<>"']/g, ch =>
    ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const mod = (n, d) => ((n % d) + d) % d;

  function itemKey(item) {
    return (item && (item.repo || item.id || item.name)) || '';
  }
  function imagesFor(item) {
    return (source()?.images(item) || []).filter(v => typeof v === 'string');
  }
  function isWebGL() {
    return !!(state.renderer && state.renderer.domElement.isConnected);
  }
  function displayDate(value) {
    return source()?.date(value) || '—';
  }
  function renderingDpr(width, height) {
    // Native device resolution alone is insufficient on common 1x desktops.
    // Super-sample screenshot edges while bounding the framebuffer for laptops.
    const coarse=matchMedia('(pointer:coarse)').matches;
    const density=Math.max(window.devicePixelRatio || 1,coarse ? 1.55 : 1.85);
    return Math.max(1,Math.min(density,2.5,4096/width,2560/height));
  }
  function updateMetadata() {
    if (!state.items.length) return;
    const item = state.items[state.selected];
    const color = COLORS[item.category] || COLORS.Other;
    el.index.textContent =
      String(state.selected + 1).padStart(2, '0') + ' / ' +
      String(state.items.length).padStart(2, '0');
    el.title.textContent = item.name;
    el.description.textContent = item.description || 'An independent open-source project.';
    // Long descriptions are scrollable instead of being silently cropped.
    // Only add a keyboard stop when this text actually overflows.
    el.description.tabIndex = -1;
    requestAnimationFrame(() => {
      if(state.items[state.selected]!==item || !state.active)return;
      el.description.tabIndex =
        el.description.scrollHeight > el.description.clientHeight + 2 ? 0 : -1;
    });
    el.created.textContent = displayDate(item.created);
    el.updated.textContent = displayDate(item.updated);
    const website = item.kind === 'site';
    // The website favicon identifies the title in the right-hand inspector.
    // Keep the 3D screenshot entirely free of badges and floating geometry.
    const icon = website ? source()?.favicon(item) : '';
    el.favicon.hidden = !icon;
    if (icon) {
      el.favicon.onerror = () => {
        if (el.favicon.getAttribute('src') === icon) el.favicon.hidden = true;
      };
      el.favicon.src = icon;
    } else el.favicon.removeAttribute('src');
    // The detail view contains repository mirrors, so the 3D inspector
    // displays each project name and action once.
    el.identity.hidden = true;
    el.identity.replaceChildren();
    el.category.textContent = (item.category || 'OTHER').toUpperCase();
    el.category.style.setProperty('--atlas-category-color', color);
    // The title already identifies the selected item; keep the navigation
    // menu as an action instead of showing the same name twice.
    el.select.value = '';
    el.status.textContent =
      String(state.selected + 1).padStart(2, '0') + ' / ' +
      String(state.items.length).padStart(2, '0');
    el.collection.textContent = state.tab === 'sites' ? 'WEBSITES' : 'REPOSITORIES';
    el.progress.style.width = ((state.selected + 1) / state.items.length * 100) + '%';
    el.visit.href = item.url;
    el.visit.innerHTML = 'Open <span aria-hidden="true">↗</span>';
    el.visit.setAttribute('aria-label',
      (website ? 'Open website for ' : 'Open repository for ') + item.name);
    el.pagination.hidden = !state.active || state.items.length <= 1;
    renderPagination();
    el.prev.disabled = state.items.length <= 1;
    el.next.disabled = state.items.length <= 1;
  }

  function alignPagination() {
    // The pagination is a sibling of directoryPanel: keep it outside the
    // artwork while centering it precisely under the left 3D stage.
    const stage = el.stage.getBoundingClientRect();
    const directory = el.pagination.parentElement?.getBoundingClientRect();
    if (!directory?.width || !stage.width) return;
    const center = stage.left - directory.left + stage.width / 2;
    el.pagination.style.setProperty('--atlas-pagination-center', center + 'px');
  }

  function renderPagination() {
    const count = state.items.length;
    // Show every position, with clickable targets when they fit.
    // On narrow screens, large collections use visual-only markers. The
    // 42px arrows and project chooser remain accessible for navigation.
    const interactive = !(compactPagination.matches && count > 7);
    const tag = interactive ? 'button' : 'span';
    el.pagination.style.setProperty('--pagination-count', String(count));
    if (interactive) el.pagination.removeAttribute('aria-hidden');
    else el.pagination.setAttribute('aria-hidden', 'true');
    if (el.pagination.children.length !== count ||
        el.pagination.firstElementChild?.tagName.toLowerCase() !== tag) {
      el.pagination.replaceChildren();
      for (let i = 0; i < count; i++) {
        const marker = document.createElement(tag);
        if (interactive) {
          marker.type = 'button';
          marker.addEventListener('click', () => select(i));
        }
        marker.className = 'atlas-marker';
        marker.dataset.index = String(i);
        el.pagination.append(marker);
      }
    }
    for (let i = 0; i < count; i++) {
      const item = state.items[i];
      const marker = el.pagination.children[i];
      const active = i === state.selected;
      marker.title = item.name;
      marker.setAttribute('aria-label', 'Select ' + item.name +
        ', ' + (i + 1) + ' of ' + count);
      if (active) marker.setAttribute('aria-current', 'page');
      else marker.removeAttribute('aria-current');
      marker.classList.toggle('is-active', active);
    }
    el.pagination.setAttribute('aria-label', 'Showcase position ' +
      (state.selected + 1) + ' of ' + count);
    alignPagination();
  }

  function animateInspector() {
    if (reduced.matches || !state.active) return;
    const targets = [el.favicon, el.category, el.title, el.description,
      el.created, el.updated];
    for (const node of targets) {
      if (!node || node.hidden || typeof node.animate !== 'function') continue;
      node.getAnimations().forEach(animation => animation.cancel());
      node.animate([
        {opacity: .38, transform: 'translate3d(0, 7px, 0)'},
        {opacity: 1, transform: 'translate3d(0, 0, 0)'}
      ], {duration: 290, easing: 'cubic-bezier(.16, 1, .3, 1)'});
    }
  }

  function placeholderTexture(THREE, item, index) {
    // Purpose-built typographic card for repos without screenshots.
    const canvas = document.createElement('canvas');
    // High-resolution typography: retina desktop, bounded mobile textures.
    const scale = el.host.clientWidth > 640 ? 1.5 : 1.0;
    canvas.width = Math.round(1024 * scale);
    canvas.height = Math.round(640 * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    const color = COLORS[item.category] || COLORS.Other;
    const accent = color;
    ctx.fillStyle = '#171d1b';
    ctx.fillRect(0, 0, 1024, 640);
    ctx.strokeStyle = 'rgba(198,213,199,.062)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1024; x += 72) {ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,640);ctx.stroke();}
    for (let y = 0; y < 640; y += 72) {ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(1024,y);ctx.stroke();}
    ctx.strokeStyle = 'rgba(204,220,206,.19)';
    ctx.strokeRect(38, 38, 948, 564);
    ctx.fillStyle = accent;
    ctx.fillRect(56, 60, 38, 4);
    ctx.font = '600 21px monospace';
    ctx.fillStyle = '#a5b2ab';
    ctx.fillText('LUIZBIZZIO  /  PROJECT ARCHIVE', 112, 72);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.fillText(String(index + 1).padStart(2, '0'), 953, 72);
    ctx.textAlign = 'left';

    let fontSize = 94;
    const chunks = String(item.name).split(/\s+/);
    const lines = [];
    let current = '';
    ctx.font = '650 ' + fontSize + 'px Arial, sans-serif';
    for (const word of chunks) {
      const candidate = current ? current + ' ' + word : word;
      if (ctx.measureText(candidate).width > 840 && current) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    if (current) lines.push(current);
    while (lines.length > 3 || lines.some(v => {
      ctx.font = '650 ' + fontSize + 'px Arial, sans-serif';
      return ctx.measureText(v).width > 855;
    })) {
      fontSize -= 4;
      if (fontSize <= 42) break;
    }
    ctx.fillStyle = '#f1f2ec';
    ctx.font = '650 ' + fontSize + 'px Arial, sans-serif';
    const lineHeight = fontSize * 1.08;
    const y0 = 302 - ((Math.min(3, lines.length) - 1) * lineHeight / 2);
    lines.slice(0,3).forEach((line, i) => ctx.fillText(line, 65, y0 + i * lineHeight, 860));
    ctx.fillStyle = accent;
    ctx.fillRect(65, 487, 12, 12);
    ctx.font = '500 24px monospace';
    ctx.fillStyle = '#b8c1b9';
    ctx.fillText((item.category || 'OTHER').toUpperCase(), 91, 501);
    ctx.fillStyle = '#6f7c74';
    ctx.textAlign = 'right';
    ctx.fillText('OPEN SOURCE / ' + String(item.repo || 'PROJECT').toUpperCase().slice(0,26), 954, 558);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    state.textures.push(texture);
    return texture;
  }

  // Rounded, UV-correct planes create a thin physical screen rather than a
  // stack of square billboards. All screenshot textures remain locally hosted.
  function roundPanel(THREE, width, height, radius) {
    const x=-width/2, y=-height/2, r=Math.min(radius,width/2,height/2);
    const shape=new THREE.Shape();
    shape.moveTo(x+r,y);
    shape.lineTo(x+width-r,y);
    shape.quadraticCurveTo(x+width,y,x+width,y+r);
    shape.lineTo(x+width,y+height-r);
    shape.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
    shape.lineTo(x+r,y+height);
    shape.quadraticCurveTo(x,y+height,x,y+height-r);
    shape.lineTo(x,y+r);
    shape.quadraticCurveTo(x,y,x+r,y);
    const geometry=new THREE.ShapeGeometry(shape,6);
    const uv=geometry.attributes.uv, pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++)
      uv.setXY(i,(pos.getX(i)+width/2)/width,
                 (pos.getY(i)+height/2)/height);
    uv.needsUpdate=true;
    return geometry;
  }

  function atmosphereTexture(THREE) {
    const canvas=document.createElement('canvas');
    canvas.width=384;canvas.height=256;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createRadialGradient(192,122,4,192,122,196);
    grad.addColorStop(0,'rgba(164,171,177,.52)');
    grad.addColorStop(.28,'rgba(105,113,123,.23)');
    grad.addColorStop(.68,'rgba(49,55,63,.075)');
    grad.addColorStop(1,'rgba(10,12,14,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,384,256);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    state.textures.push(texture);
    return texture;
  }

  function shadowTexture(THREE) {
    const canvas=document.createElement('canvas');
    canvas.width=256;canvas.height=96;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createRadialGradient(128,48,2,128,48,124);
    grad.addColorStop(0,'rgba(0,0,0,.65)');
    grad.addColorStop(.34,'rgba(0,0,0,.33)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    ctx.setTransform(1,0,0,.44,0,27);
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,256,96);
    const texture=new THREE.CanvasTexture(canvas);
    texture.colorSpace=THREE.SRGBColorSpace;
    state.textures.push(texture);
    return texture;
  }

  // An actual in-scene reflection mask: the mirrored screenshot loses its
  // opacity as it extends away from the screen into the dark studio floor.
  // No SSR render target, which would double GPU work and soften the artwork.
  function reflectionMaskTexture(THREE) {
    const canvas=document.createElement('canvas');
    canvas.width=8;canvas.height=256;
    const ctx=canvas.getContext('2d');
    const gradient=ctx.createLinearGradient(0,0,0,256);
    gradient.addColorStop(0,'rgb(0,0,0)');
    gradient.addColorStop(.35,'rgb(18,18,18)');
    gradient.addColorStop(.64,'rgb(110,110,110)');
    gradient.addColorStop(1,'rgb(255,255,255)');
    ctx.fillStyle=gradient;
    ctx.fillRect(0,0,8,256);
    const texture=new THREE.CanvasTexture(canvas);
    texture.minFilter=THREE.LinearFilter;
    texture.magFilter=THREE.LinearFilter;
    texture.generateMipmaps=false;
    state.textures.push(texture);
    return texture;
  }

  function buildCard(THREE, item, index, generation, softShadow, reflectionMask) {
    const group=new THREE.Group();
    const backing=new THREE.Mesh(
      roundPanel(THREE,3.91,2.63,.135),
      new THREE.MeshBasicMaterial({color:0x07090b,side:THREE.DoubleSide})
    );
    backing.position.z=-.115;
    group.add(backing);

    const border=new THREE.Mesh(
      roundPanel(THREE,3.82,2.55,.125),
      new THREE.MeshBasicMaterial({
        color:0x92989c,transparent:true,opacity:.72,
        depthWrite:false,side:THREE.DoubleSide
      })
    );
    border.position.z=-.055;
    group.add(border);

    const bezel=new THREE.Mesh(
      roundPanel(THREE,3.765,2.497,.112),
      new THREE.MeshBasicMaterial({color:0x111315,side:THREE.DoubleSide})
    );
    bezel.position.z=-.026;
    group.add(bezel);

    // Repository previews are letterboxed in their texture, not cropped.
    const material=new THREE.MeshBasicMaterial({
      color:0x181a1d,side:THREE.DoubleSide,toneMapped:false
    });
    const photo=new THREE.Mesh(roundPanel(THREE,3.65,2.39,.085),material);
    photo.position.z=.016;
    photo.userData.cardIndex=index;
    group.add(photo);

    // Geometry shares the source texture. Alpha decays into the ground, so
    // nearby screenshots gain a restrained, physically coherent reflection.
    const reflectionMaterial=new THREE.MeshBasicMaterial({
      color:0xaeb4ba,transparent:true,opacity:.19,
      alphaMap:reflectionMask,depthWrite:false,
      side:THREE.DoubleSide,toneMapped:false
    });
    const reflection=new THREE.Mesh(
      roundPanel(THREE,3.65,2.39,.085),reflectionMaterial
    );
    reflection.position.set(0,-1.79,-.07);
    reflection.scale.y=-.50;
    reflection.visible=false;
    group.add(reflection);

    const edge=new THREE.Mesh(
      new THREE.PlaneGeometry(3.25,.009),
      new THREE.MeshBasicMaterial({
        color:0xd3d9dc,transparent:true,opacity:.27,
        depthWrite:false,side:THREE.DoubleSide
      })
    );
    edge.position.set(0,1.251,.025);
    group.add(edge);

    const shadow=new THREE.Mesh(
      new THREE.PlaneGeometry(5.05,1.24),
      new THREE.MeshBasicMaterial({
        map:softShadow,transparent:true,opacity:.56,
        depthWrite:false,side:THREE.DoubleSide
      })
    );
    shadow.position.set(0,-1.47,-.23);
    shadow.scale.y=.78;
    group.add(shadow);
    group.userData.cardIndex=index;
    group.visible=false;

    const urls = imagesFor(item);
    let imageRequested = false;
    let coverReady = false;
    let loadSerial = 0;
    let completed=false;
    let resolveReady;
    let ready=new Promise(resolve=>{resolveReady=resolve;});
    function completeReady() {
      if(completed)return;
      completed=true;
      resolveReady();
    }
    function releaseImage() {
      if (!imageRequested && !coverReady) return;
      // Discard textures that are far outside the visible carousel window.
      // Keep only a small working set, even after browsing all 29 projects.
      loadSerial++;
      completed=false;
      ready=new Promise(resolve=>{resolveReady=resolve;});
      if (material.map) {
        const previous = material.map;
        reflectionMaterial.map=null;
        reflectionMaterial.needsUpdate=true;
        reflection.visible=false;
        material.map = null;
        const position = state.textures.indexOf(previous);
        if (position >= 0) state.textures.splice(position,1);
        previous.dispose();
      }
      material.color.setHex(0x18201b);
      material.needsUpdate = true;
      imageRequested = false;
      coverReady = false;
    }
    function loadImage() {
      if (!coverReady) {
        coverReady = true;
        material.map = placeholderTexture(THREE, item, index);
        reflectionMaterial.map=material.map;
        reflectionMaterial.needsUpdate=true;
        reflection.visible=true;
        // Three.js multiplies the texture by material.color.
        // Keep the untextured backing dark, but display images at full brightness.
        material.color.setHex(0xffffff);
        material.needsUpdate = true;
      }
      if(!urls.length)completeReady();
      if (imageRequested || !urls.length) return ready;
      imageRequested = true;
      const ticket = ++loadSerial;
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const loadNext = (n) => {
        if (n >= urls.length) {completeReady();return;}
        loader.load(urls[n], imageTexture => {
          if (ticket !== loadSerial || generation !== state.generation ||
              !state.scene || !group.parent || !state.renderer) {
            imageTexture.dispose();completeReady();return;
          }
          if (item.kind === 'repo') {
            // README photos are diagrams, demos and screenshots with different
            // aspect ratios. Letterbox instead of cropping away important UI.
            const image = imageTexture.image;
            // Avoid permanently throwing away 55% of the screenshot detail.
            // Cap the texture at 2.3K to keep the visible working set bounded.
            const width=el.host.clientWidth>=600 ? 2304 : 1792;
            const height=Math.round(width*(2.39/3.65));
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d', {alpha:false});
            if (ctx) {
              ctx.fillStyle = '#111714';
              ctx.fillRect(0,0,width,height);
              const ratio = Math.min(width/image.width,height/image.height);
              const w = Math.round(image.width*ratio);
              const h = Math.round(image.height*ratio);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(image,Math.floor((width-w)/2),Math.floor((height-h)/2),w,h);
              const fitted = new THREE.CanvasTexture(canvas);
              imageTexture.dispose();
              imageTexture = fitted;
            }
          } else {
            // Browser captures can fill the frame without distortion.
            const sourceRatio = imageTexture.image.width / imageTexture.image.height;
            const cardRatio = 3.64 / 2.34;
            if (sourceRatio > cardRatio) {
              imageTexture.repeat.set(cardRatio / sourceRatio, 1);
              imageTexture.offset.set((1 - imageTexture.repeat.x) / 2, 0);
            } else if (sourceRatio < cardRatio) {
              imageTexture.repeat.set(1, sourceRatio / cardRatio);
              imageTexture.offset.set(0, (1 - imageTexture.repeat.y) / 2);
            }
          }
          imageTexture.colorSpace=THREE.SRGBColorSpace;
          imageTexture.magFilter=THREE.LinearFilter;
          imageTexture.minFilter=THREE.LinearMipmapLinearFilter;
          imageTexture.generateMipmaps=true;
          imageTexture.anisotropy=Math.min(
            16,state.renderer.capabilities.getMaxAnisotropy()
          );
          const previous = material.map;
          material.map=imageTexture;
          material.needsUpdate=true;
          reflectionMaterial.map=imageTexture;
          reflectionMaterial.needsUpdate=true;
          reflection.visible=true;
          if (previous && previous !== imageTexture) {
            previous.dispose();
            const position = state.textures.indexOf(previous);
            if (position >= 0) state.textures.splice(position, 1);
          }
          state.textures.push(imageTexture);
          completeReady();
          requestRender();
        }, undefined, () => loadNext(n + 1));
      };
      loadNext(0);
      return ready;
    }
    return {group, photo, border, edge, shadow, reflection,
      reflectionMaterial, material, index, loadImage, releaseImage,
      ready:()=>ready, isPrepared:()=>completed};
  }

  function layoutTargets(collection=state.currentCollection) {
    if(!collection)return;
    const cards=collection.cards;
    const count=cards.length;
    if(!count)return;
    const isForeground=collection===state.currentCollection;
    const position=collection.motion.position-
      (isForeground && state.pointerDown ?
        state.drag/Math.max(210,state.stageWidth*.27):0);
    // A true 3D arc: the center screen is the focal point, with each neighbor
    // moving backwards in Z and rotating toward the viewer.
    const aspect=state.stageWidth/Math.max(1,state.stageHeight);
    const fit=clamp(aspect/1.28,.77,1);
    const stops=[
      {x:0,   y:.20, z:1.06, scale:1.68, turn:0,   roll:0},
      {x:3.23,y:.06, z:-1.14,scale:.91, turn:.42, roll:.018},
      {x:5.25,y:-.06,z:-3.10,scale:.68, turn:.64, roll:.027},
      {x:6.48,y:.05, z:-4.72,scale:.51, turn:.74, roll:.034},
      {x:7.12,y:.13, z:-5.45,scale:.40, turn:.80, roll:.04}
    ];
    const mix=(a,b,t)=>a+(b-a)*t;
    for(let i=0;i<count;i++) {
      const card=cards[i];
      const raw=i-position;
      // Continuous circular index, including the first/last transition.
      const delta=raw-Math.round(raw/count)*count;
      const d=Math.abs(delta);
      const shown=d<=3.55;
      card.group.visible=shown;
      if(!shown) {
        if(d>4.7)card.releaseImage();
        continue;
      }
      card.loadImage();
      const base=Math.min(3,Math.floor(d)),t=Math.min(1,d-base);
      const ease=t*t*(3-2*t);
      const from=stops[base],to=stops[base+1],side=Math.sign(delta);
      const group=card.group;
      // Pointer position never affects card height or depth. Movement comes
      // exclusively from deliberate navigation and dragging.
      group.position.set(side*mix(from.x,to.x,ease),
        mix(from.y,to.y,ease),mix(from.z,to.z,ease));
      group.rotation.y=-side*mix(from.turn,to.turn,ease);
      group.rotation.z=-side*mix(from.roll,to.roll,ease);
      group.scale.setScalar(mix(from.scale,to.scale,ease)*fit);
      // Lateral cards recede rather than competing with the selected image.
      const prominence=clamp(1-d/3.65,0,1);
      card.border.material.opacity=.18+.72*prominence;
      card.edge.material.opacity=.035+.26*prominence;
      card.shadow.material.opacity=.14+.33*prominence;
      card.reflectionMaterial.opacity=.17*prominence*prominence;
      card.reflection.visible=!!card.reflectionMaterial.map && d<2.5;
      if(card.material.map) {
        const tint=1-.38*(1-prominence);
        card.material.color.setRGB(tint,tint,tint);
      }
    }
  }

  function advanceMotion(timestamp) {
    const motion = state.motion;
    const elapsed = motion.lastTime
      ? Math.max(0, (timestamp-motion.lastTime)/1000)
      : 1/60;
    // Time-based analytic spring, stable even when WebGL drops to 10 FPS.
    // Unlike a per-frame lerp, it does not slow down under GPU pressure.
    const dt = Math.min(.25, elapsed);
    motion.lastTime = timestamp;
    if (reduced.matches) {
      motion.position = motion.target;
      motion.velocity = 0;
      return false;
    }
    const offset = motion.position-motion.target;
    if (Math.abs(offset) < .0015 && Math.abs(motion.velocity) < .03) {
      motion.position = motion.target;
      motion.velocity = 0;
      return false;
    }
    const omega = 11.6;
    const decay = Math.exp(-omega*dt);
    const term = motion.velocity + omega*offset;
    motion.position = motion.target + (offset + term*dt)*decay;
    motion.velocity = (motion.velocity - omega*term*dt)*decay;
    return true;
  }

  function render() {
    if (!state.scene || !state.renderer || !state.camera) return;
    state.renderer.render(state.scene, state.camera);
  }

  function animate(timestamp) {
    state.raf = 0;
    if (!state.active || !state.renderer) return;
    if (document.hidden) {
      state.motion.position = state.motion.target;
      state.motion.velocity = 0;
      state.motion.lastTime = 0;
      layoutTargets();
      el.host.dataset.settledIndex = String(state.selected);
      return;
    }
    const transitioning = advanceMotion(timestamp);
    layoutTargets();
    render();
    // The DOM indicator reflects the actual 3D track, not just the selected text.
    if (!transitioning && !state.pointerDown)
      el.host.dataset.settledIndex = String(state.selected);
    if (transitioning || state.pointerDown) state.raf = requestAnimationFrame(animate);
  }
  function requestRender() {
    if (!state.active || !state.renderer || state.raf) return;
    state.raf = requestAnimationFrame(animate);
  }

  function select(index) {
    if (!state.active ||
        (!state.currentCollection && !state.fallback) ||
        !Number.isInteger(index) ||
        index < 0 || index >= state.items.length) return;
    if (index === state.selected) return;
    const count = state.items.length;
    const motion = state.motion;
    // Use the current TARGET rather than the rendered position, preserving
    // direction and velocity when Next is clicked repeatedly during movement.
    let target = index + Math.round((motion.target-index)/count)*count;
    const delta = target-motion.target;
    if (Math.abs(delta) > 4) {
      // Far dropdown jumps skip intermediate cards but never replay a fade.
      motion.position = target - Math.sign(target-motion.position)*.80;
      motion.velocity = 0;
    }
    motion.target = target;
    // Do not zero lastTime or cancel/restart an in-flight animation.
    state.selected=index;
    if(state.currentCollection)state.currentCollection.selected=index;
    delete el.host.dataset.settledIndex;
    updateMetadata();
    if (state.fallback) drawFallback();
    requestRender();
  }
  function step(diff) {
    if (state.items.length) select(mod(state.selected + diff, state.items.length));
  }

  function pointerIndex(event) {
    if (!state.camera || !state.raycaster || !state.renderer) return -1;
    const rect = state.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return -1;
    state.pointer.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1
    );
    state.raycaster.setFromCamera(state.pointer, state.camera);
    const objects = state.cards.filter(c => c.group.visible).map(c => c.photo);
    const hit = state.raycaster.intersectObjects(objects, false);
    return hit.length ? hit[0].object.userData.cardIndex : -1;
  }

  function attachCanvasEvents(canvas) {
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label',
      '3D Showcase. Drag or swipe to browse. Left and right arrows navigate; Enter opens details.');
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      state.pointerDown = {x:event.clientX,y:event.clientY,
        index:pointerIndex(event), id:event.pointerId};
      state.moved = false;
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!state.pointerDown) {
        canvas.style.cursor=pointerIndex(event)>=0 ? 'pointer' : 'grab';
        return;
      }
      const dx = event.clientX - state.pointerDown.x;
      state.moved = state.moved || Math.abs(dx) > 7 ||
        Math.abs(event.clientY - state.pointerDown.y) > 12;
      if (state.moved) {
        state.drag = clamp(dx, -Math.max(210,state.stageWidth*.65),
          Math.max(210,state.stageWidth*.65));
        requestRender();
      }
    });
    canvas.addEventListener('pointerup', event => {
      if (!state.pointerDown) return;
      const dx = event.clientX - state.pointerDown.x;
      const picked = state.pointerDown.index;
      // Carry the physical drag offset into the spring on release.
      if (state.moved) {
        state.motion.position -= state.drag / Math.max(210,state.stageWidth*.27);
      }
      state.pointerDown = null;
      state.drag = 0;
      if (Math.abs(dx) > 42) {
        const amount = Math.max(1, Math.min(3, Math.round(Math.abs(dx) / 120)));
        step(dx < 0 ? amount : -amount);
      } else if (!state.moved) {
        const index = pointerIndex(event);
        if (index >= 0) {
          if (index === state.selected) window.HubExplorer?.open(state.items[index]);
          else select(index);
        } else if (picked >= 0) select(picked);
      }
      requestRender();
    });
    canvas.addEventListener('pointercancel', () => {
      state.pointerDown = null; state.drag = 0; requestRender();
    });
    canvas.addEventListener('wheel', event => {
      // Horizontal trackpad gestures navigate; vertical page scroll stays native.
      if (Math.abs(event.deltaX) < Math.abs(event.deltaY)*1.15 ||
          Math.abs(event.deltaX) < 12) return;
      event.preventDefault();
      const now = performance.now();
      if (now-state.wheelAt < 280) return;
      state.wheelAt = now;
      step(event.deltaX > 0 ? 1 : -1);
    }, {passive:false});
    canvas.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); step(event.key === 'ArrowRight' ? 1 : -1);
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        select(event.key === 'Home' ? 0 : state.items.length - 1);
      }
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        step(event.key === 'PageUp' ? -5 : 5);
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); window.HubExplorer?.open(state.items[state.selected]);
      }
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      // An intentional renderer replacement is not a real WebGL failure.
      if (!state.renderer || state.renderer.domElement !== canvas ||
          !state.active) return;
      console.warn('Project Room: unexpected WebGL context loss');
      disposeScene(); state.fallback = true; drawFallback();
    });
  }

  function disposeScene() {
    if (state.raf) {cancelAnimationFrame(state.raf);state.raf = 0;}
    if (state.scene) {
      state.scene.traverse(object => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
        else object.material?.dispose?.();
      });
    }
    state.textures.forEach(t => t.dispose?.()); state.textures = [];
    if (state.renderer) {
      const old = state.renderer;
      // Mark it inactive BEFORE forceContextLoss, which may dispatch an event.
      state.renderer = null;
      old.domElement.remove();
      old.dispose();
      old.forceContextLoss?.();
    }
    state.cards=[];state.renderer=null;state.scene=null;
    state.camera = null; state.raycaster = null; state.pointer = null;
  }

  function drawFallback() {
    if (!state.active || isWebGL()) return;
    state.fallback = true;
    el.pagination.hidden=true;
    el.host.replaceChildren();
    const root = document.createElement('div');
    root.className = 'atlas-fallback';
    const heading = document.createElement('p');
    heading.textContent = 'PROJECT ROOM / INDEX';
    root.append(heading);
    const list = document.createElement('div');
    list.className = 'atlas-fallback-list';
    state.items.forEach((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'atlas-fallback-node' + (i===state.selected?' active':'');
      btn.textContent = String(i+1).padStart(2,'0') + '  ' + item.name;
      btn.onclick = () => select(i);
      list.append(btn);
    });
    root.append(list);el.host.append(root);
  }

  function setSize() {
    if (!state.renderer || !state.camera) return;
    const w = Math.max(260,el.host.clientWidth);
    const h = Math.max(260,el.host.clientHeight);
    if (w === state.stageWidth && h === state.stageHeight) return;
    state.stageWidth = w;state.stageHeight = h;
    state.camera.aspect = w/h;state.camera.updateProjectionMatrix();
    state.renderer.setPixelRatio(renderingDpr(w, h));
    state.renderer.setSize(w,h,false);
    requestRender();
  }

  function buildScene(THREE) {
    if(state.scene)return;
    const scene=new THREE.Scene();
    // Hidden pre-rendering uses the eventual desktop stage footprint.
    const region=document.querySelector('.directory');
    const estimate=Math.round((region?.clientWidth||1000)*.68);
    const w=Math.max(260,el.host.clientWidth||estimate);
    const h=Math.max(260,el.host.clientHeight||480);
    const camera=new THREE.PerspectiveCamera(37,w/h,.1,80);
    camera.position.set(0,0,11);
    const renderer=new THREE.WebGLRenderer({
      alpha:true,antialias:true,powerPreference:'high-performance',
      preserveDrawingBuffer:false
    });
    renderer.setClearColor(0x000000,0);
    renderer.setPixelRatio(renderingDpr(w,h));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    renderer.setSize(w,h,false);
    renderer.domElement.className='atlas-webgl';
    state.scene=scene;state.camera=camera;state.renderer=renderer;
    state.stageWidth=w;state.stageHeight=h;
    el.host.replaceChildren(renderer.domElement);
    const glow=atmosphereTexture(THREE);
    const halo=new THREE.Mesh(
      new THREE.PlaneGeometry(13.5,9),
      new THREE.MeshBasicMaterial({
        map:glow,transparent:true,opacity:.50,
        depthWrite:false,side:THREE.DoubleSide
      })
    );
    halo.position.set(0,.12,-7.25);
    scene.add(halo);
    state.shadowMap=shadowTexture(THREE);
    state.reflectionMask=reflectionMaskTexture(THREE);
    state.raycaster=new THREE.Raycaster();
    state.pointer=new THREE.Vector2();
    attachCanvasEvents(renderer.domElement);
    state.fallback=false;
  }

  function catalogSignature(tab,items) {
    return tab+':'+items.map(item=>
      itemKey(item)+'@'+imagesFor(item).join(',')).join('|');
  }

  function disposeCollection(collection) {
    if(!collection||collection.disposed)return;
    collection.disposed=true;
    collection.cards.forEach(card=>card.releaseImage());
    collection.root.traverse(object=>{
      object.geometry?.dispose?.();
      if(Array.isArray(object.material))
        object.material.forEach(material=>material.dispose());
      else object.material?.dispose?.();
    });
    state.scene?.remove(collection.root);
    if(state.currentCollection===collection)state.currentCollection=null;
  }

  function preRenderCollection(collection) {
    if(!state.renderer||!state.scene||collection.disposed)return;
    const foreground=state.currentCollection;
    if(foreground===collection)return;
    if(foreground)foreground.root.visible=false;
    collection.root.visible=true;
    layoutTargets(collection);
    state.renderer.render(state.scene,state.camera);
    collection.root.visible=false;
    if(foreground) {
      foreground.root.visible=true;
      state.renderer.render(state.scene,state.camera);
    }
  }

  function primeCollection(collection) {
    const count=collection.cards.length;
    if(!count)return Promise.resolve();
    const center=collection.selected;
    // Wait for actual images before showing the collection, not placeholders.
    const indices=[center,mod(center-1,count),mod(center+1,count)];
    const promises=[...new Set(indices)].map(index=>
      collection.cards[index].loadImage());
    for(const side of [-2,2])
      collection.cards[mod(center+side,count)].loadImage();
    return Promise.all(promises).then(()=>{
      if(collection.disposed)return;
      collection.prepared=true;
      preRenderCollection(collection);
      if(state.active&&state.requestedTab===collection.tab&&
         state.requestedSignature===collection.signature&&
         state.collections.get(collection.tab)===collection)
        activateCollection(collection);
    });
  }

  function makeCollection(tab,items,signature) {
    const old=state.collections.get(tab);
    if(old&&old.signature===signature&&!old.disposed) {
      old.items=items;
      return old;
    }
    if(old)disposeCollection(old);
    const THREE=state.THREE, root=new THREE.Group();
    root.visible=false;
    state.scene.add(root);
    const cards=items.map((item,index)=>
      buildCard(THREE,item,index,state.generation,
        state.shadowMap,state.reflectionMask));
    cards.forEach(card=>{
      root.add(card.group);
      card.group.position.set(card.index===0?0:card.index%2?6:-6,0,-4);
      card.group.scale.setScalar(.42);
    });
    const motion={position:0,target:0,velocity:0,lastTime:0};
    const collection={
      tab,signature,items,root,cards,motion,selected:0,
      prepared:false,disposed:false,ready:null
    };
    state.collections.set(tab,collection);
    collection.ready=primeCollection(collection);
    return collection;
  }

  function activateCollection(collection) {
    if(!collection||collection.disposed||!collection.prepared||
       !state.active||state.requestedTab!==collection.tab||
       state.requestedSignature!==collection.signature)return;
    if(state.currentCollection&&state.currentCollection!==collection)
      state.currentCollection.root.visible=false;
    collection.root.visible=true;
    state.currentCollection=collection;
    state.cards=collection.cards;
    state.motion=collection.motion;
    state.selected=collection.selected;
    state.items=collection.items;
    state.tab=collection.tab;
    state.signature=collection.signature;
    el.count.textContent=String(collection.items.length).padStart(2,'0')+
      (collection.tab==='sites'?' WEBSITES':' REPOSITORIES');
    el.select.innerHTML='<option value="" disabled>Jump to a project</option>'+
      collection.items.map((item,index)=>
        '<option value="'+index+'">'+safe(item.name)+'</option>').join('');
    state.motion.lastTime=0;
    state.pointerDown=null;state.drag=0;
    state.fallback=false;
    delete el.host.dataset.settledIndex;
    setSize();
    layoutTargets(collection);
    updateMetadata();
    render();
    requestRender();
  }

  async function warmCollections() {
    const serial=++state.switchSerial;
    const THREE=await loadThree();
    if(serial!==state.switchSerial)return;
    if(!THREE) {
      if(state.active) {
        state.items=state.requestedItems||[];
        state.tab=state.requestedTab;
        state.selected=0;
        state.fallback=true;
        drawFallback();
      }
      return;
    }
    if(!state.scene) {
      try {buildScene(THREE);}
      catch(error) {
        console.warn('Pre-render unavailable, using static fallback.',error);
        disposeScene();
        if(state.active) {
          state.items=state.requestedItems||[];
          state.tab=state.requestedTab;
          state.selected=0;
          state.fallback=true;
          drawFallback();
        }
        return;
      }
    }
    const requestedSignature=state.requestedSignature;
    const requestedTab=state.requestedTab;
    for(const tab of ['sites','projects']) {
      const items=source()?.catalog?.(tab)||[];
      if(!items.length)continue;
      const signature=catalogSignature(tab,items);
      // An active filter/search is a temporary collection for that tab.
      if(state.active&&tab===requestedTab&&
         requestedSignature!==signature)continue;
      makeCollection(tab,items,signature);
    }
    if(state.active) {
      const collection=makeCollection(
        requestedTab,state.requestedItems,requestedSignature);
      if(collection.prepared)activateCollection(collection);
      else void collection.ready.then(()=>activateCollection(collection));
    }
  }

  async function loadThree() {
    if (state.THREE) return state.THREE;
    if (!state.promise) {
      state.promise = import('./vendor/three.module.js')
        .then(module => {state.THREE=module;return module;})
        .catch(error => {
          console.info('3D unavailable. Using the plain project index.', error);
          return null;
        });
    }
    return await state.promise;
  }

  function prepare() {
    state.prewarmStarted=true;
    void warmCollections();
  }

  function update({items,tab,active}) {
    const next=Array.isArray(items)?items.slice():[];
    const signature=catalogSignature(tab,next);
    state.active=!!active&&next.length>0;
    state.requestedTab=tab;
    state.requestedItems=next;
    state.requestedSignature=signature;
    if(!state.active) {
      el.pagination.hidden=true;
      if(state.raf)cancelAnimationFrame(state.raf);
      state.raf=0;
      state.pointerDown=null;
      state.drag=0;
      return;
    }
    // Both catalogues are typically ready before the user opens 3D.
    // Reuse the same WebGL canvas and switch the scene root synchronously.
    const cached=state.collections.get(tab);
    if(cached&&cached.signature===signature&&cached.prepared&&state.scene) {
      activateCollection(cached);
      return;
    }
    // Keep the previous rendered frame if a filter creates a new collection.
    // Never clear the canvas to a loading placeholder during a tab switch.
    state.prewarmStarted=true;
    void warmCollections();
  }

  el.prev.addEventListener('click',()=>step(-1));
  el.next.addEventListener('click',()=>step(1));
  el.select.addEventListener('change',event=>select(Number(event.target.value)));
  el.explore.addEventListener('click',()=>window.HubExplorer?.open(state.items[state.selected]));
  el.quickExplore?.addEventListener('click',()=>window.HubExplorer?.open(state.items[state.selected]));
  el.visit.addEventListener('click',e=>{if(!state.items[state.selected])e.preventDefault();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){if(state.raf)cancelAnimationFrame(state.raf);state.raf=0;}
    else if(state.active)requestRender();
  });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      setSize();
      alignPagination();
    });
    observer.observe(el.host);
    observer.observe(el.stage);
  } else {
    window.addEventListener('resize', () => {
      setSize();
      alignPagination();
    });
  }
  reduced.addEventListener?.('change',()=>requestRender());
  compactPagination.addEventListener?.('change',()=>{
    if (state.active) renderPagination();
  });

  window.HubAtlas=Object.freeze({
    version:'studio-prewarmed-v6',update,select,step,prepare,
    debug: () => ({
      selected:state.selected,active:state.active,renderer:isWebGL(),
      canvasIdentity:state.renderer?.domElement?.dataset?.instance||'',
      collectionStatus:[...state.collections.entries()].map(([tab,collection])=>({
        tab,prepared:collection.prepared,disposed:collection.disposed,
        cardCount:collection.cards.length,
        loadedImages:collection.cards.slice(0,3)
          .filter(card=>card.isPrepared()).length
      })),
      sceneCount:state.collections.size,
      requestedTab:state.requestedTab,
      currentTab:state.currentCollection?.tab||null,
      hidden: document.hidden, raf: state.raf, pendingPointer: !!state.pointerDown,
      position: state.motion.position, target: state.motion.target,
      velocity: state.motion.velocity, settled: el.host.dataset.settledIndex || null,
      textureTint: state.cards[state.selected]?.material.color.getHexString() || null,
      hasTexture: !!state.cards[state.selected]?.material.map,
      overlays: state.cards[state.selected]?.group.children
        .filter(mesh => mesh.userData.identityKind)
        .map(mesh => mesh.userData.identityKind) || [],
      activeTextures: state.cards.filter(card => !!card.material.map).length,
      visibleCards: state.cards.filter(card => card.group.visible).length,
      sceneStyle: 'rounded-arc',
      selectedFrame: state.cards[state.selected] ? {
        geometry:state.cards[state.selected].photo.geometry.type,
        bevel:!!state.cards[state.selected].border,
        shadow:!!state.cards[state.selected].shadow,
        z:state.cards[state.selected].group.position.z,
        y:state.cards[state.selected].group.position.y,
        scale:state.cards[state.selected].group.scale.x,
        reflectionVisible:state.cards[state.selected].reflection.visible,
        reflectedMapShared:
          state.cards[state.selected].reflectionMaterial.map ===
          state.cards[state.selected].material.map,
        imageWidth:state.cards[state.selected].material.map?.image?.width || 0,
        imageHeight:state.cards[state.selected].material.map?.image?.height || 0
      } : null,
      reflectiveFloor:state.cards[state.selected] ?
        !!state.cards[state.selected].reflection.material.alphaMap : false,
      rendererDpr:state.renderer?.getPixelRatio()||0,
      hoverIsStatic:true,
      neighborFrame: state.cards.length>1 ? {
        z:state.cards[(state.selected+1)%state.cards.length].group.position.z,
        yaw:state.cards[(state.selected+1)%state.cards.length].group.rotation.y
      } : null,
      signature: state.signature
    })
  });
  const initial=source()?.current();
  if(initial)update(initial);
})();
