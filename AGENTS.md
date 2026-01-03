# AGENTS.md - Unified Project Context for AI Agents

This document serves as the **Single Source of Truth** for any AI agent (Claude, Gemini, Copilot, etc.) working on the **CPU Wars** repository. It consolidates project goals, architectural rules, coding conventions, and deployment workflows.

---

## 1. Project Overview

**Name:** CPU Wars
**Type:** Educational Puzzle-Strategy Game (Web-based)
**Core Concept:** Players write "Fake Assembly" code (TankScript) to control tanks in a real-time autobattler. The code is compiled and executed by a custom Virtual Machine (VM).
**Goal:** Teach low-level programming concepts (registers, loops, conditionals) visually.

---

## 2. Operational Mandates & Conventions

### Critical Rules
1.  **Strict Logic/View Separation:**
    *   `src/vm/` and `src/simulation/` must **NEVER** import Phaser or DOM elements.
    *   They must be pure JavaScript, testable in Node.js via `npm test`.
    *   `src/view/` contains all Phaser-related code.
2.  **State Management:** The `BattleManager` (Simulation) is the source of truth. The View observes state changes via events.
3.  **No Magic Numbers:** Use constants from `InstructionSet.js` or configuration files.

### Coding Style
*   **Language:** JavaScript (ES6+ modules).
*   **Registers:** UPPERCASE (`R0`, `ACC`, `PC`).
*   **Instructions:** UPPERCASE (`MOV_F`, `SCAN`).
*   **Internal Labels:** snake_case with `__` prefix (e.g., `__while_start_0`).

---

## 3. Architecture

### Folder Structure
```text
/
├── public/               # Static assets (images, maps)
├── src/
│   ├── main.js           # Entry point, Phaser init, DOM events
│   ├── vm/               # [PURE LOGIC] Virtual Machine
│   │   ├── Tokenizer.js  # Text -> Tokens
│   │   ├── Parser.js     # Tokens -> AST/Instructions
│   │   ├── CPU.js        # Execution Engine
│   │   └── SimpleCompiler.js # TankScript -> Assembly Compiler
│   ├── simulation/       # [PURE LOGIC] Game Rules
│   │   ├── BattleManager.js # Referee, Loop, Collision
│   │   └── Grid.js       # Arena logic
│   └── view/             # [VISUALS] Phaser Code
│       └── scenes/
│           └── BattleScene.js
└── tests/                # Node.js tests for VM/Simulation
```

### Execution Pipeline
1.  **Source:** User writes TankScript.
2.  **Compile:** `SimpleCompiler` converts it to Assembly Opcodes.
3.  **Parse:** `Parser` converts Assembly to Instruction Objects.
4.  **Execute:** `CPU` runs instructions. `Action` instructions yield control to `BattleManager`.

---

## 4. Virtual Machine (VM) Specifications

### Registers
*   **R0 - R5:** General purpose (Read/Write).
*   **ACC:** Accumulator (Math/Scan results).
*   **PC:** Program Counter (Internal).
*   **CMP:** Comparison Flag (-1, 0, 1).
*   **PX, PY:** Tank Position (Read-Only).
*   **DIR:** Tank Direction (0=E, 1=S, 2=W, 3=N) (Read-Only).

### Constraints
*   **MAX_OPS:** 50 instructions per tick (prevents infinite loops).
*   **MAX_NESTING:** 3 levels (enforced by Compiler for `if`/`while`/`repeat`).
*   **Variables:** Strictly `var0` - `var5`.

### Instruction Set (Partial)
*   **Actions (End Turn):** `MOV_F`, `MOV_B`, `ROT_L`, `ROT_R`, `FIRE`.
*   **Sensors (End Turn):** `SCAN` (Raycast), `PING` (Enemy Loc).
*   **Flow (Instant):** `JMP`, `JE`, `JNE`, `CMP`, `DJNZ`.
*   **Math (Instant):** `SET`, `ADD`, `SUB`.

---

## 5. Development Workflow

### Commands
*   **Install:** `npm install`
*   **Develop:** `npm run dev` (Vite Server)
*   **Test:** `npm test` (Runs `tests/vm.test.js`)
*   **Build:** `npm run build` (Outputs to `dist/`)
*   **Deploy:** `npm run deploy` (Builds & Pushes to `gh-pages` branch)

### Deployment
*   **Automated:** Pushing to `main` triggers a GitHub Action to deploy.
*   **Manual:** Run `npm run deploy`.

---

## 6. Available Sub-Agents

### codebase_investigator
**Purpose:** Deep analysis of file structures, dependencies, and logic flows.
**Interaction:** Delegate to this agent for complex refactoring planning, root-cause analysis of bugs, or understanding large systems.