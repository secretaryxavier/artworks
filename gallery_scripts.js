// gallery_scripts.js

// Import THREE.js. PointerLockControls will be available globally via THREE.PointerLockControls
import * as THREE from 'three';

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
let playerVelocity = new THREE.Vector3();
const moveSpeed = 4; 

let raycaster;
let interactableObjects = []; 

let initialAnimationTime = 0;
const initialAnimationDuration = 3; // seconds

// Store the PDF path here - update this to the actual path of your PDF
const manuscriptPDFPath = 'docs/your_manuscript_excerpt.pdf'; // IMPORTANT: Update this path!

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); 
    scene.fog = new THREE.Fog(0x050505, 10, 40); 

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.7, 12); // Start further back, player height approx 1.7

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3); // Slightly brighter ambient
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4); // Slightly brighter directional
    directionalLight.position.set(15, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 1; // Adjusted shadow camera properties
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
        roughness: 0.9, // More matte floor
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
    const wallThickness = 0.2; // Give walls some thickness
    const cubeActualHeight = 4; // Inner height of the cube

    // Materials for the cube
    const exteriorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x020202, // Very, very dark
        roughness: 0.8,
        metalness: 0.05,
    });
    const interiorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x151515, // Dark grey interior, less reflective
        roughness: 0.95,
    });
    
    // Cube Floor (interior face is interiorMaterial)
    const cubeFloorGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeFloorMesh = new THREE.Mesh(cubeFloorGeo, [
        exteriorMaterial, exteriorMaterial, // L, R
        interiorMaterial, exteriorMaterial, // Top (inside), Bottom (outside)
        exteriorMaterial, exteriorMaterial  // F, B
    ]);
    cubeFloorMesh.position.y = wallThickness / 2;
    cubeFloorMesh.receiveShadow = true;
    blackCubeGroup.add(cubeFloorMesh);

    // Cube Ceiling (interior face is interiorMaterial)
    const cubeCeilGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeCeilingMesh = new THREE.Mesh(cubeCeilGeo, [
        exteriorMaterial, exteriorMaterial, // L, R
        exteriorMaterial, interiorMaterial, // Top (outside), Bottom (inside)
        exteriorMaterial, exteriorMaterial  // F, B
    ]);
    cubeCeilingMesh.position.y = cubeActualHeight - (wallThickness / 2);
    cubeCeilingMesh.castShadow = true; 
    cubeCeilingMesh.receiveShadow = true;
    blackCubeGroup.add(cubeCeilingMesh);

    // Wall constructor helper
    function createWall(width, height, depth, matExterior, matInterior) {
        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            [matExterior, matExterior, matExterior, matExterior, matInterior, matExterior] // Assuming Z+ is interior
        );
        // For walls, it's often easier to use separate planes or ensure normals are correct
        // Or use a single material with DoubleSide if appearance is uniform
        // For now, using BoxGeometry which is simpler to place but material assignment is tricky for "inside/outside"
        // A common approach is to make the "interior" material the one for the face pointing inwards.
        // For a box, faces are: +X, -X, +Y, -Y, +Z, -Z
        return wall;
    }
    
    const wallHeight = cubeActualHeight - wallThickness; // Height of the wall panel itself

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
    const doorHeight = 2.8; // Taller door
    const sidePanelWidth = (cubeSize - doorWidth - 2 * wallThickness) / 2; // Account for side wall thickness

    if (sidePanelWidth > 0) {
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
    const interiorLight1 = new THREE.PointLight(0xffeedd, 0.9, 12, 1.8); // Slightly increased intensity & distance
    interiorLight1.position.set(0, cubeActualHeight - 0.7, 0); 
    interiorLight1.castShadow = true;
    interiorLight1.shadow.mapSize.width = 512; 
    interiorLight1.shadow.mapSize.height = 512;
    interiorLight1.shadow.bias = -0.005; // Help with shadow acne on interior surfaces
    blackCubeGroup.add(interiorLight1); 
    // scene.add(new THREE.PointLightHelper(interiorLight1, 0.3));


    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.85, metalness: 0.1 }); // Darker wood
    const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.25, 0.6); // Slightly larger bench
    bench = new THREE.Mesh(benchSeatGeo, benchMaterial); // Renamed to 'bench'
    bench.position.set(0, 0.5 + wallThickness, -cubeSize / 2 + 1.2); // Adjusted position
    bench.castShadow = true; bench.receiveShadow = true;
    blackCubeGroup.add(bench);
    interactableObjects.push(bench); 
    bench.userData = { name: "manuscript_bench", action: "download_pdf", pdfPath: manuscriptPDFPath };


    const paintingPlaceholderMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x505050, 
        side: THREE.FrontSide // Paintings are single-sided
    });
    const paintingGeo = new THREE.PlaneGeometry(1.8, 1.2); // Example aspect ratio

    paintingPlane1 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone()); // Clone material for unique textures later
    paintingPlane1.position.set(-cubeSize/2 + wallThickness + 0.1, cubeActualHeight/2 - 0.2, 0); 
    paintingPlane1.rotation.y = Math.PI / 2;
    paintingPlane1.castShadow = false; paintingPlane1.receiveShadow = true; 
    blackCubeGroup.add(paintingPlane1);
    // paintingPlane1.userData = { name: "painting_1", imagePath: "assets/paintings/painting1.jpg"}; // Example for later

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
    if (typeof THREE.PointerLockControls === 'undefined') {
        console.error('THREE.PointerLockControls is not loaded. Check HTML script tag.');
        if(loadingScreen) loadingScreen.textContent = 'Error: Player controls could not load.';
        return; // Stop initialization if controls are missing
    }
    controls = new THREE.PointerLockControls(camera, document.body);
    
    canvas.addEventListener('click', () => {
        if (!controls.isLocked) {
            controls.lock();
        } else {
            handleInteractionClick(); 
        }
    });
    controls.addEventListener('lock', () => { 
        crosshair.style.display = 'block'; 
        if (instructionsOverlay) instructionsOverlay.style.display = 'block';
    });
    controls.addEventListener('unlock', () => { 
        crosshair.style.display = 'none'; 
        if (instructionsOverlay) instructionsOverlay.style.display = 'none';
    });

    document.addEventListener('keydown', (event) => { if (keys.hasOwnProperty(event.key)) keys[event.key] = true; });
    document.addEventListener('keyup', (event) => { if (keys.hasOwnProperty(event.key)) keys[event.key] = false; });

    raycaster = new THREE.Raycaster();
    raycaster.far = 5; // Set max distance for raycaster (e.g., interaction range)

    window.addEventListener('resize', onWindowResize, false);

    if (loadingScreen) {
        loadingScreen.classList.add('hidden'); // Fade out loading screen
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
            // Create a temporary link and click it to trigger download
            const link = document.createElement('a');
            link.href = firstIntersectedObject.userData.pdfPath;
            link.download = firstIntersectedObject.userData.pdfPath.split('/').pop(); // Suggest filename
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            // alert(`Downloading: ${firstIntersectedObject.userData.pdfPath.split('/').pop()}`); 
        }
    }
}

function updatePlayerPosition(delta) {
    if (!controls.isLocked && initialAnimationTime >= initialAnimationDuration) return;

    const speed = moveSpeed * delta;
    // Reset velocity. Don't use playerVelocity directly for controls.move methods.
    let moveForward = 0;
    let moveRight = 0;

    if (keys.w || keys.W || keys.ArrowUp) moveForward -= speed;
    if (keys.s || keys.S || keys.ArrowDown) moveForward += speed;
    if (keys.a || keys.A || keys.ArrowLeft) moveRight -= speed;
    if (keys.d || keys.D || keys.ArrowRight) moveRight += speed;
    
    if (Math.abs(moveForward) > 0) controls.moveForward(moveForward);
    if (Math.abs(moveRight) > 0) controls.moveRight(moveRight);
    
    // Keep player on the "ground" (at camera Y position) and prevent flying
    camera.position.y = 1.7; 
    // Basic collision detection will be handled in a more advanced way later.
}

function animateInitialCamera(delta) {
    if (initialAnimationTime < initialAnimationDuration) {
        initialAnimationTime += delta;
        const progress = Math.min(initialAnimationTime / initialAnimationDuration, 1); // 0 to 1
        const easedProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI); // Ease-in-out

        const startZ = 12;
        const endZ = blackCubeGroup.position.z + (cubeSize / 2) + 1.5; // Target just outside the entrance
        camera.position.z = THREE.MathUtils.lerp(startZ, endZ, easedProgress);
        
        // Optionally, make camera look at the center of the cube entrance
        const targetLookAt = new THREE.Vector3(blackCubeGroup.position.x, 1.7, blackCubeGroup.position.z + cubeSize / 2);
        // camera.lookAt(targetLookAt); // This might conflict with PointerLockControls if not handled carefully

        if (initialAnimationTime >= initialAnimationDuration) {
            console.log("Initial camera animation complete. Player controls active.");
            // Ensure camera is not inside a wall after animation
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
        if (controls.isLocked) { 
            updatePlayerPosition(delta);
        }
    }
    
    renderer.render(scene, camera);
}

// --- Load Textures for Paintings (Example) ---
// This should be called after init or as part of it, ensuring objects exist
function loadPaintingTextures() {
    const textureLoader = new THREE.TextureLoader();
    
    // Example for paintingPlane1:
    // Ensure 'assets/paintings/your_painting_image1.jpg' exists
    // const paintingTexture1 = textureLoader.load('assets/paintings/your_painting_image1.jpg', 
    //     (texture) => {
    //         paintingPlane1.material.map = texture;
    //         paintingPlane1.material.color.set(0xffffff); // Set color to white to show texture fully
    //         paintingPlane1.material.needsUpdate = true;
    //         console.log("Painting 1 texture loaded.");
    //     },
    //     undefined,
    //     (error) => { console.error("Error loading painting 1 texture:", error); }
    // );
    // Repeat for paintingPlane2, paintingPlane3 with their respective image paths
}


// --- Start ---
if (typeof THREE === 'undefined') {
    console.error('THREE.js has not been loaded. Check the script tag in your HTML.');
    if (loadingScreen) loadingScreen.textContent = 'Error: Could not load 3D library.';
} else {
    init();
    // loadPaintingTextures(); // Call this when you have your painting image paths ready
}
