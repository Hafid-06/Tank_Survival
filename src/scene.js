// src/scene.js
import * as BABYLON from "@babylonjs/core";
import * as GUI from "@babylonjs/gui"; 
import "@babylonjs/loaders";
import "@babylonjs/core/Audio/audioSceneComponent";

export function createScene(engine, canvas) {
    const scene = new BABYLON.Scene(engine);

    // --- ETAT DU JEU ---
    let isGameStarted = false; 
    let isPaused = false;

    // --- IA : ÉTATS DES ENNEMIS (FSM) ---
    const EnemyState = {
        PATROL: 'patrol',
        CHASE: 'chase',
        FLANK: 'flank',
        CHARGE: 'charge'
    };

    function getRandomPatrolTarget() {
        return new BABYLON.Vector3(
            (Math.random() * 60) - 30,
            0,
            (Math.random() * 60) - 30
        );
    }

    /* ================= 1. ENVIRONNEMENT ================= */
    scene.clearColor = new BABYLON.Color3(0.53, 0.80, 0.92); 
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP;
    scene.fogDensity = 0.005; 
    scene.fogColor = scene.clearColor; 

    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
    dirLight.position = new BABYLON.Vector3(20, 40, 20);
    dirLight.intensity = 0.8;

    const shadowGenerator = new BABYLON.ShadowGenerator(1024, dirLight);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 100, height: 100 }, scene);
    const groundMat = new BABYLON.StandardMaterial("groundMat", scene);
    groundMat.diffuseTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/ground.jpg", scene);
    groundMat.diffuseTexture.uScale = 10;
    groundMat.diffuseTexture.vScale = 10;
    ground.material = groundMat;
    ground.receiveShadows = true;

    // --- SONS LOCAUX ---
    let shootLoaded = false;
    let bonusLoaded = false;

    const shootSound = new BABYLON.Sound("shoot", "/sounds/shoot.mp3", scene, () => {
        shootLoaded = true;
    }, { volume: 0.5, spatialSound: false });

    const bonusSound = new BABYLON.Sound("bonus", "/sounds/bonus.mp3", scene, () => {
        bonusLoaded = true;
    }, { volume: 1.0, spatialSound: false });

    const shootAudioEl = new Audio('/sounds/shoot.mp3');
    shootAudioEl.preload = 'auto';
    shootAudioEl.addEventListener('canplaythrough', () => {});
    shootAudioEl.addEventListener('error', (e) => {});

    const bonusAudioEl = new Audio('/sounds/bonus.mp3');
    bonusAudioEl.preload = 'auto';
    bonusAudioEl.addEventListener('canplaythrough', () => {});
    bonusAudioEl.addEventListener('error', (e) => {});

    try {
    fetch('/sounds/shoot.mp3', { method: 'HEAD' }).then(() => {}).catch(() => {});
    fetch('/sounds/bonus.mp3', { method: 'HEAD' }).then(() => {}).catch(() => {});
    } catch (e) {
        // silent
    }

    function unlockAudioContext() {
        try {
            const engineObj = scene.getEngine && scene.getEngine();
            const audioEngine = engineObj && (engineObj.audioEngine || (engineObj.getAudioEngine && engineObj.getAudioEngine()));
            const audioCtx = audioEngine && audioEngine.audioContext;
            if (audioCtx) {
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(() => {});
                }
            }
        } catch (e) {
            // silent
        }

        try {
            shootAudioEl && shootAudioEl.play().then(() => { shootAudioEl.pause(); shootAudioEl.currentTime = 0; }).catch(() => {});
            bonusAudioEl && bonusAudioEl.play().then(() => { bonusAudioEl.pause(); bonusAudioEl.currentTime = 0; }).catch(() => {});
        } catch (e) {
            // silent
        }

        window.removeEventListener('pointerdown', unlockAudioContext);
        window.removeEventListener('keydown', unlockAudioContext);
    }

    window.addEventListener('pointerdown', unlockAudioContext);
    window.addEventListener('keydown', unlockAudioContext);

    // ROCHERS
    const obstacles = [];
    for (let i = 0; i < 8; i++) {
        const rockBase = BABYLON.MeshBuilder.CreateSphere("rock", { 
            diameter: 1.2 + Math.random() * 1.2,
            segments: 6 
        }, scene);
        rockBase.position.x = (Math.random() * 80) - 40;
        rockBase.position.z = (Math.random() * 80) - 40;
        rockBase.position.y = 0.6;
        
        rockBase.scaling.x = 0.8 + Math.random() * 0.4;
        rockBase.scaling.y = 0.5 + Math.random() * 0.3;
        rockBase.scaling.z = 0.8 + Math.random() * 0.4;
        rockBase.rotation.y = Math.random() * Math.PI;
        
        const rockMat = new BABYLON.StandardMaterial("rockMat", scene);
        const gray = 0.75 + Math.random() * 0.1;
        rockMat.diffuseColor = new BABYLON.Color3(gray, gray, gray);
        rockMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        rockMat.specularPower = 16;

        rockBase.material = rockMat;
        rockBase.receiveShadows = true;
        shadowGenerator.addShadowCaster(rockBase);
        
        obstacles.push(rockBase);
    }

    // ARBRES
    for (let i = 0; i < 5; i++) {
        const trunk = BABYLON.MeshBuilder.CreateCylinder("trunk", { 
            height: 5, 
            diameterTop: 0.3, 
            diameterBottom: 0.5,
            tessellation: 8
        }, scene);
        trunk.position.x = (Math.random() * 80) - 40;
        trunk.position.z = (Math.random() * 80) - 40;
        trunk.position.y = 2.5;
        
        const trunkMat = new BABYLON.StandardMaterial("trunkMat", scene);
        trunkMat.diffuseColor = new BABYLON.Color3(0.25, 0.15, 0.1);
        trunk.material = trunkMat;
        shadowGenerator.addShadowCaster(trunk);
        
        obstacles.push(trunk);
        
        for (let layer = 0; layer < 4; layer++) {
            const cone = BABYLON.MeshBuilder.CreateCylinder("leaves", {
                height: 2.5 - (layer * 0.3),
                diameterTop: 0,
                diameterBottom: 3 - (layer * 0.6),
                tessellation: 8
            }, scene);
            cone.position = trunk.position.clone();
            cone.position.y = 5 + (layer * 1.2);
            
            const leavesMat = new BABYLON.StandardMaterial("leavesMat", scene);
            leavesMat.diffuseColor = new BABYLON.Color3(0.1 + Math.random() * 0.1, 0.4 + Math.random() * 0.1, 0.15);
            leavesMat.specularColor = new BABYLON.Color3(0, 0, 0);
            cone.material = leavesMat;
            shadowGenerator.addShadowCaster(cone);
        }
    }

    /* ================= 2. TANK (JOUEUR) ================= */
    const tank = BABYLON.MeshBuilder.CreateBox("tank", { width: 2, height: 1, depth: 3 }, scene);
    tank.position.y = 0.6;
    const tankMat = new BABYLON.StandardMaterial("tankMat", scene);
    tankMat.diffuseColor = new BABYLON.Color3(0.2, 0.8, 0.2); 
    tank.material = tankMat;
    shadowGenerator.addShadowCaster(tank);

    const turret = new BABYLON.MeshBuilder.CreateBox("turret", { width: 1.5, height: 0.8, depth: 1.5 }, scene);
    turret.parent = tank;
    turret.position.y = 0.9;
    shadowGenerator.addShadowCaster(turret);

    const gun = BABYLON.MeshBuilder.CreateCylinder("gun", { diameter: 0.2, height: 2 }, scene);
    gun.parent = turret;
    gun.rotation.x = Math.PI / 2;
    gun.position.z = 1.5;
    shadowGenerator.addShadowCaster(gun);

    // --- POUSSIERE DU TANK ---
    const dustParticles = new BABYLON.ParticleSystem("dust", 200, scene);
    dustParticles.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/cloud.png", scene);
    dustParticles.emitter = tank; 
    dustParticles.minEmitBox = new BABYLON.Vector3(-1, -0.5, -1.5); 
    dustParticles.maxEmitBox = new BABYLON.Vector3(1, -0.5, 1.5);
    dustParticles.color1 = new BABYLON.Color4(0.4, 0.3, 0.2, 0.4); 
    dustParticles.color2 = new BABYLON.Color4(0.5, 0.4, 0.3, 0.2);
    dustParticles.colorDead = new BABYLON.Color4(0, 0, 0, 0);
    dustParticles.minSize = 0.5;
    dustParticles.maxSize = 1.5;
    dustParticles.minLifeTime = 0.2;
    dustParticles.maxLifeTime = 0.8;
    dustParticles.emitRate = 0; 
    dustParticles.direction1 = new BABYLON.Vector3(-0.5, 0.5, -0.5);
    dustParticles.direction2 = new BABYLON.Vector3(0.5, 1, 0.5);
    dustParticles.gravity = new BABYLON.Vector3(0, -2, 0);
    dustParticles.start();

    /* ================= 3. VARIABLES DE JEU ================= */
    let score = 0;
    let lives = 3;
    let currentWave = 1;
    let rapidFireActive = false;
    let speedBoostActive = false;
    let enemiesFrozen = false;

    let tankVelocity = 0;      
    let tankTurnVelocity = 0;  

    let dashActive = false;
    let dashCooldown = 0;
    const DASH_DURATION = 0.7;
    const DASH_COOLDOWN = 5.0;
    let dashTimer = 0;
    let dashParticles = null;

    let highScore = parseInt(localStorage.getItem('tankSurvivalHighScore')) || 0;

    /* ================= 4. UI / INTERFACE (MENU + HUD) ================= */
    const advancedTexture = GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI");

    const hudContainer = new GUI.Rectangle();
    hudContainer.thickness = 0;
    hudContainer.isVisible = false;
    advancedTexture.addControl(hudContainer);

    const damageOverlay = new GUI.Rectangle();
    damageOverlay.width = "100%";
    damageOverlay.height = "100%";
    damageOverlay.background = "red";
    damageOverlay.alpha = 0;
    damageOverlay.thickness = 0;
    damageOverlay.zIndex = -1;
    hudContainer.addControl(damageOverlay);

    const topPanel = new GUI.Rectangle();
    topPanel.width = "300px";
    topPanel.height = "130px";
    topPanel.cornerRadius = 20; 
    topPanel.color = "Black"; 
    topPanel.thickness = 1; 
    topPanel.background = "rgba(255, 255, 255, 0.5)"; 
    topPanel.top = "20px";
    topPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    topPanel.left = "20px"; 
    hudContainer.addControl(topPanel);

    const scoreText = new GUI.TextBlock();
    scoreText.text = "SCORE: 0";
    scoreText.color = "Black"; 
    scoreText.fontSize = 24;
    scoreText.fontWeight = "bold";
    scoreText.top = "-35px";
    topPanel.addControl(scoreText);

    const highScoreText = new GUI.TextBlock();
    highScoreText.text = "RECORD: " + highScore;
    highScoreText.color = "Gold";
    highScoreText.fontSize = 20;
    highScoreText.fontWeight = "bold";
    highScoreText.top = "-5px";
    topPanel.addControl(highScoreText);

    const livesText = new GUI.TextBlock();
    livesText.text = "VIES: 3";
    livesText.color = "#008800"; 
    livesText.fontSize = 24;
    livesText.fontWeight = "bold";
    livesText.top = "30px";
    topPanel.addControl(livesText);

    const wavePanel = new GUI.Rectangle();
    wavePanel.width = "200px";
    wavePanel.height = "60px";
    wavePanel.cornerRadius = 20;
    wavePanel.color = "Black";
    wavePanel.thickness = 2;
    wavePanel.background = "rgba(255, 0, 0, 0.2)"; 
    wavePanel.top = "20px";
    wavePanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    wavePanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    wavePanel.left = "-20px"; 
    hudContainer.addControl(wavePanel);

    const waveText = new GUI.TextBlock();
    waveText.text = "VAGUE: 1";
    waveText.color = "DarkRed";
    waveText.fontSize = 30;
    waveText.fontWeight = "bold";
    wavePanel.addControl(waveText);

    const dashPanel = new GUI.Rectangle();
    dashPanel.width = "200px";
    dashPanel.height = "60px";
    dashPanel.cornerRadius = 20;
    dashPanel.color = "Black";
    dashPanel.thickness = 2;
    dashPanel.background = "rgba(0, 255, 255, 0.3)"; 
    dashPanel.top = "100px";
    dashPanel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    dashPanel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    dashPanel.left = "-20px"; 
    hudContainer.addControl(dashPanel);

    const dashText = new GUI.TextBlock();
    dashText.text = "DASH: PRÊT";
    dashText.color = "Cyan";
    dashText.fontSize = 24;
    dashText.fontWeight = "bold";
    dashPanel.addControl(dashText);

    const bonusText = new GUI.TextBlock();
    bonusText.text = "";
    bonusText.color = "Gold";
    bonusText.fontSize = 40;
    bonusText.fontWeight = "bold";
    bonusText.top = "-100px";
    hudContainer.addControl(bonusText);

    // Menu Pause
    const pauseMenu = new GUI.Rectangle();
    pauseMenu.width = "400px";
    pauseMenu.height = "300px";
    pauseMenu.cornerRadius = 20;
    pauseMenu.color = "White";
    pauseMenu.thickness = 3;
    pauseMenu.background = "rgba(0, 0, 0, 0.9)";
    pauseMenu.isVisible = false;
    pauseMenu.zIndex = 100; 
    hudContainer.addControl(pauseMenu);

    const pauseTitle = new GUI.TextBlock();
    pauseTitle.text = "PAUSE";
    pauseTitle.color = "White";
    pauseTitle.fontSize = 40;
    pauseTitle.fontWeight = "bold";
    pauseTitle.top = "-80px";
    pauseMenu.addControl(pauseTitle);

    const resumeBtn = GUI.Button.CreateSimpleButton("resumeBtn", "▶ REPRENDRE");
    resumeBtn.width = "250px";
    resumeBtn.height = "60px";
    resumeBtn.color = "white";
    resumeBtn.cornerRadius = 15;
    resumeBtn.background = "green";
    resumeBtn.top = "0px";
    resumeBtn.fontSize = 24;
    resumeBtn.fontWeight = "bold";
    resumeBtn.onPointerClickObservable.add(() => { 
        isPaused = false;
        pauseMenu.isVisible = false;
        pauseBtn.textBlock.text = "⏸ PAUSE";
    });
    pauseMenu.addControl(resumeBtn);

    const quitBtn = GUI.Button.CreateSimpleButton("quitBtn", "🏠 MENU");
    quitBtn.width = "250px";
    quitBtn.height = "60px";
    quitBtn.color = "white";
    quitBtn.cornerRadius = 15;
    quitBtn.background = "darkred";
    quitBtn.top = "80px";
    quitBtn.fontSize = 24;
    quitBtn.fontWeight = "bold";
    quitBtn.onPointerClickObservable.add(() => { 
        isPaused = false;
        isGameStarted = false;
        pauseMenu.isVisible = false;
        pauseBtn.textBlock.text = "⏸ PAUSE";
        hudContainer.isVisible = false;
        menuContainer.isVisible = true;
        resetGame();
    });
    pauseMenu.addControl(quitBtn);

    // Bouton Pause
    const pauseBtn = GUI.Button.CreateSimpleButton("pauseBtn", "⏸ PAUSE");
    pauseBtn.width = "150px";
    pauseBtn.height = "50px";
    pauseBtn.color = "white";
    pauseBtn.cornerRadius = 15;
    pauseBtn.background = "rgba(100, 100, 100, 0.7)";
    pauseBtn.top = "20px";
    pauseBtn.fontSize = 20;
    pauseBtn.fontWeight = "bold";
    pauseBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    pauseBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    pauseBtn.zIndex = 10; 
    pauseBtn.onPointerClickObservable.add(() => {
        isPaused = !isPaused;
        pauseMenu.isVisible = isPaused;
        pauseBtn.textBlock.text = isPaused ? "▶ REPRENDRE" : "⏸ PAUSE";
    });
    hudContainer.addControl(pauseBtn);

    // --- ECRAN D'ACCUEIL (MENU) ---
    const menuContainer = new GUI.Rectangle();
    menuContainer.background = "rgba(0, 0, 0, 0.8)";
    menuContainer.thickness = 0;
    advancedTexture.addControl(menuContainer);

    const titleText = new GUI.TextBlock();
    titleText.text = "TANK SURVIVAL";
    titleText.color = "White";
    titleText.fontSize = 60;
    titleText.fontWeight = "bold";
    titleText.top = "-150px";
    menuContainer.addControl(titleText);

    const menuHighScoreText = new GUI.TextBlock();
    menuHighScoreText.text = "🏆 MEILLEUR SCORE: " + highScore;
    menuHighScoreText.color = "Gold";
    menuHighScoreText.fontSize = 30;
    menuHighScoreText.fontWeight = "bold";
    menuHighScoreText.top = "-80px";
    menuContainer.addControl(menuHighScoreText);

    const instructionsText = new GUI.TextBlock();
    instructionsText.text = "ZQSD pour bouger - ESPACE pour tirer\nSHIFT pour dash - ESC pour pause\nSurvivez aux vagues !";
    instructionsText.color = "LightGray";
    instructionsText.fontSize = 24;
    instructionsText.top = "-20px";
    menuContainer.addControl(instructionsText);

    const playBtn = GUI.Button.CreateSimpleButton("playBtn", "JOUER");
    playBtn.width = "200px";
    playBtn.height = "60px";
    playBtn.color = "white";
    playBtn.cornerRadius = 20;
    playBtn.background = "green";
    playBtn.top = "100px";
    playBtn.fontSize = 30;
    playBtn.fontWeight = "bold";
    
    playBtn.onPointerClickObservable.add(() => { 
        isGameStarted = true;
        menuContainer.isVisible = false;
        hudContainer.isVisible = true;
        try { unlockAudioContext(); } catch (e) { /* silent */ }
    });

    menuContainer.addControl(playBtn);

    // --- FONCTION TEXTE FLOTTANT (+10) ---
    function showFloatingText(text, position) {
        const dummy = BABYLON.MeshBuilder.CreateBox("dummy", {size: 0.1}, scene);
        dummy.position = position.clone();
        dummy.position.y += 2; 
        dummy.isVisible = false;

        const label = new GUI.TextBlock();
        label.text = text;
        label.color = "Yellow";
        label.fontSize = 30;
        label.fontWeight = "bold";
        label.outlineWidth = 3;
        label.outlineColor = "Black";
        advancedTexture.addControl(label);
        
        label.linkWithMesh(dummy);

        let alpha = 1.0;
        const floatAnim = scene.onBeforeRenderObservable.add(() => {
            if (isPaused) return; 
            dummy.position.y += 0.05; 
            alpha -= 0.02; 
            label.alpha = alpha;
            if (alpha <= 0) { 
                scene.onBeforeRenderObservable.remove(floatAnim);
                label.dispose();
                dummy.dispose();
            }
        });
    }

    /* ================= 5. SYSTEME DE POWER-UPS (BONUS) ================= */
    const powerUps = [];

    const spawnPowerUp = () => {
        if (!isGameStarted) return;

        const type = Math.floor(Math.random() * 4); 
        let color, name;

        if (type === 0) { color = BABYLON.Color3.Yellow(); name = "MITRAILLETTE !"; }
        if (type === 1) { color = BABYLON.Color3.Red(); name = "VIE +1"; }
        if (type === 2) { color = BABYLON.Color3.Teal(); name = "FREEZE !"; }
        if (type === 3) { color = BABYLON.Color3.Purple(); name = "VITESSE MAX !"; }

        const box = BABYLON.MeshBuilder.CreateBox("bonus", {size: 1.5}, scene);
        box.position.x = (Math.random() * 80) - 40;
        box.position.z = (Math.random() * 80) - 40;
        box.position.y = 20; 

        const mat = new BABYLON.StandardMaterial("bonusMat", scene);
        mat.emissiveColor = color; 
        box.material = mat;
        
        box.bonusType = type;
        box.bonusName = name;
        
        scene.registerBeforeRender(() => {
            if (!isPaused) {
                box.rotation.y += 0.05;
                box.rotation.x += 0.05;
            }
        });

        powerUps.push(box);
    };

    setInterval(spawnPowerUp, 15000);

    /* ================= 6. PARTICULES (EXPLOSIONS) ================= */
    const createExplosion = (position) => {
        const particleSystem = new BABYLON.ParticleSystem("particles", 200, scene);
        particleSystem.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", scene);
        particleSystem.emitter = position; 
        
        particleSystem.color1 = new BABYLON.Color4(1, 0.5, 0, 1.0);
        particleSystem.color2 = new BABYLON.Color4(1, 0.2, 0, 1.0);
        particleSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);

        particleSystem.minSize = 0.1;
        particleSystem.maxSize = 0.5;
        particleSystem.minLifeTime = 0.2;
        particleSystem.maxLifeTime = 0.5;
        particleSystem.emitRate = 1000;
        particleSystem.createSphereEmitter(1);
        particleSystem.minEmitPower = 1;
        particleSystem.maxEmitPower = 5;
        particleSystem.updateSpeed = 0.02;

        particleSystem.start();
        setTimeout(() => {
            particleSystem.stop();
            setTimeout(() => { particleSystem.dispose(); }, 1000);
        }, 500);
    };

    const createDashParticles = () => {
        const particleSystem = new BABYLON.ParticleSystem("dashParticles", 500, scene);
        particleSystem.particleTexture = new BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", scene);
        particleSystem.emitter = tank;
        
        particleSystem.color1 = new BABYLON.Color4(0, 1, 1, 1.0);
        particleSystem.color2 = new BABYLON.Color4(0, 0.5, 1, 1.0);
        particleSystem.colorDead = new BABYLON.Color4(0, 0, 0, 0.0);

        particleSystem.minSize = 0.2;
        particleSystem.maxSize = 0.6;
        particleSystem.minLifeTime = 0.3;
        particleSystem.maxLifeTime = 0.6;
        particleSystem.emitRate = 300;
        particleSystem.createSphereEmitter(0.5);
        particleSystem.minEmitPower = 2;
        particleSystem.maxEmitPower = 5;
        particleSystem.updateSpeed = 0.01;

        particleSystem.start();
        return particleSystem;
    };

    /* ================= 7. CAMERA ================= */
    const camera = new BABYLON.FollowCamera("camera", new BABYLON.Vector3(0, 10, -10), scene);
    camera.lockedTarget = tank;
    camera.radius = 12;
    camera.heightOffset = 5;
    camera.rotationOffset = 180;
    camera.cameraAcceleration = 0.05;
    camera.maxCameraSpeed = 10;

    let cameraShakeIntensity = 0;
    let originalCameraHeight = camera.heightOffset;

    /* ================= 8. INPUTS ================= */
    const inputMap = {};
    scene.onKeyboardObservable.add((kb) => {
        const key = kb.event.key.toLowerCase();
        if (kb.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
            inputMap[key] = true;
            
            if (kb.event.key === "Escape" && isGameStarted) {
                isPaused = !isPaused;
                pauseMenu.isVisible = isPaused;
                pauseBtn.textBlock.text = isPaused ? "▶ REPRENDRE" : "⏸ PAUSE";
            }
        }
        if (kb.type === BABYLON.KeyboardEventTypes.KEYUP) {
            inputMap[key] = false;
        }
    });

    /* ================= 9. BALLES ================= */
    const bullets = [];
    const COOLDOWN_TIME = 0.30; 
    let shootCooldown = 0;

    function fireBullet() {
        const bullet = BABYLON.MeshBuilder.CreateSphere("bullet", { diameter: 0.5 }, scene);
        bullet.position = tank.position.clone();
        bullet.position.y += 1;
        bullet.direction = new BABYLON.Vector3(
            Math.sin(tank.rotation.y),
            0,
            Math.cos(tank.rotation.y)
        );
        
        const mat = new BABYLON.StandardMaterial("bulletMat", scene);
        mat.emissiveColor = new BABYLON.Color3(0.6, 0.6, 0.6);
        mat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        bullet.material = mat;
        
        bullets.push(bullet);

        try {
            if (shootLoaded && shootSound && typeof shootSound.play === 'function') {
                shootSound.play();
            } else {
                shootAudioEl.currentTime = 0;
                const p = shootAudioEl.play();
                if (p && p.catch) p.catch(() => {});
            }
        } catch (e) { /* silent */ }
    }

    /* ================= 10. ENNEMIS (FSM + TYPES) ================= */
    const enemies = [];
    let baseDude = null;
    let baseSkeleton = null;

    BABYLON.SceneLoader.ImportMesh(
        "",
        "https://playground.babylonjs.com/scenes/Dude/",
        "Dude.babylon",
        scene,
        (meshes, _, skeletons) => {
            baseDude = meshes[0];
            baseSkeleton = skeletons[0];
            baseDude.scaling.setAll(0.05);
            baseDude.position.y = -100;
            baseDude.setEnabled(false);
            for (let i = 0; i < 8; i++) spawnEnemy();
        }
    );

    function spawnEnemy() {
        if (!baseDude) return;
        const zombie = baseDude.clone("zombie");
        zombie.setEnabled(true);
        zombie.skeleton = baseSkeleton.clone("zombieSkeleton");

        const angle = Math.random() * Math.PI * 2;
        const distance = 25 + Math.random() * 20; 

        zombie.position = new BABYLON.Vector3(
            Math.cos(angle) * distance,
            0, 
            Math.sin(angle) * distance
        );

        zombie.getChildMeshes().forEach(mesh => {
            mesh.skeleton = zombie.skeleton;
        });

        const hitbox = BABYLON.MeshBuilder.CreateBox("zombieHitbox", { width: 25, height: 100, depth: 25 }, scene);
        hitbox.parent = zombie;
        hitbox.position.y = 50;
        hitbox.isVisible = false; 
        zombie.hitbox = hitbox;

        shadowGenerator.addShadowCaster(zombie);

        let animSpeed = 1.0 + (currentWave * 0.1);
        scene.beginAnimation(zombie.skeleton, 0, 100, true, animSpeed); 

        // --- IA FSM : Attribution d'état initial et de type ---
        zombie.aiState = EnemyState.PATROL;
        zombie.patrolTarget = getRandomPatrolTarget();
        zombie.stateTimer = 0;
        zombie.flankDirection = Math.random() < 0.5 ? 1 : -1;
        zombie.hp = 1;

        // Choix du type selon la vague en cours
        const roll = Math.random();
        if (currentWave >= 5 && roll < 0.15) {
            // --- CHARGER : gros, résistant, charge brutale ---
            zombie.enemyType = 'charger';
            zombie.hp = 3;
            zombie.scaling.setAll(0.07);
            zombie.getChildMeshes().forEach(m => {
                if (m.material) {
                    const mat = m.material.clone("chargerMat_" + Math.random());
                    mat.emissiveColor = new BABYLON.Color3(0.5, 0.1, 0);
                    m.material = mat;
                }
            });
        } else if (currentWave >= 3 && roll < 0.35) {
            // --- FLANKER : contourne le joueur, teinte violette ---
            zombie.enemyType = 'flanker';
            zombie.getChildMeshes().forEach(m => {
                if (m.material) {
                    const mat = m.material.clone("flankerMat_" + Math.random());
                    mat.emissiveColor = new BABYLON.Color3(0.3, 0, 0.5);
                    m.material = mat;
                }
            });
        } else {
            // --- RUSHER : comportement classique (seek) ---
            zombie.enemyType = 'rusher';
        }

        enemies.push(zombie);
    }

    const triggerDamageEffect = () => {
        damageOverlay.alpha = 0.5;
        
        let fadeOut = setInterval(() => {
            damageOverlay.alpha -= 0.05;
            if (damageOverlay.alpha <= 0) {
                damageOverlay.alpha = 0;
                clearInterval(fadeOut);
            }
        }, 30);

        cameraShakeIntensity = 0.8;
    };

    const resetGame = () => {
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('tankSurvivalHighScore', highScore.toString());
            highScoreText.text = "RECORD: " + highScore;
            menuHighScoreText.text = "🏆 MEILLEUR SCORE: " + highScore;
        }

        lives = 3;
        score = 0;
        currentWave = 1;
        livesText.text = "VIES: " + lives;
        livesText.color = "#008800";
        scoreText.text = "SCORE: " + score;
        waveText.text = "VAGUE: 1";
        tank.position = new BABYLON.Vector3(0, 0.6, 0);
        tank.rotation = new BABYLON.Vector3(0, 0, 0);
        
        tankVelocity = 0;
        tankTurnVelocity = 0;

        rapidFireActive = false;
        speedBoostActive = false;
        enemiesFrozen = false;
        bonusText.text = "";
        damageOverlay.alpha = 0;
        
        dashActive = false;
        dashCooldown = 0;
        dashTimer = 0;
        dashText.text = "DASH: PRÊT";
        dashText.color = "Cyan";
        if (dashParticles) {
            dashParticles.dispose();
            dashParticles = null;
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            enemies[i].hitbox.dispose();
            enemies[i].dispose();
        }
        enemies.length = 0; 
        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].dispose();
        }
        bullets.length = 0;
        for (let i = powerUps.length - 1; i >= 0; i--) {
            powerUps[i].dispose();
        }
        powerUps.length = 0;

        for(let i=0; i<8; i++) spawnEnemy();
    };

    /* ================= 11. GAME LOOP ================= */
    scene.onBeforeRenderObservable.add(() => {
        if (!isGameStarted || isPaused) {
            return;
        }

        const dt = engine.getDeltaTime() / 1000;

        let newWave = Math.floor(score / 50) + 1;
        if (newWave > currentWave) {
            currentWave = newWave;
            waveText.text = "VAGUE: " + currentWave;
        }
        
        let zombieSpeedMax = 3.5 + (currentWave * 0.5);
        if (zombieSpeedMax > 9) zombieSpeedMax = 9;

        if (cameraShakeIntensity > 0) {
            camera.heightOffset = originalCameraHeight + (Math.random() - 0.5) * cameraShakeIntensity;
            camera.radius = 12 + (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
            cameraShakeIntensity -= dt * 3;
        } else {
            camera.heightOffset = originalCameraHeight;
            camera.radius = 12;
        }

        if (inputMap["shift"] && dashCooldown <= 0 && !dashActive) {
            dashActive = true;
            dashTimer = DASH_DURATION;
            dashCooldown = DASH_COOLDOWN;
            dashParticles = createDashParticles();
            dashText.text = "DASH!";
            dashText.color = "Yellow";
            
            tankVelocity = speedBoostActive ? 40 : 25; 
        }

        if (dashActive) {
            dashTimer -= dt;
            if (dashTimer <= 0) {
                dashActive = false;
                if (dashParticles) {
                    dashParticles.stop();
                    setTimeout(() => {
                        if (dashParticles) {
                            dashParticles.dispose();
                            dashParticles = null;
                        }
                    }, 500);
                }
            }
        }

        if (dashCooldown > 0) {
            dashCooldown -= dt;
            if (!dashActive) {
                dashText.text = "DASH: " + Math.ceil(dashCooldown) + "s";
                dashText.color = "Gray";
            }
            if (dashCooldown <= 0) {
                dashText.text = "DASH: PRÊT";
                dashText.color = "Cyan";
            }
        }

        // --- PHYSIQUE DU TANK ---
        const ACCELERATION = 70;
        const FRICTION = 10;
        let maxSpeed = speedBoostActive ? 16 : 8;
        if (dashActive) maxSpeed = speedBoostActive ? 40 : 25;

        const TURN_ACCEL = 10;
        const TURN_FRICTION = 15;
        const MAX_TURN = 3;

        if (inputMap["q"] || inputMap["a"]) {
            tankTurnVelocity -= TURN_ACCEL * dt;
        } else if (inputMap["d"]) {
            tankTurnVelocity += TURN_ACCEL * dt;
        } else {
            if (tankTurnVelocity > 0) {
                tankTurnVelocity -= TURN_FRICTION * dt;
                if (tankTurnVelocity < 0) tankTurnVelocity = 0;
            }
            if (tankTurnVelocity < 0) {
                tankTurnVelocity += TURN_FRICTION * dt;
                if (tankTurnVelocity > 0) tankTurnVelocity = 0;
            }
        }

        if (tankTurnVelocity > MAX_TURN) tankTurnVelocity = MAX_TURN;
        if (tankTurnVelocity < -MAX_TURN) tankTurnVelocity = -MAX_TURN;

        if (inputMap["z"] || inputMap["w"]) {
            tankVelocity += ACCELERATION * dt;
        } else if (inputMap["s"]) {
            tankVelocity -= ACCELERATION * dt;
        } else {
            if (tankVelocity > 0) {
                tankVelocity -= FRICTION * dt;
                if (tankVelocity < 0) tankVelocity = 0;
            }
            if (tankVelocity < 0) {
                tankVelocity += FRICTION * dt;
                if (tankVelocity > 0) tankVelocity = 0;
            }
        }

        if (tankVelocity > maxSpeed) tankVelocity = maxSpeed;
        if (tankVelocity < -maxSpeed * 0.8) tankVelocity = -maxSpeed * 0.8;

        if (Math.abs(tankVelocity) > 2) {
            dustParticles.emitRate = 150 * (Math.abs(tankVelocity) / maxSpeed);
        } else {
            dustParticles.emitRate = 0; 
        }

        tank.rotation.y += tankTurnVelocity * dt;
        
        const oldX = tank.position.x;
        const oldZ = tank.position.z;

        tank.position.x += tankVelocity * Math.sin(tank.rotation.y) * dt;
        for (let obstacle of obstacles) {
            if (tank.intersectsMesh(obstacle, false)) {
                tank.position.x = oldX;
                tankVelocity *= 0.8;
                break;
            }
        }

        tank.position.z += tankVelocity * Math.cos(tank.rotation.y) * dt;
        for (let obstacle of obstacles) {
            if (tank.intersectsMesh(obstacle, false)) {
                tank.position.z = oldZ;
                tankVelocity *= 0.8;
                break;
            }
        }

        shootCooldown -= dt;
        let limit = rapidFireActive ? 0.05 : COOLDOWN_TIME;
        if (inputMap[" "] && shootCooldown <= 0) {
            fireBullet();
            shootCooldown = limit;
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.position.addInPlace(b.direction.scale(40 * dt)); 
            if (b.position.length() > 150) {
                b.dispose();
                bullets.splice(i, 1);
            }
        }

        for (let i = powerUps.length - 1; i >= 0; i--) {
            const p = powerUps[i];
            
            if (p.position.y > 1) p.position.y -= 5 * dt;

            if (p.intersectsMesh(tank, false)) {
                bonusText.text = p.bonusName;
                setTimeout(() => bonusText.text = "", 2000);

                try {
                    if (bonusLoaded && bonusSound && typeof bonusSound.play === 'function') {
                        bonusSound.play();
                    } else {
                        bonusAudioEl.currentTime = 0;
                        const pr = bonusAudioEl.play();
                        if (pr && pr.catch) pr.catch(() => {});
                    }
                } catch (e) { /* silent */ }

                if (p.bonusType === 0) { 
                    rapidFireActive = true;
                    setTimeout(() => rapidFireActive = false, 5000);
                }
                
                if (p.bonusType === 1) {
                    lives++;
                    livesText.text = "VIES: " + lives;
                    if (lives >= 3) livesText.color = "#008800"; 
                    else if (lives === 2) livesText.color = "orange";
                    else livesText.color = "red";
                }

                if (p.bonusType === 2) {
                    enemiesFrozen = true;
                    enemies.forEach(e => scene.stopAnimation(e.skeleton));
                    setTimeout(() => { 
                        enemiesFrozen = false;
                        enemies.forEach(e => scene.beginAnimation(e.skeleton, 0, 100, true, 1.0 + (currentWave * 0.1)));
                    }, 3000);
                }
                if (p.bonusType === 3) {
                    speedBoostActive = true;
                    setTimeout(() => speedBoostActive = false, 5000);
                }

                p.dispose();
                powerUps.splice(i, 1);
            }
        }

        // =====================================================
        // --- GESTION ENNEMIS (FSM + SEEK + ARRIVAL + FLOCKING) ---
        // =====================================================
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            
            if (!enemiesFrozen) {
                let distanceToTank = BABYLON.Vector3.Distance(
                    new BABYLON.Vector3(enemy.position.x, 0, enemy.position.z),
                    new BABYLON.Vector3(tank.position.x, 0, tank.position.z)
                );

                // =====================
                // MISE A JOUR FSM
                // =====================
                enemy.stateTimer += dt;

                switch (enemy.aiState) {
                    case EnemyState.PATROL:
                        // Détection du joueur → passe en chasse
                        if (distanceToTank < 25) {
                            enemy.aiState = EnemyState.CHASE;
                            enemy.stateTimer = 0;
                        }
                        break;

                    case EnemyState.CHASE:
                        // Flanker : contourne quand à mi-distance
                        if (enemy.enemyType === 'flanker' && distanceToTank < 15 && distanceToTank > 5) {
                            enemy.aiState = EnemyState.FLANK;
                            enemy.stateTimer = 0;
                        }
                        // Charger : charge quand assez proche
                        if (enemy.enemyType === 'charger' && distanceToTank < 12) {
                            enemy.aiState = EnemyState.CHARGE;
                            enemy.stateTimer = 0;
                        }
                        // Si le joueur s'éloigne trop → retour patrouille
                        if (distanceToTank > 35) {
                            enemy.aiState = EnemyState.PATROL;
                            enemy.patrolTarget = getRandomPatrolTarget();
                            enemy.stateTimer = 0;
                        }
                        break;

                    case EnemyState.FLANK:
                        // Contournement pendant 3s puis retour en chasse
                        if (enemy.stateTimer > 3.0 || distanceToTank < 4) {
                            enemy.aiState = EnemyState.CHASE;
                            enemy.stateTimer = 0;
                        }
                        break;

                    case EnemyState.CHARGE:
                        // La charge dure 2s max
                        if (enemy.stateTimer > 2.0) {
                            enemy.aiState = EnemyState.CHASE;
                            enemy.stateTimer = 0;
                        }
                        break;
                }

                // =====================
                // CALCUL DU MOUVEMENT SELON L'ÉTAT
                // =====================
                let dir = new BABYLON.Vector3(0, 0, 0);
                let currentSpeed = zombieSpeedMax;

                switch (enemy.aiState) {
                    case EnemyState.PATROL: {
                        // Marche vers un point aléatoire
                        let toTarget = enemy.patrolTarget.subtract(enemy.position);
                        toTarget.y = 0;
                        if (toTarget.length() < 2) {
                            enemy.patrolTarget = getRandomPatrolTarget();
                        }
                        dir = toTarget.normalize();
                        currentSpeed = zombieSpeedMax * 0.4; // Patrouille lente
                        break;
                    }

                    case EnemyState.CHASE: {
                        // Seek + Arrival classique
                        let desiredVelocity = tank.position.subtract(enemy.position);
                        desiredVelocity.y = 0;
                        let slowingRadius = 8.0;
                        if (distanceToTank < slowingRadius) {
                            currentSpeed = zombieSpeedMax * (distanceToTank / slowingRadius);
                            if (currentSpeed < 1.0) currentSpeed = 1.0;
                        }
                        dir = desiredVelocity.normalize();
                        break;
                    }

                    case EnemyState.FLANK: {
                        // Se déplace perpendiculairement au joueur pour contourner
                        let toTank = tank.position.subtract(enemy.position);
                        toTank.y = 0;
                        let perpendicular = new BABYLON.Vector3(-toTank.z, 0, toTank.x).normalize();
                        let forward = toTank.normalize().scale(0.3);
                        let side = perpendicular.scale(enemy.flankDirection);
                        dir = forward.add(side).normalize();
                        currentSpeed = zombieSpeedMax * 0.9;
                        break;
                    }

                    case EnemyState.CHARGE: {
                        // Fonce très vite en ligne droite
                        let toTank = tank.position.subtract(enemy.position);
                        toTank.y = 0;
                        dir = toTank.normalize();
                        currentSpeed = zombieSpeedMax * 1.8; // Charge rapide !
                        break;
                    }
                }

                // =====================
                // SEPARATION (Flocking)
                // =====================
                let separationForce = new BABYLON.Vector3(0, 0, 0);
                for (let k = 0; k < enemies.length; k++) {
                    if (i !== k) {
                        const otherEnemy = enemies[k];
                        const dist = BABYLON.Vector3.Distance(enemy.position, otherEnemy.position);
                        const minDistance = 2.5;
                        if (dist < minDistance && dist > 0.001) {
                            let pushDir = enemy.position.subtract(otherEnemy.position);
                            pushDir.y = 0;
                            pushDir.normalize();
                            pushDir.scaleInPlace(minDistance - dist);
                            separationForce.addInPlace(pushDir);
                        }
                    }
                }

                dir.addInPlace(separationForce.scale(2.5));
                dir.y = 0;
                dir.normalize();

                enemy.position.addInPlace(dir.scale(currentSpeed * dt));
                enemy.position.y = 0;

                // Orientation : regarde la direction de marche en patrouille, sinon regarde le tank
                let lookTarget;
                if (enemy.aiState === EnemyState.PATROL) {
                    lookTarget = enemy.position.add(dir);
                } else {
                    lookTarget = tank.position.clone();
                }
                lookTarget.y = enemy.position.y;
                enemy.lookAt(lookTarget, Math.PI);
            }

            // =====================
            // COLLISION BALLES → ENNEMI
            // =====================
            let enemyDead = false;

            for (let j = bullets.length - 1; j >= 0; j--) {
                const b = bullets[j];
                if (b.intersectsMesh(enemy.hitbox, true)) {
                    
                    // Réduire les HP (chargers ont plusieurs PV)
                    enemy.hp -= 1;

                    b.dispose();
                    bullets.splice(j, 1);

                    if (enemy.hp <= 0) {
                        // Ennemi mort
                        let points = 10;
                        if (enemy.enemyType === 'flanker') points = 15;
                        if (enemy.enemyType === 'charger') points = 25;

                        score += points;
                        scoreText.text = "SCORE: " + score;

                        if (score > highScore) {
                            highScore = score;
                            localStorage.setItem('tankSurvivalHighScore', highScore.toString());
                            highScoreText.text = "RECORD: " + highScore;
                            menuHighScoreText.text = "🏆 MEILLEUR SCORE: " + highScore;
                        }

                        showFloatingText("+" + points, enemy.position.clone());
                        createExplosion(enemy.position.clone());

                        enemy.hitbox.dispose();
                        enemy.dispose();
                        enemies.splice(i, 1);
                        spawnEnemy();
                        enemyDead = true;
                    } else {
                        // Ennemi touché mais pas mort → flash rouge + texte
                        showFloatingText("HIT!", enemy.position.clone());
                        // Flash visuel sur le charger quand il est touché
                        enemy.getChildMeshes().forEach(m => {
                            if (m.material) {
                                const originalEmissive = m.material.emissiveColor.clone();
                                m.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
                                setTimeout(() => {
                                    if (m.material) m.material.emissiveColor = originalEmissive;
                                }, 150);
                            }
                        });
                    }
                    break;
                }
            }
            if (enemyDead) continue;

            // =====================
            // COLLISION ENNEMI → TANK
            // =====================
            if (enemy.hitbox.intersectsMesh(tank, true)) {
                // Les chargers font 2 dégâts au contact
                let damage = 1;
                if (enemy.enemyType === 'charger') damage = 2;

                lives -= damage;
                livesText.text = "VIES: " + lives;
                
                if (lives >= 3) livesText.color = "#008800";
                else if (lives === 2) livesText.color = "orange";
                else if (lives >= 1) livesText.color = "red";

                triggerDamageEffect();

                createExplosion(enemy.position.clone());
                enemy.hitbox.dispose();
                enemy.dispose();
                enemies.splice(i, 1);
                spawnEnemy();

                if (lives <= 0) { resetGame(); return; }
            }
        }
    });

    return scene;
}