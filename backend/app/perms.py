"""Permission areas (F24) and subscription modules (F26)."""
from .models import Role

# ---------------------------------------------------------------- areas
AREAS = {
    "insights": "Dashboard & analytics",
    "people": "Students, teachers & parents",
    "classes": "Classes, subjects, teachers & timetable",
    "attendance": "Attendance",
    "exams": "Exams & marks",
    "notices": "Notices & homework",
    "calendar": "School calendar",
    "leaves": "Leave requests",
    "staff_attendance": "Staff attendance",
    "transport": "Transport",
    "settings": "School settings, privacy & plan",
}
LEVELS = ("none", "view", "edit")
RANK = {"none": 0, "view": 1, "edit": 2}

DEFAULT_PERMISSIONS: dict[Role, dict[str, str]] = {
    Role.vice_principal: {"insights": "view", "people": "edit", "classes": "edit", "attendance": "edit",
                          "exams": "edit", "notices": "edit", "calendar": "edit", "settings": "view",
                          "leaves": "edit", "staff_attendance": "view", "transport": "edit"},
    Role.coordinator: {"insights": "view", "people": "view", "classes": "view", "attendance": "edit",
                       "exams": "edit", "notices": "edit", "calendar": "view", "settings": "none",
                       "leaves": "view", "staff_attendance": "none", "transport": "view"},
}


def clean_permissions(perms: dict | None, role: Role) -> dict[str, str]:
    base = dict(DEFAULT_PERMISSIONS.get(role, {}))
    for k, v in (perms or {}).items():
        if k in AREAS and v in LEVELS:
            base[k] = v
    return base


def level_of(user, area: str) -> str:
    if user.role == Role.principal:
        return "edit"
    if user.role in (Role.vice_principal, Role.coordinator):
        return clean_permissions(user.permissions, user.role).get(area, "none")
    return "none"


# ---------------------------------------------------------------- modules
MODULES = {
    "core": "Core (logins, classes, timetable, attendance, marks, notices, calendar)",
    "communication": "Communication (image banners, consent forms & polls, notifications)",
    "leaves": "Leaves (teacher & student)",
    "fees": "Fees & receipts",
    "payments": "Online payments",
    "transport": "Transport",
    "staff_attendance": "Staff attendance (GPS)",
    "id_cards": "ID cards",
    "admissions": "Admissions & enquiries",
    "gallery": "Photo gallery",
    "extra_roles": "Vice Principal & Coordinator roles",
}

DEFAULT_PLANS = [
    # name, modules, ₹/student/month, minimum ₹/month  (placeholders — Admin edits these)
    ("Basic", ["core"], 0, 0),
    ("Standard", ["core", "communication", "leaves", "fees", "extra_roles"], 0, 0),
    ("Premium", list(MODULES), 0, 0),
]
