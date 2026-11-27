# dsh-paste-dock

See [README.md](README.md) (Chinese, canonical) and
[README.pt.md](README.pt.md) (Portuguese).

## Paste directory and automatic cleanup (since 0.1.27)

The default is still the workspace `pastes/` — behavior unchanged. Two new knobs
let you move it or give it a retention window:

| Field        | Default | Meaning                                                                                                                                                                                                         |
| ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pasteDir`   | `''`    | empty = workspace `pastes/`; relative = a subdirectory of the workspace (e.g. `scratch/pastes`); absolute = a directory outside it (e.g. `/tmp/dsh-pastes`). A `..` escape is an error, never a silent redirect |
| `retainDays` | `0`     | automatic cleanup window in days. `0` = never delete (default); ceiling 3650. Runs after a successful save                                                                                                      |

The prune scope is deliberately narrow: **only this plugin's own**
`YYYYMMDD-HHMMSSmmm[-label].txt`, only that one directory (never recursive); your
own files in the same directory are never touched.

Inside the workspace the reference stays relative (`pastes/x.txt`); when pastes
land outside it the reference becomes **absolute** — dsh'S `@` grammar resolves
relative paths from the workspace root and treats absolute paths as host files.

If `pastes/` shows up as `?? pastes/` in `git status`, pick one:

```bash
# 1) keep it out of the repo
echo 'pastes/' >> .gitignore

# 2) ignore it only on this machine (repo .gitignore untouched)
echo 'pastes/' >> .git/info/exclude

# 3) point pasteDir outside the workspace
# cordis.patch.yml → pasteDir: 'C:/temp/dsh-pastes'
```

## Not intercepting: the raw-paste exits (since 0.1.28)

Two independent exits:

| How                        | Scope                            | Usage                                                                                                                                                                                     |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alwaysRaw: true`          | global until set back to `false` | set `alwaysRaw: true` in `cordis.patch.yml` and restart dsh. The plugin then intercepts **no** paste at all: no file, no chip, no dock card — the content goes straight into the composer |
| hold `Shift` while pasting | this paste only                  | no config change. The next paste is intercepted again                                                                                                                                     |

`alwaysRaw` defaults to `false`, i.e. byte-for-byte the 0.1.27 behaviour. It is
plain config (not volatile): a deployment decision, not something to flip by
accident from a row.
