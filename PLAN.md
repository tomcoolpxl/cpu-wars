# PLAN.md - Assembly Editor Mode

## Overview

Add a proper "Assembly Mode" that allows users to write assembly code directly, bypassing the TankScript compiler. This replaces the broken checkbox approach with a proper UI toggle.

---

## Current Architecture Analysis

### Current Flow (TankScript Mode)
```
TankScript (textarea)
    ↓ SimpleCompiler.compile()
Assembly (displayed in read-only div)
    ↓ Tokenizer.tokenize()
    ↓ Parser.parse()
Program + Labels → CPU
    ↓
Machine Code (displayed in read-only div)
```

### Current UI Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ CPU 1                              [COMPILE] [-- Load Script --]│
├─────────────────────────────────────────────────────────────────┤
│ Machine(i)      │ Assembler(i)     │ TankScript(i)              │
├─────────────────────────────────────────────────────────────────┤
│ .machine-viewer │ .code-viewer     │ textarea                   │
│ (read-only div) │ (read-only div)  │ (editable)                 │
│ 140px           │ 160px            │ flex: 1                    │
└─────────────────────────────────────────────────────────────────┘
```

### Current Problems
1. Raw ASM checkboxes are invisible (positioned inside script-panel but hidden behind textarea)
2. No proper mode toggle - checkbox is a poor UX pattern for this
3. Assembler panel is not editable
4. No way to edit assembly directly and run it

---

## Proposed Design

### Mode Toggle UI

**Location**: Replace the column headers row with a tabbed interface

**Design**: Segmented button / tab-style toggle above the panels

```
┌─────────────────────────────────────────────────────────────────┐
│ CPU 1                              [COMPILE] [-- Load Script --]│
├─────────────────────────────────────────────────────────────────┤
│ Machine(i) │ [TANKSCRIPT ▼] [ASSEMBLY  ]  ← Mode Toggle Tabs   │
├─────────────────────────────────────────────────────────────────┤
│            │                │                                   │
│ Machine    │ Assembler      │ TankScript                        │
│ Code       │ (view/edit)    │ (edit/disabled)                   │
│            │                │                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Visual States

#### TankScript Mode (Default)
| Panel      | State    | Appearance                    |
|------------|----------|-------------------------------|
| Machine    | View     | Read-only, shows opcodes      |
| Assembler  | View     | Read-only div, cyan text      |
| TankScript | Edit     | Full opacity textarea, green  |
| Button     | COMPILE  | Compiles TankScript → ASM     |

#### Assembly Mode
| Panel      | State    | Appearance                    |
|------------|----------|-------------------------------|
| Machine    | View     | Read-only, shows opcodes      |
| Assembler  | Edit     | Textarea, cyan text, editable |
| TankScript | Disabled | 30% opacity, non-interactive  |
| Button     | VALIDATE | Parses ASM → Machine Code     |

### Mode Toggle Behavior

**TankScript → Assembly Transition:**
1. Auto-compile current TankScript
2. Populate assembler textarea with compiled output
3. Grey out TankScript panel
4. Switch button to "VALIDATE"
5. Machine code remains as-is (from last compile)

**Assembly → TankScript Transition:**
1. Show confirmation if assembler was edited? (Optional - maybe skip for simplicity)
2. Restore TankScript panel to full opacity
3. Clear assembler viewer (will repopulate on next compile)
4. Switch button to "COMPILE"
5. TankScript content preserved (was never modified)

---

## Implementation Details

### New HTML Elements

```html
<!-- Mode toggle tabs (per player) -->
<div class="mode-toggle" id="p1-mode-toggle">
    <button class="mode-btn active" data-mode="tankscript">TANKSCRIPT</button>
    <button class="mode-btn" data-mode="assembly">ASSEMBLY</button>
</div>

<!-- Assembler textarea (hidden by default, shown in assembly mode) -->
<textarea id="p1-asm-editor" class="asm-editor" style="display: none;"></textarea>
```

### New CSS Classes

```css
/* Mode toggle tabs */
.mode-toggle {
    display: flex;
    gap: 0;
    margin-bottom: 5px;
}

.mode-btn {
    padding: 4px 12px;
    background: #333;
    color: #888;
    border: 1px solid #555;
    cursor: pointer;
    font-size: 11px;
    font-family: monospace;
}

.mode-btn:first-child {
    border-radius: 3px 0 0 3px;
}

.mode-btn:last-child {
    border-radius: 0 3px 3px 0;
    border-left: none;
}

.mode-btn.active {
    background: #2a4a2a;
    color: #fff;
    border-color: #4a6a4a;
}

.mode-btn:hover:not(.active) {
    background: #444;
}

/* Disabled panel state */
.panel-disabled {
    opacity: 0.3;
    pointer-events: none;
    position: relative;
}

.panel-disabled::after {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
}

/* Assembler editor textarea */
.asm-editor {
    width: 100%;
    height: 100%;
    background: #000;
    color: #0af;
    border: 1px solid #444;
    padding: 5px;
    resize: none;
    box-sizing: border-box;
    font-family: monospace;
    font-size: 11px;
}
```

### JavaScript State Management

```javascript
// Editor mode state (per player)
const editorModes = {
    p1: 'tankscript',  // 'tankscript' | 'assembly'
    p2: 'tankscript'
};

// Store last compiled assembly for each player
const compiledAsm = {
    p1: '',
    p2: ''
};
```

### Key Functions to Modify/Add

#### 1. `setEditorMode(player, mode)`
Switches UI state between modes.

```javascript
function setEditorMode(player, mode) {
    const prefix = player; // 'p1' or 'p2'
    editorModes[prefix] = mode;

    const scriptPanel = document.querySelector(`#${prefix}-script`).parentElement;
    const asmViewer = document.getElementById(`${prefix}-viewer`);
    const asmEditor = document.getElementById(`${prefix}-asm-editor`);
    const compileBtn = document.getElementById(`${prefix}-compile`);
    const modeBtns = document.querySelectorAll(`#${prefix}-mode-toggle .mode-btn`);

    // Update toggle button states
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'assembly') {
        // Switch to assembly mode
        scriptPanel.classList.add('panel-disabled');
        asmViewer.style.display = 'none';
        asmEditor.style.display = 'block';
        compileBtn.textContent = 'VALIDATE';

        // Auto-compile TankScript and populate assembler
        const script = document.getElementById(`${prefix}-script`);
        try {
            const asm = compiler.compile(script.value);
            asmEditor.value = asm;
            compiledAsm[prefix] = asm;
        } catch (e) {
            asmEditor.value = '; Compilation failed - write assembly here\nNOP';
        }
    } else {
        // Switch to TankScript mode
        scriptPanel.classList.remove('panel-disabled');
        asmViewer.style.display = 'block';
        asmEditor.style.display = 'none';
        compileBtn.textContent = 'COMPILE';
    }
}
```

#### 2. Modify `compilePlayer()`
Handle both modes.

```javascript
function compilePlayer(prefix, scriptEl, viewerEl, machineEl) {
    clearError(prefix.toUpperCase());
    const mode = editorModes[prefix];

    try {
        let asm;

        if (mode === 'assembly') {
            // Assembly mode: read directly from asm editor
            const asmEditor = document.getElementById(`${prefix}-asm-editor`);
            asm = asmEditor.value;
        } else {
            // TankScript mode: compile first
            asm = compiler.compile(scriptEl.value);
        }

        const tokens = tokenizer.tokenize(asm);
        const { program, labels, error } = parser.parse(tokens);
        if (error) throw new Error(error);

        // Always update viewers
        renderAssembly(viewerEl, program);
        renderMachineCode(machineEl, program);

        return { asm, program, labels };
    } catch (e) {
        showError(prefix.toUpperCase(), `${mode === 'assembly' ? 'Parse' : 'Compile'} Error: ${e.message}`);
        return null;
    }
}
```

#### 3. Mode Toggle Event Handler

```javascript
document.querySelectorAll('.mode-toggle .mode-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const toggle = e.target.closest('.mode-toggle');
        const player = toggle.id.replace('-mode-toggle', ''); // 'p1' or 'p2'
        const mode = e.target.dataset.mode;
        setEditorMode(player, mode);
    });
});
```

---

## Edge Cases & Error Handling

### 1. Empty Assembly Editor
- **Scenario**: User switches to assembly mode, clears editor, clicks RUN
- **Handling**: Parser returns empty program, CPU halts immediately
- **UX**: Could show warning "No instructions to execute"

### 2. Invalid Assembly Syntax
- **Scenario**: User types invalid assembly (typos, wrong opcodes)
- **Handling**: Parser returns error, displayed in error div
- **UX**: VALIDATE button shows "ERROR" briefly, error message displayed

### 3. Mode Switch During Simulation
- **Scenario**: Simulation running, user clicks mode toggle
- **Handling**: Allow switch - next RUN will use new mode's content
- **Alternative**: Stop simulation on mode switch (more conservative)
- **Decision**: Allow switch without stopping (less disruptive)

### 4. Mode Switch After Editing Assembly
- **Scenario**: User edits assembly, then switches back to TankScript
- **Handling**: Assembly edits are lost (can't decompile)
- **UX**: No warning needed - TankScript content still there
- **Note**: Could add "unsaved changes" warning but adds complexity

### 5. Strategy Dropdown in Assembly Mode
- **Scenario**: User in assembly mode, selects strategy from dropdown
- **Handling**: Strategy loads into TankScript (still disabled), auto-compile populates assembler
- **Alternative**: Disable dropdown in assembly mode
- **Decision**: Allow it - useful for loading examples then editing assembly

### 6. PC Highlighting in Assembly Mode
- **Scenario**: During execution, PC should highlight current instruction
- **Handling**: In TankScript mode, highlight in viewer div
- **Handling**: In Assembly mode, need different approach since it's a textarea
- **Decision**: For assembly mode, show PC in status or don't highlight (textarea limitation)
- **Alternative**: Use contenteditable div instead of textarea for assembly editor
- **Decision**: Use textarea for simplicity, accept no highlighting during edit

### 7. Live Validation While Typing
- **Scenario**: User types in assembly editor
- **Handling**: Don't validate on every keystroke (laggy, distracting)
- **Decision**: Only validate on explicit VALIDATE click or RUN

---

## UI/UX Considerations

### Color Coding Consistency
- TankScript mode: Green theme (#0f0 text)
- Assembly mode: Cyan theme (#0af text)
- Machine code: Orange theme (#f80 text)
- Disabled state: Grey overlay

### Button States
| Mode       | Button Text | Button Color  | Action                    |
|------------|-------------|---------------|---------------------------|
| TankScript | COMPILE     | Green (#2a4a2a)| Compile TS → ASM + Machine|
| Assembly   | VALIDATE    | Cyan (#2a4a6a) | Parse ASM → Machine       |

### Visual Feedback
- Mode toggle: Active tab clearly highlighted
- Disabled panel: Greyed out with overlay
- Errors: Red text in error div (existing)
- Success: Button briefly shows "OK!" (existing)

---

## Files to Modify

### 1. `index.html`
- Remove raw-asm checkboxes (broken)
- Add mode toggle buttons for each player
- Add assembler textarea (hidden by default)
- Add new CSS classes

### 2. `src/main.js`
- Add editorModes state object
- Add `setEditorMode()` function
- Modify `compilePlayer()` to handle both modes
- Add mode toggle event listeners
- Update RUN/STEP/FF handlers to use correct mode

### 3. `src/view/scenes/BattleScene.js`
- No changes needed (receives compiled program)

### 4. `src/vm/*`
- No changes needed (already handles raw assembly)

### 5. `src/simulation/*`
- No changes needed

---

## Testing Checklist

### Functional Tests
- [ ] Toggle P1 to assembly mode
- [ ] Toggle P2 to assembly mode (independent of P1)
- [ ] TankScript auto-compiles when switching to assembly mode
- [ ] Assembly editor is editable
- [ ] VALIDATE button parses assembly and updates machine code
- [ ] RUN uses assembly editor content in assembly mode
- [ ] RUN uses TankScript content in TankScript mode
- [ ] STEP works in both modes
- [ ] RESET works in both modes
- [ ] Strategy dropdown works in both modes
- [ ] Errors display correctly in assembly mode
- [ ] Switch back to TankScript mode preserves TankScript content

### Edge Case Tests
- [ ] Empty assembly editor → graceful handling
- [ ] Invalid assembly syntax → error displayed
- [ ] Mode switch during simulation → continues working
- [ ] Very long assembly program → scrollable
- [ ] Special characters in assembly (labels, comments)

### Visual Tests
- [ ] Mode toggle looks like proper tabs
- [ ] Active mode clearly indicated
- [ ] Disabled TankScript panel is greyed out
- [ ] Assembly editor matches assembler viewer styling
- [ ] No layout shifts when switching modes

---

## Implementation Order

1. **Phase 1: HTML Structure**
   - Remove raw-asm checkboxes
   - Add mode toggle buttons
   - Add assembler textareas
   - Add CSS for new elements

2. **Phase 2: Mode Switching**
   - Implement `setEditorMode()` function
   - Add toggle event listeners
   - Test visual state changes

3. **Phase 3: Compilation Logic**
   - Modify `compilePlayer()` for dual-mode
   - Update button text based on mode
   - Test compilation in both modes

4. **Phase 4: Run Integration**
   - Verify RUN uses correct source
   - Verify STEP uses correct source
   - Test error handling

5. **Phase 5: Polish**
   - Fine-tune styling
   - Test edge cases
   - Fix any visual glitches

---

## Open Questions

1. **Should mode be global or per-player?**
   - Decision: Per-player (more flexible)

2. **Should we warn when switching from assembly mode with unsaved changes?**
   - Decision: No (adds complexity, TankScript is still there)

3. **Should strategy dropdown be disabled in assembly mode?**
   - Decision: No (useful for loading examples)

4. **Should machine code update live while typing assembly?**
   - Decision: No (only on VALIDATE/RUN)

5. **Should we support PC highlighting in assembly editor textarea?**
   - Decision: No (textarea limitation, would need contenteditable)

---

## Estimated Scope

- **HTML changes**: ~50 lines (toggle buttons, textareas, CSS)
- **JavaScript changes**: ~100 lines (mode state, toggle logic, compile modification)
- **Testing**: ~30 minutes
- **Total effort**: ~2 hours

---

## Rollback Plan

If issues arise, can revert to previous state:
- Mode toggle buttons can be hidden via CSS
- Assembly textareas can be hidden
- `compilePlayer()` changes are backward compatible
- No database or persistent state changes
