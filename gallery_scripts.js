// gallery_scripts.js

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let scene, camera, renderer, controls;
let floor;
let blackCubeGroup; 
let bench; // Removed painting plane variables for now, focus on core
let collidableObjects = []; // Array to store objects player can collide with

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
const playerHeight = 1.7; // Assumed player eye height
const playerRadius = 0.3; // Approximate player width for collision

let raycaster;
let interactableObjects = []; 
let currentIntersected = null;

let initialAnimationTime = 0;
const initialAnimationDuration = 3; 

// IMPORTANT: Update this path to your actual PDF file!
const manuscriptPDFPath = 'docs/your_manuscript_excerpt.pdf'; 
// Example placeholder for a cathedral model - replace with your actual path
const cathedralModelPath = 'assets/models/your_cathedral_model.glb'; 
// Example placeholder for black marble texture - replace with your actual path
const blackMarbleTexturePath = 'assets/textures/black_marble.jpg';

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
    scene.fog = new THREE.Fog(0x050505, 15, 50); // Adjusted fog for potentially larger scenes

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); // Increased far plane
    camera.position.set(0, playerHeight, 12); 

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Slightly increased ambient light
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6); // Slightly increased directional light
    directionalLight.position.set(20, 30, 15); // Adjusted light position
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; // Increased shadow map size for better quality
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1; 
    directionalLight.shadow.camera.far = 100; // Increased shadow camera far plane
    directionalLight.shadow.camera.left = -40;
    directionalLight.shadow.camera.right = 40;
    directionalLight.shadow.camera.top = 40;
    directionalLight.shadow.camera.bottom = -40;
    scene.add(directionalLight);
    // scene.add(new THREE.CameraHelper(directionalLight.shadow.camera)); // For debugging

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a, roughness: 0.9, metalness: 0.1
    });
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    // --- Load Cathedral Model (Placeholder) ---
    // Uncomment and modify this section when you have your cathedral model
    /*
    const loader = new GLTFLoader(); // Make sure to import GLTFLoader if you use this
    loader.load(
        cathedralModelPath, // Use the variable defined at the top
        function (gltf) {
            const cathedral = gltf.scene;
            cathedral.position.set(0, 0, 0); // Adjust as needed
            // cathedral.scale.set(1, 1, 1); // Adjust as needed
            cathedral.traverse(function (node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            scene.add(cathedral);
            console.log("Cathedral model loaded.");
            // Position the blackCubeGroup inside or relative to the cathedral
            // blackCubeGroup.position.set(desiredX, desiredY, desiredZ); 
        },
        undefined, // Optional progress callback
        function (error) {
            console.error('Error loading cathedral model:', error);
        }
    );
    */

    // --- Black Cube Construction ---
    blackCubeGroup = new THREE.Group();
    const cubeSize = 6; 
    const wallThickness = 0.2; 
    const cubeActualHeight = 4; 

    // --- Load Black Marble Texture (Placeholder) ---
    const textureLoader = new THREE.TextureLoader();
    // Uncomment and modify this when you have your marble texture
    /*
    const marbleTexture = textureLoader.load(blackMarbleTexturePath, (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2); // Example: Tiling the texture
        console.log("Marble texture loaded.");
        // Note: You'll need to re-assign materials if they are created before texture loads,
        // or create them within this callback. For simplicity, we'll assume materials are created after.
    }, undefined, (error) => {
        console.error("Error loading marble texture: ", error);
    });
    */
    
    // For now, using simple materials. Replace with textured materials when ready.
    const exteriorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x020202, roughness: 0.8, metalness: 0.05,
        // map: marbleTexture // Assign loaded texture here if available
    });
    const interiorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x151515, roughness: 0.95,
        // map: marbleTexture // Or a different interior texture
    });
    
    const cubeWallMaterialArray = [ // For BoxGeometry: px, nx, py, ny, pz, nz
        exteriorMaterial, // Right (+X)
        exteriorMaterial, // Left (-X)
        exteriorMaterial, // Top (+Y)
        exteriorMaterial, // Bottom (-Y)
        exteriorMaterial, // Front (+Z)
        exteriorMaterial  // Back (-Z)
    ];

    // Helper to create a wall and add it to collidables
    function createAndAddWall(geometry, materialArray, position, rotationY = 0) {
        const wall = new THREE.Mesh(geometry, materialArray);
        wall.position.copy(position);
        if (rotationY) wall.rotation.y = rotationY;
        wall.castShadow = true;
        wall.receiveShadow = true;
        blackCubeGroup.add(wall);
        collidableObjects.push(wall); // Add wall to collidable objects list
        return wall;
    }
    
    const wallHeight = cubeActualHeight - wallThickness;

    // Cube Floor (not typically a collidable wall for vertical movement, but part of the group)
    const cubeFloorGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeFloorMesh = new THREE.Mesh(cubeFloorGeo, [exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial]);
    cubeFloorMesh.position.y = wallThickness / 2;
    cubeFloorMesh.receiveShadow = true;
    blackCubeGroup.add(cubeFloorMesh);

    // Cube Ceiling
    const cubeCeilGeo = new THREE.BoxGeometry(cubeSize, wallThickness, cubeSize);
    const cubeCeilingMesh = new THREE.Mesh(cubeCeilGeo, [exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial, exteriorMaterial]);
    cubeCeilingMesh.position.y = cubeActualHeight - (wallThickness / 2);
    cubeCeilingMesh.castShadow = true; cubeCeilingMesh.receiveShadow = true;
    blackCubeGroup.add(cubeCeilingMesh);
    // Add ceiling to collidables if you want to prevent jumping through it
    // collidableObjects.push(cubeCeilingMesh);


    // Walls for collision
    const commonWallGeo = new THREE.BoxGeometry(cubeSize - 2 * wallThickness, wallHeight, wallThickness);
    const sideWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, cubeSize);

    // Back Wall (Z-)
    createAndAddWall(commonWallGeo, [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial], new THREE.Vector3(0, wallHeight / 2 + wallThickness / 2, -cubeSize / 2 + wallThickness / 2));
    // Left Wall (X-)
    createAndAddWall(sideWallGeo, [interiorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial], new THREE.Vector3(-cubeSize / 2 + wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0));
    // Right Wall (X+)
    createAndAddWall(sideWallGeo, [exteriorMaterial, interiorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial], new THREE.Vector3(cubeSize / 2 - wallThickness / 2, wallHeight / 2 + wallThickness / 2, 0));

    // Front Wall (with opening) - Z+
    const doorWidth = 2;
    const doorHeight = 2.8; 
    const frontSidePanelWidth = (cubeSize - doorWidth - 2 * wallThickness) / 2;

    if (frontSidePanelWidth > 0.01) {
        const panelGeo = new THREE.BoxGeometry(frontSidePanelWidth, wallHeight, wallThickness);
        createAndAddWall(panelGeo, [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial], new THREE.Vector3(- (doorWidth / 2 + frontSidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
        createAndAddWall(panelGeo, [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial], new THREE.Vector3( (doorWidth / 2 + frontSidePanelWidth / 2), wallHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
    }
    const lintelHeight = wallHeight - doorHeight;
    if (lintelHeight > 0.01) { 
        const lintelGeo = new THREE.BoxGeometry(doorWidth, lintelHeight, wallThickness);
        createAndAddWall(lintelGeo, [exteriorMaterial, exteriorMaterial, exteriorMaterial, exteriorMaterial, interiorMaterial, exteriorMaterial], new THREE.Vector3(0, doorHeight + lintelHeight / 2 + wallThickness/2, cubeSize / 2 - wallThickness / 2));
    }
    
    // Position the entire black cube group (e.g., if you load a cathedral model, you'd place this inside it)
    blackCubeGroup.position.set(0, 0, 0); 
    scene.add(blackCubeGroup);

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
    
    // Placeholder for painting planes - you'll load textures onto these
    const paintingPlaceholderMaterial = new THREE.MeshStandardMaterial({ color: 0x505050, side: THREE.FrontSide });
    const paintingGeo = new THREE.PlaneGeometry(1.8, 1.2); 

    const paintingPlane1 = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone()); 
    paintingPlane1.position.set(-cubeSize/2 + wallThickness + 0.1, cubeActualHeight/2 - 0.2, 0); 
    paintingPlane1.rotation.y = Math.PI / 2;
    blackCubeGroup.add(paintingPlane1);
    // Add paintingPlane1 to interactableObjects if you want to click on paintings later
    // paintingPlane1.userData = { name: "Painting Title 1", promptText: "View Painting Details"};
    // interactableObjects.push(paintingPlane1);


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
        console.log(`Interacted with: ${object.userData.name}. Attempting to download PDF from: ${pdfPath}`);
        
        // Check if the path is placeholder
        if (pdfPath === 'docs/your_manuscript_excerpt.pdf') {
            alert("PDF download placeholder: Please update the manuscriptPDFPath in gallery_scripts.js with your actual PDF file path.");
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

    const speed = moveSpeed * delta;
    let moveForward = 0;
    let moveStrafe = 0;

    // Corrected W and S: W for forward, S for backward
    if (keys.w || keys.arrowup) moveForward -= 1; 
    if (keys.s || keys.arrowdown) moveForward += 1;
    if (keys.a || keys.arrowleft) moveStrafe -= 1;
    if (keys.d || keys.arrowright) moveStrafe += 1;
    
    const worldDirection = new THREE.Vector3();
    camera.getWorldDirection(worldDirection); // Direction camera is facing

    const rightDirection = new THREE.Vector3();
    rightDirection.crossVectors(camera.up, worldDirection).normalize(); // Right vector relative to camera

    let intendedMove = new THREE.Vector3();
    if (moveForward !== 0) {
        intendedMove.addScaledVector(worldDirection, moveForward * speed);
    }
    if (moveStrafe !== 0) {
        // Correct strafing: use the rightDirection vector
        const strafeVector = new THREE.Vector3().copy(rightDirection).multiplyScalar(moveStrafe * speed);
        intendedMove.add(strafeVector);
    }
    
    // --- Basic Collision Detection ---
    // Store current position in case we need to revert
    const oldPosition = camera.position.clone();
    let potentialPosition = camera.position.clone().add(intendedMove);
    potentialPosition.y = playerHeight; // Keep player at constant height

    let collisionDetected = false;
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        potentialPosition, 
        new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2)
    );

    for (let i = 0; i < collidableObjects.length; i++) {
        const wall = collidableObjects[i];
        wall.updateMatrixWorld(); // Ensure world matrix is up to date
        const wallBox = new THREE.Box3().setFromObject(wall);
        
        if (playerBox.intersectsBox(wallBox)) {
            collisionDetected = true;
            // More sophisticated response would be to slide along the wall
            // For now, we just prevent the move if any collision occurs
            // To allow sliding, you'd project the movement vector away from the collision normal
            
            // Simplistic: try moving along X only, then Z only if combined move fails
            let moveX = new THREE.Vector3(intendedMove.x, 0, 0);
            let potentialPosX = camera.position.clone().add(moveX);
            potentialPosX.y = playerHeight;
            let playerBoxX = new THREE.Box3().setFromCenterAndSize(potentialPosX, new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2));
            if (!playerBoxX.intersectsBox(wallBox)) {
                camera.position.add(moveX);
            }

            let moveZ = new THREE.Vector3(0, 0, intendedMove.z);
            let potentialPosZ = camera.position.clone().add(moveZ); // Use current camera pos after potential X move
            potentialPosZ.y = playerHeight;
            let playerBoxZ = new THREE.Box3().setFromCenterAndSize(potentialPosZ, new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2));
            if (!playerBoxZ.intersectsBox(wallBox)) {
                 camera.position.add(moveZ);
            }
            break; // Stop checking after first collision for this simple model
        }
    }

    if (!collisionDetected) {
        camera.position.add(intendedMove);
    }
    
    camera.position.y = playerHeight; // Ensure player stays at the correct height
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

// --- Function to load your 3D models (e.g., Cathedral) ---
// You would call this from init()
function loadGLTFModel(path, onLoaded, onError) {
    // Ensure GLTFLoader is imported if you use this function
    // import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    const loader = new GLTFLoader(); 
    loader.load(path, onLoaded, undefined, onError);
}

// --- Function to load textures (e.g., Marble) ---
// You would call this from init() before creating materials that use them
function loadTexture(path, onLoaded, onError) {
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(path, onLoaded, undefined, onError);
}


try {
    init();
    // Example of how you might load your cathedral model:
    // loadGLTFModel(cathedralModelPath, 
    //     function (gltf) { /* Cathedral loaded successfully */ 
    //         const model = gltf.scene;
    //         model.position.set(0,0,-20); // Example position
    //         scene.add(model);
    //         // Add model's meshes to collidableObjects if needed
    //     }, 
    //     function (error) { /* Error loading */ console.error("Cathedral load error:", error)}
    // );

    // Example of how you might load marble texture and apply it:
    // loadTexture(blackMarbleTexturePath, 
    //     function(loadedTexture) { /* Texture loaded */
    //         loadedTexture.wrapS = THREE.RepeatWrapping;
    //         loadedTexture.wrapT = THREE.RepeatWrapping;
    //         // Apply to your cube's exteriorMaterial.map = loadedTexture;
    //         // exteriorMaterial.needsUpdate = true;
    //         console.log("Marble texture ready to be applied.");
    //     },
    //     function(error) { /* Error loading */ console.error("Marble texture error:", error)}
    // );

} catch (error) {
    console.error("CRITICAL ERROR during gallery initialization:", error);
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        loadingScreen.textContent = 'Error loading gallery. Check console.';
    }
}
