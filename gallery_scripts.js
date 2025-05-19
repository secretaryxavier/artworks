// gallery_scripts.js

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; // Import GLTFLoader

let scene, camera, renderer, controls;
let floor;
// let blackCubeGroup; // Black Cube group is being removed
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
// IMPORTANT: Update these paths to your actual files!
const manuscriptPDFPath = 'docs/your_manuscript_excerpt.pdf'; 
const cathedralModelPath = 'assets/models/cathedral.glb'; 
const technoWiresFloorTexturePath = 'assets/TechnoBrosDoomScape.png'; // <-- RENAME THIS

let paintingPlanes = []; // Array to hold painting planes

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
    scene.fog = new THREE.Fog(0x050505, 10, 60); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000); 
    camera.position.set(0, playerHeight, 15); 

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Gloomier Lighting Setup ---
    const ambientLight = new THREE.AmbientLight(0x303040, 0.4); 
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0x404055, 0x101020, 0.5); 
    scene.add(hemisphereLight);
    const directionalLight = new THREE.DirectionalLight(0x707080, 0.3); 
    directionalLight.position.set(20, 30, 10); 
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048; 
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1; 
    directionalLight.shadow.camera.far = 100; 
    directionalLight.shadow.camera.left = -50; 
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    scene.add(directionalLight);

    // --- Floor with Techno Wires Texture ---
    const textureLoader = new THREE.TextureLoader();
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x888888, 
        roughness: 0.8, 
        metalness: 0.4, 
    });
    textureLoader.load(
        technoWiresFloorTexturePath, // Uses the variable you updated at the top
        function(loadedTexture) { 
            loadedTexture.wrapS = THREE.RepeatWrapping; 
            loadedTexture.wrapT = THREE.RepeatWrapping; 
            // Adjust tiling here (e.g., 10x10 repetition)
            loadedTexture.repeat.set(10, 10); 
            floorMaterial.map = loadedTexture;
            floorMaterial.color.set(0xffffff); 
            floorMaterial.needsUpdate = true;
            console.log("Techno wires floor texture loaded: " + technoWiresFloorTexturePath);
        },
        undefined, 
        function(error) { 
            console.error("Error loading techno wires floor texture. Using fallback. Path: " + technoWiresFloorTexturePath, error);
        }
    );
    const floorGeometry = new THREE.PlaneGeometry(200, 200); 
    floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0; 
    floor.receiveShadow = true;
    scene.add(floor);
    
    // --- Load Cathedral Model ---
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(
        cathedralModelPath, 
        function (gltf) { 
            const cathedral = gltf.scene;
            cathedral.position.set(0, 0, 0); 
            // IMPORTANT: Scale your model if it's too large or small
            // cathedral.scale.set(0.1, 0.1, 0.1); 

            cathedral.traverse(function (node) {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                    collidableObjects.push(node); 
                }
            });
            scene.add(cathedral);
            console.log("Cathedral model loaded successfully: " + cathedralModelPath);
            positionInteriorElements(cathedral); 
        },
        function (xhr) { 
            console.log(`Cathedral model ${ (xhr.loaded / xhr.total * 100).toFixed(2) }% loaded`);
        },
        function (error) { 
            console.error('Error loading cathedral model. Check path: ' + cathedralModelPath, error);
            positionInteriorElements(null); 
        }
    );
    
    // --- Interior Elements (Bench, Paintings) ---
    const benchMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3b2a, roughness: 0.85, metalness: 0.1 });
    const benchSeatGeo = new THREE.BoxGeometry(1.8, 0.25, 0.6);
    bench = new THREE.Mesh(benchSeatGeo, benchMaterial);
    bench.castShadow = true; bench.receiveShadow = true;
    interactableObjects.push(bench); 
    bench.userData = { 
        name: "manuscript_bench", action: "download_pdf", pdfPath: manuscriptPDFPath,
        promptText: "Press [E] to Read Manuscript"
    };
    
    const paintingPlaceholderMaterial = new THREE.MeshStandardMaterial({ color: 0x505050, side: THREE.DoubleSide });
    const paintingGeo = new THREE.PlaneGeometry(1.8, 1.2); 

    for (let i = 0; i < 3; i++) { 
        const paintingPlane = new THREE.Mesh(paintingGeo, paintingPlaceholderMaterial.clone());
        paintingPlane.castShadow = true; 
        paintingPlane.receiveShadow = true;
        paintingPlanes.push(paintingPlane);
    }

    // --- Controls and UI Setup ---
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

function positionInteriorElements(cathedralModel) {
    // --- Position Bench ---
    if (cathedralModel) {
        // TODO: Adjust these coordinates based on your cathedral model's interior.
        bench.position.set(0, 0.5, -10); 
    } else {
        bench.position.set(0, 0.5, -5); 
    }
    scene.add(bench);

    // --- Position Paintings ---
    // TODO: Adjust these positions and rotations for your cathedral's walls.
    const paintingPositions = [
        new THREE.Vector3(-3, playerHeight + 0.5, -12), 
        new THREE.Vector3( 0, playerHeight + 0.5, -13.5),
        new THREE.Vector3( 3, playerHeight + 0.5, -12)  
    ];
    const paintingRotationsY = [ Math.PI / 2, 0, -Math.PI / 2 ];

    paintingPlanes.forEach((plane, index) => {
        if (index < paintingPositions.length) { 
            plane.position.copy(paintingPositions[index]);
            plane.rotation.y = paintingRotationsY[index];
        } else { 
            plane.position.set(index * 2 - 2, playerHeight + 0.5, -15);
        }
        scene.add(plane);

        const paintingLight = new THREE.SpotLight(0xffffee, 0.6, 15, Math.PI / 5, 0.25, 1); 
        const normal = new THREE.Vector3();
        plane.getWorldDirection(normal); 
        const lightPosition = plane.position.clone().addScaledVector(normal.negate(), 2); 
        lightPosition.y += 0.5; 
        paintingLight.position.copy(lightPosition);
        paintingLight.target = plane; 
        scene.add(paintingLight);
        scene.add(paintingLight.target); 
    });
    loadPaintingArtworks(); 
}

function loadPaintingArtworks() {
    const textureLoader = new THREE.TextureLoader();
    // IMPORTANT: Replace with paths to YOUR painting images
    const artworkPaths = [
        'assets/paintings/painting_image_1.jpg', 
        'assets/paintings/painting_image_2.jpg',
        'assets/paintings/painting_image_3.jpg'
    ];

    paintingPlanes.forEach((plane, index) => {
        if (artworkPaths[index]) {
            textureLoader.load(artworkPaths[index], 
                (texture) => {
                    plane.material.map = texture;
                    plane.material.color.set(0xffffff); 
                    plane.material.needsUpdate = true;
                    console.log(`Painting ${index + 1} texture loaded: ${artworkPaths[index]}`);
                },
                undefined,
                (error) => {
                    console.error(`Error loading texture for painting ${index + 1} (${artworkPaths[index]}):`, error);
                }
            );
        }
    });
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
        if (pdfPath === 'docs/your_manuscript_excerpt.pdf' && !pdfPath.startsWith('assets/')) { 
            alert("PDF download placeholder: Please update manuscriptPDFPath in gallery_scripts.js.");
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
    if (moveZ !== 0 && moveX !== 0) intendedDisplacement.normalize().multiplyScalar(actualSpeed);
    const oldPosition = camera.position.clone();
    let potentialPosition = camera.position.clone().add(intendedDisplacement);
    potentialPosition.y = playerHeight; 
    let collisionDetectedThisFrame = false;
    const playerBox = new THREE.Box3().setFromCenterAndSize(potentialPosition, new THREE.Vector3(playerRadius * 2, playerHeight * 0.9, playerRadius * 2));
    for (let i = 0; i < collidableObjects.length; i++) {
        const collidable = collidableObjects[i];
        if (!collidable.geometry || !collidable.visible) continue; 
        collidable.updateMatrixWorld(true); 
        const collidableBox = new THREE.Box3().setFromObject(collidable);
        if (playerBox.intersectsBox(collidableBox)) {
            collisionDetectedThisFrame = true;
            let allowedToMove = false;
            let testPos = oldPosition.clone().add(new THREE.Vector3(intendedDisplacement.x, 0, 0));
            testPos.y = playerHeight;
            let testBox = playerBox.clone().translate(testPos.clone().sub(potentialPosition)); 
            if (!testBox.intersectsBox(collidableBox)) {
                camera.position.copy(testPos);
                allowedToMove = true;
            }
            testPos = camera.position.clone().add(new THREE.Vector3(0, 0, intendedDisplacement.z));
            testPos.y = playerHeight;
            testBox = playerBox.clone().translate(testPos.clone().sub(potentialPosition)); 
            if (!testBox.intersectsBox(collidableBox)) {
                camera.position.copy(testPos);
                allowedToMove = true;
            } else if (allowedToMove) { /* No specific action if only one axis was blocked after first was allowed */ }
            if (!allowedToMove) camera.position.copy(oldPosition); 
            break; 
        }
    }
    if (!collisionDetectedThisFrame) camera.position.copy(potentialPosition);
    camera.position.y = playerHeight; 
}

function animateInitialCamera(delta) {
    if (initialAnimationTime < initialAnimationDuration) {
        initialAnimationTime += delta;
        const progress = Math.min(initialAnimationTime / initialAnimationDuration, 1); 
        const easedProgress = 0.5 - 0.5 * Math.cos(progress * Math.PI); 
        const startZ = 15; 
        const endZ = 5; 
        camera.position.z = THREE.MathUtils.lerp(startZ, endZ, easedProgress);
        if (initialAnimationTime >= initialAnimationDuration) {
            console.log("Initial camera animation complete. Player controls active.");
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
