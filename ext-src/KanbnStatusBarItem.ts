import * as vscode from 'vscode';

export default class KanbnStatusBarItem {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _kanbn: typeof import('@basementuniverse/kanbn/src/main');

  constructor(
    context: vscode.ExtensionContext,
    kanbn: typeof import('@basementuniverse/kanbn/src/main')
  ) {
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
    context.subscriptions.push(this._statusBarItem);
    this._kanbn = kanbn;
  }

  async update(): Promise<void> {
    if (this._statusBarItem === undefined) {
      return;
    }
    if (await this._kanbn.initialised()) {
      const status = await this._kanbn.status(true);
      const text = [
        `$(project) ${status.tasks}`
      ];
      const tooltip = [
        `${status.tasks} task${status.tasks === 1 ? '' : 's'}`
      ];
      if ('startedTasks' in status) {
        text.push(`$(play) ${status.startedTasks}`);
        tooltip.push(`${status.startedTasks} started task${status.startedTasks === 1 ? '' : 's'}`);
      }
      if ('completedTasks' in status) {
        text.push(`$(check) ${status.completedTasks}`);
        tooltip.push(`${status.completedTasks} completed task${status.completedTasks === 1 ? '' : 's'}`);
      }
      this._statusBarItem.text = text.join(' ');
      this._statusBarItem.tooltip = tooltip.join('\n');
      this._statusBarItem.command = 'kanbn.board';
    } else {
      this._statusBarItem.text = '$(project) Not initialised';
      this._statusBarItem.tooltip = 'Click to initialise';
      this._statusBarItem.command = 'kanbn.init';
    }
    this._statusBarItem.show();
  }
}