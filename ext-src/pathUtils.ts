import * as path from 'path'
import * as os from 'os'

export function resolveBoardPath(
  boardPath: string,
  basePath: string | null
): string {
  if (!boardPath || boardPath.trim() === '') {
    if (basePath) {
      return basePath
    }
    throw new Error('Empty path provided')
  }

  let expandedPath = boardPath
  if (expandedPath.startsWith('~')) {
    expandedPath = path.join(os.homedir(), expandedPath.slice(1))
  }

  if (path.isAbsolute(expandedPath)) {
    return path.normalize(expandedPath)
  }

  if (basePath === null) {
    throw new Error(
      `Relative path "${boardPath}" cannot be used in global settings. ` +
      `Use an absolute path or ~/ for home directory.`
    )
  }

  return path.normalize(path.resolve(basePath, expandedPath))
}
