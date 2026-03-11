import * as path from 'path'

jest.mock('path', () => {
  const win32 = jest.requireActual<typeof path>('path').win32
  return {
    ...win32,
    default: win32
  }
})

jest.mock('os', () => ({
  homedir: () => 'C:\\Users\\testuser'
}))

import { resolveBoardPath } from '../pathUtils'

describe('resolveBoardPath (win32)', () => {
  const workspacePath = 'C:\\Users\\testuser\\projects\\myproject'

  it('resolves relative path against workspace folder', () => {
    expect(resolveBoardPath(workspacePath, 'boards\\my-board'))
      .toBe('C:\\Users\\testuser\\projects\\myproject\\boards\\my-board')
  })

  it('resolves forward-slash relative path', () => {
    expect(resolveBoardPath(workspacePath, 'boards/my-board'))
      .toBe('C:\\Users\\testuser\\projects\\myproject\\boards\\my-board')
  })

  it('preserves absolute paths unchanged', () => {
    expect(resolveBoardPath(workspacePath, 'D:\\absolute\\path\\board'))
      .toBe('D:\\absolute\\path\\board')
  })

  it('expands tilde to home directory', () => {
    expect(resolveBoardPath(workspacePath, '~/my-boards/main'))
      .toBe('C:\\Users\\testuser\\my-boards\\main')
  })

  it('handles parent directory traversal', () => {
    expect(resolveBoardPath(workspacePath, '..\\other-boards\\main'))
      .toBe('C:\\Users\\testuser\\projects\\other-boards\\main')
  })

  it('handles null basePath for global config with relative path', () => {
    expect(() => resolveBoardPath(null, 'relative\\path'))
      .toThrow('Relative path "relative\\path" cannot be used in global settings')
  })

  it('handles null basePath for global config with absolute path', () => {
    expect(resolveBoardPath(null, 'C:\\absolute\\path\\board'))
      .toBe('C:\\absolute\\path\\board')
  })

  it('handles null basePath for global config with tilde path', () => {
    expect(resolveBoardPath(null, '~/my-boards/main'))
      .toBe('C:\\Users\\testuser\\my-boards\\main')
  })

  it('throws on empty string path', () => {
    expect(() => resolveBoardPath(workspacePath, ''))
      .toThrow('Empty path provided')
  })

  it('throws on whitespace-only path', () => {
    expect(() => resolveBoardPath(workspacePath, '   '))
      .toThrow('Empty path provided')
  })
})
