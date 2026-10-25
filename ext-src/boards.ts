import * as path from 'path'
import { Kanbn } from '@basementuniverse/kanbn/src/main'

export interface BoardInfo {
  slug: string
  // The board's H1 heading.
  name: string
  // The board's markdown file, e.g. m8.md.
  fileName: string
  main: boolean
  isDefault: boolean
}

export interface BoardList {
  boards: BoardInfo[]
  // The slug of the board to open first.
  defaultSlug: string | null
  // Set when defaultBoard names a board that doesn't exist, in which case the main board is used.
  warning?: string
}

/**
 * Find the boards of a kanbn workspace and the one to open first.
 *
 * Boards are found by kanbn itself: every markdown file with an H1 heading directly inside the kanbn folder.
 * The default board is the `defaultBoard` workspace option (kanbn.yml, kanbn.json or the main board's front matter).
 * Without it, or when it names a board that doesn't exist, it is the main board. The KANBN_BOARD environment
 * variable that the command line honours is deliberately ignored: this runs inside the editor's process.
 */
export async function listBoards (kanbn: Kanbn): Promise<BoardList> {
  // Kanbn memoises its config, which would hide edits to kanbn.yml made while the editor is running.
  kanbn.clearConfigCache()
  const found = await kanbn.listBoards()
  if (found.length === 0) {
    return { boards: [], defaultSlug: null }
  }

  const configured = (await kanbn.getWorkspaceOptions()).defaultBoard
  const requested = (typeof configured === 'string' || typeof configured === 'number') ? String(configured).trim() : ''
  const main = found.find(board => board.main) ?? found[0]
  let defaultSlug = main.slug
  let warning: string | undefined
  if (requested !== '') {
    if (found.some(board => board.slug === requested)) {
      defaultSlug = requested
    } else {
      warning = `The default board '${requested}' doesn't exist, opening '${main.slug}' instead.`
    }
  }

  return {
    boards: found.map(board => ({
      slug: board.slug,
      name: board.name,
      fileName: path.basename(board.path),
      main: board.main,
      isDefault: board.slug === defaultSlug
    })),
    defaultSlug,
    warning
  }
}
