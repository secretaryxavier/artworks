// scripts.js
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('interactive-canvas');
  if (canvas) {
    try {
      const scene = new THREE.Scene();
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 15;
      console.log("Three.js scene, renderer, camera initialized.");

      let envMapLoaded = false;
      const envLoader = new THREE.CubeTextureLoader();
      envLoader
        .setPath('https://unpkg.com/three@0.150.1/examples/textures/cube/Bridge2/')
        .load(
          ['posx.jpg', 'negx.jpg', 'posy.jpg', 'negy.jpg', 'posz.jpg', 'negz.jpg'],
          (loadedEnvMap) => {
            envMapLoaded = true;
            scene.environment = loadedEnvMap;
            console.log("Environment map loaded successfully.");
            if (coreMat) coreMat.needsUpdate = true;
          },
          undefined,
          (error) => { console.error('Env map loading error:', error); scene.background = new THREE.Color(0x0a0f1f); }
        );

      const textureLoader = new THREE.TextureLoader();
      let plasmaTextureForCore = null; 
      let auraSpriteSheetTexture = null; // For the animated aura

      // Load plasma_noise.png for the core's emissive map (optional inner detail)
      plasmaTextureForCore = textureLoader.load('assets/plasma_noise.png',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
          console.log("Plasma/Noise texture for core loaded.");
          if (coreMat) { coreMat.emissiveMap = texture; coreMat.needsUpdate = true; }
        },
        undefined,
        (error) => { console.warn('Plasma/Noise texture for core not loaded.', error); }
      );

      // --- Animated Aura Sprite Sheet ---
      // *** YOU NEED TO CREATE 'assets/electron_cloud_spritesheet.png' ***
      // *** AND UPDATE THE FOLLOWING VARIABLES CORRECTLY: ***
      const auraSpriteParams = {
          path: 'assets/electron_cloud_spritesheet.png', // YOUR SPRITE SHEET FILENAME
          numberOfColumns: 5,    // How many frames across in your sheet (e.g., 5)
          numberOfRows: 60,     // How many frames down in your sheet (e.g., 4)
          totalFrames: 200,       // numberOfColumns * numberOfRows (e.g., 20)
          frameDuration: 20    // ms per frame (e.g., 100ms = 10 FPS). Adjust for speed.
      };
      // --- END OF VALUES YOU MUST UPDATE ---

      let currentAuraFrame = 0;
      let lastAuraFrameTime = 0;

      if (auraSpriteParams.totalFrames > 1 && auraSpriteParams.numberOfColumns > 0 && auraSpriteParams.numberOfRows > 0) {
        auraSpriteSheetTexture = textureLoader.load(auraSpriteParams.path,
          (texture) => {
            console.log("Electron cloud SPRITE SHEET for aura loaded.");
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.repeat.set(1 / auraSpriteParams.numberOfColumns, 1 / auraSpriteParams.numberOfRows);
            if (auraMat) { 
              auraMat.map = texture; 
              auraMat.needsUpdate = true; 
            }
          },
          undefined,
          (error) => { console.warn(`Electron cloud SPRITE SHEET (${auraSpriteParams.path}) for aura not loaded. Aura may not animate.`, error); }
        );
      } else {
          console.warn("Sprite sheet parameters are invalid (totalFrames <=1 or columns/rows <=0). Aura will not use sprite sheet.");
      }
      
      // Core Orb Material
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.1, roughness: 0.4,
        transmission: 0.0, thickness: 1.5, ior: 1.4,
        emissive: 0xffffff, emissiveIntensity: 0.7,
        transparent: true, opacity: 0.9,
        depthWrite: true,
        envMapIntensity: 1.2, clearcoat: 0.0,
        // emissiveMap (for core) set by plasmaTextureForCore loader
      });

      const coreGeo = new THREE.SphereGeometry(0.7, 48, 48);
      const orbCore = new THREE.Mesh(coreGeo, coreMat);
      
      const orbGroup = new THREE.Group();
      orbGroup.add(orbCore);
      
      // Single, Textured (and now Animated) Aura Layer
      let auraMesh;
      const auraMat = new THREE.MeshBasicMaterial({
          map: null, // Will be set by auraSpriteSheetTexture loader
          transparent: true,
          opacity: 0.42, 
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          color: 0xffffff, 
      });
      const auraGeo = new THREE.SphereGeometry(1.25, 48, 48); 
      auraMesh = new THREE.Mesh(auraGeo, auraMat);
      orbGroup.add(auraMesh);

      orbGroup.scale.set(0.3, 0.3, 0.3);

      const savedX = parseFloat(localStorage.getItem('orbPosX'));
      const savedY = parseFloat(localStorage.getItem('orbPosY'));
      if (!isNaN(savedX) && !isNaN(savedY)) {
        orbGroup.position.set(savedX, savedY, 0);
      }
      scene.add(orbGroup);

      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dir1 = new THREE.DirectionalLight(0xffffff, 0.7); dir1.position.set(5, 10, 7); scene.add(dir1);
      const dir2 = new THREE.DirectionalLight(0xaaaaff, 0.4); dir2.position.set(-5, -5, -5); scene.add(dir2);
      const pointLight = new THREE.PointLight(0xffffff, 0.7, 60); scene.add(pointLight);

      const trail = []; const maxTrail = 60; let trailLag = 18;
      let lastMove = performance.now(); let idle = false; const idleThreshold = 3000;
      let isClicked = false; let clickTime = 0; const clickDur = 250;

      window.addEventListener('mousedown', () => { isClicked = true; clickTime = performance.now(); });
      window.addEventListener('mouseup', () => { isClicked = false; clickTime = performance.now(); });
      window.addEventListener('mousemove', e => {
        const x = (e.clientX / window.innerWidth) * 2 - 1; const y = -(e.clientY / window.innerHeight) * 2 + 1;
        trail.push({ x: x * 6, y: y * 4 });
        if (trail.length > maxTrail) trail.shift();
        lastMove = performance.now(); if (idle) idle = false;
      });

      const settings = { period: 7, wobbleAmp: 0.05, wobbleFreq: 0.6, repulseRadius: 0.1, repulseStrength: 0.02, upwardBias: 0.03, worldTopY: 3.5 };
      const activeCoreOpacity = 0.6; const idleCoreOpacity = 0.3;
      const activeCoreEmissiveBase = 0.7; const idleCoreEmissiveBase = 0.15;
      const activeCoreTransmission = 0.93; const idleCoreTransmission = 0.5;
      const activeAuraOpacity = 0.8; const idleAuraOpacity = 0.2;


      function animate(ms) {
        requestAnimationFrame(animate);
        const t = ms * 0.001; 
        const currentTime = ms; 

        // Aura Sprite Sheet Animation
        if (auraMat.map && auraMat.map.image && auraSpriteParams.totalFrames > 1 && (currentTime - lastAuraFrameTime > auraSpriteParams.frameDuration)) {
            lastAuraFrameTime = currentTime;
            currentAuraFrame = (currentAuraFrame + 1) % auraSpriteParams.totalFrames;

            const column = currentAuraFrame % auraSpriteParams.numberOfColumns;
            const row = Math.floor(currentAuraFrame / auraSpriteParams.numberOfColumns);

            auraMat.map.offset.x = column / auraSpriteParams.numberOfColumns;
            auraMat.map.offset.y = 1 - (row + 1) / auraSpriteParams.numberOfRows;
        }
        
        const groupOsc = Math.sin(t * (2 * Math.PI) / (settings.period * 1.2)) * 0.5 + 0.5;
        const baseGroupScale = 0.28 + groupOsc * 0.07;
        orbGroup.scale.set(baseGroupScale, baseGroupScale, baseGroupScale);
        
        let clickPct = 0; const sinceClick = performance.now() - clickTime;
        if (isClicked) clickPct = 1; else if (sinceClick < clickDur) clickPct = 1 - (sinceClick / clickDur);
        clickPct = Math.max(0, Math.min(1, clickPct));
        const coreOsc = Math.sin(t * (2 * Math.PI) / settings.period * 0.9) * 0.5 + 0.5;
        const coreInternalScale = 0.95 + coreOsc * 0.1; 
        orbCore.scale.set(coreInternalScale * (1 + 0.15 * clickPct), coreInternalScale * (1 - 0.15 * clickPct), coreInternalScale);
        orbCore.scale.x += Math.sin(t * settings.wobbleFreq + 0.7) * settings.wobbleAmp * coreInternalScale;
        orbCore.scale.y += Math.cos(t * settings.wobbleFreq + 0.9) * settings.wobbleAmp * coreInternalScale;

        if (!idle && (performance.now() - lastMove) > idleThreshold) idle = true;

        let targetPos = trail.length > trailLag ? trail[trail.length - 1 - trailLag] : (trail[0] || { x: orbGroup.position.x, y: orbGroup.position.y });
        let biasedTargetY = targetPos.y + (settings.worldTopY - targetPos.y) * settings.upwardBias;
        let desiredX = targetPos.x; let desiredY = biasedTargetY;
        const dx = orbGroup.position.x - targetPos.x; const dy = orbGroup.position.y - biasedTargetY;
        const dist = Math.hypot(dx, dy) || 1;
        if (!idle && dist < settings.repulseRadius && dist > 0.01) {
          desiredX = orbGroup.position.x + (dx / dist) * settings.repulseStrength;
          desiredY = orbGroup.position.y + (dy / dist) * settings.repulseStrength;
        }
        orbGroup.position.x += (desiredX - orbGroup.position.x) * 0.012;
        orbGroup.position.y += (desiredY - orbGroup.position.y) * 0.018;

        const targetOCore = idle ? idleCoreOpacity : activeCoreOpacity;
        const targetEBCore = idle ? idleCoreEmissiveBase : activeCoreEmissiveBase;
        const targetTransCore = (envMapLoaded && !idle) ? activeCoreTransmission : (envMapLoaded && idle ? idleCoreTransmission : 0.0);
        coreMat.opacity += (targetOCore - coreMat.opacity) * 0.02;
        if (envMapLoaded) {
            coreMat.transmission += (targetTransCore - coreMat.transmission) * 0.02;
            coreMat.depthWrite = coreMat.transmission < 0.1;
        } else { coreMat.transmission = 0; coreMat.depthWrite = true; }

        const hueFrac = (t * 0.08) % 1.0;
        coreMat.color.setHSL(hueFrac, 0.85, 0.65);
        coreMat.emissive.setHSL(hueFrac, 0.85, 0.55);
        let currentEmissiveBase = coreMat.emissiveIntensity / (1 + 0.5 * Math.sin((t - 0.016) * 1.2) || 1);
        currentEmissiveBase = (isNaN(currentEmissiveBase) || !isFinite(currentEmissiveBase)) ? (idle ? idleCoreEmissiveBase : activeCoreEmissiveBase) : currentEmissiveBase;
        currentEmissiveBase += (targetEBCore - currentEmissiveBase) * 0.02;
        let matEmissiveIntensity = currentEmissiveBase + currentEmissiveBase * 0.5 * Math.sin(t * 1.2);
        if (!isNaN(matEmissiveIntensity) && isFinite(matEmissiveIntensity)) {
            coreMat.emissiveIntensity = matEmissiveIntensity;
        }
        if (coreMat.emissiveMap && coreMat.emissiveMap.image) {
            coreMat.emissiveMap.offset.x += 0.0005; coreMat.emissiveMap.offset.y -= 0.0003;
        }
        
        if (auraMesh && auraMesh.material) {
            const targetAuraOp = idle ? idleAuraOpacity : activeAuraOpacity;
            auraMesh.material.opacity += (targetAuraOp - auraMesh.material.opacity) * 0.025;
            // auraMesh.material.color.setHSL(hueFrac, 0.7, 0.8); // Optional: tint aura
            auraMesh.scale.setScalar(1 + Math.sin(t * 0.4 + Math.PI / 2) * 0.05);
            auraMesh.rotation.x += 0.00015; auraMesh.rotation.y += 0.00025; auraMesh.rotation.z -= 0.0001;
        }
        
        document.documentElement.style.setProperty('--card-hue', Math.floor(hueFrac * 360));
        pointLight.position.copy(orbGroup.position);
        pointLight.color.setHSL(hueFrac, 0.8, 0.7);
        pointLight.intensity = idle ? 0.1 : 0.8;

        orbGroup.rotation.y += 0.0004; orbGroup.rotation.x += 0.0002;
        
        orbCore.renderOrder = 0;
        if (auraMesh) auraMesh.renderOrder = 1;

        renderer.render(scene, camera);
      }
      animate(0); 

      window.addEventListener('beforeunload', () => { localStorage.setItem('orbPosX', orbGroup.position.x); localStorage.setItem('orbPosY', orbGroup.position.y); });
      window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); }, false);

    } catch (error) { console.error("THREE.js (Orb) initialization failed:", error); if (canvas) canvas.style.display = 'none'; }
  } else {
      console.error("Canvas element #interactive-canvas not found!");
  }

  // --- Blog Loading, Footer Year, Video Controls ---
  document.querySelectorAll('video').forEach(video => {
    if (video.closest && video.closest('.project-item')) return;
    video.removeAttribute('controls'); 
    video.addEventListener('mouseenter', () => video.setAttribute('controls', ''));
    video.addEventListener('mouseleave', () => video.removeAttribute('controls'));
    video.addEventListener('click', () => { 
        if (video.paused) video.play();
        else video.pause();
    });
  });

  const yearSpan = document.getElementById('current-year');
  if (yearSpan) {
    yearSpan.textContent = new Date().getFullYear();
  }

  async function loadBlogPosts() {
    const postsContainer = document.getElementById('blog-posts-container');
    const blogPreviewContainer = document.getElementById('blog-preview-container');
    if (!postsContainer && !blogPreviewContainer) return;
    try {
      const response = await fetch('data/blog-posts.json'); 
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const posts = await response.json();
      if (postsContainer) { 
        postsContainer.innerHTML = ''; 
        if (posts.length === 0) {
            postsContainer.innerHTML = '<p>No posts yet. Stay tuned!</p>'; return;
        }
        posts.forEach(post => {
          const postElement = document.createElement('article');
          postElement.className = 'blog-post-summary';
          const postLink = post.filePath ? (post.filePath.startsWith('http') ? post.filePath : `../${post.filePath}`) : '#';
          const targetAttribute = post.filePath && post.filePath.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : '';
          postElement.innerHTML = `<h3><a href="${postLink}" ${targetAttribute} ${!post.filePath ? 'onclick="return false;"' : ''}>${post.title}</a></h3><span class="post-date">${new Date(post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span><p>${post.summary}</p>${post.filePath ? `<a href="${postLink}" ${targetAttribute} class="btn-secondary">Read More →</a>` : ''}`;
          postsContainer.appendChild(postElement);
        });
      }
      if (blogPreviewContainer) { 
        blogPreviewContainer.innerHTML = ''; 
        const postsToShow = posts.slice(0, 3); 
         if (postsToShow.length === 0) {
            blogPreviewContainer.innerHTML = '<p class="col-span-3" style="text-align:center;">No recent posts.</p>';
        }
        postsToShow.forEach(post => {
          const previewElement = document.createElement('article');
          previewElement.className = 'blog-card'; 
          const postLink = post.filePath ? (post.filePath.startsWith('http') ? post.filePath : `../${post.filePath}`) : 'blog.html';
          const targetAttribute = post.filePath && post.filePath.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : '';
          previewElement.innerHTML = `<h3>${post.title}</h3><p>${post.summary.substring(0, 100)}...</p><a href="${postLink}" ${targetAttribute} class="btn-secondary">${post.filePath ? 'Read More →' : 'View Post →'}</a>`;
          blogPreviewContainer.appendChild(previewElement);
        });
      }
    } catch (error) {
      console.error("Could not load blog posts:", error);
      if (postsContainer) postsContainer.innerHTML = '<p>Error loading posts. Please try again later.</p>';
      if (blogPreviewContainer) blogPreviewContainer.innerHTML = '<p class="col-span-3" style="text-align:center;">Could not load blog previews.</p>';
    }
  }
  if (document.getElementById('blog-posts-container') || document.getElementById('blog-preview-container')) {
    loadBlogPosts();
  }
});