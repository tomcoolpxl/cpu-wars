import Phaser from 'phaser';
import { BattleManager, TANK_IDS } from '../../simulation/BattleManager.js';

export class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
        this.gridWidth = 16;
        this.gridHeight = 10;
        this.tileSize = 40;
        this.canvasWidth = this.gridWidth * this.tileSize;  // 640
        this.canvasHeight = this.gridHeight * this.tileSize; // 400
        this.tickDuration = 500; // ms
        this.normalTickDuration = 500;
        this.fastTickDuration = 50;
        this.lastTickTime = 0;
        this.isRunning = false;
        this.isPaused = false;

        this.sim = new BattleManager();
        this.tankSprites = {};
        this.bulletSprites = [];
        this.pingRateLimits = { P1: 0, P2: 0 };
    }

    preload() {
        // Generate placeholder assets programmatically
        // P1 Tank (Blue with Cannon)
        const p1 = this.make.graphics({ x: 0, y: 0, add: false });
        p1.fillStyle(0x0000ff);
        p1.fillRect(0, 0, 32, 32); // Scaled Body
        p1.fillStyle(0x88ccff);
        p1.fillRect(16, 12, 16, 8); // Cannon
        p1.generateTexture('tank_p1', 32, 32);

        // P2 Tank (Red with Cannon)
        const p2 = this.make.graphics({ x: 0, y: 0, add: false });
        p2.fillStyle(0xff0000);
        p2.fillRect(0, 0, 32, 32); // Scaled Body
        p2.fillStyle(0xff8888);
        p2.fillRect(16, 12, 16, 8); // Cannon
        p2.generateTexture('tank_p2', 32, 32);

        this.make.graphics({ x: 0, y: 0, add: false })
            .fillStyle(0x888888)
            .fillRect(0, 0, 40, 40) // Wall size matches tileSize
            .generateTexture('wall', 40, 40);
            
        this.make.graphics({ x: 0, y: 0, add: false })
            .fillStyle(0xffffff)
            .fillCircle(8, 8, 8)
            .generateTexture('bullet', 16, 16);
    }

    create() {
        // Draw Grid Background
        const gridGraphics = this.add.graphics();
        gridGraphics.lineStyle(1, 0x333333);
        for (let x = 0; x <= this.gridWidth; x++) {
            gridGraphics.moveTo(x * this.tileSize, 0);
            gridGraphics.lineTo(x * this.tileSize, this.canvasHeight);
        }
        for (let y = 0; y <= this.gridHeight; y++) {
            gridGraphics.moveTo(0, y * this.tileSize);
            gridGraphics.lineTo(this.canvasWidth, y * this.tileSize);
        }
        gridGraphics.strokePath();

        // Initial Entities
        this.createEntities();
        
// Listen for DOM Events (via main.js or global dispatcher)
        window.addEventListener('run-sim', (e) => this.startSimulation(e.detail));
        window.addEventListener('reset-sim', (e) => this.resetSimulation(e.detail));
        window.addEventListener('ff-sim', () => {
            if (this.isRunning) this.tickDuration = this.fastTickDuration;
        });
        window.addEventListener('stop-sim', () => {
            if (this.isRunning) {
                this.isPaused = true;
                this.updateStatus("HALTED");
                this.log("Halted.");
                window.dispatchEvent(new CustomEvent('halt-state', { detail: { halted: true } }));
            }
        });
        window.addEventListener('step-sim', () => {
            if (this.isRunning) {
                this.isPaused = true; // Ensure paused
                this.doTick(this.time.now);
                this.log("Stepped.");
                window.dispatchEvent(new CustomEvent('halt-state', { detail: { halted: true } }));
            }
        });

        // UI Overlay
        this.uiInfo = this.add.text(10, 10, 'Tick: 0', { font: '16px monospace', fill: '#ffffff' });
        this.uiP1 = this.add.text(120, 10, 'P1 HP: 3', { font: '16px monospace', fill: '#0088ff' });
        this.uiP2 = this.add.text(240, 10, 'P2 HP: 3', { font: '16px monospace', fill: '#ff4444' });
        
        this.tickCount = 0;
    }
    
    updateStatus(msg) {
        this.uiInfo.setText(`Tick: ${this.tickCount} [${msg}]`);
    }

    createEntities() {
        // Clear old
        if (this.tankSprites.P1) this.tankSprites.P1.destroy();
        if (this.tankSprites.P2) this.tankSprites.P2.destroy();
        this.bulletSprites.forEach(s => s.destroy());
        this.bulletSprites = [];

        // Create Walls
        // We need to access the grid from the sim
        // For now, let's just redraw walls based on the sim's grid
        // (A bit inefficient to do every reset, but fine for now)
        // Actually, let's just assume the Sim's setupArena() is static for this prototype.
        this.drawWalls();

        // Create Tanks
        this.tankSprites[TANK_IDS.P1] = this.add.sprite(0, 0, 'tank_p1').setOrigin(0.5);
        this.tankSprites[TANK_IDS.P2] = this.add.sprite(0, 0, 'tank_p2').setOrigin(0.5);
        
        this.updateVisuals(this.sim.tanks, []);
    }

    drawWalls() {
        // This is a bit hacky, accessing internal Sim state, but acceptable for prototype
        this.sim.grid.walls.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            this.add.image(x * this.tileSize + 20, y * this.tileSize + 20, 'wall');
        });
    }

    startSimulation(data) {
        const { p1Code, p2Code, level } = data;
        this.sim = new BattleManager(); // Reset Logic
        this.sim.setupArena(level || 1);
        const res = this.sim.loadCode(p1Code, p2Code);

        if (res.success) {
            this.createEntities(); // Reset Visuals
            this.isRunning = true;
            this.isPaused = false;
            this.tickDuration = this.normalTickDuration;
            this.tickCount = 0;
            this.log(`Simulation Started (Level ${level || 1})`);
            window.dispatchEvent(new CustomEvent('halt-state', { detail: { halted: false } }));
            
            // Notify UI with bytecode
            window.dispatchEvent(new CustomEvent('sim-started', {
                detail: {
                    p1Program: res.p1Program,
                    p2Program: res.p2Program
                }
            }));
        } else {
            this.log("Error: " + res.error);
        }
    }

    resetSimulation(data) {
        const level = (data && data.level) ? data.level : 1;
        this.isRunning = false;
        this.isPaused = false; // Unpause when resetting
        this.tickDuration = this.normalTickDuration;
        this.sim = new BattleManager();
        this.sim.setupArena(level);
        this.createEntities();
        this.tickCount = 0;
        this.uiInfo.setText("Ready");
        this.log(`Reset (Level ${level}).`);
        window.dispatchEvent(new CustomEvent('halt-state', { detail: { halted: false } }));
    }

    update(time, delta) {
        // Auto-run logic
        if (this.isRunning && !this.isPaused) {
            if (time - this.lastTickTime > this.tickDuration) {
                this.doTick(time);
            }
        }
    }

    doTick(time) {
        this.lastTickTime = time || this.time.now;
        
        const state = this.sim.tick();
        
        if (!state) {
            if (this.sim.isGameOver) {
                this.isRunning = false;
                this.updateStatus("GAME OVER: " + this.sim.winner);
                this.log(`Game Over! Winner: ${this.sim.winner}`);
                window.dispatchEvent(new CustomEvent('halt-state', { detail: { halted: true } }));
            }
            return;
        }

        this.updateVisuals(state.tanks, state.bullets);
        this.updateStatus(this.isPaused ? "PAUSED" : (this.tickDuration < 100 ? "FF >>" : "RUNNING"));
        
        // Handle Events (Explosions, PINGs)
        if (state.events && state.events.length > 0) {
            state.events.forEach(e => {
                if (e.type === 'EXPLOSION') {
                    this.triggerExplosion(e.x, e.y, e.owner);
                }
                if (e.type === 'PING') {
                    this.triggerPingVisual(e.tankId, e.x, e.y);
                }
            });
        }

        // Log events
         if (state.log && state.log.length > 0) {
             // For now, just log the last one
             // this.log(state.log[state.log.length - 1]);
         }
         
         this.tickCount++;
         this.uiInfo.setText(`Tick: ${this.tickCount}`);
         this.uiP1.setText(`P1 HP: ${state.tanks.P1.hp}`);
         this.uiP2.setText(`P2 HP: ${state.tanks.P2.hp}`);
         
         // Update CPU UI
         window.dispatchEvent(new CustomEvent('update-ui', { detail: state }));
    }

    updateStatus(msg) {
        // We can reuse uiInfo or add a new one. 
        // Let's append to uiInfo for now or create a status text.
        // Actually, let's just use uiInfo title.
        this.uiInfo.setText(`Tick: ${this.tickCount} [${msg}]`);
    }

    updateVisuals(tanks, bullets) {
        // Update Tanks
        this.updateTank(this.tankSprites.P1, tanks.P1);
        this.updateTank(this.tankSprites.P2, tanks.P2);

        // Update Bullets
        this.bulletSprites.forEach(s => s.destroy());
        this.bulletSprites = [];
        
        bullets.forEach(b => {
            const targetX = b.x * this.tileSize + 20;
            const targetY = b.y * this.tileSize + 20;
            
            // Calculate previous position (Speed = 2)
            const startGridX = b.x - (b.dx * 2);
            const startGridY = b.y - (b.dy * 2);
            
            const startX = startGridX * this.tileSize + 20;
            const startY = startGridY * this.tileSize + 20;
            
            const sprite = this.add.sprite(startX, startY, 'bullet');
            this.bulletSprites.push(sprite);
            
            // Standard Tween (No wrapping check needed anymore)
            this.tweens.add({
                targets: sprite,
                x: targetX,
                y: targetY,
                duration: this.tickDuration,
                ease: 'Linear'
            });
        });
    }

    updateTank(sprite, data) {
        if (data.hp <= 0) {
            sprite.setVisible(false);
            return;
        }
        sprite.setVisible(true);
        
        const targetX = data.x * this.tileSize + 20;
        const targetY = data.y * this.tileSize + 20;
        const targetAngle = data.facing * 90;

        // Smooth Movement
        this.tweens.add({
            targets: sprite,
            x: targetX,
            y: targetY,
            angle: {
                getEnd: (target, key, value) => {
                    // Shortest rotation path logic
                    let diff = targetAngle - value;
                    while (diff < -180) diff += 360;
                    while (diff > 180) diff -= 360;
                    return value + diff;
                }
            },
            duration: this.tickDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                // Check if HP changed and flash sprite if hit
                const tankId = sprite.texture.key.endsWith('_p1') ? 'P1' : 'P2';
                const currentHp = data.hp;
                const previousHp = this.sim.tanks[tankId].hp; // Get previous HP from simulation state
                if (currentHp < previousHp) {
                    // Flash opponent green briefly
                    sprite.tint = 0x00FF00; // Green tint
                    this.time.delayedCall(100, () => {
                        sprite.tint = 0xFFFFFF; // Reset tint
                    });
                }
            }
        });
    }

    triggerExplosion(gx, gy, ownerId) {
        this.isPaused = true;
        const cx = gx * this.tileSize + 20;
        const cy = gy * this.tileSize + 20;

        // Check if Edge/Wall Hit
        const isEdge = (gx < 0 || gx >= this.gridWidth || gy < 0 || gy >= this.gridHeight);
        
        if (isEdge) {
            const graphics = this.add.graphics();
            graphics.fillStyle(0xff0000, 1);
            graphics.fillCircle(cx, cy, 5); // Small red circle
            
            // Fade out
            this.tweens.add({
                targets: graphics,
                alpha: 0,
                duration: 300,
                onComplete: () => {
                    graphics.destroy();
                    this.isPaused = false;
                    this.lastTickTime = this.time.now;
                }
            });
            return;
        }

        // Draw Tracer if owner is known
        if (ownerId && this.tankSprites[ownerId]) {
            const ownerSprite = this.tankSprites[ownerId];
            const startX = ownerSprite.x;
            const startY = ownerSprite.y;
            
            const tracer = this.add.graphics();
            tracer.lineStyle(2, 0xffff00, 0.8);
            tracer.beginPath();
            tracer.moveTo(startX, startY);
            tracer.lineTo(cx, cy);
            tracer.strokePath();
            
            // Fade out tracer
            this.tweens.add({
                targets: tracer,
                alpha: 0,
                duration: 300,
                onComplete: () => tracer.destroy()
            });
        }

        const graphics = this.add.graphics();
        
        const duration = 500;
        
        // Calculate max distances for 8 directions
        const directions = [];
        for (let i = 0; i < 8; i++) {
            const angle = Phaser.Math.DegToRad(i * 45);
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            // Raycast to screen edge
            let t = 10000;

            if (dx > 0) t = Math.min(t, (this.canvasWidth - cx) / dx);
            else if (dx < 0) t = Math.min(t, (0 - cx) / dx);

            if (dy > 0) t = Math.min(t, (this.canvasHeight - cy) / dy);
            else if (dy < 0) t = Math.min(t, (0 - cy) / dy);

            directions.push({ angle, len: t });
        }

        this.tweens.addCounter({
            from: 0,
            to: 100,
            duration: duration,
            onUpdate: (tween) => {
                const progress = tween.getValue() / 100; // 0 to 1
                graphics.clear();
                graphics.lineStyle(2, 0xffffff, 1 - progress); // Fade out
                
                for (let d of directions) {
                    const currentLen = d.len * progress;
                    
                    const x2 = cx + Math.cos(d.angle) * currentLen;
                    const y2 = cy + Math.sin(d.angle) * currentLen;
                    
                    graphics.beginPath();
                    graphics.moveTo(cx, cy); // From Center
                    graphics.lineTo(x2, y2); // To Edge
                    graphics.strokePath();
                }
            },
            onComplete: () => {
                graphics.destroy();
                this.isPaused = false;
                // Correct lastTickTime so we don't skip a beat
                this.lastTickTime = this.time.now;
            }
        });
    }

    triggerPingVisual(tankId, gx, gy) {
        // Rate Limit: Only show 1 ping every 2 seconds per tank to avoid visual clutter
        const now = this.time.now;
        if (now - this.pingRateLimits[tankId] < 2000) return;
        this.pingRateLimits[tankId] = now;

        const x = gx * this.tileSize + 20;
        const y = gy * this.tileSize + 20;
        const color = tankId === 'P1' ? 0x0088ff : 0xff4444; 
        
        // Find Enemy Position
        const enemyId = tankId === 'P1' ? 'P2' : 'P1';
        const enemySprite = this.tankSprites[enemyId];
        
        let maxRadius = 100;
        let enemyHit = false;
        
        if (enemySprite && enemySprite.visible) {
            // Calculate pixel distance
            const dx = enemySprite.x - x;
            const dy = enemySprite.y - y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            maxRadius = dist;
            enemyHit = true;
        }

        const graphics = this.add.graphics();
        const duration = enemyHit ? (maxRadius / 800) * 1000 : 500; // Speed based? Or fixed time? 
        // Let's make it expand at constant speed. say 500px/s.
        const speed = 0.5; // px/ms
        const time = maxRadius / speed;

        this.tweens.addCounter({
            from: 0,
            to: maxRadius,
            duration: time,
            ease: 'Linear',
            onUpdate: (tween) => {
                const r = tween.getValue();
                graphics.clear();
                graphics.lineStyle(2, color, 1 - (r / maxRadius)); 
                graphics.strokeCircle(x, y, r);
            },
            onComplete: () => {
                graphics.destroy();
                if (enemyHit) {
                    // Flash Enemy Green
                    enemySprite.tint = 0x00FF00;
                    this.time.delayedCall(150, () => {
                        enemySprite.tint = 0xFFFFFF;
                    });
                }
            }
        });
    }

    log(msg) {
        const logEl = document.getElementById('status-log');
        if (logEl) {
            const entry = document.createElement('div');
            entry.textContent = msg;
            logEl.prepend(entry);
        }
    }
}
