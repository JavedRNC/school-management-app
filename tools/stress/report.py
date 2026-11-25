"""Stress test, step 4: turn Locust's numbers into a short summary (printed, and added to the GitHub run page)."""
import csv
import os
import sys

from common import load_state


def main(prefix):
    st = load_state()
    rows = list(csv.DictReader(open(f"{prefix}_stats.csv")))
    fails = list(csv.DictReader(open(f"{prefix}_failures.csv"))) if os.path.exists(f"{prefix}_failures.csv") else []
    hist = list(csv.DictReader(open(f"{prefix}_stats_history.csv"))) if os.path.exists(f"{prefix}_stats_history.csv") else []
    total = next(r for r in rows if r["Name"] == "Aggregated")
    n, nf = int(total["Request Count"]), int(total["Failure Count"])
    fd = st["first_day"]
    peak_users = max((int(h["User Count"]) for h in hist), default=0)
    peak_rps = max((float(h["Requests/s"]) for h in hist), default=0)
    out = ["## Prangan stress test — 1500 people", "",
           f"Server: `{os.getenv('STRESS_API_URL', 'local')}` · run {st['run']}", "",
           "### First day (everyone signs in for the first time and chooses a password)", "",
           f"- {fd['ok']} of {fd['people']} people done in {fd['seconds'] // 60} min {fd['seconds'] % 60} s "
           f"(about {fd['per_minute']} people a minute, {fd['workers']} at a time)",
           f"- one person's sign-in + new password: median {fd['median_s']} s, slowest 5% over {fd['p95_s']} s",
           f"- failed: {fd['failed']}" + (f" — e.g. {fd['errors'][:3]}" if fd["failed"] else ""),
           f"- importing the school's 1499 people from Excel took {st['import_s']} s", "",
           "### Morning rush (all 1500 open the app within about 8 minutes and keep using it)", "",
           f"- people active at the peak: {peak_users}, requests at the peak: {peak_rps:.0f} a second",
           f"- requests: {n}, failed: {nf} ({(nf / n * 100 if n else 0):.1f}%)",
           f"- response time: median {total['50%']} ms, 95% under {total['95%']} ms, 99% under {total['99%']} ms, slowest {float(total['Max Response Time']):.0f} ms",
           "", "| Action | Requests | Failed | Median ms | 95% ms | 99% ms |", "|---|---|---|---|---|---|"]
    for r in sorted((r for r in rows if r["Name"] != "Aggregated"), key=lambda r: -float(r["95%"] or 0)):
        out.append(f"| {r['Type']} {r['Name']} | {r['Request Count']} | {r['Failure Count']} | {r['50%']} | {r['95%']} | {r['99%']} |")
    if fails:
        out += ["", "### Failures", "", "| Action | Error | Times |", "|---|---|---|"]
        for f in sorted(fails, key=lambda f: -int(f["Occurrences"]))[:15]:
            out.append(f"| {f['Method']} {f['Name']} | {f['Error'][:90]} | {f['Occurrences']} |")
    text = "\n".join(out) + "\n"
    print(text)
    if os.getenv("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(text)
    with open(f"{prefix}_summary.md", "w") as f:
        f.write(text)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "rush")
