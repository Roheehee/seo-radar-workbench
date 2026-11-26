"""Create a safe free-mode configuration for a fresh checkout."""
from pathlib import Path


def ensure_config(root: Path):
    destination = root / 'config.json'
    if destination.exists():
        return
    template = (root / 'config.free.example.json').read_text(encoding='utf-8')
    try:
        with destination.open('x', encoding='utf-8') as handle:
            handle.write(template)
    except FileExistsError:
        pass
