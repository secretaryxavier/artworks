// gallery_scripts.js

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; // Import GLTFLoader

let scene, camera, renderer, controls;
let floor;
let blackCubeGroup; 
let bench; 
let collidableObjects = []; 

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const canvas = document.getElementById('gallery-canvas');
const crosshair = document.getElementById('crosshair');
const instructionsDisplay = document.getElementById('instructionsDisplay');
const interactionPrompt = document.getElementById('interactionPrompt');
const pauseMenu = document.getElementById('pauseMenu');
const resumeButton = document.getElementById('resumeButton');

const clock = new THREE.Clock();
const keys = {
    w: false, a: false, s: false, d: false, e: false,
    W: false, A: false, S: false, D: false, E: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};
const moveSpeed = 4; 
const playerHeight = 1.7; 
const playerRadius = 0.3; 

let raycaster;
let interactableObjects = []; 
let currentIntersected = null;

let initialAnimationTime = 0;
const initialAnimationDuration = 3; 

// --- PATHS FOR YOUR ASSETS ---
// IMPORTANT: Update these paths to your actual PDF file!
const manuscriptPDFPath = 'docs/your_manuscript_excerpt.pdf'; 
// IMPORTANT: Update this path to your actual cathedral model file!
const cathedralModelPath = 'assets/cathedral.glb'; 
// IMPORTANT: Update this path to your actual black marble texture file!
const blackMarbleTexturePath = 'assets/textures/black_marble.jpg';

// Materials that might be updated by texture loaders
let blackCubeExteriorMaterial; 

function init() {
    if (!canvas) {
        console.error("CRITICAL: gallery-canvas DOM element not found!");
        if (loadingScreen) loadingScreen.textContent = 'Error: Canvas element missing.';
        return; 
    }
    if (!pauseMenu || !resumeButton || !interactionPrompt || !instructionsDisplay) {
        console.warn("One or more UI elements are missing. UI may not function correctly.");
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); 
    scene.fog = new THREE.Fog(0x050505, 15, 70); // Increased fog distance slightly

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); 
    camera.position.set(0, playerHeight, 12); 

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // For better quality with transparent/alpha textures if needed later
    // renderer.sortObjects = false; 

    const ambientLight = new THREE.AmbientLight(0x606060, 0.6); // Slightly brighter ambient for larger scenes
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); 
    directionalLight.position.set(30, 40, 25); 
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; 
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1; 
    directionalLight.shadow.camera.far = 100; 
    directionalLight.shadow.camera.left = -50; // Wider shadow camera for larger scenes
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);
    // scene.add(new THREE.CameraHelper(directionalLight.shadow.camera));

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a, roughness: 0.9, metalness: 0.1
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);
    
    // --- Load Cathedral Model ---
    // This will load your cathedral model. Ensure the path is correct and the file exists.
    // The GLTFLoader is imported at the top of the script.
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
        cathedralModelPath, // Path to your .glb or .gltf file
        function (gltf) {
            const cathedral = gltf.scene;
            // Adjust position, scale, and rotation as needed for your specific model
            cathedral.position.set(0, 0, 0); // Example: Center it at the origin
            // cathedral.scale.set(1, 1, 1); // Example: Adjust scale if it's too big or small
            // cathedral.rotation.y = Math.PI / 2; // Example: Rotate it

            cathedral.traverse(function (node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    // Optional: Add parts of the cathedral to collidableObjects if needed
                    // collidableObjects.push(node); 
                }
            });
            scene.add(cathedral);
            console.log("Cathedral model loaded successfully.");

            // Position the blackCubeGroup inside or relative to the cathedral
            // For example, if the cathedral is large and at origin, cube might be:
            // blackCubeGroup.position.set(0, 0.1, -10); // Adjust X, Y, Z
        },
        function (xhr) { // Optional: Progress callback
            console.log(`Cathedral model ${ (xhr.loaded / xhr.total * 100).toFixed(2) }% loaded`);
        },
        function (error) {
            console.error('Error loading cathedral model. Check path and file:', error);
            // Fallback: If cathedral fails to load, ensure cube is still visible
            if (blackCubeGroup) scene.add(blackCubeGroup); 
        }
    );
    
    // --- Black Cube Construction ---
    blackCubeGroup = new THREE.Group();
    // Example: Position the cube. This might be adjusted after cathedral loads.
    blackCubeGroup.position.set(0, 0, 0); // Adjust if cathedral is loaded
    scene.add(blackCubeGroup); // Add group to scene early, content added below

    const cubeSize = 6; 
    const wallThickness = 0.2; 
    const cubeActualHeight = 4; 

    // --- Load Black Marble Texture ---
    // This will load your marble texture and apply it to the cube's exterior.
    const textureLoader = new THREE.TextureLoader();
    blackCubeExteriorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x111111, // Dark base color in case texture fails
        roughness: 0.7, 
        metalness: 0.2,
    });

    textureLoader.load(
        blackMarbleTexturePath, // Path to your marble texture
        function (loadedTexture) { // Success callback
            loadedTexture.wrapS = THREE.RepeatWrapping; // How texture repeats horizontally
            loadedTexture.wrapT = THREE.RepeatWrapping; // How texture repeats vertically
            loadedTexture.repeat.set(2, 2); // Example: Tile the texture 2x2 on each face

            blackCubeExteriorMaterial.map = loadedTexture;
            blackCubeExteriorMaterial.color.set(0xffffff); // Set to white to show texture color fully
            blackCubeExteriorMaterial.needsUpdate = true;
            console.log("Black marble texture loaded and applied.");
        },
        function (xhr) { // Optional: Progress callback
            console.log(`Marble texture ${ (xhr.loaded / xhr.total * 100).toFixed(2) }% loaded`);
        },
        function (error) {
            console.error('Error loading black marble texture. Using fallback material. Check path and file:', error);
        }
    );
    
    const interiorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x151515, roughness: 0.95,
    });
    
    function createAndAddWall(geometry, materialArray, position, rotationY = 0) {
        const wall = new THREE.Mesh(geometry, materialArray);
        wall.position.copy(position);
        if (rotationY) wall.rotation.y = rotationY;
        wall.castShadow = true;
        wall.receiveShadow = true;
        blackCubeGroup.add(wall);
        collidableObjects.push(wall); 
        return wall;
    }
    
    const wallHeight = cubeActualHeight - wallThickness;

    // Use blackCubeExteriorMaterial for outside faces of the cube
    const cubeFloorGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeFloorMesh = new THREE.Mesh(cubeFloorGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial]);
    cubeFloorMesh.position.y = wallThickness / 2;
    cubeFloorMesh.receiveShadow = true;
    blackCubeGroup.add(cubeFloorMesh);

    const cubeCeilGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeCeilingMesh = new THREE.Mesh(cubeCeilGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial]);
    cubeCeilingMesh.position.y = cubeActualHeight - (wallThickness / 2);
    cubeCeilingMesh.castShadow = true; cubeCeilingMesh.receiveShadow = true;
    blackCubeGroup.add(cubeCeilingMesh);

    const commonWallGeo = new THREE.BoxGeometry(cubeSize - 2 * wallThickness, wallHeight, wallThickness);
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, cubeSize);

    createAndAddWall(commonWallGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial], new THREE.Vector3(0, wallHeight / 2 + wallThickness / 2, -cubeSize / 2 + wallThickness / 2));
    createAndAddWall(sideWallGeo, [interiorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial], new THREE.Vector3(-cubeSize / 2 + wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0));
    createAndAddWall(sideWallGeo, [blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial], new THREE.Vector3(cubeSize / 2 - wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0));

    const doorWidth = 2;
    const doorHeight = 2.8; 
    const frontSidePanelWidth = (cubeSize - doorWidth - 2 * wallThickness) / 2;

    if (frontSidePanelWidth > 0.01) {
        const panelGeo = new THREE.BoxGeometry(frontSidePanelWidth, wallHeight, wallThickness);
        createAndAddWall(panelGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial], new THREE.Vector3(- (doorWidth / 2 + frontSidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
        createAndAddWall(panelGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial], new THREE.Vector3( (doorWidth / 2 + frontSidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
    }
    const lintelHeight = wallHeight - doorHeight;
    if (lintelHeight > 0.01) { 
        const lintelGeo = new THREE.BoxGeometry(doorWidth, lintelHeight, wallThickness);
        createAndAddWall(lintelGeo, [blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, blackCubeExteriorMaterial, interiorMaterial, blackCubeExteriorMaterial], new THREE.Vector3(0, doorHeight + lintelHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
    }
    
    const interiorLight1 = new THREE.PointLight(0xffeedd, 0.9, 12, 1.8); 
    interiorLight1.position.set(0, cubeActualHeight - 0.7, 0); 
    interiorLight1.castShadow = true;
    interiorLight1.shadow.mapSize.width = 512; interiorLight1.shadow.mapSize.height = 512;
    interiorLight1.shadow.bias = -0.005; 
    blackCubeGroup.add(interiorLight1); 

    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.85, metalness: 0.1 });
    const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.25, 0.6);
    bench = new THREE.Mesh(benchSeatGeo, benchMaterial);
    bench.position.set(0, 0.5 + wallThickness, -cubeSize / 2 + 1.2); 
    bench.castShadow = true; bench.receiveShadow = true;
    blackCubeGroup.add(bench);
    interactableObjects.push(bench); 
    bench.userData = { 
        name: "manuscript_bench", action: "download_pdf", pdfPath: manuscriptPDFPath,
        promptText: "Press [E] to Read Manuscript"
    };
    
    const paintingPlaceholderMaterial = new THREE.MeshStandardMaterial({ color: 0x505050, side: THREE.FrontSide });
    const paintingGeo = new THREE.PlaneGeometry(1.8, 1.2); 
    const paintingPlane1 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone()); 
    paintingPlane1.position.set(-cubeSize/2 + wallThickness + 0.1, cubeActualHeight/2 - 0.2, 0); 
    paintingPlane1.rotation.y = Math.PI / 2;
    blackCubeGroup.add(paintingPlane1);

    controls = new PointerLockControls(camera, document.body); 
    
    if (pauseMenu && resumeButton) {
        controls.addEventListener('lock', () => { 
            pauseMenu.style.display = 'none';
            if (crosshair) crosshair.style.display = 'block'; 
            if (instructionsDisplay) instructionsDisplay.style.display = 'block';
            if (canvas) canvas.style.cursor = 'none';
        });
        controls.addEventListener('unlock', () => { 
            pauseMenu.style.display = 'flex'; 
            if (crosshair) crosshair.style.display = 'none'; 
            if (instructionsDisplay) instructionsDisplay.style.display = 'none';
            if (interactionPrompt) interactionPrompt.style.display = 'none';
            if (canvas) canvas.style.cursor = 'grab';
        });
        resumeButton.addEventListener('click', () => { controls.lock(); });
    }
    
    canvas.addEventListener('click', () => { if (!controls.isLocked) { controls.lock(); } });

    document.addEventListener('keydown', (event) => { 
        const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = true;
        if (key === 'e' && currentIntersected && controls.isLocked) {
            handleInteraction(currentIntersected);
        }
    });
    document.addEventListener('keyup', (event) => { 
        const key = event.key.toLowerCase();
        if (keys.hasOwnProperty(key)) keys[key] = false;
    });

    raycaster = new THREE.Raycaster();
    raycaster.far = 3; 

    window.addEventListener('resize', onWindowResize, false);

    if (loadingScreen) loadingScreen.classList.add('hidden'); 
    animate();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function checkInteractionRaycast() {
    if (!controls.isLocked || !interactionPrompt) return; 

    raycaster.setFromCamera({ x: 0, y: 0 }, camera); 
    const intersects = raycaster.intersectObjects(interactableObjects, false); 

    if (intersects.length > 0) {
        const firstIntersectedObject = intersects[0].object;
        if (currentIntersected !== firstIntersectedObject) {
            currentIntersected = firstIntersectedObject;
            if (currentIntersected.userData.promptText) {
                interactionPrompt.textContent = currentIntersected.userData.promptText;
                interactionPrompt.style.display = 'block';
            } else {
                interactionPrompt.style.display = 'none';
            }
        }
    } else {
        if (currentIntersected) {
            interactionPrompt.style.display = 'none';
        }
        currentIntersected = null;
    }
}

function handleInteraction(object) {
    if (object.userData.action === "download_pdf" && object.userData.pdfPath) {
        const pdfPath = object.userData.pdfPath;
        if (pdfPath === 'docs/your_manuscript_excerpt.pdf' && !pdfPath.startsWith('assets/')) { // Basic check
            alert("PDF download placeholder: Please update the manuscriptPDFPath in gallery_scripts.js with your actual PDF file path (e.g., 'assets/docs/MyManuscript.pdf').");
            if(interactionPrompt) interactionPrompt.textContent = "Update PDF Path!";
            return;
        }
        const link = document.createElement('a');
        link.href = pdfPath;
        link.download = pdfPath.split('/').pop() || 'manuscript.pdf'; 
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if(interactionPrompt) {
            interactionPrompt.textContent = "Downloading...";
            setTimeout(() => {
                if (currentIntersected && currentIntersected.userData.promptText && interactionPrompt) {
                     interactionPrompt.textContent = currentIntersected.userData.promptText;
                } else if (interactionPrompt) {
                    interactionPrompt.style.display = 'none';
                }
            }, 2000);
        }
    }
}

function updatePlayerPosition(delta) {
    if (!controls.isLocked || initialAnimationTime < initialAnimationDuration) return;

    const actualSpeed = moveSpeed * delta;
    const cameraDirection = new THREE.Vector3();
    const cameraRight = new THREE.Vector3();

    cameraDirection.setFromMatrixColumn(camera.matrixWorld, 2).multiplyScalar(-1);
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);

    let moveZ = 0;
    let moveX = 0;

    if (keys.w || keys.arrowup) moveZ = actualSpeed;    
    if (keys.s || keys.arrowdown) moveZ = -actualSpeed; 
    if (keys.a || keys.arrowleft) moveX = -actualSpeed; 
    if (keys.d || keys.arrowright) moveX = actualSpeed;  

    let intendedDisplacement = new THREE.Vector3();
    if (moveZ !== 0) intendedDisplacement.addScaledVector(cameraDirection, moveZ);
    if (moveX !== 0) intendedDisplacement.addScaledVector(cameraRight, moveX);

    if (moveZ !== 0 && moveX !== 0) { // Normalize for diagonal movement
        intendedDisplacement.normalize().multiplyScalar(actualSpeed);
    }
    
    const oldPosition = camera.position.clone();
    let potentialPosition = camera.position.clone().add(intendedDisplacement);
    potentialPosition.y = playerHeight; 

    let collisionDetectedThisFrame = false;
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        potentialPosition, 
        new THREE.Vector3(playerRadius * 2, playerHeight * 0.9, playerRadius * 2)
    );

    for (let i = 0; i < collidableObjects.length; i++) {
        const wall = collidableObjects[i];
        wall.updateMatrixWorld(true); 
        const wallBox = new THREE.Box3().setFromObject(wall);
        
        if (playerBox.intersectsBox(wallBox)) {
            collisionDetectedThisFrame = true;
            // Simplified sliding: try to move along axes separately
            // Try only X component of the original intended displacement
            let testPos = oldPosition.clone().add(new THREE.Vector3(intendedDisplacement.x, 0, 0));
            testPos.y = playerHeight;
            let testBox = playerBox.clone().translate(testPos.clone().sub(potentialPosition));
            if (!testBox.intersectsBox(wallBox)) {
                camera.position.copy(testPos);
            } else {
                // Try only Z component of the original intended displacement
                testPos = oldPosition.clone().add(new THREE.Vector3(0, 0, intendedDisplacement.z));
                testPos.y = playerHeight;
                testBox = playerBox.clone().translate(testPos.clone().sub(potentialPosition));
                if (!testBox.intersectsBox(wallBox)) {
                    camera.position.copy(testPos);
                } else {
                    // If both fail, effectively block movement by not updating camera.position from oldPosition
                    camera.position.copy(oldPosition); // Fully block if individual axes also collide
                }
            }
            break; 
        }
    }

    if (!collisionDetectedThisFrame) {
        camera.position.copy(potentialPosition);
    }
    
    camera.position.y = playerHeight; 
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
        updatePlayerPosition(delta);
        checkInteractionRaycast(); 
    }
    
    renderer.render(scene, camera);
}

try {
    init();
} catch (error) {
    console.error("CRITICAL ERROR during gallery initialization:", error);
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        loadingScreen.textContent = 'Error loading gallery. Check console.';
    }
}
