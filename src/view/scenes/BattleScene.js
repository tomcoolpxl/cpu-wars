import Phaser from 'phaser';
import { TANK_IDS } from '../../constants.js';

export { TANK_IDS };

export class BattleScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BattleScene' });
        this.gridWidth = 16;
        this.gridHeight = 10;
        this.tileSize = 40;
        this.titleHeight = 40; // Space for title at top
        this.canvasWidth = this.gridWidth * this.tileSize;  // 640
        this.canvasHeight = this.gridHeight * this.tileSize; // 400
        this.tickDuration = 500; // ms
        this.normalTickDuration = 500;
        this.fastTickDuration = 50;
        this.walls = new Set(); // Store walls directly instead of BattleManager
        this.initialTanks = null; // Store initial tank state from payload
        this.tankSprites = {};
        this.bulletSprites = {}; // Map ID -> Sprite
        this.processedEvents = new Set();
        this.lastLogIndex = 0;
    }

    preload() {
        const p1 = this.make.graphics({ x: 0, y: 0, add: false });
        p1.fillStyle(0x0000ff); p1.fillRect(0, 0, 32, 32); 
        p1.fillStyle(0x88ccff); p1.fillRect(16, 12, 16, 8); 
        p1.generateTexture('tank_p1', 32, 32);

        const p2 = this.make.graphics({ x: 0, y: 0, add: false });
        p2.fillStyle(0xff0000); p2.fillRect(0, 0, 32, 32); 
        p2.fillStyle(0xff8888); p2.fillRect(16, 12, 16, 8); 
        p2.generateTexture('tank_p2', 32, 32);

        this.make.graphics({ x: 0, y: 0, add: false })
            .fillStyle(0x888888).fillRect(0, 0, 40, 40).generateTexture('wall', 40, 40);
            
        this.make.graphics({ x: 0, y: 0, add: false })
            .fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('bullet', 16, 16);
    }

    create() {
        // Draw "CPU WARS" title with retro green line style
        this.drawTitle();

        // Draw grid (offset by titleHeight)
        const gridGraphics = this.add.graphics();
        gridGraphics.lineStyle(1, 0x333333);
        for (let x = 0; x <= this.gridWidth; x++) {
            gridGraphics.moveTo(x * this.tileSize, this.titleHeight);
            gridGraphics.lineTo(x * this.tileSize, this.titleHeight + this.canvasHeight);
        }
        for (let y = 0; y <= this.gridHeight; y++) {
            gridGraphics.moveTo(0, this.titleHeight + y * this.tileSize);
            gridGraphics.lineTo(this.canvasWidth, this.titleHeight + y * this.tileSize);
        }
        gridGraphics.strokePath();

        this.createEntities();

        window.addEventListener('run-sim', (e) => this.startSimulation(e.detail));
        window.addEventListener('reset-sim', (e) => this.resetSimulation(e.detail));
        window.addEventListener('update-ui', (e) => this.renderState(e.detail));

        // UI text at bottom of grid area
        const bottomY = this.titleHeight + this.canvasHeight - 25;
        this.uiInfo = this.add.text(10, bottomY, 'Actions: 0', { font: '12px monospace', fill: '#888888' });
        this.uiP1 = this.add.text(this.canvasWidth - 130, bottomY, 'P1: 3HP', { font: '12px monospace', fill: '#0088ff' }).setOrigin(1, 0);
        this.uiP2 = this.add.text(this.canvasWidth - 10, bottomY, 'P2: 3HP', { font: '12px monospace', fill: '#ff4444' }).setOrigin(1, 0);
        this.uiGameOver = this.add.text(320, this.titleHeight + this.canvasHeight / 2, '', { font: 'bold 20px monospace', fill: '#ffff00' }).setOrigin(0.5, 0.5);
    }

    drawTitle() {
        // Draw "CPU WARS" in retro Star Wars style with green lines
        const g = this.add.graphics();
        g.lineStyle(2, 0x00ff00); // Green lines

        const startX = 200;
        const y = 20;
        const scale = 0.8;

        // Simple blocky letters - C P U   W A R S
        // C
        this.drawLetter(g, startX, y, scale, [
            [[10, 0], [0, 0], [0, 20], [10, 20]],
        ]);
        // P
        this.drawLetter(g, startX + 20 * scale, y, scale, [
            [[0, 0], [0, 20]],
            [[0, 0], [10, 0], [10, 10], [0, 10]],
        ]);
        // U
        this.drawLetter(g, startX + 40 * scale, y, scale, [
            [[0, 0], [0, 20], [10, 20], [10, 0]],
        ]);

        // Space
        const warsX = startX + 80 * scale;

        // W
        this.drawLetter(g, warsX, y, scale, [
            [[0, 0], [2, 20], [5, 10], [8, 20], [10, 0]],
        ]);
        // A
        this.drawLetter(g, warsX + 20 * scale, y, scale, [
            [[0, 20], [5, 0], [10, 20]],
            [[2, 12], [8, 12]],
        ]);
        // R
        this.drawLetter(g, warsX + 40 * scale, y, scale, [
            [[0, 0], [0, 20]],
            [[0, 0], [10, 0], [10, 10], [0, 10]],
            [[5, 10], [10, 20]],
        ]);
        // S
        this.drawLetter(g, warsX + 60 * scale, y, scale, [
            [[10, 0], [0, 0], [0, 10], [10, 10], [10, 20], [0, 20]],
        ]);
    }

    drawLetter(g, x, y, scale, paths) {
        paths.forEach(path => {
            g.beginPath();
            path.forEach((point, i) => {
                const px = x + point[0] * scale;
                const py = y + point[1] * scale;
                if (i === 0) g.moveTo(px, py);
                else g.lineTo(px, py);
            });
            g.strokePath();
        });
    }

    createEntities() {
        if (this.tankSprites.P1) this.tankSprites.P1.destroy();
        if (this.tankSprites.P2) this.tankSprites.P2.destroy();

        Object.values(this.bulletSprites).forEach(s => s.destroy());
        this.bulletSprites = {};

        this.drawWalls();

        if (!this.initialTanks) return;

        const p1Data = this.initialTanks.P1;
        const p2Data = this.initialTanks.P2;
        const halfTile = this.tileSize / 2;

        this.tankSprites[TANK_IDS.P1] = this.add.sprite(p1Data.x * this.tileSize + halfTile, this.titleHeight + p1Data.y * this.tileSize + halfTile, 'tank_p1').setOrigin(0.5).setAngle(p1Data.facing * 90);
        this.tankSprites[TANK_IDS.P2] = this.add.sprite(p2Data.x * this.tileSize + halfTile, this.titleHeight + p2Data.y * this.tileSize + halfTile, 'tank_p2').setOrigin(0.5).setAngle(p2Data.facing * 90);
    }

    drawWalls() {
        if (this.wallSprites) {
            this.wallSprites.forEach(s => s.destroy());
        }
        this.wallSprites = [];
        const halfTile = this.tileSize / 2;
        this.walls.forEach(key => {
            const [x, y] = key.split(',').map(Number);
            const sprite = this.add.image(x * this.tileSize + halfTile, this.titleHeight + y * this.tileSize + halfTile, 'wall');
            this.wallSprites.push(sprite);
        });
    }

    startSimulation(data) {
        // Receive walls and initial tank state from main.js
        this.walls = new Set(data.walls || []);
        this.initialTanks = data.tanks || null;
        this.createEntities();
        this.uiGameOver.setText('');
        this.lastLogIndex = 0;
        this.processedEvents.clear();
    }

    resetSimulation(data) {
        // Receive walls and initial tank state from main.js
        this.walls = new Set(data.walls || []);
        this.initialTanks = data.tanks || null;
        this.createEntities();
        this.uiInfo.setText("Ready");
        this.uiGameOver.setText('');
        this.lastLogIndex = 0;
        this.processedEvents.clear();
    }

    renderState(state) {
        if (!state) return;
        this.updateVisuals(state.tanks, state.bullets);
        
        const totalOps = (state.tanks.P1.totalOps || 0) + (state.tanks.P2.totalOps || 0);
        this.uiInfo.setText(`Actions: ${state.turnCount || 0} | CPU Ticks: ${totalOps}`);
        this.uiP1.setText(`P1: ${state.tanks.P1.hp}HP`);
        this.uiP2.setText(`P2: ${state.tanks.P2.hp}HP`);

        if (state.events) {
            state.events.forEach(e => {
                if (!this.processedEvents.has(e.id)) {
                    this.processedEvents.add(e.id);
                    if (e.type === 'EXPLOSION') this.triggerExplosion(e.x, e.y, e.owner, e.hitTank);
                    if (e.type === 'PING') this.triggerPingVisual(e.tankId, e.x, e.y, e.enemyX, e.enemyY);
                }
            });
        }

        if (state.log && state.log.length > this.lastLogIndex) {
             for (let i = this.lastLogIndex; i < state.log.length; i++) this.log(state.log[i]);
             this.lastLogIndex = state.log.length;
        }
        
        if (state.gameOver) {
             this.uiGameOver.setText(state.winner === 'DRAW' ? 'DRAW!' : `${state.winner} WINS!`);
        }
    }

    updateVisuals(tanks, bullets) {
        this.updateTank(this.tankSprites.P1, tanks.P1);
        this.updateTank(this.tankSprites.P2, tanks.P2);

        // Bullet Persistence Logic
        const currentIds = new Set();
        
        const halfTile = this.tileSize / 2;
        bullets.forEach(b => {
            currentIds.add(b.id);
            const targetX = b.x * this.tileSize + halfTile;
            const targetY = this.titleHeight + b.y * this.tileSize + halfTile;

            if (this.bulletSprites[b.id]) {
                const sprite = this.bulletSprites[b.id];
                // Tween if moved
                if (sprite.x !== targetX || sprite.y !== targetY) {
                     if (!sprite.isTweening || sprite.targetX !== targetX || sprite.targetY !== targetY) {
                         sprite.targetX = targetX; sprite.targetY = targetY; sprite.isTweening = true;
                         this.tweens.add({
                             targets: sprite,
                             x: targetX, y: targetY,
                             duration: this.tickDuration,
                             ease: 'Linear',
                             onComplete: () => { sprite.isTweening = false; }
                         });
                     }
                }
            } else {
                // New bullet
                // Note: Bullets move fast. If we spawn at current pos, it looks fine.
                // If we want to animate from spawn, we need `prevX`.
                // For now, spawn at current.
                const sprite = this.add.sprite(targetX, targetY, 'bullet');
                sprite.targetX = targetX; sprite.targetY = targetY;
                this.bulletSprites[b.id] = sprite;
            }
        });

        // Remove dead bullets
        Object.keys(this.bulletSprites).forEach(id => {
            if (!currentIds.has(parseInt(id))) {
                this.bulletSprites[id].destroy();
                delete this.bulletSprites[id];
            }
        });
    }

    updateTank(sprite, data) {
        if (!sprite) return;
        if (data.hp <= 0) { sprite.setVisible(false); return; }
        sprite.setVisible(true);

        const halfTile = this.tileSize / 2;
        const targetX = data.x * this.tileSize + halfTile;
        const targetY = this.titleHeight + data.y * this.tileSize + halfTile;
        const targetAngle = data.facing * 90;

        if (sprite.targetX !== targetX || sprite.targetY !== targetY || sprite.targetAngle !== targetAngle) {
            sprite.targetX = targetX; sprite.targetY = targetY; sprite.targetAngle = targetAngle;
            this.tweens.add({
                targets: sprite,
                x: targetX, y: targetY,
                angle: {
                    getEnd: (target, key, value) => {
                        let diff = Phaser.Math.Angle.WrapDegrees(targetAngle - value);
                        return value + diff;
                    }
                },
                duration: 200, 
                ease: 'Power1'
            });
        }
    }

    triggerExplosion(gx, gy, ownerId, hitTankId) {
        const halfTile = this.tileSize / 2;
        const cx = gx * this.tileSize + halfTile;
        const cy = this.titleHeight + gy * this.tileSize + halfTile;
        
        // Flash Hit Tank
        if (hitTankId && this.tankSprites[hitTankId]) {
            this.tankSprites[hitTankId].tint = 0xff8800;
            this.time.delayedCall(200, () => { if(this.tankSprites[hitTankId]) this.tankSprites[hitTankId].tint = 0xffffff; });
        }

        // Retro Starburst Explosion
        const graphics = this.add.graphics();
        const duration = 500;
        
        // 8 lines
        const directions = [];
        for (let i = 0; i < 8; i++) {
            const angle = Phaser.Math.DegToRad(i * 45);
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            // Length
            const len = 600; // Long lines like retro lasers
            directions.push({ angle, len });
        }

        this.tweens.addCounter({
            from: 0,
            to: 100,
            duration: duration,
            onUpdate: (tween) => {
                const progress = tween.getValue() / 100; 
                graphics.clear();
                graphics.lineStyle(2, 0xffffff, 1 - progress);
                
                for (let d of directions) {
                    const currentLen = d.len * progress;
                    const x2 = cx + Math.cos(d.angle) * currentLen;
                    const y2 = cy + Math.sin(d.angle) * currentLen;
                    graphics.beginPath();
                    graphics.moveTo(cx, cy);
                    graphics.lineTo(x2, y2);
                    graphics.strokePath();
                }
            },
            onComplete: () => graphics.destroy()
        });
    }

    triggerPingVisual(tankId, gx, gy, ex, ey) {
        const sprite = this.tankSprites[tankId];
        if (!sprite) return;
        const x = sprite.x, y = sprite.y;
        
        let targetRadius = 1000;
        let found = false;

        if (ex !== -1 && ey !== -1) {
            const halfTile = this.tileSize / 2;
            const enemyX = ex * this.tileSize + halfTile;
            const enemyY = this.titleHeight + ey * this.tileSize + halfTile;
            targetRadius = Phaser.Math.Distance.Between(x, y, enemyX, enemyY);
            found = true;
        }

        const color = tankId === 'P1' ? 0x0088ff : 0xff4444;
        const g = this.add.graphics();
        
        this.tweens.addCounter({
            from: 0, 
            to: targetRadius, 
            duration: 500,
            ease: 'Quad.out',
            onUpdate: (t) => {
                const r = t.getValue();
                g.clear();
                g.lineStyle(2, color, 1 - (r / targetRadius));
                g.strokeCircle(x, y, r);
            },
            onComplete: () => {
                g.destroy();
                if (found) {
                    const enemyId = tankId === 'P1' ? 'P2' : 'P1';
                    const enemySprite = this.tankSprites[enemyId];
                    if (enemySprite && enemySprite.visible) {
                        enemySprite.tint = 0x00ff00;
                        this.time.delayedCall(150, () => enemySprite.tint = 0xffffff);
                    }
                }
            }
        });
    }

    log(msg) {
        const logEl = document.getElementById('status-log');
        if (logEl) {
            const entry = document.createElement('div');
            entry.textContent = `> ${msg}`;
            logEl.prepend(entry);
            if (logEl.childNodes.length > 20) logEl.removeChild(logEl.lastChild);
        }
    }
}
