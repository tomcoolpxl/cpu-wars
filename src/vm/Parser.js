import { OPCODES, INSTRUCTION_SPECS, ARG_TYPES, TOKEN_TYPES } from './InstructionSet.js';

export class Parser {
    constructor() {
        this.labels = {}; // Label Name -> Program Index (PC)
        this.program = []; // Array of Instruction Objects
    }

    /**
     * @param {Array} tokens - Output from Tokenizer
     * @returns {Object} { program, labels, error }
     */
    parse(tokens) {
        this.labels = {};
        this.program = [];
        let currentTokenIndex = 0;

        try {
            while (currentTokenIndex < tokens.length) {
                const token = tokens[currentTokenIndex];

                // Skip newlines
                if (token.type === TOKEN_TYPES.NEWLINE) {
                    currentTokenIndex++;
                    continue;
                }

                // Expecting an Instruction (Opcode)
                // Note: Some opcodes like CMP or PC might be tokenized as REGISTER 
                // if they are also register names.
                if (token.type !== TOKEN_TYPES.INSTRUCTION && token.type !== TOKEN_TYPES.REGISTER) {
                     throw new Error(`Line ${token.line}: Unexpected token '${token.value}'. Expected Instruction.`);
                }

                const opcode = token.value;
                
                // Check if valid Opcode
                if (!INSTRUCTION_SPECS[opcode]) {
                    throw new Error(`Line ${token.line}: Unknown instruction '${opcode}'.`);
                }

                const spec = INSTRUCTION_SPECS[opcode];
                const args = [];
                currentTokenIndex++; // Move past Opcode

                // Parse Arguments
                for (let i = 0; i < spec.length; i++) {
                    const expectedType = spec[i];
                    
                    // Consume comma if it's not the first arg
                    if (i > 0) {
                        if (currentTokenIndex >= tokens.length) throw new Error(`Line ${token.line}: Unexpected end of input.`);
                        if (tokens[currentTokenIndex].type === TOKEN_TYPES.COMMA) {
                            currentTokenIndex++;
                        } else {
                             // Optional comma? Let's be strict for now.
                             // Actually, let's allow missing commas if it's just whitespace separation, 
                             // but our Tokenizer generates COMMA tokens.
                             // If we see a comma, eat it. If not, check if we have the next arg.
                        }
                    }

                    if (currentTokenIndex >= tokens.length) throw new Error(`Line ${token.line}: Missing arguments for '${opcode}'.`);
                    
                    const argToken = tokens[currentTokenIndex];
                    
                    // Validate Argument
                    this.validateArg(argToken, expectedType, opcode);
                    
                    args.push(argToken.value);
                    currentTokenIndex++;
                }

                // Special Case: LABEL definition
                if (opcode === OPCODES.LBL) {
                    const labelName = args[0];
                    if (this.labels[labelName] !== undefined) {
                        throw new Error(`Line ${token.line}: Duplicate label '${labelName}'.`);
                    }
                    // Label points to the NEXT instruction index. 
                    // But 'LBL' itself is a pseudo-instruction. It shouldn't take up a slot in the executed program?
                    // actually, for simplicity, let's store it as a NO-OP in the program, 
                    // or just map it to the current index and NOT add it to the program array.
                    // Decision: DO NOT add LBL to program array. It's meta-data.
                    this.labels[labelName] = this.program.length;
                } else {
                    // Normal instruction
                    this.program.push({
                        opcode: opcode,
                        args: args,
                        line: token.line
                    });
                }
            }

            return { program: this.program, labels: this.labels };

        } catch (err) {
            return { error: err.message };
        }
    }

    validateArg(token, expectedTypeOrArray, opcode) {
        // expectedTypeOrArray can be a single string 'REGISTER' or an array ['REGISTER', 'NUMBER']
        const allowedTypes = Array.isArray(expectedTypeOrArray) ? expectedTypeOrArray : [expectedTypeOrArray];
        let isValid = false;

        if (token.type === TOKEN_TYPES.REGISTER && allowedTypes.includes(ARG_TYPES.REGISTER)) isValid = true;
        if (token.type === TOKEN_TYPES.NUMBER && allowedTypes.includes(ARG_TYPES.NUMBER)) isValid = true;
        
        // For Labels, the Tokenizer sees them as INSTRUCTION (Identifier) or REGISTER (if named R1..).
        // If we expect a LABEL, anything that is an Identifier (INSTRUCTION type in tokenizer) is valid.
        // Also a Register name could theoretically be a label name, but let's disallow that to avoid confusion.
        if (token.type === TOKEN_TYPES.INSTRUCTION && allowedTypes.includes(ARG_TYPES.LABEL)) isValid = true;

        if (!isValid) {
            throw new Error(`Line ${token.line}: Invalid argument '${token.value}' for '${opcode}'. Expected ${allowedTypes.join(' or ')}.`);
        }
    }
}
