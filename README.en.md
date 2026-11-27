# dsh-paste-dock

See [README.md](README.md) (Chinese, canonical) and
[README.pt.md](README.pt.md) (Portuguese).

## Paste directory and automatic cleanup (since 0.1.27)

The default is still the workspace `pastes/` — behavior unchanged. Two new knobs
let you move it or give it a retention window:

| Field | Default | Meaning |
| --- | --- | --- |
| `pasteDir` | `''` | empty = workspace `pastes/`; relative = a subdirectory of the workspace (e.g. `scratch/pastes`); absolute = a directory outside it (e.g. `/tmp/dsh-pastes`). A `..` escape is an error, never a silent redirect |
| `retainDays` | `0` | automatic cleanup window in days. `0` = never delete (default); ceiling 3650. Runs after a successful save |

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
