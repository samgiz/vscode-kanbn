/**
 * @jest-environment node
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { Kanbn } from '@basementuniverse/kanbn/src/main'
import { listBoards } from '../ext-src/boards'

// A workspace in the layout kanbn documents for several boards: a main board (index.md), a second board (m8.md)
// that carries its own startedColumns and completedColumns, a markdown file that isn't a board, and tasks shared by
// both boards.
const MAIN_BOARD = '# Milestones\n\n## Backlog\n\n## In Progress\n\n- [m8](tasks/m8.md)\n\n## Done\n'
const M8_BOARD = [
  '---',
  'startedColumns:',
  "  - 'In Progress'",
  '  - Done',
  'completedColumns:',
  '  - Done',
  '---',
  '',
  '# M8 Users',
  '',
  '## Backlog',
  '',
  '- [m8-t01](tasks/m8-t01.md)',
  '- [m8-t02](tasks/m8-t02.md)',
  '',
  '## In Progress',
  '',
  '## Done',
  ''
].join('\n')
const task = (name: string): string => `# ${name}\n`

let root: string

function write (file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), content)
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-kanbn-'))
  write('.kanbn/index.md', MAIN_BOARD)
  write('.kanbn/m8.md', M8_BOARD)
  write('.kanbn/README.md', 'Notes that have no heading.\n')
  write('.kanbn/tasks/m8.md', task('M8'))
  write('.kanbn/tasks/m8-t01.md', task('M8 T01'))
  write('.kanbn/tasks/m8-t02.md', task('M8 T02'))
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('listBoards', () => {
  test('finds every markdown file with a heading and nothing else', async () => {
    const { boards } = await listBoards(new Kanbn(root))
    expect(boards.map(board => [board.slug, board.name, board.fileName, board.main])).toEqual([
      ['index', 'Milestones', 'index.md', true],
      ['m8', 'M8 Users', 'm8.md', false]
    ])
  })

  test('opens the board named by defaultBoard in kanbn.yml first', async () => {
    write('kanbn.yml', 'defaultBoard: m8\n')
    const { boards, defaultSlug, warning } = await listBoards(new Kanbn(root))
    expect(defaultSlug).toBe('m8')
    expect(warning).toBeUndefined()
    expect(boards.filter(board => board.isDefault).map(board => board.slug)).toEqual(['m8'])
  })

  test('opens the main board without a defaultBoard', async () => {
    const { defaultSlug, warning } = await listBoards(new Kanbn(root))
    expect(defaultSlug).toBe('index')
    expect(warning).toBeUndefined()
  })

  test('falls back to the main board, with a warning, when defaultBoard names no board', async () => {
    write('kanbn.yml', 'defaultBoard: m9\n')
    const { defaultSlug, warning } = await listBoards(new Kanbn(root))
    expect(defaultSlug).toBe('index')
    expect(warning).toContain('m9')
  })

  test('accepts the main board as the default', async () => {
    write('kanbn.yml', 'defaultBoard: index\n')
    const { boards, defaultSlug } = await listBoards(new Kanbn(root))
    expect(defaultSlug).toBe('index')
    expect(boards.find(board => board.isDefault)?.main).toBe(true)
  })

  test('ignores the KANBN_BOARD environment variable', async () => {
    write('kanbn.yml', 'defaultBoard: m8\n')
    process.env.KANBN_BOARD = 'index'
    try {
      expect((await listBoards(new Kanbn(root))).defaultSlug).toBe('m8')
    } finally {
      delete process.env.KANBN_BOARD
    }
  })

  test('sees an edit of kanbn.yml made after the config was first read', async () => {
    const kanbn = new Kanbn(root)
    write('kanbn.yml', 'defaultBoard: m8\n')
    expect((await listBoards(kanbn)).defaultSlug).toBe('m8')
    write('kanbn.yml', 'defaultBoard: index\n')
    expect((await listBoards(kanbn)).defaultSlug).toBe('index')
  })

  test('finds defaultBoard in the front matter of the main board when there is no config file', async () => {
    write('.kanbn/index.md', `---\ndefaultBoard: m8\n---\n\n${MAIN_BOARD}`)
    expect((await listBoards(new Kanbn(root))).defaultSlug).toBe('m8')
  })

  test('returns no boards for a folder that has none', async () => {
    fs.rmSync(path.join(root, '.kanbn'), { recursive: true })
    expect(await listBoards(new Kanbn(root))).toEqual({ boards: [], defaultSlug: null })
  })

  test('respects boards.exclude and boards.order from kanbn.yml', async () => {
    write('kanbn.yml', 'boards:\n  order:\n    - m8\n    - index\n')
    expect((await listBoards(new Kanbn(root))).boards.map(board => board.slug)).toEqual(['m8', 'index'])
    write('kanbn.yml', 'boards:\n  exclude:\n    - m8\n')
    expect((await listBoards(new Kanbn(root))).boards.map(board => board.slug)).toEqual(['index'])
  })
})

describe('per board settings', () => {
  test('startedColumns and completedColumns come from the front matter of the board', async () => {
    const kanbn = new Kanbn(root)
    const m8 = await kanbn.board('m8').getIndex()
    expect(m8.options.startedColumns).toEqual(['In Progress', 'Done'])
    expect(m8.options.completedColumns).toEqual(['Done'])
    const main = await kanbn.board('index').getIndex()
    expect(main.options.startedColumns).toBeUndefined()
    expect(main.options.completedColumns).toBeUndefined()
  })

  test('the status counts the tasks of the board it is asked on', async () => {
    const kanbn = new Kanbn(root)
    const m8 = await kanbn.board('m8').status(true)
    expect(m8).toMatchObject({ name: 'M8 Users', tasks: 2, columnTasks: { Backlog: 2, 'In Progress': 0, Done: 0 } })
    const main = await kanbn.board('index').status(true)
    expect(main).toMatchObject({ name: 'Milestones', tasks: 1, columnTasks: { Backlog: 0, 'In Progress': 1, Done: 0 } })
  })

  test('a task is added to the board the instance is scoped to and to no other', async () => {
    const kanbn = new Kanbn(root)
    await kanbn.board('m8').createTask({ name: 'M8 T03', description: '' }, 'Backlog')
    expect(Object.values((await kanbn.board('m8').getIndex()).columns).flat()).toContain('m8-t03')
    expect(Object.values((await kanbn.board('index').getIndex()).columns).flat()).not.toContain('m8-t03')
    expect(fs.existsSync(path.join(root, '.kanbn', 'tasks', 'm8-t03.md'))).toBe(true)
  })

  test('moving a card moves only its line in the board file and leaves the other board alone', async () => {
    await new Kanbn(root).board('m8').moveTask('m8-t01', 'In Progress')
    // The front matter keeps its key order and quoting, the card goes from one column to the other.
    expect(fs.readFileSync(path.join(root, '.kanbn', 'm8.md'), 'utf8')).toBe(
      M8_BOARD
        .replace('- [m8-t01](tasks/m8-t01.md)\n', '')
        .replace('## In Progress\n', '## In Progress\n\n- [m8-t01](tasks/m8-t01.md)\n')
    )
    expect(fs.readFileSync(path.join(root, '.kanbn', 'index.md'), 'utf8')).toBe(MAIN_BOARD)
    // The task records the move and, as the column is a started one, when it started.
    const moved = fs.readFileSync(path.join(root, '.kanbn', 'tasks', 'm8-t01.md'), 'utf8')
    expect(moved).toMatch(/^---\nupdated: .+\nstarted: .+\n---\n/)
    expect(moved).toContain('toColumn: In Progress')
    expect(moved).toContain('board: m8')
  })
})
