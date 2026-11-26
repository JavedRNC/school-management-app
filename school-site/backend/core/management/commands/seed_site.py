"""Fills a fresh database with a complete, ready-to-edit website: settings, menu, a homepage with every section, a few
pages, notices, staff, fees, a gallery album and a careers post. The text is generic placeholder content for a
fictional school — the real school's logo, photos and words go in later from the admin. Safe to re-run (idempotent).

    python manage.py seed_site
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand
from django.db import transaction

from core import models


class Command(BaseCommand):
    help = "Seed the website with starter content (idempotent)."

    @transaction.atomic
    def handle(self, *args, **opts):
        s = models.SiteSettings.load()
        if s.school_name == "Your School Name":
            s.school_name = "Crescent Public School"
            s.tagline = "Knowledge · Character · Community"
            s.established_year = 1998
            s.phone = "+91 90000 00000"
            s.whatsapp = "+91 90000 00000"
            s.email = "info@crescentschool.example"
            s.address = "Station Road, Farrukhabad, Uttar Pradesh 209625"
            s.footer_about = "A community school offering modern academics alongside Islamic studies and Arabic, from nursery to senior secondary."
            s.footer_note = "© Crescent Public School. All rights reserved."
            s.facebook = "https://facebook.com/"
            s.instagram = "https://instagram.com/"
            s.youtube = "https://youtube.com/"
            s.save()

        # ---------------- pages (menu links point at these)
        pages = {
            "society": ("about", "The Society", "The registered society that runs the school and its wider welfare work."),
            "principals-message": ("about", "Principal's Message", "A word from our principal on what the school stands for."),
            "history": ("about", "History", "How the school grew from a single classroom to today's campus."),
            "vision-mission": ("about", "Vision & Mission", "Where we are headed, and the promises we keep to every child."),
            "board-of-directors": ("about", "Board of Directors", "The people who guide the school's direction."),
            "policies": ("policies", "Policies", "Admissions, safeguarding, fees and conduct policies."),
            "supplies-list": ("parents", "Supplies List", "Books and materials for each class."),
            "calendar": ("parents", "Academic Calendar", "Terms, holidays and examinations for the year."),
            "activities": ("parents", "Activities", "Clubs, sports and events through the year."),
            "newsletter": ("parents", "Newsletter", "Our termly newsletter archive."),
            "parent-app": ("parents", "Parent App", "Track attendance, marks and fees on the Prangan parent app."),
        }
        for slug, (cat, title, summary) in pages.items():
            models.Page.objects.get_or_create(slug=slug, defaults={
                "title": title, "category": cat, "summary": summary,
                "body": f"<p>{summary}</p><p>This page is editable from the admin panel — replace this text with the school's own.</p>"})

        # ---------------- header menu (About & Parents are dropdowns)
        if not models.MenuItem.objects.exists():
            def item(label, order, location="header", url="", page=None, parent=None, **k):
                return models.MenuItem.objects.create(label=label, order=order, location=location, url=url,
                                                      page=page, parent=parent, **k)
            item("Home", 0, url="/")
            about = item("About", 1, url="#")
            for i, slug in enumerate(["society", "principals-message", "history", "vision-mission", "board-of-directors", "policies"]):
                item(models.Page.objects.get(slug=slug).title, i, parent=about, page=models.Page.objects.get(slug=slug))
            parents = item("Parents", 2, url="#")
            for i, slug in enumerate(["supplies-list", "calendar", "activities", "newsletter", "parent-app"]):
                item(models.Page.objects.get(slug=slug).title, i, parent=parents, page=models.Page.objects.get(slug=slug))
            item("Registration", 3, url="/registration")
            item("Fees", 4, url="/fees")
            item("Events", 5, url="/events")
            item("Gallery", 6, url="/gallery")
            item("Donate", 7, url="/donate")
            item("Contact", 8, url="/contact")
            for i, (label, url) in enumerate([("Registration", "/registration"), ("Fees", "/fees"), ("Donate", "/donate"),
                                              ("Zakat", "/zakat"), ("Careers", "/careers"), ("Contact", "/contact")]):
                item(label, i, location="footer", url=url)

        # ---------------- homepage sections
        section_defaults = {
            "welcome": ("Welcome to Crescent Public School", "A place where every child is known",
                        "For over twenty-five years we have brought together strong academics, Islamic values and a caring community. Our students leave us confident, grounded and ready for the world."),
            "stats": ("Our school at a glance", "", ""),
            "experience": ("The Crescent experience", "Five strands that shape every student", ""),
            "learn": ("How we learn", "Small steps, every day", ""),
            "notices": ("Events & Notices", "What's happening on campus", ""),
            "quicklinks": ("Quick links", "", ""),
            "newsletter": ("Stay in the loop", "Get our termly newsletter in your inbox", ""),
            "donate": ("Support a child's education", "Your donation and zakat keep deserving students in school", ""),
        }
        for i, (key, (title, sub, body)) in enumerate(section_defaults.items()):
            models.HomeSection.objects.get_or_create(key=key, defaults={
                "title": title, "subtitle": sub, "body": body, "order": i,
                "cta_label": "Donate now" if key == "donate" else "", "cta_url": "/donate" if key == "donate" else ""})

        if not models.Slide.objects.exists():
            models.Slide.objects.create(title="Admissions open for 2026–27", order=0,
                                        subtitle="Join a school that nurtures mind and character. Limited seats in every class.",
                                        cta_label="Apply now", cta_url="/registration", cta2_label="Take a tour", cta2_url="/about/history")
            models.Slide.objects.create(title="Learning rooted in values", order=1,
                                        subtitle="Modern academics alongside Islamic studies and Arabic, from nursery to senior secondary.",
                                        cta_label="Our approach", cta_url="/about/vision-mission")

        for i, (label, value, suffix) in enumerate([("Students", "1200", "+"), ("Teachers", "60", ""),
                                                    ("Years of service", "25", "+"), ("Board results", "98", "%")]):
            models.Stat.objects.get_or_create(label=label, defaults={"value": value, "suffix": suffix, "order": i})

        exp = [("Academics", "A strong CBSE-aligned curriculum with science, maths and languages."),
               ("Islamic Studies", "Qur'an, Hadith and character, taught with warmth and depth."),
               ("Arabic", "Reading, writing and conversation from the early years."),
               ("Sports", "Cricket, football, athletics and indoor games for every age."),
               ("Community", "Service, charity drives and a close circle of families.")]
        for i, (title, desc) in enumerate(exp):
            models.ExperienceCard.objects.get_or_create(title=title, defaults={"description": desc, "order": i})

        learn = [("Understand", "We begin from what a child already knows."),
                 ("Practise", "Short daily practice builds real mastery."),
                 ("Apply", "Projects and discussion turn knowledge into skill."),
                 ("Reflect", "Regular feedback keeps every learner moving forward.")]
        for i, (title, desc) in enumerate(learn):
            models.LearnStep.objects.get_or_create(title=title, defaults={"description": desc, "order": i})

        for i, (label, url) in enumerate([("Admissions", "/registration"), ("Fee structure", "/fees"),
                                          ("Academic calendar", "/calendar"), ("Parent app", "/parent-app"),
                                          ("Careers", "/careers"), ("Contact us", "/contact")]):
            models.QuickLink.objects.get_or_create(label=label, defaults={"url": url, "order": i})

        # ---------------- notices / events
        if not models.NoticeEvent.objects.exists():
            today = date.today()
            models.NoticeEvent.objects.create(kind="notice", title="Half-yearly examination schedule released",
                                              date=today, pinned=True, body="The half-yearly examination timetable is now available. Please collect the admit cards from the class teacher.")
            models.NoticeEvent.objects.create(kind="event", title="Annual Sports Day", date=today,
                                              event_start=None, venue="School ground",
                                              body="A day of athletics, races and inter-house competitions. Parents are warmly invited.")
            models.NoticeEvent.objects.create(kind="notice", title="Winter uniform from next Monday", date=today - timedelta(days=3),
                                              body="Students should wear the winter uniform from Monday onward.")

        # ---------------- people
        people = [("Dr. A. R. Khan", "Principal", "leadership"), ("Mrs. S. Begum", "Vice Principal", "leadership"),
                  ("Mr. M. Ali", "Head of Academics", "staff"), ("Ms. F. Sheikh", "Head of Islamic Studies", "staff"),
                  ("Mr. I. Ahmed", "Chairman", "board"), ("Mr. N. Hussain", "Secretary", "board")]
        for i, (name, role, cat) in enumerate(people):
            models.Person.objects.get_or_create(name=name, defaults={"designation": role, "category": cat, "order": i})

        # ---------------- fees
        if not models.FeeRow.objects.exists():
            for i, (label, adm, mon) in enumerate([("Nursery – UKG", 5000, 1200), ("Class I – V", 6000, 1500),
                                                   ("Class VI – VIII", 7000, 1800), ("Class IX – X", 9000, 2200),
                                                   ("Class XI – XII", 12000, 2800)]):
                models.FeeRow.objects.create(label=label, admission_fee=adm, monthly_fee=mon, order=i)

        # ---------------- careers + gallery
        models.CareerPosting.objects.get_or_create(slug="primary-teacher", defaults={
            "title": "Primary School Teacher", "location": "Farrukhabad", "employment_type": "Full-time",
            "description": "We are looking for a warm, qualified primary teacher. B.Ed and a love for children required.",
            "deadline": date.today() + timedelta(days=30)})
        models.GalleryAlbum.objects.get_or_create(slug="campus-life", defaults={
            "title": "Campus Life", "description": "A glimpse of everyday life at school.", "order": 0})

        self.stdout.write(self.style.SUCCESS("Seeded website content. Visit /admin to edit everything."))
