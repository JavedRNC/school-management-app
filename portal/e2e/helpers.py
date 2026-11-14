"""Small page helpers shared by the browser tests."""
import re

from conftest import WEB


def go(page, path):
    page.goto(f"{WEB}/#{path}")


def sign_in(page, code, login_id, password):
    go(page, "/login")
    page.get_by_label("School code").fill(code)
    page.get_by_label("Login ID").fill(login_id)
    page.get_by_label("Password").fill(password)
    page.get_by_role("button", name="Sign in").click()


def heading(page, name):
    page.get_by_role("heading", name=name, level=1).wait_for()


def toast(page, text):
    """Wait for a NEW confirmation or error message with this text.

    Messages stay on screen for a few seconds, and two steps in a row often say the same thing ("… saved"). Each message is
    therefore counted once: after it has been seen it is marked, so the next call waits for the next message rather than
    passing on the old one before the server has answered.
    """
    fresh = page.locator(".toast:not([data-seen])", has_text=text).first
    fresh.wait_for()
    page.evaluate("document.querySelectorAll('.toast').forEach((e) => e.setAttribute('data-seen', '1'))")


def dialog(page):
    """The top-most open drawer or pop-up."""
    return page.get_by_role("dialog").last


def tab(page, name):
    page.get_by_role("tab", name=re.compile(rf"^{re.escape(name)}")).click()


def token_of(page):
    return page.evaluate("JSON.parse(sessionStorage.getItem('prangan.session')).token")


def no_sideways_scroll(page):
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "the page scrolls sideways"


def confirm(page, button):
    """Press the confirming button of the confirmation pop-up."""
    dialog(page).get_by_role("button", name=button, exact=True).click()
