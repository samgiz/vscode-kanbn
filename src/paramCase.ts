// Mirrors paramCase() in @basementuniverse/kanbn/src/utility.js, which can't be imported here because the module
// pulls in node-only dependencies that the webview bundle can't include. Keep the two in sync: task ids are
// derived from task names with this function.
export function paramCase (s: string): string {
  return s
    .replace(
      /([A-Z]+(.))/g,
      (_, separator: string, __, offset: number) => (offset > 0 ? '-' + separator : separator).toLowerCase()
    )
    .split(/[\s!?.,@:;|\\/"'`£$%^&*{}[\]()<>~#+\-=_¬]+/g)
    .join('-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}
