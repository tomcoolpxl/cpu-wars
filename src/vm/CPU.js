import { REGISTERS, OPCODES, READ_ONLY_REGISTERS, REGISTER_MAX } from './InstructionSet.js';

/**
 * @typedef {Object} Instruction
 * @property {string} opcode - The instruction opcode (e.g., 'MOV_F', 'SET')
 * @property {Array<string|number>} args - Instruction arguments (registers or numbers)
 * @property {number} [line] - Source line number (if available)
 */

/**
 * @typedef {Object} CPUAction
 * @property {string} type - Action type ('MOVE', 'ROTATE', 'FIRE', 'SCAN', 'PING', 'NOP', 'CPU_OP', 'HALT')
 * @property {string} [dir] - Direction for MOVE/ROTATE ('FORWARD', 'BACKWARD', 'LEFT', 'RIGHT')
 * @property {string} [opcode] - Opcode for CPU_OP actions
 * @property {string} [destDist] - Destination register for SCAN distance
 * @property {string} [destType] - Destination register for SCAN type
 * @property {string} [destX] - Destination register for PING X
 * @property {string} [destY] - Destination register for PING Y
 */

/**
 * Virtual CPU for tank program execution.
 * All registers are 8-bit unsigned (0-255) with wrapping arithmetic.
 */
export class CPU {
    /**
     * @param {Instruction[]} program - Parsed program instructions
     * @param {Object<string, number>} labels - Map of label names to instruction indices
     */
    constructor(program, labels) {
        this.program = program;
        this.labels = labels;

        // All registers are 8-bit (0-255), values wrap on overflow
        this.registers = {
            [REGISTERS.R0]: 0,
            [REGISTERS.R1]: 0,
            [REGISTERS.R2]: 0,
            [REGISTERS.R3]: 0,
            [REGISTERS.R4]: 0,
            [REGISTERS.R5]: 0,
            [REGISTERS.ACC]: 0,
            [REGISTERS.PC]: 0,
            [REGISTERS.CMP]: 0,
            [REGISTERS.PX]: 0,   // Tank X position (read-only, set by BattleManager)
            [REGISTERS.PY]: 0,   // Tank Y position (read-only, set by BattleManager)
            [REGISTERS.DIR]: 0,  // Tank direction (read-only, set by BattleManager)
            [REGISTERS.HP]: 0,   // Tank HP (read-only)
            [REGISTERS.AMMO]: 0, // Tank Ammo (read-only)
        };

        this.yieldAction = null;
        this.isDone = false;
        this.lastError = null;
    }

    /**
     * Executes exactly one instruction.
     * @returns {CPUAction|null} Action object for game simulation, or null if program ended
     */
    step() {
        if (this.registers.PC >= this.program.length) {
            this.isDone = true;
            return null; // End of program
        }

        const instruction = this.program[this.registers.PC];
        this.registers.PC++; // Advance PC immediately (Jumps will overwrite this)

        const { opcode, args } = instruction;
        
        // Execute Logic
        const result = this.executeInstruction(opcode, args);

        // If an Action was produced, return it.
        if (result) {
            return result;
        }

        // Otherwise, it was a logic/math operation (instant in game time, but 1 step in CPU time)
        return { type: 'CPU_OP', opcode: opcode };
    }

    executeInstruction(opcode, args) {
        switch (opcode) {
            // --- ACTIONS (Return objects) ---
            case OPCODES.NOP:   return { type: 'NOP' };
            case OPCODES.MOV_F: return { type: 'MOVE', dir: 'FORWARD' };
            case OPCODES.MOV_B: return { type: 'MOVE', dir: 'BACKWARD' };
            case OPCODES.ROT_L: return { type: 'ROTATE', dir: 'LEFT' };
            case OPCODES.ROT_R: return { type: 'ROTATE', dir: 'RIGHT' };
            case OPCODES.FIRE:  return { type: 'FIRE' };
            
            // --- SENSORS (Instant) ---
            case OPCODES.SCAN:
                // Scan is special. It requires interaction with the World.
                // The CPU calculates the intent, but the Simulator performs the Raycast.
                // WE MUST YIELD to the simulator to get the data.
                return { type: 'SCAN', destDist: args[0], destType: args[1] };
                
            case OPCODES.PING:
                return { type: 'PING', destX: args[0], destY: args[1] };

            // --- FLOW CONTROL ---
            case OPCODES.JMP:
                this.jump(args[0]);
                break;
            case OPCODES.CMP:
                this.compare(args[0], args[1]);
                break;
            case OPCODES.JE:
                if (this.registers.CMP === 0) this.jump(args[0]);
                break;
            case OPCODES.JNE:
                if (this.registers.CMP !== 0) this.jump(args[0]);
                break;
            case OPCODES.JG:
                if (this.getSignedCMP() > 0) this.jump(args[0]);
                break;
            case OPCODES.JL:
                if (this.getSignedCMP() < 0) this.jump(args[0]);
                break;
            case OPCODES.JGE:
                if (this.getSignedCMP() >= 0) this.jump(args[0]);
                break;
            case OPCODES.JLE:
                if (this.getSignedCMP() <= 0) this.jump(args[0]);
                break;
            case OPCODES.DJNZ:
                // Decrement and Jump if Not Zero
                // Don't decrement if already 0 (prevents wrap to 255 causing infinite loop)
                if (this.registers[args[0]] !== undefined && !READ_ONLY_REGISTERS.includes(args[0])) {
                    if (this.registers[args[0]] !== 0) {
                        this.registers[args[0]] = this.mask(this.registers[args[0]] - 1);
                        if (this.registers[args[0]] !== 0) this.jump(args[1]);
                    }
                }
                break;

            // --- MATH (all results masked to 8-bit) ---
            case OPCODES.SET:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] = this.mask(this.getValue(args[1]));
                }
                break;
            case OPCODES.ADD:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] = this.mask(this.registers[args[0]] + this.getValue(args[1]));
                }
                break;
            case OPCODES.SUB:
                if (!READ_ONLY_REGISTERS.includes(args[0])) {
                    this.registers[args[0]] = this.mask(this.registers[args[0]] - this.getValue(args[1]));
                }
                break;
        }
        return null; // Continue execution
    }

    /**
     * Mask value to 8-bit unsigned (0-255)
     * @param {number} value - Value to mask
     * @returns {number} Value masked to 0-255
     */
    mask(value) {
        return value & REGISTER_MAX;
    }

    /**
     * Get signed interpretation of CMP register.
     * CMP stores 0, 1, or 255 (for -1). This interprets 255 as -1.
     * @returns {number} Signed value (-1, 0, or 1)
     */
    getSignedCMP() {
        const cmp = this.registers.CMP;
        return cmp > 127 ? cmp - 256 : cmp;
    }

    /**
     * Jump to a labeled instruction
     * @param {string} labelName - Name of the label to jump to
     */
    jump(labelName) {
        const addr = this.labels[labelName];
        if (addr !== undefined) {
            this.registers.PC = addr;
        } else {
            // Label not found - halt execution
            this.isDone = true;
            this.registers.PC = this.program.length;
        }
    }

    /**
     * Compare two values and set CMP register
     * @param {string} reg - Register to compare
     * @param {string|number} valOrReg - Value or register to compare against
     */
    compare(reg, valOrReg) {
        const v1 = this.registers[reg];
        const v2 = this.getValue(valOrReg);
        if (v1 === v2) this.registers.CMP = 0;
        else if (v1 > v2) this.registers.CMP = 1;
        else this.registers.CMP = 255;  // -1 in two's complement byte
    }

    /**
     * Get value from a register or return literal number
     * @param {string|number} arg - Register name or literal number
     * @returns {number} The value (0-255)
     */
    getValue(arg) {
        if (typeof arg === 'number') return arg;
        if (this.registers[arg] !== undefined) return this.registers[arg];
        // Error case - unknown register (should be caught at parse time)
        console.warn(`CPU: Unknown register '${arg}', returning 0`);
        this.lastError = `Unknown register: ${arg}`;
        return 0;
    }

    /**
     * Set a register value (used by BattleManager for SCAN/PING results)
     * @param {string} reg - Register name (R0-R5, ACC)
     * @param {number} val - Value to set (will be masked to 0-255)
     */
    setRegister(reg, val) {
        if (this.registers[reg] !== undefined && !READ_ONLY_REGISTERS.includes(reg)) {
            this.registers[reg] = this.mask(val);
        }
    }

    /**
     * Update read-only tank state registers (called by BattleManager before each step)
     * @param {number} x - Tank X position (0-15)
     * @param {number} y - Tank Y position (0-9)
     * @param {number} direction - Tank facing direction (0=E, 1=S, 2=W, 3=N)
     * @param {number} hp - Tank health points
     * @param {number} ammo - Tank ammo (0 or 1)
     */
    updateTankState(x, y, direction, hp, ammo) {
        this.registers[REGISTERS.PX] = this.mask(x);
        this.registers[REGISTERS.PY] = this.mask(y);
        this.registers[REGISTERS.DIR] = this.mask(direction);
        this.registers[REGISTERS.HP] = this.mask(hp);
        this.registers[REGISTERS.AMMO] = this.mask(ammo);
    }
}
