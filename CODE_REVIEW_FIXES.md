# Code Review Fixes - Implementation Plan

Based on comprehensive code review. Prioritized fixes.

---

## Phase 1: 1-Byte Registers (Foundation)

All registers become unsigned 8-bit (0-255) with wrapping arithmetic.

### 1.1 CPU.js - Register Masking

Add mask on all register writes:

```javascript
// In setRegister()
this.registers[reg] = value & 0xFF;

// In executeInstruction() for SET, ADD, SUB
this.registers[dest] = (result) & 0xFF;
```

### 1.2 CPU.js - CMP Signed Interpretation

CMP stores 255 for -1, but jump instructions interpret as signed:

```javascript
// Helper function
getSignedCMP() {
    const cmp = this.registers.CMP;
    return cmp > 127 ? cmp - 256 : cmp;
}

// In jump instructions (JL, JG, JLE, JGE)
case OPCODES.JL:
    if (this.getSignedCMP() < 0) this.jump(args[0]);
    break;
```

### 1.3 CPU.js - DJNZ Zero Protection

Prevent infinite loop when decrementing 0:

```javascript
case OPCODES.DJNZ:
    if (this.registers[dest] !== 0) {
        this.registers[dest] = (this.registers[dest] - 1) & 0xFF;
        if (this.registers[dest] !== 0) this.jump(args[1]);
    }
    break;
```

### 1.4 InstructionSet.js - Document Limits

Add constant and documentation:

```javascript
export const REGISTER_BITS = 8;
export const REGISTER_MAX = 255;
export const REGISTER_MIN = 0;
```

### 1.5 Tests

- Test ADD wrapping: 255 + 1 = 0
- Test SUB wrapping: 0 - 1 = 255
- Test CMP with negative result still works for jumps
- Test DJNZ with 0 doesn't loop forever

---

## Phase 2: Input Validation (High Priority)

### 2.1 Parser.js - Validate Label Names

Prevent labels that match register names:

```javascript
// In parseLBL or wherever labels defined
const RESERVED = ['R0','R1','R2','R3','R4','R5','ACC','CMP','PC','PX','PY','DIR','HP','AMMO'];
if (RESERVED.includes(labelName.toUpperCase())) {
    return { error: `Label name '${labelName}' is reserved (register name)` };
}
```

### 2.2 CPU.js - Throw on Undefined Register

Don't silently return 0:

```javascript
getValue(arg) {
    if (typeof arg === 'number') return arg & 0xFF;
    if (this.registers[arg] !== undefined) return this.registers[arg];
    throw new Error(`Unknown register: ${arg}`);
}
```

### 2.3 Parser.js - Validate Instruction Argument Count

Check that instruction has correct number of arguments:

```javascript
if (args.length !== spec.length) {
    return { error: `${opcode} expects ${spec.length} arguments, got ${args.length}` };
}
```

---

## Phase 3: Recompile on RUN (High Priority)

### 3.1 main.js - Track Code Changes

```javascript
let lastCompiledP1 = '';
let lastCompiledP2 = '';

// In RUN handler:
const p1Source = editorModes.p1 === 'assembly' ? asmEditorP1.value : scriptP1.value;
const p2Source = editorModes.p2 === 'assembly' ? asmEditorP2.value : scriptP2.value;

const codeChanged = p1Source !== lastCompiledP1 || p2Source !== lastCompiledP2;

if (!hasLoadedCode || codeChanged) {
    // Recompile
    lastCompiledP1 = p1Source;
    lastCompiledP2 = p2Source;
}
```

---

## Phase 4: Centralize Constants (Medium Priority)

### 4.1 src/constants.js - Add All Constants

```javascript
export const TANK_IDS = { P1: 'P1', P2: 'P2' };

// Arena
export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 10;

// Game rules
export const INITIAL_HP = 3;
export const MAX_OPS_PER_TURN = 50;
export const BULLET_SPEED = 2;  // tiles per turn
export const BULLET_MAX_RANGE = 40;
export const RAYCAST_MAX = 45;

// Starting positions
export const START_POSITIONS = {
    P1: { x: 0, y: 4, facing: 0 },
    P2: { x: 15, y: 5, facing: 2 }
};

// Registers
export const REGISTER_BITS = 8;
export const REGISTER_MAX = 255;
```

### 4.2 Update BattleManager.js, Grid.js, BattleScene.js

Import and use constants instead of magic numbers.

---

## Phase 5: Game Turn Limit (Medium Priority)

### 5.1 BattleManager.js - Add Max Turns

```javascript
import { MAX_TURNS } from '../constants.js';

// In resolveTurn():
if (this.turnCount >= MAX_TURNS) {
    this.isGameOver = true;
    this.winner = 'DRAW (TURN LIMIT)';
}
```

### 5.2 constants.js

```javascript
export const MAX_TURNS = 1000;  // Prevent infinite games
```

---

## Phase 6: Collision Priority Fix (Medium Priority)

### 6.1 BattleManager.js - Document and Fix Order

```javascript
// Collision resolution priority (documented):
// 1. Wall collision - highest priority, blocks movement
// 2. Head-on collision - both tanks try to swap
// 3. Same-target collision - both tanks try to move to same cell
// 4. Occupied cell - tank tries to move into other tank's current cell
```

Ensure lastFeedback only set once per tank per turn.

---

## Phase 7: Improve Error Messages (Medium Priority)

### 7.1 SimpleCompiler.js - Track Line Numbers

```javascript
compile(source) {
    this.currentLine = 0;
    const lines = source.split('\n');

    lines.forEach((line, index) => {
        this.currentLine = index + 1;  // 1-based for user display
        // ... existing processing
    });
}

// In error throws:
throw new Error(`Line ${this.currentLine}: Unknown command '${cmd}'`);
```

### 7.2 Parser.js - Include Token Position

```javascript
// Store line info in tokens (Tokenizer already has lineNum)
return { error: `Line ${token.line}: Expected instruction, got ${token.type}` };
```

### 7.3 main.js - Display Line Numbers in Errors

Error messages already displayed, just need better formatting:
```javascript
showError(prefix, `Compile Error (line ${lineNum}): ${message}`);
```

---

## Phase 8: Add JSDoc Type Annotations (Medium Priority)

### 8.1 CPU.js - Document Types

```javascript
/**
 * @typedef {Object} Instruction
 * @property {string} opcode - The instruction opcode
 * @property {Array<string|number>} args - Instruction arguments
 */

/**
 * Execute one instruction and return result
 * @returns {{type: string, [key: string]: any}|null} Action or null if halted
 */
step() { ... }

/**
 * @param {string} reg - Register name (R0-R5, ACC, etc.)
 * @param {number} value - Value to set (will be masked to 0-255)
 */
setRegister(reg, value) { ... }
```

### 8.2 BattleManager.js - Document Types

```javascript
/**
 * @typedef {Object} Tank
 * @property {number} x - Grid X position (0-15)
 * @property {number} y - Grid Y position (0-9)
 * @property {number} facing - Direction (0=E, 1=S, 2=W, 3=N)
 * @property {number} hp - Health points (0-3)
 * @property {CPU|null} cpu - The tank's CPU instance
 */

/**
 * @typedef {Object} Bullet
 * @property {number} id - Unique bullet ID
 * @property {string} owner - Tank ID (P1 or P2)
 * @property {number} x - Grid X position
 * @property {number} y - Grid Y position
 * @property {number} dx - X direction (-1, 0, or 1)
 * @property {number} dy - Y direction (-1, 0, or 1)
 */
```

### 8.3 SimpleCompiler.js - Document Types

```javascript
/**
 * Compile TankScript source to assembly
 * @param {string} source - TankScript source code
 * @returns {string} Assembly code
 * @throws {Error} If compilation fails (with line number)
 */
compile(source) { ... }
```

### 8.4 Key Interfaces to Document

- `CPU.step()` return value
- `BattleManager.getState()` return value
- `Parser.parse()` return value
- Event payloads for window events

---

## Phase 9: Documentation Updates

### 9.1 CLAUDE.md - Add Missing Info

- Register limits (0-255, wrapping)
- Sensor timing (registers updated after resolveTurn)
- Collision priority order
- Turn limit
- Reserved label names

### 9.2 README.md - Update Examples

Ensure examples reflect current syntax and behavior.

---

## Testing Checklist

After each phase:
- [ ] Run `npm test` - all 127 tests pass
- [ ] Manual test: compile simple script
- [ ] Manual test: run simulation
- [ ] Manual test: fast-forward
- [ ] Manual test: step mode
- [ ] Check edge cases for that phase

---

## Estimated Scope

| Phase | Files Changed | Complexity |
|-------|---------------|------------|
| 1. 1-Byte Registers | CPU.js, InstructionSet.js, tests | Medium |
| 2. Input Validation | Parser.js, CPU.js | Low |
| 3. Recompile on RUN | main.js | Low |
| 4. Centralize Constants | constants.js, 4+ files | Low |
| 5. Turn Limit | BattleManager.js, constants.js | Low |
| 6. Collision Priority | BattleManager.js | Medium |
| 7. Error Messages | SimpleCompiler.js, Parser.js, main.js | Low |
| 8. JSDoc Types | CPU.js, BattleManager.js, SimpleCompiler.js | Low |
| 9. Documentation | CLAUDE.md, README.md | Low |

---

## Not Implementing (Per User Request)

- ~~Save/Load~~
- ~~Undo/Replay~~
- Ammo logic change (intentional design)
