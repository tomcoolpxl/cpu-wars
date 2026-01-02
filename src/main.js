import Phaser from 'phaser';
import { BattleScene } from './view/scenes/BattleScene.js';
import { OPCODE_BINARY } from './vm/InstructionSet.js';
import { SimpleCompiler } from './vm/SimpleCompiler.js';
import { Tokenizer } from './vm/Tokenizer.js';
import { Parser } from './vm/Parser.js';

const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 400,
    parent: 'game-container',
    backgroundColor: '#000000',
    scene: [BattleScene]
};

const game = new Phaser.Game(config);

// DOM Elements
const btnRun = document.getElementById('btn-run');
const btnStop = document.getElementById('btn-stop');
const btnStep = document.getElementById('btn-step');
const btnFf = document.getElementById('btn-ff');
const btnReset = document.getElementById('btn-reset');
const levelSelect = document.getElementById('level-select');

const scriptP1 = document.getElementById('p1-script');
const scriptP2 = document.getElementById('p2-script');

const selP1 = document.getElementById('p1-strategy');
const selP2 = document.getElementById('p2-strategy');

const btnCompileP1 = document.getElementById('p1-compile');
const btnCompileP2 = document.getElementById('p2-compile');

const viewerP1 = document.getElementById('p1-viewer');
const viewerP2 = document.getElementById('p2-viewer');

const machineP1 = document.getElementById('p1-machine');
const machineP2 = document.getElementById('p2-machine');

// Compiler & Parser
const compiler = new SimpleCompiler();
const tokenizer = new Tokenizer();
const parser = new Parser();

// Note: Use var0 == var0 for infinite loops since CMP requires register as first arg
const STRATEGIES = {
    ATTACK_1: `# --- Attack 1: Center Defender ---
# Navigate to X=8 and Patrol vertically
var3 = 0

while var3 == var3:
  ping(var4, var5)

  if var4 == 8:
    # At Center - Check vertical bounds
    if var5 < 2:
      turn_right
      turn_right
    else:
      if var5 > 7:
        turn_right
        turn_right
      end
    end
  else:
    # Seek X=8
    if var4 > 8:
      turn_left
    else:
      turn_right
    end
  end

  # Combat & Move
  scan(var0, var1)
  if var1 == 2:
    fire
  else:
    if var1 == 1:
      turn_right
      move
    else:
      move
    end
  end
end`,

    ATTACK_2: `# --- Attack 2: Predictive Stalker ---
# Hunt center and engage
var3 = 0
while var3 == var3:
  ping(var4, var5)

  if var4 > 8:
    turn_left
    move
  else:
    if var4 < 8:
      turn_right
      move
    else:
      # At Center, Scan for enemy
      scan(var0, var1)
      if var1 == 2:
        fire
        # Dodge after firing
        turn_left
        move
      else:
        turn_right
      end
    end
  end
end`,

    STUPID_SPINNER: `# --- Stupid Spinner ---
var0 = 0
while var0 == var0:
  turn_left
  fire
end`,

    CHICKEN: `# --- Chicken ---
# Run away from the fight
var2 = 0
while var2 == var2:
  ping(var0, var1)
  if var0 > 8:
    turn_right
    move
  else:
    turn_left
    move
  end
end`
};

// Initial Load
scriptP1.value = STRATEGIES.ATTACK_1;
scriptP2.value = STRATEGIES.ATTACK_2;

// Strategy Selectors
selP1.addEventListener('change', () => {
    if (STRATEGIES[selP1.value]) scriptP1.value = STRATEGIES[selP1.value];
});

selP2.addEventListener('change', () => {
    if (STRATEGIES[selP2.value]) scriptP2.value = STRATEGIES[selP2.value];
});

// Compile a single player's script
function compilePlayer(prefix, scriptEl, viewerEl, machineEl) {
    try {
        const asm = compiler.compile(scriptEl.value);
        const tokens = tokenizer.tokenize(asm);
        const { program, labels, error } = parser.parse(tokens);

        if (error) throw new Error(error);

        renderAssembly(viewerEl, program);
        renderMachineCode(machineEl, program);

        return { asm, program, labels };
    } catch (e) {
        alert(`${prefix} Compile Error: ${e.message}`);
        return null;
    }
}

// Compile button handlers
btnCompileP1.addEventListener('click', () => {
    compilePlayer('P1', scriptP1, viewerP1, machineP1);
});

btnCompileP2.addEventListener('click', () => {
    compilePlayer('P2', scriptP2, viewerP2, machineP2);
});

btnRun.addEventListener('click', () => {
    try {
        // Compile TankScript to Assembly
        const p1Asm = compiler.compile(scriptP1.value);
        const p2Asm = compiler.compile(scriptP2.value);

        // Parse to get program for display
        const p1Tokens = tokenizer.tokenize(p1Asm);
        const p2Tokens = tokenizer.tokenize(p2Asm);
        const p1Result = parser.parse(p1Tokens);
        const p2Result = parser.parse(p2Tokens);

        if (p1Result.error) throw new Error('P1 Error: ' + p1Result.error);
        if (p2Result.error) throw new Error('P2 Error: ' + p2Result.error);

        // Render assembly and machine code
        renderAssembly(viewerP1, p1Result.program);
        renderAssembly(viewerP2, p2Result.program);
        renderMachineCode(machineP1, p1Result.program);
        renderMachineCode(machineP2, p2Result.program);

        const event = new CustomEvent('run-sim', {
            detail: {
                p1Code: p1Asm,
                p2Code: p2Asm,
                level: parseInt(levelSelect.value)
            }
        });
        window.dispatchEvent(event);
    } catch (e) {
        alert("Compile Error: " + e.message);
    }
});

btnStop.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('stop-sim'));
});

// Listen for halt state changes
window.addEventListener('halt-state', (e) => {
    if (e.detail.halted) {
        btnStop.classList.add('active');
    } else {
        btnStop.classList.remove('active');
    }
});

btnStep.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('step-sim'));
});

btnFf.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('ff-sim'));
});

btnReset.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: { level: parseInt(levelSelect.value) }
    }));
});

levelSelect.addEventListener('change', () => {
    window.dispatchEvent(new CustomEvent('reset-sim', {
        detail: { level: parseInt(levelSelect.value) }
    }));
});

// UI Updater
const REGISTERS = ['PC', 'ACC', 'CMP', 'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'PX', 'PY', 'DIR'];

window.addEventListener('update-ui', (e) => {
    const state = e.detail;
    updateCPU('p1', state.tanks.P1);
    updateCPU('p2', state.tanks.P2);
});

// Handle Sim Start (Show Bytecode View)
window.addEventListener('sim-started', (e) => {
    const { p1Program, p2Program } = e.detail;
    renderAssembly(viewerP1, p1Program);
    renderAssembly(viewerP2, p2Program);
    renderMachineCode(machineP1, p1Program);
    renderMachineCode(machineP2, p2Program);
});

function renderAssembly(viewer, program) {
    viewer.innerHTML = '';

    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'asm-line';
        row.id = viewer.id.replace('viewer', 'asm-line') + '-' + index;

        const addr = document.createElement('span');
        addr.className = 'asm-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();

        const text = document.createElement('span');
        text.className = 'asm-instr';
        let args = inst.args.join(', ');
        text.textContent = `${inst.opcode} ${args}`;

        row.appendChild(addr);
        row.appendChild(text);
        viewer.appendChild(row);
    });
}

function renderMachineCode(container, program) {
    container.innerHTML = '';

    program.forEach((inst, index) => {
        const row = document.createElement('div');
        row.className = 'machine-line';
        row.id = container.id + '-line-' + index;

        const addr = document.createElement('span');
        addr.className = 'machine-addr';
        addr.textContent = index.toString(16).padStart(2, '0').toUpperCase();

        const opByte = OPCODE_BINARY[inst.opcode] || 0;

        // Build hex representation
        const hex = document.createElement('span');
        hex.className = 'machine-hex';
        hex.textContent = opByte.toString(16).padStart(2, '0').toUpperCase();

        // Build binary representation
        const bin = document.createElement('span');
        bin.className = 'machine-bin';
        bin.textContent = opByte.toString(2).padStart(8, '0');

        row.appendChild(addr);
        row.appendChild(hex);
        row.appendChild(bin);
        container.appendChild(row);
    });
}

function updateCPU(prefix, tankData) {
    if (!tankData || !tankData.debugRegisters) return;

    const regs = tankData.debugRegisters;

    REGISTERS.forEach(reg => {
        const val = regs[reg];
        const el = document.getElementById(`${prefix}-${reg}`);
        if (el) el.textContent = val;

        const binEl = document.getElementById(`${prefix}-${reg}-bin`);
        if (binEl) {
            binEl.textContent = (val & 0xFF).toString(2).padStart(8, '0');
        }
    });

    const irEl = document.getElementById(`${prefix}-IR`);
    const irBinEl = document.getElementById(`${prefix}-IR-bin`);

    if (irEl) {
        const irText = tankData.debugIR || '-';
        irEl.textContent = irText;

        if (irBinEl) {
            if (irText === '-' || irText === 'HALT') {
                irBinEl.textContent = '00000000';
            } else {
                const opcode = irText.split(' ')[0];
                const binVal = OPCODE_BINARY[opcode] || 0;
                irBinEl.textContent = binVal.toString(2).padStart(8, '0');
            }
        }
    }

    // Highlight current PC in assembly viewer
    const highlightPC = (tankData.debugPC !== undefined) ? tankData.debugPC : regs.PC;
    const viewer = document.getElementById(`${prefix}-viewer`);
    const oldActiveAsm = viewer.querySelector('.active');
    if (oldActiveAsm) oldActiveAsm.classList.remove('active');

    const newActiveAsm = document.getElementById(`${prefix}-asm-line-${highlightPC}`);
    if (newActiveAsm) {
        newActiveAsm.classList.add('active');
        newActiveAsm.scrollIntoView({ block: 'nearest' });
    }

    // Highlight current PC in machine code viewer
    const machine = document.getElementById(`${prefix}-machine`);
    const oldActiveMachine = machine.querySelector('.active');
    if (oldActiveMachine) oldActiveMachine.classList.remove('active');

    const newActiveMachine = document.getElementById(`${prefix}-machine-line-${highlightPC}`);
    if (newActiveMachine) {
        newActiveMachine.classList.add('active');
        newActiveMachine.scrollIntoView({ block: 'nearest' });
    }
}
