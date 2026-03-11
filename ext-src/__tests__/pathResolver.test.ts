import * as os from 'os'
import { resolveBoardPath } from '../pathUtils'

describe('resolveBoardPath', () => {
  const workspacePath = '/home/user/projects/myproject'

  it('resolves relative path against workspace folder', () => {
    expect(resolveBoardPath(workspacePath, 'boards/my-board'))
      .toBe('/home/user/projects/myproject/boards/my-board')
  })

  it('preserves absolute paths unchanged', () => {
    expect(resolveBoardPath(workspacePath, '/absolute/path/board'))
      .toBe('/absolute/path/board')
  })

  it('expands tilde to home directory', () => {
    expect(resolveBoardPath(workspacePath, '~/my-boards/main'))
      .toBe(os.homedir() + '/my-boards/main')
  })

  it('handles parent directory traversal', () => {
    expect(resolveBoardPath(workspacePath, '../other-boards/main'))
      .toBe('/home/user/projects/other-boards/main')
  })

  it('handles null workspacePath for global config with relative path', () => {
    expect(() => resolveBoardPath(null, 'relative/path'))
      .toThrow('Relative path "relative/path" cannot be used in global settings')
  })

  it('handles null workspacePath for global config with absolute path', () => {
    expect(resolveBoardPath(null, '/absolute/path/board'))
      .toBe('/absolute/path/board')
  })

  it('handles null workspacePath for global config with tilde path', () => {
    expect(resolveBoardPath(null, '~/my-boards/main'))
      .toBe(os.homedir() + '/my-boards/main')
  })

  it('throws on empty string path with workspace', () => {
    expect(() => resolveBoardPath(workspacePath, ''))
      .toThrow('Empty path provided')
  })

  it('throws on whitespace-only path with workspace', () => {
    expect(() => resolveBoardPath(workspacePath, '   '))
      .toThrow('Empty path provided')
  })

  it('throws on empty string path without workspace', () => {
    expect(() => resolveBoardPath(null, ''))
      .toThrow('Empty path provided')
  })
})
