"""Wait until the deployed TEST environment is running the given commit (used by the QA workflow before the browser tests).

    python portal/e2e/wait_for_deploy.py <commit sha>

The API reports its commit at "/", the portal at "/version.json". A part whose files did not change between the commit it is
running and the wanted commit is not rebuilt by Render, so that also counts as ready.
"""
import json
import re
import os
import subprocess
import sys
import time
import urllib.request

WANT = sys.argv[1]
API = os.environ["E2E_API_URL"].rstrip("/")
WEB = os.environ["E2E_WEB_URL"].rstrip("/")
MINUTES = int(os.getenv("DEPLOY_WAIT_MINUTES", "25"))
PARTS = [("API", API + "/", "backend"), ("Portal", WEB + "/version.json", "portal")]


def running(url):
    try:
        req = urllib.request.Request(url + ("&" if "?" in url else "?") + f"t={int(time.time())}", headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=30) as r:
            commit = str(json.loads(r.read()).get("commit") or "")
            return commit if re.fullmatch(r"[0-9a-f]{7,40}", commit) else ""      # only a commit id is ever passed to git
    except Exception:  # noqa: BLE001  (asleep, mid-deploy, or an older build without the stamp)
        return ""


def same_files(commit, folder):
    """True when nothing under `folder` differs between the running commit and the wanted one."""
    done = subprocess.run(["git", "diff", "--quiet", commit, WANT, "--", folder], capture_output=True)
    return done.returncode == 0


end = time.time() + MINUTES * 60
waiting = {name for name, _, _ in PARTS}
while waiting and time.time() < end:
    for name, url, folder in PARTS:
        if name not in waiting:
            continue
        commit = running(url)
        if commit and (WANT.startswith(commit) or same_files(commit, folder)):
            print(f"{name}: ready (running {commit})")
            waiting.discard(name)
        else:
            print(f"{name}: not yet (running {commit or 'unknown'})")
    if waiting:
        time.sleep(20)
if waiting:
    print(f"::error title=TEST is not running this commit::{', '.join(sorted(waiting))} did not reach {WANT[:12]} within {MINUTES} minutes. Check the deploy on Render.")
    sys.exit(1)
