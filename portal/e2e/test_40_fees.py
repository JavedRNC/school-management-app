"""Principal: fees — setup, charges, collecting with a receipt, cancelling a receipt, one-time charges, UPI payments to check."""
import pytest
import datetime as dt
import random
import re

from conftest import PARENT_PW, SCHOOL_CODE, TAG, TODAY, call, login, ok
from helpers import confirm, dialog, go, heading, tab, toast


def open_student(page, name):
    go(page, "/school/fees")
    heading(page, "Fees")
    tab(page, "Students & dues")
    page.get_by_label("Search").fill(name)
    page.get_by_role("link", name=name).click()
    return dialog(page)


@pytest.mark.tc("TC-P-022", "Fee setup is checked and saved")
@pytest.mark.sanity
@pytest.mark.regression
def test_fee_setup_validates_and_saves(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/fees")
    tab(page, "Fee setup")
    upi = page.get_by_label("School UPI ID")
    # TC-P-022.1 — A wrong UPI ID is refused
    upi.fill("not a upi id")
    page.get_by_role("alert").filter(has_text="It should look like schoolname@bank").wait_for()
    assert page.get_by_role("button", name="Save fee setup").is_disabled()
    upi.fill("e2eschool@sbi")
    # TC-P-022.2 — Monthly fee, due day, receipt prefix and a class-specific fee are saved
    page.get_by_label("Monthly fee per student (₹)").fill("1200")
    page.get_by_label("Due on day of month").fill("10")
    page.get_by_label("Receipt number starts with").fill("E2E")
    page.get_by_label(re.compile(rf"^6-{TAG} ")).fill("1500")                      # this class pays more
    page.get_by_role("button", name="Save fee setup").click()
    toast(page, "Fee setup saved")
    cfg = ok(call("GET", "/fees/config", school["principal"]["token"]))
    mine = [c for c in cfg["classes"] if c["name"] == f"6-{TAG}"][0]
    assert cfg["monthly_amount"] == 1200 and cfg["upi_id"] == "e2eschool@sbi" and mine["amount"] == 1500 and mine["custom"] is True


@pytest.mark.tc("TC-P-023", "Charge, part payment, receipt, print and cancel")
@pytest.mark.smoke
@pytest.mark.sanity
@pytest.mark.regression
def test_add_charge_collect_part_payment_print_receipt_and_cancel_it(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    sid = seeded["students"][0]["id"]
    panel = open_student(page, f"Aman Verma {TAG}")
    # TC-P-023.1 — Add a one-off charge for a student
    panel.get_by_role("button", name="Add a charge").click()
    assert panel.get_by_role("button", name="Add charge").is_disabled()
    panel.get_by_label("What is it for?").fill(f"Lab fee {TAG}")
    panel.get_by_label("Amount (₹)").fill("800")
    panel.get_by_role("button", name="Add charge").click()
    toast(page, "Charge added")
    panel.get_by_text(f"Lab fee {TAG}").wait_for()
    # TC-P-023.2 — Collecting more than the dues is refused
    panel.get_by_role("button", name="Collect fee").click()
    due = sum(i["balance"] for i in ok(call("GET", f"/fees/students/{sid}", t))["items"])
    amount = panel.get_by_label("Amount received (₹)")
    assert float(amount.input_value()) == due, "the amount starts at everything that is due"
    amount.fill(str(due + 500))
    panel.get_by_role("alert").filter(has_text="More than the dues selected").wait_for()
    assert panel.get_by_role("button", name="Save and issue receipt").is_disabled()
    # TC-P-023.3 — A cheque needs its number; the receipt shows the amount in words
    amount.fill("300")
    panel.get_by_label("Paid by").select_option("cheque")
    panel.get_by_role("alert").filter(has_text="Enter the reference number").wait_for()
    panel.get_by_label("Cheque number").fill("004512")
    panel.get_by_role("button", name="Save and issue receipt").click()
    toast(page, "issued")
    receipt = dialog(page)
    receipt.get_by_role("heading", name=re.compile("^Receipt ")).wait_for()
    receipt.get_by_text("Rupees Three Hundred Only").wait_for()
    receipt.get_by_text(f"Aman Verma {TAG}").first.wait_for()
    # TC-P-023.4 — Printing shows the receipt alone
    page.evaluate("window.print = () => {}")                                      # printing shows the receipt alone, not the page behind it
    receipt.get_by_role("button", name="Print or save as PDF").click()
    page.emulate_media(media="print")
    assert page.locator("#print-root .receipt").is_visible() and not page.locator(".shell").is_visible()
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")
    page.emulate_media(media="screen")
    assert page.locator("#print-root").count() == 0
    # TC-P-023.5 — Outstanding and payment details match the server
    detail = ok(call("GET", f"/fees/students/{sid}", t))
    assert detail["totals"]["outstanding"] == due - 300
    pay = [p for p in detail["payments"] if p["status"] == "confirmed"][0]
    assert pay["mode"] == "cheque" and pay["reference"] == "004512" and pay["amount"] == 300
    # TC-P-023.6 — Cancelling a receipt needs a reason, reopens the dues and can't be done twice
    receipt.get_by_role("button", name="Cancel receipt").click()
    ask = dialog(page)
    assert ask.get_by_role("button", name="Cancel receipt").is_disabled()
    ask.get_by_label("Reason").fill("Cheque bounced")
    ask.get_by_role("button", name="Cancel receipt").click()
    toast(page, "Receipt cancelled")
    receipt.get_by_text("CANCELLED", exact=True).wait_for()
    assert receipt.get_by_role("button", name="Cancel receipt").count() == 0, "a cancelled receipt can't be cancelled twice"
    assert ok(call("GET", f"/fees/students/{sid}", t))["totals"]["outstanding"] == due
    assert call("POST", f"/fees/payments/{pay['id']}/cancel", t, {"reason": "again"})[0] == 400


@pytest.mark.tc("TC-P-024", "A charge can be reduced but not below what is paid")
@pytest.mark.regression
def test_charge_can_be_reduced_but_not_below_what_is_paid(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    sid = seeded["students"][1]["id"]
    item = ok(call("POST", "/fees/items", t, {"student_id": sid, "title": f"Uniform {TAG}", "amount": 1000}))
    ok(call("POST", "/fees/payments", t, {"student_id": sid, "amount": 400, "mode": "cash", "item_ids": [item["id"]]}))
    panel = open_student(page, f"Bina Das {TAG}")
    panel.get_by_role("button", name=f"Change amount of Uniform {TAG}").click()
    box = dialog(page)
    # TC-P-024.1 — Reducing below the paid amount is refused
    box.get_by_label("New amount (₹)").fill("300")
    box.get_by_role("alert").filter(has_text="₹400 is already paid against this charge").wait_for()
    assert box.get_by_role("button", name="Save").is_disabled()
    # TC-P-024.2 — Reducing with a reason is saved
    box.get_by_label("New amount (₹)").fill("700")
    box.get_by_label("Reason").fill("Sibling concession")
    box.get_by_role("button", name="Save").click()
    toast(page, "Charge updated")
    got = [i for i in ok(call("GET", f"/fees/students/{sid}", t))["items"] if i["id"] == item["id"]][0]
    assert got["amount"] == 700 and got["balance"] == 300


@pytest.mark.tc("TC-P-025", "One-time charge for chosen classes")
@pytest.mark.regression
def test_one_time_charge_for_chosen_classes_shows_who_pays_first(principal_page, school, seeded):
    page = principal_page
    go(page, "/school/fees")
    tab(page, "One-time charges")
    page.get_by_role("button", name="New charge").click()
    form = dialog(page)
    check = form.get_by_role("button", name="Check who is charged")
    # TC-P-025.1 — Check is off until title, amount and classes are chosen
    assert check.is_disabled()
    form.get_by_label("What is it for?").fill(f"Picnic {TAG}")
    form.get_by_label("Amount per student (₹)").fill("250")
    form.get_by_label("Who pays").select_option("classes")
    assert check.is_disabled(), "no class chosen yet"
    form.get_by_role("button", name=f"6-{TAG}", exact=True).click()
    # TC-P-025.2 — The number of students charged is shown before charging
    check.click()
    form.get_by_role("status").filter(has_text=re.compile(r"\d+ students will be charged")).wait_for()
    count = int(re.search(r"(\d+) students will be charged", form.get_by_role("status").inner_text()).group(1))
    assert count >= 3
    form.get_by_role("button", name=f"Charge {count} students").click()
    toast(page, f"Charged {count} students")
    card = page.locator(".tile", has_text=f"Picnic {TAG}")
    card.get_by_text(f"0 of {count} paid").wait_for()
    # TC-P-025.3 — The charge is removed
    card.get_by_role("button", name=f"Remove Picnic {TAG}").click()
    confirm(page, "Remove")
    toast(page, "Charge removed")
    card.wait_for(state="detached")


@pytest.mark.tc("TC-P-026", "UPI payments from parents: confirm, correct, reject")
@pytest.mark.sanity
@pytest.mark.regression
def test_upi_payment_from_a_parent_is_confirmed_corrected_or_rejected(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    cfg = ok(call("GET", "/fees/config", t))                                       # parents can pay by UPI only when the school has a UPI ID
    ok(call("PUT", "/fees/config", t, {**{k: cfg[k] for k in ("monthly_amount", "class_amounts", "route_amounts", "due_day", "start_month", "auto_generate", "upi_name", "receipt_prefix", "receipt_note")}, "upi_id": "e2eschool@sbi"}))
    kid = seeded["students"][2]
    mobile = "96" + "".join(random.choices("0123456789", k=8))
    ok(call("POST", "/users", t, {"name": f"Mrs Rao {TAG}", "login_id": mobile, "password": PARENT_PW, "role": "parent", "children_ids": [kid["id"]]}))
    ok(call("POST", "/fees/items", t, {"student_id": kid["id"], "title": f"Exam fee {TAG}", "amount": 500}))
    parent = ok(login(SCHOOL_CODE, mobile, PARENT_PW, web=False))
    pt = ok(call("POST", "/auth/password", parent["token"], {"old_password": PARENT_PW, "new_password": PARENT_PW + "2"}))["token"]
    call("POST", "/auth/consent", pt)
    utr1, utr2, utr3 = (("4" + "".join(random.choices("0123456789", k=11))) for _ in range(3))
    for utr in (utr1, utr2, utr3):
        ok(call("POST", "/fees/me/claim", pt, {"student_id": kid["id"], "amount": 100, "reference": utr, "paid_on": TODAY.isoformat()}))
    go(page, "/school/fees")
    tab(page, "UPI payments to check")
    first = page.locator(".tile", has_text=f"UTR {utr1}")
    # TC-P-026.1 — Confirming a UPI payment issues a receipt
    first.get_by_role("button", name="Money received — confirm").click()
    toast(page, "Payment confirmed and receipt issued")
    first.wait_for(state="detached")
    second = page.locator(".tile", has_text=f"UTR {utr2}")
    # TC-P-026.2 — Rejecting needs a reason shown to the parent
    second.get_by_role("button", name="Not received").click()
    ask = dialog(page)
    assert ask.get_by_role("button", name="Reject payment").is_disabled()          # a reason is required
    ask.get_by_label("Reason shown to the parent").fill("Not in our bank statement")
    ask.get_by_role("button", name="Reject payment").click()
    toast(page, "Payment rejected")
    second.wait_for(state="detached")
    # TC-P-026.3 — A different amount received can be confirmed
    third = page.locator(".tile", has_text=f"UTR {utr3}")
    third.get_by_role("button", name=f"A different amount was received from Chirag Rao {TAG}").click()
    fix = dialog(page)
    fix.get_by_label("Amount received (₹)").fill("1.2.3")
    assert fix.get_by_role("button", name="Confirm this amount").is_disabled()
    fix.get_by_label("Amount received (₹)").fill("80")
    fix.get_by_role("button", name="Confirm this amount").click()
    toast(page, "Payment confirmed and receipt issued")
    pays = {p["reference"]: p for p in ok(call("GET", f"/fees/students/{kid['id']}", t))["payments"]}
    assert pays[utr1]["status"] == "confirmed" and pays[utr2]["status"] == "rejected" and pays[utr3]["status"] == "confirmed" and pays[utr3]["amount"] == 80
    # TC-P-026.4 — Rejected and confirmed lists show the right payments
    page.get_by_label("Show").select_option("rejected")
    page.locator(".tile", has_text=f"UTR {utr2}").get_by_text("Not in our bank statement").wait_for()
    page.get_by_label("Show").select_option("confirmed")
    page.locator(".tile", has_text=f"UTR {utr3}").get_by_text("₹80").wait_for()


@pytest.mark.tc("TC-P-027", "Receipts list filters")
@pytest.mark.regression
def test_receipts_list_filters_by_date_and_mode(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    sid = seeded["students"][1]["id"]
    item = ok(call("POST", "/fees/items", t, {"student_id": sid, "title": f"Bus pass {TAG}", "amount": 150}))
    ok(call("POST", "/fees/payments", t, {"student_id": sid, "amount": 150, "mode": "bank", "reference": f"NEFT{TAG}", "item_ids": [item["id"]]}))
    extra = ok(call("POST", "/fees/items", t, {"student_id": sid, "title": f"Diary {TAG}", "amount": 60}))
    void = ok(call("POST", "/fees/payments", t, {"student_id": sid, "amount": 60, "mode": "cash", "item_ids": [extra["id"]]}))
    ok(call("POST", f"/fees/payments/{void['id']}/cancel", t, {"reason": "Entered twice"}))
    go(page, "/school/fees")
    tab(page, "Receipts")
    # TC-P-027.1 — Filter by payment mode
    page.get_by_label("Paid by").select_option("bank")
    row = page.locator("tr", has_text=f"Bina Das {TAG}").first
    row.get_by_text("Bank transfer").wait_for()
    page.get_by_label("Paid by").select_option("online")
    page.get_by_text("No receipts in these dates").wait_for()
    page.get_by_label("Paid by").select_option("")
    # TC-P-027.2 — Cancelled receipts show the reason
    page.get_by_label("Show").select_option("cancelled")
    page.get_by_role("link", name=void["receipt_no"]).click()
    dialog(page).get_by_text("CANCELLED", exact=True).wait_for()
    dialog(page).get_by_text("Entered twice").wait_for()


@pytest.mark.tc("TC-P-028", "Fee overview numbers and safe monthly billing")
@pytest.mark.regression
def test_overview_numbers_match_the_server_and_month_billing_is_safe_to_repeat(principal_page, school, seeded):
    page = principal_page
    t = school["principal"]["token"]
    go(page, "/school/fees")
    heading(page, "Fees")
    s = ok(call("GET", "/fees/summary", t))
    # TC-P-028.1 — Overview numbers match the server
    page.locator(".stat", has_text="Outstanding").get_by_text(f"{s['students_with_dues']} students").wait_for()
    # TC-P-028.2 — Bill next month; the same month again charges nobody twice
    nxt = (TODAY.replace(day=1) + dt.timedelta(days=32)).strftime("%Y-%m")
    expected = ok(call("POST", "/fees/generate", t, {"period": nxt, "preview": True}))["new_items"]
    assert expected >= 3, "this run's students are not billed for next month yet"
    month = page.get_by_label("Month to bill")
    month.fill(nxt)
    page.get_by_role("button", name="Check and bill").click()
    box = dialog(page)
    box.get_by_text(f"{expected} charges totalling").wait_for()
    box.get_by_role("button", name=re.compile(r"^Bill \d+ students")).click()
    toast(page, "fees billed to")
    assert ok(call("POST", "/fees/generate", t, {"period": nxt, "preview": True}))["new_items"] == 0
    assert month.input_value() == nxt, "the chosen month stays chosen after billing"
    page.get_by_role("button", name="Check and bill").click()
    box = dialog(page)
    box.get_by_role("heading", name=re.compile("^Bill .* fees")).wait_for()
    box.get_by_text("Everyone is already billed").wait_for()
    assert box.get_by_role("button", name=re.compile(r"^Bill \d+ students")).is_disabled(), "billing the same month twice must not charge anyone twice"
    # TC-P-028.3 — Billing months ahead is refused
    far = (TODAY.replace(day=1) + dt.timedelta(days=95)).strftime("%Y-%m")
    assert call("POST", "/fees/generate", t, {"period": far})[0] == 400, "nobody can be billed months ahead"
