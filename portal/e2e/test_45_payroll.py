"""Principal: payroll — a salary, the month's payroll, a change for this month, locking, paying, the payslip, undoing a payment."""
import re

from conftest import SCHOOL_CODE, TAG, TEACHER_PW, TODAY, call, login, ok
from helpers import confirm, dialog, go, heading, tab, toast

MONTH = TODAY.strftime("%B %Y")
THIS = TODAY.strftime("%Y-%m")


def teacher_token(n=0):
    """The teacher's own sign-in from the phone app (first time: choose a password and accept the notice)."""
    code = f"T{TAG}{('One', 'Two')[n]}"
    first = login(SCHOOL_CODE, code, TEACHER_PW, web=False)
    if first[0] == 200:
        token = ok(call("POST", "/auth/password", first[1]["token"], {"old_password": TEACHER_PW, "new_password": TEACHER_PW + "2"}))["token"]
        call("POST", "/auth/consent", token)
        return token
    return ok(login(SCHOOL_CODE, code, TEACHER_PW + "2", web=False))["token"]


def open_payroll(page, section=None):
    go(page, "/school/payroll")
    heading(page, "Payroll")
    if section:
        tab(page, section)


def test_salary_form_checks_what_is_typed_and_saves(principal_page, school, seeded):
    page = principal_page
    name = f"Teacher One {TAG}"
    open_payroll(page, "Salaries")
    page.get_by_label("Find a person").fill(name)
    row = page.locator("tr", has_text=name)
    row.get_by_text("No salary set").wait_for()
    row.get_by_role("button", name=f"Set salary for {name}").click()
    box = dialog(page)
    box.get_by_label("Basic pay a month (₹)").fill("25000")
    box.get_by_role("button", name="Add an allowance").click()
    box.get_by_label("Allowance 1 name").fill("House rent")
    box.get_by_role("alert").filter(has_text="Enter an amount above 0 for “House rent”").wait_for()
    assert box.get_by_role("button", name="Save salary").is_disabled()
    box.get_by_label("Amount (₹)").first.fill("5000")
    box.get_by_role("button", name="Add a deduction").click()
    box.get_by_label("Deduction 1 name").fill("Provident fund")
    box.get_by_label("Amount (₹)").nth(1).fill("90000")
    box.get_by_role("alert").filter(has_text="Deductions can't be more than the pay").wait_for()
    box.get_by_label("Amount (₹)").nth(1).fill("3000")
    box.get_by_text("₹27,000", exact=True).wait_for()                      # net pay a month, worked out as you type
    box.get_by_role("button", name="Save salary").click()
    toast(page, f"Salary saved for {name}")
    row.get_by_text("₹27,000", exact=True).wait_for()
    saved = {r["login_id"]: r for r in ok(call("GET", "/payroll/staff", school["principal"]["token"]))["rows"]}[f"T{TAG}One"]["salary"]
    assert saved["basic"] == 25000 and saved["gross"] == 30000 and saved["net"] == 27000


def test_a_month_of_payroll_from_preparing_to_paying(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    name = f"Teacher One {TAG}"
    staff = {r["login_id"]: r for r in ok(call("GET", "/payroll/staff", t))["rows"]}
    ok(call("PUT", f"/payroll/staff/{staff[f'T{TAG}One']['user_id']}", t, {"basic": 25000, "allowances": [{"name": "House rent", "amount": 5000}],
                                                                              "deductions": [{"name": "Provident fund", "amount": 3000}]}))
    ok(call("PUT", f"/payroll/staff/{staff[f'T{TAG}Two']['user_id']}", t, {"basic": 20000}))
    tt = teacher_token()
    open_payroll(page)
    page.get_by_role("button", name="Prepare payroll").click()
    toast(page, f"Payroll for {MONTH} is ready to check")
    heading(page, f"Payroll · {MONTH}")
    row = page.locator("tr", has_text=name)
    row.get_by_text("₹27,000", exact=True).wait_for()
    assert not [p for p in ok(call("GET", "/payroll/me", tt))["payslips"] if p["month"] == THIS], "a teacher saw a payslip that is still a draft"

    # something for this month only
    row.get_by_role("button", name=f"Edit {name}'s payslip").click()
    box = dialog(page)
    box.get_by_role("button", name="Add an extra payment").click()
    box.get_by_label("Extra payment 1 name").fill("Exam duty")
    box.get_by_label("Amount (₹)").first.fill("1000")
    box.get_by_label("Unpaid days").fill("1.3")
    box.get_by_role("alert").filter(has_text="Use whole or half days").wait_for()
    assert box.get_by_role("button", name="Save payslip").is_disabled()
    box.get_by_label("Unpaid days").fill("0")
    box.get_by_role("button", name="Save payslip").click()
    toast(page, "Payslip saved")
    row.get_by_text("₹28,000", exact=True).wait_for()

    # lock it: numbers are given and the teacher can see the payslip
    page.get_by_role("button", name="Lock payroll").click()
    confirm(page, "Lock payroll")
    toast(page, "Payroll locked")
    row.get_by_text("Not paid").wait_for()
    page.get_by_role("button", name="Lock payroll").wait_for(state="detached")
    mine = [p for p in ok(call("GET", "/payroll/me", tt))["payslips"] if p["month"] == THIS]
    assert len(mine) == 1 and mine[0]["net"] == 28000 and mine[0]["slip_no"] and mine[0]["status"] == "unpaid"

    # pay one person, then everyone else
    row.get_by_role("button", name=f"Mark {name} as paid").click()
    box = dialog(page)
    box.get_by_label("Paid by").select_option("upi")
    box.get_by_label("Reference (optional)").fill(f"UTR{TAG}")
    box.get_by_role("button", name="Mark as paid").click()
    toast(page, f"{name}'s salary marked as paid")
    row.get_by_text(re.compile("^Paid ")).wait_for()
    everyone = re.compile(r"^(Mark 1 salary as paid|Mark all \d+ as paid)$")       # people left from an earlier run may be in this month too
    page.get_by_role("button", name=everyone).click()
    dialog(page).get_by_role("button", name="Mark as paid").click()
    toast(page, re.compile(r"\d+ salar(y|ies) marked as paid"))
    page.get_by_role("button", name=everyone).wait_for(state="detached")
    page.get_by_role("button", name="Reopen").wait_for(state="detached")          # a paid month can't be reopened
    detail = {p["login_id"]: p for p in ok(call("GET", f"/payroll/runs/{mine[0]['run_id']}", t))["payslips"]}
    assert detail[f"T{TAG}One"]["mode"] == "upi" and detail[f"T{TAG}One"]["reference"] == f"UTR{TAG}", "paying everyone overwrote the first payment"
    assert all(p["status"] == "paid" for p in detail.values())

    # the payslip reads right, and undoing a payment needs a reason
    row.get_by_role("button", name=f"Open {name}'s payslip").click()
    box = dialog(page)
    slip = box.locator("#payslip")
    for text in ("E2E Test School", f"Payslip for {MONTH}", "Basic pay", "House rent", "Exam duty", "Provident fund", "Net pay: ₹28,000", f"UTR{TAG}"):
        slip.get_by_text(text).first.wait_for()
    box.get_by_role("button", name="Undo payment").click()
    ask = dialog(page)
    assert ask.get_by_role("button", name="Undo payment").is_disabled(), "undoing a payment needs a reason"
    ask.get_by_label("Reason").fill("Paid to the wrong account")
    ask.get_by_role("button", name="Undo payment").click()
    toast(page, "Payment undone")
    row.get_by_text("Not paid").wait_for()
    log = ok(call("GET", "/school/audit", t))
    assert any(x["action"] == "payroll.payment_undone" and "Paid to the wrong account" in x["detail"] for x in log)

    # back on the list the month shows what is still to pay
    page.get_by_role("link", name="← All months").click()
    heading(page, "Payroll")
    page.locator("tr", has_text=MONTH).get_by_text("1 unpaid").wait_for()
    assert page.get_by_role("button", name="Prepare payroll").is_disabled(), "a second payroll for the same month was offered"


def test_payroll_settings_save(principal_page, school, seeded):
    page = principal_page
    open_payroll(page, "Settings")
    prefix = page.get_by_label("Starts with")
    prefix.fill("has space")
    page.get_by_text("Use up to 12 letters, numbers, - or /").wait_for()
    assert page.get_by_role("button", name="Save settings").is_disabled()
    prefix.fill("e2e-pay")
    page.get_by_label("One day's pay is").select_option("working")
    page.get_by_role("button", name="Save settings").click()
    toast(page, "Payroll settings saved")
    saved = ok(call("GET", "/payroll/config", school["principal"]["token"]))
    assert saved["slip_prefix"] == "E2E-PAY" and saved["lop_basis"] == "working"
