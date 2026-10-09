import { Dialog } from './Dialog'

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
const alt = isMac ? '⌥' : 'Alt'
const mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUTS: [string, string[]][] = [
  ['Play / pause', [alt, 'K']],
  ['Back 10 seconds', [alt, 'J']],
  ['Forward 10 seconds', [alt, 'L']],
  ['Insert timestamp at cursor', [alt, 'T']],
  ['Start / end a clip', [alt, 'C']],
  ['Play the timestamp under the cursor', [mod, 'Enter']],
  ['Open a regular link in the notes', [mod, 'Click']],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} title="Keyboard shortcuts" onClose={onClose}>
      <p>These work even while you’re typing in the notes.</p>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([label, keys]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && ' + '}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="field-hint">Click any timestamp in your notes to jump the video there. Clips play their range and then pause.</p>
    </Dialog>
  )
}
