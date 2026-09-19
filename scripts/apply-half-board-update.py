"""One-time source integration. Hashes prevent overwriting changed source or accepting a partial edit."""
from pathlib import Path
import hashlib
import json

manifest = json.loads(Path('.half-board-edits.json').read_text())
prepared = {}
for name, update in manifest.items():
    path = Path(name)
    if path.is_absolute() or '..' in path.parts:
        raise RuntimeError('Unsafe source path')
    source = path.read_text()
    if hashlib.sha256(source.encode()).hexdigest() != update['source']:
        raise RuntimeError('Source changed; review before applying: ' + name)
    for start, end, replacement in reversed(update['edits']):
        source = source[:start] + replacement + source[end:]
    if hashlib.sha256(source.encode()).hexdigest() != update['target']:
        raise RuntimeError('Patched source verification failed: ' + name)
    prepared[path] = source
for path, source in prepared.items():
    path.write_text(source)
    print('Verified source:', path)
Path('.half-board-edits.json').unlink()
Path('scripts/apply-half-board-update.py').unlink()
