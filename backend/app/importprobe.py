"""Trial-parse an uploaded workbook in a separate process that is not allowed to grow past a fixed amount of memory.

Run as `python -m app.importprobe` with the workbook bytes on stdin. Whatever a crafted file does to the parser, it can
only kill this child — never the API process that serves every school. Exit codes: 0 parsed · 4 refused (reason as JSON
on stdout) · anything else = too big or crashed."""
import json
import os
import sys


def main() -> int:
    limit = int(os.environ.get("IMPORT_PROBE_MB", "280")) * 1024 * 1024
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_DATA, (limit, limit))        # heap + private mappings (Linux)
        resource.setrlimit(resource.RLIMIT_CPU, (150, 160))             # seconds of processor time
    except Exception:  # noqa: BLE001 — not available on this platform: the pre-checks still apply
        pass
    data = sys.stdin.buffer.read()
    os.environ["IMPORT_PROBE"] = "0"                                    # the child parses directly
    from fastapi import HTTPException

    from . import auth
    auth.SECRET = os.environ.get("IMPORT_PROBE_KEY") or "probe-" + "0" * 40
    from .dataimport import Book
    try:
        Book(data)
    except HTTPException as e:
        sys.stdout.write(json.dumps({"status": e.status_code, "detail": e.detail}))
        return 4
    except MemoryError:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
