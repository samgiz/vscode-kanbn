import * as path from 'path'
import * as os from 'os'
import { resolveBoardPath } from '../pathUtils'

describe('resolveBoardPath', () => {
  const workspacePath = '/home/user/projects/myproject'

  it('resolves relative path against workspace folder', () => {
    expect(resolveBoardPath('boards/my-board', workspacePath))
      .toBe(path.normalize('/home/user/projects/myproject/boards/my-board'))
  })

  it('preserves absolute paths unchanged', () => {
    expect(resolveBoardPath('/absolute/path/board', workspacePath))
      .toBe(path.normalize('/absolute/path/board'))
  })

  it('expands tilde to home directory', () => {
    expect(resolveBoardPath('~/my-boards/main', workspacePath))
      .toBe(path.join(os.homedir(), 'my-boards/main'))
  })

  it('handles parent directory traversal', () => {
    expect(resolveBoardPath('../other-boards/main', workspacePath))
      .toBe(path.normalize('/home/user/projects/other-boards/main'))
  })

  it('handles null workspacePath for global config with relative path', () => {
    expect(() => resolveBoardPath('relative/path', null))
      .toThrow('Relative path "relative/path" cannot be used in global settings')
  })

  it('handles null workspacePath for global config with absolute path', () => {
    expect(resolveBoardPath('/absolute/path/board', null))
      .toBe(path.normalize('/absolute/path/board'))
  })

  it('handles null workspacePath for global config with tilde path', () => {
    expect(resolveBoardPath('~/my-boards/main', null))
      .toBe(path.join(os.homedir(), 'my-boards/main'))
  })

  it('handles empty string path with workspace', () => {
    expect(resolveBoardPath('', workspacePath))
      .toBe(workspacePath)
  })

  it('handles whitespace-only path with workspace', () => {
    expect(resolveBoardPath('   ', workspacePath))
      .toBe(workspacePath)
  })

  it('throws on empty string path without workspace', () => {
    expect(() => resolveBoardPath('', null))
      .toThrow('Empty path provided')
  })
})
