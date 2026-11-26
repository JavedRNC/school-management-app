"""The whole site is data: every word, image, menu entry and page below is editable from the admin, nothing is written
into the code. These models are the shape of that data (the DB schema) and the base of the admin panel and the API.

Grouped as: site-wide settings & menu · homepage · pages · notices/events · people · fees · admissions · careers ·
gallery · donations · contact & newsletter.
"""
from django.db import models
from django.utils.text import slugify


class Singleton(models.Model):
    """A table meant to hold exactly one row (site settings): always saved with id=1, and fetched with .load()."""

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


# --------------------------------------------------------------------------- site-wide

class SiteSettings(Singleton):
    """Logo, name and contact details shown across the whole site, plus the global on/off switches."""
    school_name = models.CharField(max_length=120, default="Your School Name")
    tagline = models.CharField(max_length=200, blank=True, help_text="Short line under the name")
    logo = models.ImageField(upload_to="site/", blank=True)
    favicon = models.ImageField(upload_to="site/", blank=True)
    established_year = models.PositiveIntegerField(null=True, blank=True)

    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    map_embed = models.TextField(blank=True, help_text="Google Maps embed URL (src of the iframe)")

    facebook = models.URLField(blank=True)
    instagram = models.URLField(blank=True)
    youtube = models.URLField(blank=True)
    twitter = models.URLField(blank=True)
    linkedin = models.URLField(blank=True)

    primary_color = models.CharField(max_length=9, default="#0F3D34", help_text="Main brand colour (hex)")
    accent_color = models.CharField(max_length=9, default="#B8893B")
    footer_about = models.TextField(blank=True, help_text="Short paragraph in the footer")
    footer_note = models.CharField(max_length=200, blank=True, help_text="Copyright line")

    registration_open = models.BooleanField(default=True)
    donation_enabled = models.BooleanField(default=True)
    zakat_enabled = models.BooleanField(default=True)
    newsletter_enabled = models.BooleanField(default=True)

    class Meta:
        verbose_name = verbose_name_plural = "Site settings"

    def __str__(self):
        return self.school_name


class MenuItem(models.Model):
    """One entry in the site navigation. A child (with a parent) becomes a dropdown item. Points at a page or any URL."""
    HEADER, FOOTER = "header", "footer"
    label = models.CharField(max_length=60)
    page = models.ForeignKey("Page", null=True, blank=True, on_delete=models.SET_NULL, help_text="Link to a page …")
    url = models.CharField(max_length=300, blank=True, help_text="… or an address (e.g. /donate or https://…)")
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.CASCADE, related_name="children")
    location = models.CharField(max_length=10, choices=[(HEADER, "Header"), (FOOTER, "Footer")], default=HEADER)
    order = models.PositiveIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["location", "order", "id"]

    def __str__(self):
        return f"{self.label} ({self.location})"

    @property
    def href(self):
        if self.url:
            return self.url
        if self.page_id:
            return f"/{self.page.slug}"
        return "#"


# --------------------------------------------------------------------------- homepage

class Slide(models.Model):
    """A banner in the homepage slider."""
    title = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=240, blank=True)
    image = models.ImageField(upload_to="slides/", blank=True)
    cta_label = models.CharField(max_length=40, blank=True)
    cta_url = models.CharField(max_length=300, blank=True)
    cta2_label = models.CharField(max_length=40, blank=True)
    cta2_url = models.CharField(max_length=300, blank=True)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class HomeSection(models.Model):
    """The on/off switch, title and intro for each block of the homepage. The block's items live in the models below."""
    KEYS = [("welcome", "Welcome message"), ("stats", "Stats counters"), ("experience", "Experience cards"),
            ("learn", "How we learn"), ("notices", "Events / Notices"), ("quicklinks", "Quick links"),
            ("newsletter", "Newsletter signup"), ("donate", "Donate call-to-action")]
    key = models.CharField(max_length=20, choices=KEYS, unique=True)
    title = models.CharField(max_length=120, blank=True)
    subtitle = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True)
    image = models.ImageField(upload_to="home/", blank=True)
    cta_label = models.CharField(max_length=40, blank=True)
    cta_url = models.CharField(max_length=300, blank=True)
    enabled = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.get_key_display()


class Stat(models.Model):
    """A counter in the stats band (e.g. 1200 Students)."""
    label = models.CharField(max_length=60)
    value = models.CharField(max_length=20, help_text="e.g. 1200 or 25")
    suffix = models.CharField(max_length=10, blank=True, help_text="e.g. + or %")
    icon = models.CharField(max_length=40, blank=True, help_text="Icon name (optional)")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.value}{self.suffix} {self.label}"


class ExperienceCard(models.Model):
    """One of the 'Experience' cards (Academics, Islamic Studies, Arabic, Sports, Community …)."""
    title = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="experience/", blank=True)
    icon = models.CharField(max_length=40, blank=True)
    color = models.CharField(max_length=9, blank=True, help_text="Optional accent colour (hex)")
    link = models.CharField(max_length=300, blank=True)
    order = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class LearnStep(models.Model):
    """A step/point in the 'How we learn' section."""
    title = models.CharField(max_length=80)
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=40, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.title


class QuickLink(models.Model):
    """A shortcut tile in the Quick links band."""
    label = models.CharField(max_length=60)
    url = models.CharField(max_length=300)
    icon = models.CharField(max_length=40, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


# --------------------------------------------------------------------------- pages

class Page(TimeStamped):
    """A rich-text page. Covers About (Society, Principal's message, History, Vision/Mission …), Parents (Supplies,
    Calendar, Activities …), Policies, and any other standing page. The menu points at these by slug."""
    CATEGORIES = [("about", "About"), ("parents", "Parents"), ("policies", "Policies"), ("other", "Other")]
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    category = models.CharField(max_length=20, choices=CATEGORIES, default="other")
    summary = models.CharField(max_length=300, blank=True)
    body = models.TextField(blank=True, help_text="Rich text / HTML")
    hero_image = models.ImageField(upload_to="pages/", blank=True)
    meta_title = models.CharField(max_length=180, blank=True)
    meta_description = models.CharField(max_length=300, blank=True)
    order = models.PositiveIntegerField(default=0)
    published = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "order", "title"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:180]
        super().save(*args, **kwargs)


# --------------------------------------------------------------------------- notices & events

class NoticeEvent(TimeStamped):
    """A notice or an event. Events add a date/time and venue. A PDF can be attached (circular, schedule)."""
    NOTICE, EVENT = "notice", "event"
    kind = models.CharField(max_length=10, choices=[(NOTICE, "Notice"), (EVENT, "Event")], default=NOTICE)
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    body = models.TextField(blank=True)
    date = models.DateField(help_text="Date it was posted / the notice date")
    event_start = models.DateTimeField(null=True, blank=True)
    event_end = models.DateTimeField(null=True, blank=True)
    venue = models.CharField(max_length=160, blank=True)
    image = models.ImageField(upload_to="notices/", blank=True)
    attachment = models.FileField(upload_to="notices/pdf/", blank=True, help_text="PDF (optional)")
    pinned = models.BooleanField(default=False)
    published = models.BooleanField(default=True)

    class Meta:
        ordering = ["-pinned", "-date", "-id"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title)[:200] or self.kind
            slug, n = base, 2
            while NoticeEvent.objects.exclude(pk=self.pk).filter(slug=slug).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)


# --------------------------------------------------------------------------- people

class Person(models.Model):
    """Staff, leadership and board members. 'category' groups them on the public pages."""
    LEADERSHIP, STAFF, BOARD = "leadership", "staff", "board"
    name = models.CharField(max_length=120)
    designation = models.CharField(max_length=120, blank=True)
    category = models.CharField(max_length=20, choices=[(LEADERSHIP, "Leadership"), (STAFF, "Staff"), (BOARD, "Board of Directors")], default=STAFF)
    photo = models.ImageField(upload_to="people/", blank=True)
    bio = models.TextField(blank=True)
    email = models.EmailField(blank=True)
    order = models.PositiveIntegerField(default=0)
    visible = models.BooleanField(default=True)

    class Meta:
        ordering = ["category", "order", "name"]

    def __str__(self):
        return f"{self.name} — {self.designation}"


# --------------------------------------------------------------------------- fees

class FeeRow(models.Model):
    """A row in the fees table (per class / head)."""
    label = models.CharField(max_length=120, help_text="e.g. Class I–V, or Admission fee")
    admission_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    monthly_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    annual_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    note = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.label


# --------------------------------------------------------------------------- admissions

class AdmissionEntry(TimeStamped):
    """A registration/admission enquiry submitted from the public site. Managed (status, notes, Excel export) in admin."""
    NEW, REVIEW, ACCEPTED, WAITLIST, REJECTED = "new", "reviewing", "accepted", "waitlist", "rejected"
    STATUS = [(NEW, "New"), (REVIEW, "Reviewing"), (ACCEPTED, "Accepted"), (WAITLIST, "Waitlisted"), (REJECTED, "Rejected")]
    student_name = models.CharField(max_length=120)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    class_applied = models.CharField(max_length=60, blank=True)
    parent_name = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    previous_school = models.CharField(max_length=160, blank=True)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default=NEW)
    admin_notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name_plural = "Admission entries"

    def __str__(self):
        return f"{self.student_name} ({self.class_applied})"


# --------------------------------------------------------------------------- careers

class CareerPosting(TimeStamped):
    title = models.CharField(max_length=160)
    slug = models.SlugField(max_length=180, unique=True, blank=True)
    location = models.CharField(max_length=120, blank=True)
    employment_type = models.CharField(max_length=60, blank=True, help_text="Full-time, Part-time …")
    description = models.TextField(blank=True)
    deadline = models.DateField(null=True, blank=True)
    published = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:180]
        super().save(*args, **kwargs)


class JobApplication(TimeStamped):
    NEW, SHORTLISTED, REJECTED = "new", "shortlisted", "rejected"
    posting = models.ForeignKey(CareerPosting, on_delete=models.CASCADE, related_name="applications")
    name = models.CharField(max_length=120)
    email = models.EmailField()
    phone = models.CharField(max_length=40, blank=True)
    resume = models.FileField(upload_to="careers/resumes/", blank=True)
    cover_letter = models.TextField(blank=True)
    status = models.CharField(max_length=12, choices=[(NEW, "New"), (SHORTLISTED, "Shortlisted"), (REJECTED, "Rejected")], default=NEW)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} → {self.posting}"


# --------------------------------------------------------------------------- gallery

class GalleryAlbum(models.Model):
    title = models.CharField(max_length=120)
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    description = models.CharField(max_length=300, blank=True)
    cover = models.ImageField(upload_to="gallery/", blank=True)
    order = models.PositiveIntegerField(default=0)
    published = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "-id"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)[:140]
        super().save(*args, **kwargs)


class GalleryImage(models.Model):
    album = models.ForeignKey(GalleryAlbum, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="gallery/")
    caption = models.CharField(max_length=200, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.caption or f"Image #{self.pk}"


# --------------------------------------------------------------------------- donations

class Donation(TimeStamped):
    """A donation or zakat payment. Created when the donor submits the form; marked paid after Razorpay confirms."""
    DONATION, ZAKAT = "donation", "zakat"
    CREATED, PAID, FAILED = "created", "paid", "failed"
    kind = models.CharField(max_length=10, choices=[(DONATION, "Donation"), (ZAKAT, "Zakat")], default=DONATION)
    name = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    message = models.CharField(max_length=300, blank=True)
    anonymous = models.BooleanField(default=False)
    status = models.CharField(max_length=10, choices=[(CREATED, "Created"), (PAID, "Paid"), (FAILED, "Failed")], default=CREATED)
    razorpay_order_id = models.CharField(max_length=80, blank=True)
    razorpay_payment_id = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.get_kind_display()} ₹{self.amount} — {self.get_status_display()}"


# --------------------------------------------------------------------------- contact & newsletter

class ContactMessage(TimeStamped):
    name = models.CharField(max_length=120)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    subject = models.CharField(max_length=160, blank=True)
    message = models.TextField()
    handled = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name}: {self.subject or self.message[:40]}"


class NewsletterSubscriber(TimeStamped):
    email = models.EmailField(unique=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.email
