// gallery_scripts.js

// Explicitly import THREE and PointerLockControls from their module URLs
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.150.1/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/PointerLockControls.js';

let scene, camera, renderer, controls;
let floor;
let blackCubeGroup; 
let bench, paintingPlane1, paintingPlane2, paintingPlane3; 

const loadingScreen = document.getElementById('loadingScreen');
const canvas = document.getElementById('gallery-canvas');
const crosshair = document.getElementById('crosshair');
const instructionsOverlay = document.getElementById('instructions');

const clock = new THREE.Clock();
const keys = {
    w: false, a: false, s: false, d: false,
    W: false, A: false, S: false, D: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};
// playerVelocity is not strictly needed with how controls.moveForward/Right are used
// let playerVelocity = new THREE.Vector3(); 
const moveSpeed = 4; 

let raycaster;
let interactableObjects = []; 

let initialAnimationTime = 0;
const initialAnimationDuration = 3; // seconds

// Store the PDF path here - update this to the actual path of your PDF
const manuscriptPDFPath = 'docs/your_manuscript_excerpt.pdf'; // IMPORTANT: Update this path!

function init() {
    // Ensure essential DOM elements are present
    if (!canvas) {
        console.error("gallery-canvas not found!");
        if (loadingScreen) loadingScreen.textContent = 'Error: Canvas not found.';
        return;
    }
    if (!loadingScreen) {
        console.error("loadingScreen element not found!");
        // Can't update loading screen text if it's not found
    }


    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); 
    scene.fog = new THREE.Fog(0x050505, 10, 40); 

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.7, 12); 

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3); 
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4); 
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 1; 
    directionalLight.shadow.camera.far = 60;
    directionalLight.shadow.camera.left = -30;
    directionalLight.shadow.camera.right = 30;
    directionalLight.shadow.camera.top = 30;
    directionalLight.shadow.camera.bottom = -30;
    scene.add(directionalLight);
    // For debugging shadows:
    // scene.add(new THREE.CameraHelper(directionalLight.shadow.camera));
    // scene.add(new THREE.DirectionalLightHelper(directionalLight, 2));

    // --- Outer Environment ---
    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a, 
        roughness: 0.9, 
        metalness: 0.1
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Black Cube Construction ---
    blackCubeGroup = new THREE.Group();
    const cubeSize = 6; 
    const wallThickness = 0.2; 
    const cubeActualHeight = 4; 

    const exteriorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x020202,
        roughness: 0.8,
        metalness: 0.05,
    });
    const interiorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x151515, 
        roughness: 0.95,
    });
    
    // Cube Floor
    const cubeFloorGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeFloorMesh = new THREE.Mesh(cubeFloorGeo, [
        exteriorMaterial, exteriorMaterial, 
        interiorMaterial, exteriorMaterial, 
        exteriorMaterial, exteriorMaterial  
    ]);
    cubeFloorMesh.position.y = wallThickness / 2;
    cubeFloorMesh.receiveShadow = true;
    blackCubeGroup.add(cubeFloorMesh);

    // Cube Ceiling
    const cubeCeilGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeCeilingMesh = new THREE.Mesh(cubeCeilGeo, [
        exteriorMaterial, exteriorMaterial, 
        exteriorMaterial, interiorMaterial, 
        exteriorMaterial, exteriorMaterial  
    ]);
    cubeCeilingMesh.position.y = cubeActualHeight - (wallThickness / 2);
    cubeCeilingMesh.castShadow = true; 
    cubeCeilingMesh.receiveShadow = true;
    blackCubeGroup.add(cubeCeilingMesh);
    
    const wallHeight = cubeActualHeight - wallThickness;

    // Back Wall (Z-)
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(cubeSize - 2 * wallThickness, wallHeight, wallThickness), [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial]);
    backWall.position.set(0, wallHeight / 2 + wallThickness / 2, -cubeSize / 2 + wallThickness / 2);
    backWall.castShadow = true; backWall.receiveShadow = true;
    blackCubeGroup.add(backWall);

    // Left Wall (X-)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, cubeSize), [interiorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial]);
    leftWall.position.set(-cubeSize / 2 + wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0);
    leftWall.castShadow = true; leftWall.receiveShadow = true;
    blackCubeGroup.add(leftWall);

    // Right Wall (X+)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, cubeSize), [exteriorMaterial, interiorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial]);
    rightWall.position.set(cubeSize / 2 - wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0);
    rightWall.castShadow = true; rightWall.receiveShadow = true;
    blackCubeGroup.add(rightWall);

    // Front Wall (with opening) - Z+
    const doorWidth = 2;
    const doorHeight = 2.8; 
    const sidePanelWidth = (cubeSize - doorWidth - 2 * wallThickness) / 2;

    if (sidePanelWidth > 0.01) { // Check if side panels have meaningful width
        const frontPanelLeft = new THREE.Mesh(new THREE.BoxGeometry(sidePanelWidth, wallHeight, wallThickness), [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial]);
        frontPanelLeft.position.set(- (doorWidth / 2 + sidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2);
        frontPanelLeft.castShadow = true; frontPanelLeft.receiveShadow = true;
        blackCubeGroup.add(frontPanelLeft);

        const frontPanelRight = new THREE.Mesh(new THREE.BoxGeometry(sidePanelWidth, wallHeight, wallThickness), [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial]);
        frontPanelRight.position.set( (doorWidth / 2 + sidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2);
        frontPanelRight.castShadow = true; frontPanelRight.receiveShadow = true;
        blackCubeGroup.add(frontPanelRight);
    }
    
    const lintelHeight = wallHeight - doorHeight;
    if (lintelHeight > 0.01) { 
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, lintelHeight, wallThickness), [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial]);
        lintel.position.set(0, doorHeight + lintelHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2);
        lintel.castShadow = true; lintel.receiveShadow = true;
        blackCubeGroup.add(lintel);
    }
    
    blackCubeGroup.position.set(0, 0, 0); 
    scene.add(blackCubeGroup);

    // --- Interior Elements ---
    const interiorLight1 = new THREE.PointLight(0xffeedd, 0.9, 12, 1.8); 
    interiorLight1.position.set(0, cubeActualHeight - 0.7, 0); 
    interiorLight1.castShadow = true;
    interiorLight1.shadow.mapSize.width = 512; 
    interiorLight1.shadow.mapSize.height = 512;
    interiorLight1.shadow.bias = -0.005; 
    blackCubeGroup.add(interiorLight1); 
    // scene.add(new THREE.PointLightHelper(interiorLight1, 0.3));

    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.85, metalness: 0.1 });
    const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.25, 0.6);
    bench = new THREE.Mesh(benchSeatGeo, benchMaterial);
    bench.position.set(0, 0.5 + wallThickness, -cubeSize / 2 + 1.2); 
    bench.castShadow = true; bench.receiveShadow = true;
    blackCubeGroup.add(bench);
    interactableObjects.push(bench); 
    bench.userData = { name: "manuscript_bench", action: "download_pdf", pdfPath: manuscriptPDFPath };

    const paintingPlaceholderMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x505050, 
        side: THREE.FrontSide 
    });
    const paintingGeo = new THREE.PlaneGeometry(1.8, 1.2); 

    paintingPlane1 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone()); 
    paintingPlane1.position.set(-cubeSize/2 + wallThickness + 0.1, cubeActualHeight/2 - 0.2, 0); 
    paintingPlane1.rotation.y = Math.PI / 2;
    paintingPlane1.castShadow = false; paintingPlane1.receiveShadow = true; 
    blackCubeGroup.add(paintingPlane1);
    // paintingPlane1.userData = { name: "painting_1", imagePath: "assets/paintings/painting1.jpg"}; 

    paintingPlane2 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone());
    paintingPlane2.position.set(0, cubeActualHeight/2 - 0.2, -cubeSize/2 + wallThickness + 0.1); 
    paintingPlane2.castShadow = false; paintingPlane2.receiveShadow = true;
    blackCubeGroup.add(paintingPlane2);
    // paintingPlane2.userData = { name: "painting_2", imagePath: "assets/paintings/painting2.jpg"};

    paintingPlane3 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone());
    paintingPlane3.position.set(cubeSize/2 - wallThickness - 0.1, cubeActualHeight/2 - 0.2, 0); 
    paintingPlane3.rotation.y = -Math.PI / 2;
    paintingPlane3.castShadow = false; paintingPlane3.receiveShadow = true;
    blackCubeGroup.add(paintingPlane3);
    // paintingPlane3.userData = { name: "painting_3", imagePath: "assets/paintings/painting3.jpg"};

    // --- Controls and Interaction Setup ---
    controls = new PointerLockControls(camera, document.body); // Use the imported PointerLockControls
    
    canvas.addEventListener('click', () => {
        if (!controls.isLocked) {
            controls.lock();
        } else {
            handleInteractionClick(); 
        }
    });
    controls.addEventListener('lock', () => { 
        if (crosshair) crosshair.style.display = 'block'; 
        if (instructionsOverlay) instructionsOverlay.style.display = 'block';
    });
    controls.addEventListener('unlock', () => { 
        if (crosshair) crosshair.style.display = 'none'; 
        if (instructionsOverlay) instructionsOverlay.style.display = 'none';
    });

    document.addEventListener('keydown', (event) => { if (keys.hasOwnProperty(event.key)) keys[event.key] = true; });
    document.addEventListener('keyup', (event) => { if (keys.hasOwnProperty(event.key)) keys[event.key] = false; });

    raycaster = new THREE.Raycaster();
    raycaster.far = 5; 

    window.addEventListener('resize', onWindowResize, false);

    if (loadingScreen) {
        loadingScreen.classList.add('hidden'); 
    } else {
        console.warn("loadingScreen element was not found at the end of init.");
    }
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function handleInteractionClick() {
    if (!controls.isLocked) return; 

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); 
    const intersects = raycaster.intersectObjects(interactableObjects, false); 

    if (intersects.length > 0) {
        const firstIntersectedObject = intersects[0].object;
        if (firstIntersectedObject.userData.action === "download_pdf" && firstIntersectedObject.userData.pdfPath) {
            console.log(`Interacted with: ${firstIntersectedObject.userData.name}. Downloading PDF from: ${firstIntersectedObject.userData.pdfPath}`);
            const link = document.createElement('a');
            link.href = firstIntersectedObject.userData.pdfPath;
            link.download = firstIntersectedObject.userData.pdfPath.split('/').pop() || 'manuscript.pdf'; 
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}

function updatePlayerPosition(delta) {
    // This check is important: only move if controls are locked AND initial animation is done.
    if (!controls.isLocked || initialAnimationTime < initialAnimationDuration) return;

    const speed = moveSpeed * delta;
    let moveForwardAmount = 0;
    let moveRightAmount = 0;

    if (keys.w || keys.W || keys.ArrowUp) moveForwardAmount -= 1; // Use 1 or -1 for direction
    if (keys.s || keys.S || keys.ArrowDown) moveForwardAmount += 1;
    if (keys.a || keys.A || keys.ArrowLeft) moveRightAmount -= 1;
    if (keys.d || keys.D || keys.ArrowRight) moveRightAmount += 1;
    
    // Normalize diagonal movement and apply speed
    const moveDirection = new THREE.Vector2(moveRightAmount, moveForwardAmount).normalize();
    
    if (moveDirection.lengthSq() > 0) { // Check if there's any movement input
        controls.moveForward(moveDirection.y * speed);
        controls.moveRight(moveDirection.x * speed);
    }
    
    camera.position.y = 1.7; 
}


function animateInitialCamera(delta) {
    if (initialAnimationTime < initialAnimationDuration) {
        initialAnimationTime += delta;
        const progress = Math.min(initialAnimationTime / initialAnimationDuration, 1); 
        const easedProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI); 

        const startZ = 12;
        const endZ = blackCubeGroup.position.z + (cubeSize / 2) + 1.5; 
        camera.position.z = THREE.MathUtils.lerp(startZ, endZ, easedProgress);
        
        if (initialAnimationTime >= initialAnimationDuration) {
            console.log("Initial camera animation complete. Player controls active.");
            camera.position.z = Math.max(camera.position.z, blackCubeGroup.position.z + cubeSize/2 + 0.3); 
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (initialAnimationTime < initialAnimationDuration) {
        animateInitialCamera(delta);
    } else {
        // updatePlayerPosition already checks if controls are locked
        updatePlayerPosition(delta);
    }
    
    renderer.render(scene, camera);
}

// --- Load Textures for Paintings (Example) ---
function loadPaintingTextures() {
    const textureLoader = new THREE.TextureLoader();
    // Example:
    // const paintingTexture1 = textureLoader.load('assets/paintings/your_painting_image1.jpg', 
    //     (texture) => {
    //         if (paintingPlane1) {
    //             paintingPlane1.material.map = texture;
    //             paintingPlane1.material.color.set(0xffffff); 
    //             paintingPlane1.material.needsUpdate = true;
    //             console.log("Painting 1 texture loaded.");
    //         }
    //     },
    //     undefined,
    //     (error) => { console.error("Error loading painting 1 texture:", error); }
    // );
}

// --- Start ---
// DOM is ready when a module script executes.
// Call init directly.
try {
    init();
    // loadPaintingTextures(); // Call when ready
} catch (error) {
    console.error("Error during initialization or animation setup:", error);
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        loadingScreen.textContent = 'An error occurred. Cannot load gallery.';
    }
}

