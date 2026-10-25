import * as vscode from 'vscode'
import * as path from 'path'
import KanbnStatusBarItem from './KanbnStatusBarItem'
import KanbnBoardPanel from './KanbnBoardPanel'
import KanbnBurndownPanel from './KanbnBurndownPanel'
import { Kanbn } from '@basementuniverse/kanbn/src/main'
import { listBoards } from './boards'
import * as fs from 'fs'

export async function activate (context: vscode.ExtensionContext): Promise<void> {
  const kanbnStatusBarItem: KanbnStatusBarItem = new KanbnStatusBarItem(context, null)
  // One entry per kanbn workspace folder (a folder holding .kanbn), keyed by its resolved path. The entry keeps the
  // board that is currently shown, which the panels, the status bar and the commands all work on.
  const boardCache = new Map<string, KanbnTuple>()
  class KanbnTuple {
    readonly root: Kanbn
    kanbn: Kanbn
    activeSlug: string | null = null
    kanbnBoardPanel: KanbnBoardPanel
    kanbnBurnDownPanel: KanbnBurndownPanel
    constructor (readonly boardLocation: string) {
      if (vscode.workspace.workspaceFolders == null) {
        throw new Error('A workspace folder should be open when creating Kanbn board panels')
      }
      this.root = new Kanbn(boardLocation)
      this.kanbn = this.root
      this.kanbnBurnDownPanel = KanbnBurndownPanel.create(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        this.kanbn,
        boardLocation)
      this.kanbnBoardPanel = new KanbnBoardPanel(
        context.extensionPath,
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        this.kanbn,
        boardLocation,
        this.kanbnBurnDownPanel)
    }

    // Make the default board the active one.
    async load (): Promise<void> {
      const { defaultSlug, warning } = await listBoards(this.root)
      if (warning !== undefined) {
        void vscode.window.showWarningMessage(`${path.basename(this.boardLocation)}: ${warning}`)
      }
      if (defaultSlug !== null) {
        this.switchBoard(defaultSlug)
      }
    }

    switchBoard (slug: string): void {
      this.activeSlug = slug
      this.kanbn = this.root.board(slug)
      this.kanbnBoardPanel.setKanbn(this.kanbn)
      this.kanbnBurnDownPanel.setKanbn(this.kanbn)
    }

    refresh (): void {
      // Kanbn memoises its config, so an edit of kanbn.yml or of the main board's front matter has to drop it.
      this.root.clearConfigCache()
      void kanbnStatusBarItem.update(this.kanbn)
      void this.kanbnBoardPanel.update()
      void this.kanbnBurnDownPanel.update()
    }
  }

  // Ask which workspace folder to work on. There is nothing to ask when there is only one.
  async function chooseBoard (): Promise<string | undefined> {
    await populating
    if (boardCache.size === 0) {
      void vscode.window.showErrorMessage(
        'No boards detected. Open a workspace with Kanbn boards or add Additional Boards to the global user configuration'
      )
      return
    }
    if (boardCache.size === 1) return [...boardCache.keys()][0]
    const items = [...boardCache.keys()].map(key => ({ label: path.basename(key), description: key, key }))
    const item = await vscode.window.showQuickPick(items, { placeHolder: 'Select a board to open', canPickMany: false })
    return item?.key
  }

  function watchBoards (kanbnTuple: KanbnTuple): void {
    const kanbnFolder = vscode.Uri.file(path.join(kanbnTuple.boardLocation, '.kanbn'))
    const boardWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(kanbnFolder, '**'))
    boardWatcher.onDidChange(() => { kanbnTuple.refresh() })
    // The workspace config (defaultBoard, boards.order, ...) sits next to the kanbn folder, not inside it.
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(kanbnTuple.boardLocation), 'kanbn.{yml,json}')
    )
    configWatcher.onDidChange(() => { kanbnTuple.refresh() })
    configWatcher.onDidCreate(() => { kanbnTuple.refresh() })
    configWatcher.onDidDelete(() => { kanbnTuple.refresh() })
    context.subscriptions.push(boardWatcher, configWatcher)
  }

  async function findBoardLocations (): Promise<Set<string>> {
    const boardLocations = new Set<string>()

    // Get globally accessible board locations.
    vscode.workspace.getConfiguration('kanbn', null).get<string[]>('additionalBoards')?.forEach(boardLocation => {
      boardLocations.add(path.resolve(boardLocation))
    })

    // Get standard board locations.
    for (const workspaceFolder of vscode.workspace.workspaceFolders ?? []) {
      // Get workspace specific board locations.
      vscode.workspace.getConfiguration('kanbn', workspaceFolder.uri).get<string[]>('additionalBoards')?.forEach(boardLocation => {
        boardLocations.add(path.resolve(boardLocation))
      })

      // For backwards compatibility, check the old kanbn directory (which is just the current workspace directory).
      const oldKanbnPath = `${workspaceFolder.uri.fsPath}`
      if (fs.existsSync(`${oldKanbnPath}/.kanbn`)) {
        boardLocations.add(path.resolve(oldKanbnPath))
      }
      // Populate boards in the standard workspace location.
      const kanbnPath = `${workspaceFolder.uri.fsPath}/.kanbn_boards`
      if (fs.existsSync(kanbnPath)) {
        for (const kanbnBoardPath of fs.readdirSync(kanbnPath)) {
          boardLocations.add(path.resolve(`${kanbnPath}/${kanbnBoardPath}`))
        }
      }
    }
    return boardLocations
  }

  // Runs are chained so that overlapping triggers (start-up, configuration changes) don't race.
  let populating: Promise<void> = Promise.resolve()
  function populateBoardCache (): void {
    populating = populating.then(async () => {
      for (const boardLocation of await findBoardLocations()) {
        if (boardCache.has(boardLocation)) continue
        const kanbnTuple = new KanbnTuple(boardLocation)
        await kanbnTuple.load()
        boardCache.set(boardLocation, kanbnTuple)
        watchBoards(kanbnTuple)
      }
      // Show the active board of the first workspace folder in the status bar.
      const first = [...boardCache.values()][0]
      if (first !== undefined) void kanbnStatusBarItem.update(first.kanbn)
    }).catch(e => {
      void vscode.window.showErrorMessage(`Unable to detect Kanbn boards: ${(e as Error).message}`)
    })
  }
  populateBoardCache()

  // Register a command to initialise Kanbn in the current workspace. This command will be invoked when the status
  // bar item is clicked in a workspace where Kanbn isn't already initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.createBoard', async () => {
      // If no workspace folder is opened, we can't initialise kanbn
      if (vscode.workspace.workspaceFolders === undefined) {
        void vscode.window.showErrorMessage('You need to open a workspace before initialising Kanbn.')
        return
      }
      // Prompt for a new project name
      const getNewBoardName = (): Thenable<string | undefined> => {
        const newBoardName = vscode.window.showInputBox({
          placeHolder: 'The project name.',
          validateInput: (text) => {
            return text.length < 1 ? 'The project name cannot be empty.' : null
          }
        })
        return newBoardName
      }
      let boardName = await getNewBoardName()
      let kanbnTuple: KanbnTuple
      // If the input prompt wasn't cancelled, initialise kanbn
      while (boardName !== undefined) {
        const boardLocation: string = `${vscode.workspace.workspaceFolders[0].uri.fsPath}/.kanbn_boards/${boardName}`
        if (fs.existsSync(boardLocation)) {
          void vscode.window.showErrorMessage('A board with that name already exists. Pick a different name.')
          boardName = await getNewBoardName()
          continue
        }
        fs.mkdirSync(boardLocation, { recursive: true })
        kanbnTuple = new KanbnTuple(boardLocation)
        await kanbnTuple.kanbn.initialise({
          name: boardName
        })
        await kanbnTuple.load()
        boardCache.set(path.resolve(boardLocation), kanbnTuple)
        watchBoards(kanbnTuple)
        void vscode.window.showInformationMessage(`Created Kanbn board '${boardLocation}'.`)
        break
      }
    })
  )

  // Register a command to open the kanbn board. This command will be invoked when the status bar item is clicked
  // in a workspace where kanbn has already been initialised.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.openBoard', async () => {
      const board = await chooseBoard()
      if (board === undefined) { return }

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // If kanbn is initialised, view the kanbn board
      void kanbnTuple.kanbnBoardPanel.show()
      void kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to switch the board that is shown. The board is switched in the open panel, so there is
  // one QuickPick over the boards of every workspace folder.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.switchBoard', async () => {
      await populating
      type BoardItem = vscode.QuickPickItem & { location?: string, slug?: string }
      const items: BoardItem[] = []
      for (const [location, kanbnTuple] of boardCache) {
        const { boards } = await listBoards(kanbnTuple.root)
        if (boards.length === 0) continue
        if (boardCache.size > 1) {
          items.push({ kind: vscode.QuickPickItemKind.Separator, label: path.basename(location) })
        }
        for (const board of boards) {
          const marks = [board.slug === kanbnTuple.activeSlug ? 'Active' : '', board.isDefault ? 'Default' : '']
          items.push({
            label: board.name,
            description: board.fileName,
            detail: marks.filter(mark => mark !== '').join(', ') || undefined,
            location,
            slug: board.slug
          })
        }
      }
      if (items.length === 0) {
        void vscode.window.showErrorMessage(
          'No boards detected. Open a workspace with Kanbn boards or add Additional Boards to the global user configuration'
        )
        return
      }
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Select a board to switch to', canPickMany: false })
      if (picked?.location === undefined || picked.slug === undefined) return
      const kanbnTuple = boardCache.get(picked.location)
      if (kanbnTuple === undefined) return
      kanbnTuple.switchBoard(picked.slug)
      void kanbnTuple.kanbnBoardPanel.show()
      void kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to add a new kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.addTask', async () => {
      // Choose board to add task to
      const board = await chooseBoard()
      if (board === undefined) return

      // Set the node process directory and import kanbn
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      // Open the task webview
      kanbnTuple.kanbnBoardPanel.showTaskPanel(null)
    })
  )

  // Register a command to open an existing kanbn task.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.openTask', async () => {
      // If no workspace folder is opened, we can't open a task
      if (vscode.workspace.workspaceFolders === undefined) {
        void vscode.window.showErrorMessage('You need to open a workspace before opening a task.')
        return
      }

      // Choose board to open a task from
      const board = await chooseBoard()
      if (board === undefined) return

      // Set the node process directory and import kanbn
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) { return }

      const index = await kanbnTuple.kanbn.getIndex()
      const startedColumns: string[] = index.options?.startedColumns ?? []
      const completedColumns: string[] = index.options?.completedColumns ?? []
      const otherColumns: string[] = Object.keys(index.columns).filter(c => !(startedColumns?.includes(c) || completedColumns?.includes(c)))

      const tasksByColumns = await Promise.all([...startedColumns, ...otherColumns, ...completedColumns]
        .map(async columnName => ({
          columnName,
          tasks: await Promise.all(index.columns[columnName].map(async taskId => await kanbnTuple.kanbn.getTask(taskId)))
        })))

      // Create QuickPickItems for each task mangled with separators for each column
      const quickPickItems: vscode.QuickPickItem[] = tasksByColumns.flatMap(column => [
        {
          kind: vscode.QuickPickItemKind.Separator,
          label: column.columnName
        },
        ...column.tasks.map(task => ({
          label: task.name,
          detail: task.id
        }))])

      // Show QuickPick
      const qp = await vscode.window.showQuickPick(quickPickItems)
      if (qp?.detail !== undefined) {
        // Open the task webview
        kanbnTuple.kanbnBoardPanel.showTaskPanel(qp?.detail)
      }
    })
  )

  // Register a command to open a burndown chart.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.burndown', async () => {
      const board = await chooseBoard()
      if (board === undefined) return

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // If kanbn is initialised, view the burndown chart
      kanbnTuple.kanbnBurnDownPanel.show()
      void kanbnTuple.kanbnBurnDownPanel.update()
      void kanbnStatusBarItem.update(kanbnTuple.kanbn)
    })
  )

  // Register a command to archive tasks.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.archiveTasks', async () => {
      const board = await chooseBoard()
      if (board === undefined) return

      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // Get a list of tracked tasks
      let tasks: string[] = []
      try {
        tasks = [...await kanbnTuple.kanbn.findTrackedTasks()]
      } catch (e) {}
      if (tasks.length === 0) {
        void vscode.window.showInformationMessage('There are no tasks to archive.')
        return
      }

      // Prompt for a selection of tasks to archive
      const archiveTaskIds = await vscode.window.showQuickPick(
        tasks,
        {
          placeHolder: 'Select tasks to archive...',
          canPickMany: true
        }
      )
      if (archiveTaskIds !== undefined && archiveTaskIds.length > 0) {
        for (const archiveTaskId of archiveTaskIds) {
          void kanbnTuple.kanbn.archiveTask(archiveTaskId)
        }
        void kanbnTuple.kanbnBoardPanel.update()
        void kanbnStatusBarItem.update(kanbnTuple.kanbn)
        if (vscode.workspace.getConfiguration('kanbn').get<boolean>('showTaskNotifications') === true) {
          void vscode.window.showInformationMessage(
            `Archived ${archiveTaskIds.length} task${archiveTaskIds.length === 1 ? '' : 's'}.`
          )
        }
      }
    })
  )

  // Register a command to restore a task from the archive.
  context.subscriptions.push(
    vscode.commands.registerCommand('kanbn.restoreTasks', async () => {
      const board = await chooseBoard()
      if (board === undefined) return
      const kanbnTuple = boardCache.get(board)
      if (kanbnTuple === undefined) return

      // Get a list of archived tasks
      let archivedTasks: string[] = []
      try {
        archivedTasks = await kanbnTuple.kanbn.listArchivedTasks()
      } catch (e) {}
      if (archivedTasks.length === 0) {
        void vscode.window.showInformationMessage('There are no archived tasks to restore.')
        return
      }

      // Prompt for a selection of tasks to restore
      const restoreTaskIds = await vscode.window.showQuickPick(
        archivedTasks,
        {
          placeHolder: 'Select tasks to restore...',
          canPickMany: true
        }
      )
      if (restoreTaskIds !== undefined && restoreTaskIds.length > 0) {
        // Load index
        const index = await kanbnTuple.kanbn.getIndex()

        // Prompt for a column to restore the tasks into
        const restoreColumn = await vscode.window.showQuickPick(
          [
            'None (use original)',
            ...Object.keys(index.columns)
          ],
          {
            canPickMany: false
          }
        )
        if (restoreColumn !== undefined) {
          for (const restoreTaskId of restoreTaskIds) {
            await kanbnTuple.kanbn.restoreTask(restoreTaskId, restoreColumn === 'None (use original)' ? null : restoreColumn)
          }
          void kanbnTuple.kanbnBoardPanel.update()
          void kanbnStatusBarItem.update(kanbnTuple.kanbn)
          if (vscode.workspace.getConfiguration('kanbn').get('showTaskNotifications') === true) {
            void vscode.window.showInformationMessage(
              `Restored ${restoreTaskIds.length} task${restoreTaskIds.length === 1 ? '' : 's'}.`
            )
          }
        }
      }
    })
  )

  // Handle configuration changes.
  vscode.workspace.onDidChangeConfiguration((e) => {
    populateBoardCache()
    // Update all board panels in case we need to show/hide certain buttons.
    for (const [, kanbnTuple] of boardCache) {
      void kanbnTuple.kanbnBoardPanel.update()
    }
  })
}
