# Fix Plan: Relative Path Resolution Bug

## Summary

The `kanbn.additionalBoards` configuration setting fails when using relative paths. The bug occurs because `path.resolve()` is called without a base directory, causing paths to resolve relative to VSCode's process working directory instead of the workspace folder.

**Impact:** Users cannot use relative paths in `.vscode/settings.json` for board locations that exist within their project structure.

## Bug Locations

### Primary Issue: `ext-src/extension.ts`

| Line | Code | Issue |
|------|------|-------|
| 56 | `boardLocations.add(path.resolve(boardLocation))` | Global config: resolves against VSCode cwd |
| 63 | `boardLocations.add(path.resolve(boardLocation))` | Workspace config: ignores workspaceFolder context |

### Code Context

```typescript
// Line 55-57: Global additionalBoards (BUGGY)
vscode.workspace.getConfiguration('kanbn', null).get<string[]>('additionalBoards')?.forEach(boardLocation => {
  boardLocations.add(path.resolve(boardLocation))  // ❌ No base path
})

// Line 62-64: Workspace-scoped additionalBoards (BUGGY)
vscode.workspace.getConfiguration('kanbn', workspaceFolder.uri).get<string[]>('additionalBoards')?.forEach(boardLocation => {
  boardLocations.add(path.resolve(boardLocation))  // ❌ Has workspaceFolder but doesn't use it
})
```

### Safe Locations (No Changes Needed)

| Line | Code | Status |
|------|------|--------|
| 69 | `boardLocations.add(path.resolve(oldKanbnPath))` | ✅ Already uses full path |
| 75 | `boardLocations.add(path.resolve(\`${kanbnPath}/${kanbnBoardPath}\`))` | ✅ Already uses full path |

## Edge Cases

### 1. Multi-root Workspaces
**Scenario:** User has `.code-workspace` file with multiple folders.

**Current Behavior:** Each workspace folder's `additionalBoards` should resolve independently, but they all resolve to VSCode's cwd.

**Required Behavior:**
```typescript
// For workspaceFolder at /projects/frontend
// Setting: "additionalBoards": ["../shared-boards/my-board"]
// Should resolve to: /projects/shared-boards/my-board
```

### 2. No Workspace Folder Open
**Scenario:** User opens VSCode without a folder (single file mode) but has global `additionalBoards` configured.

**Current Behavior:** Path resolves against VSCode cwd, producing unpredictable results.

**Required Behavior:**
- Require absolute paths in global settings
- Show warning/error if relative path used without workspace
- Alternative: Resolve relative to `os.homedir()` or show error

### 3. Global vs Workspace Settings
**Scenario:** User has both global (`User/settings.json`) and workspace (`.vscode/settings.json`) `additionalBoards`.

**Current Behavior:** Both resolve incorrectly.

**Required Behavior:**
- Global settings: Require absolute paths (or expand `~` to home)
- Workspace settings: Resolve relative to respective workspace folder

### 4. Home Directory Paths (`~`)
**Scenario:** User specifies `"~/boards/my-board"` in settings.

**Current Behavior:** `path.resolve()` treats `~` as literal directory name.

**Required Behavior:**
```typescript
import os from 'os'

function expandTilde(path: string): string {
  if (path.startsWith('~')) {
    return path.join(os.homedir(), path.slice(1))
  }
  return path
}
```

### 5. Symlinked Paths
**Scenario:** Board location is a symlink or contains symlinks in path.

**Current Behavior:** Not handled - may work or fail depending on downstream kanbn library.

**Recommendation:** Document behavior, don't fix, consider `fs.realpathSync()` if issues reported.

### 6. Relative Paths with Parent Directory (`..`)
**Scenario:** `"additionalBoards": ["../other-project/boards"]`

**Required Behavior:** Should correctly resolve to parent directory relative to workspace folder.

### 7. Empty/Null/Undefined Values
**Scenario:** `"additionalBoards": []` or setting not present.

**Current Behavior:** Handled by optional chaining (`?.forEach`).

**Required Behavior:** No change needed.

## Testing Strategy

### Unit Tests (New File: `ext-src/__tests__/pathResolver.test.ts`)

```typescript
describe('resolveBoardPath', () => {
  const workspacePath = '/home/user/projects/myproject'

  it('resolves relative path against workspace folder', () => {
    expect(resolveBoardPath('boards/my-board', workspacePath))
      .toBe('/home/user/projects/myproject/boards/my-board')
  })

  it('preserves absolute paths unchanged', () => {
    expect(resolveBoardPath('/absolute/path/board', workspacePath))
      .toBe('/absolute/path/board')
  })

  it('expands tilde to home directory', () => {
    expect(resolveBoardPath('~/my-boards/main', workspacePath))
      .toBe(path.join(os.homedir(), 'my-boards/main'))
  })

  it('handles parent directory traversal', () => {
    expect(resolveBoardPath('../other-boards/main', workspacePath))
      .toBe('/home/user/projects/other-boards/main')
  })

  it('handles null workspacePath for global config', () => {
    expect(() => resolveBoardPath('relative/path', null))
      .toThrow('Relative paths in global additionalBoards require absolute paths')
  })

  it('handles empty string path', () => {
    expect(resolveBoardPath('', workspacePath))
      .toBe(workspacePath)
  })
})
```

### Integration Tests

1. **Single-root workspace with relative paths**
   - Create workspace with `.vscode/settings.json` containing relative `additionalBoards`
   - Verify boards are discovered

2. **Multi-root workspace**
   - Create `.code-workspace` with multiple folders
   - Each folder has relative paths pointing to different locations
   - Verify each resolves correctly

3. **Global settings only (no workspace)**
   - Configure global `additionalBoards` with absolute paths
   - Verify boards work without workspace open

4. **Mixed global and workspace settings**
   - Global has absolute paths
   - Workspace has relative paths
   - Verify both are merged correctly

### Manual Testing Checklist

- [ ] Open workspace with relative `additionalBoards` - boards appear in board selector
- [ ] Open multi-root workspace - each folder's boards resolve independently
- [ ] Open VSCode without workspace - global boards with absolute paths work
- [ ] Test `~` expansion in path
- [ ] Test `..` parent directory in path
- [ ] Test on Windows (path separators)
- [ ] Test with symlinked board directories

## Implementation Checklist

### Phase 1: Create Path Resolution Utility

- [ ] Create `ext-src/pathUtils.ts` with helper functions:
  ```typescript
  /**
   * Resolve a board path relative to a base path.
   * - Absolute paths returned unchanged
   * - Tilde (~) expanded to home directory
   * - Relative paths resolved against basePath
   * - Throws if relative path provided without basePath
   */
  export function resolveBoardPath(
    boardPath: string,
    basePath: string | null
  ): string
  ```

- [ ] Add unit tests for `resolveBoardPath`

### Phase 2: Fix Extension Code

- [ ] Import `resolveBoardPath` in `ext-src/extension.ts`
- [ ] Fix line 55-57 (global additionalBoards):
  ```typescript
  vscode.workspace.getConfiguration('kanbn', null).get<string[]>('additionalBoards')?.forEach(boardLocation => {
    try {
      boardLocations.add(resolveBoardPath(boardLocation, null))
    } catch (e) {
      void vscode.window.showWarningMessage(
        `Invalid board path "${boardLocation}": ${(e as Error).message}`
      )
    }
  })
  ```

- [ ] Fix line 62-64 (workspace additionalBoards):
  ```typescript
  vscode.workspace.getConfiguration('kanbn', workspaceFolder.uri).get<string[]>('additionalBoards')?.forEach(boardLocation => {
    boardLocations.add(resolveBoardPath(boardLocation, workspaceFolder.uri.fsPath))
  })
  ```

### Phase 3: Update Documentation

- [ ] Update `package.json` configuration description:
  ```json
  "kanbn.additionalBoards": {
    "type": "array",
    "default": [],
    "description": "Specify additional kanbn boards in non-standard locations, eg within the workspace or in global location. Relative paths are resolved from the workspace folder. For global settings, use absolute paths or ~/ for home directory.",
    "items": {
      "type": "string"
    }
  }
  ```

- [ ] Update README.md with two short examples of this field usage in local settings.json
- [ ] Remove initial bug doc

### Phase 4: Testing

- [ ] Run unit tests: `npm test`
- [ ] Manual testing with all edge cases: ask user to do this
- [ ] Test on Windows
- [ ] Test on macOS
- [ ] Test on Linux

### Phase 5: Cleanup

- [ ] Delete `docs/kanbn-relative-path-bug.md`
- [ ] Update CHANGELOG.md

## Suggested Implementation: `ext-src/pathUtils.ts`

```typescript
import * as path from 'path'
import * as os from 'os'

/**
 * Resolve a board path, handling relative paths, absolute paths, and tilde expansion.
 *
 * @param boardPath - The path from configuration
 * @param basePath - Base path for relative resolution (workspace folder), or null for global config
 * @returns Resolved absolute path
 * @throws Error if relative path provided without basePath
 */
export function resolveBoardPath(
  boardPath: string,
  basePath: string | null
): string {
  // Handle empty path
  if (!boardPath || boardPath.trim() === '') {
    if (basePath) {
      return basePath
    }
    throw new Error('Empty path provided')
  }

  // Expand tilde to home directory
  let expandedPath = boardPath
  if (expandedPath.startsWith('~')) {
    expandedPath = path.join(os.homedir(), expandedPath.slice(1))
  }

  // If already absolute, return as-is
  if (path.isAbsolute(expandedPath)) {
    return path.normalize(expandedPath)
  }

  // Relative path requires base path
  if (basePath === null) {
    throw new Error(
      `Relative path "${boardPath}" cannot be used in global settings. ` +
      `Use an absolute path or ~/ for home directory.`
    )
  }

  // Resolve relative to base path
  return path.normalize(path.resolve(basePath, expandedPath))
}

/**
 * Validate that a board path exists and is accessible.
 * Returns the path if valid, or throws an error.
 */
export async function validateBoardPath(
  boardPath: string,
  fs: typeof import('fs')
): Promise<string> {
  const kanbnPath = path.join(boardPath, '.kanbn')
  
  if (!fs.existsSync(boardPath)) {
    throw new Error(`Board directory does not exist: ${boardPath}`)
  }
  
  if (!fs.existsSync(kanbnPath)) {
    throw new Error(`Not a valid kanbn board (missing .kanbn directory): ${boardPath}`)
  }
  
  return boardPath
}
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing absolute path configs | Low | High | Add tests for absolute paths |
| Path resolution differs on Windows | Medium | Medium | Test on Windows, use `path.normalize()` |
| Tilde expansion fails in some environments | Low | Low | Fallback to error message |
| Multi-root workspace behavior confusing | Medium | Low | Clear documentation |

## Files Changed

| File | Change Type |
|------|-------------|
| `ext-src/pathUtils.ts` | New file |
| `ext-src/extension.ts` | Modify |
| `ext-src/__tests__/pathResolver.test.ts` | New file |
| `package.json` | Modify (description) |
| `README.md` | Modify (add example) |
| `CHANGELOG.md` | Modify (add entry) |
| `docs/kanbn-relative-path-bug.md` | Delete |
