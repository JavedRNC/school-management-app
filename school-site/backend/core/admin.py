"""The admin panel. Everything the public site shows is edited here. Django builds the screens from these registrations;
list columns, filters, search and inline sub-items are set so each module is comfortable to run day to day.

Admission entries, contact messages and newsletter subscribers can be exported to Excel (the 'Export to Excel' action).
"""
from django.contrib import admin
from django.http import HttpResponse

from . import models


# --------------------------------------------------------------------------- Excel export (shared action)

def export_to_excel(modeladmin, request, queryset):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = modeladmin.model._meta.verbose_name_plural.title()[:31]
    fields = [f for f in modeladmin.model._meta.fields]
    ws.append([f.verbose_name.title() for f in fields])
    for obj in queryset:
        row = []
        for f in fields:
            val = getattr(obj, f.name)
            if hasattr(val, "isoformat"):
                val = val.replace(tzinfo=None).isoformat(" ", "minutes") if hasattr(val, "replace") and getattr(val, "tzinfo", None) else val.isoformat()
            row.append("" if val is None else str(val))
        ws.append(row)
    resp = HttpResponse(content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    resp["Content-Disposition"] = f'attachment; filename="{ws.title.lower().replace(" ", "_")}.xlsx"'
    wb.save(resp)
    return resp


export_to_excel.short_description = "Export selected to Excel"


# --------------------------------------------------------------------------- site & menu

@admin.register(models.SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Identity", {"fields": ("school_name", "tagline", "logo", "favicon", "established_year")}),
        ("Contact", {"fields": ("phone", "whatsapp", "email", "address", "map_embed")}),
        ("Social links", {"fields": ("facebook", "instagram", "youtube", "twitter", "linkedin")}),
        ("Look", {"fields": ("primary_color", "accent_color", "footer_about", "footer_note")}),
        ("Switches", {"fields": ("registration_open", "donation_enabled", "zakat_enabled", "newsletter_enabled")}),
    )

    def has_add_permission(self, request):
        return not models.SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(models.MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ("label", "location", "parent", "href", "order", "visible")
    list_editable = ("order", "visible")
    list_filter = ("location", "visible")
    search_fields = ("label", "url")


# --------------------------------------------------------------------------- homepage

class StatInline(admin.TabularInline):
    model = models.Stat
    extra = 0


@admin.register(models.Slide)
class SlideAdmin(admin.ModelAdmin):
    list_display = ("title", "order", "active")
    list_editable = ("order", "active")


@admin.register(models.HomeSection)
class HomeSectionAdmin(admin.ModelAdmin):
    list_display = ("__str__", "key", "enabled", "order")
    list_editable = ("enabled", "order")


@admin.register(models.Stat)
class StatAdmin(admin.ModelAdmin):
    list_display = ("label", "value", "suffix", "order")
    list_editable = ("order",)


@admin.register(models.ExperienceCard)
class ExperienceCardAdmin(admin.ModelAdmin):
    list_display = ("title", "order", "active")
    list_editable = ("order", "active")


@admin.register(models.LearnStep)
class LearnStepAdmin(admin.ModelAdmin):
    list_display = ("title", "order")
    list_editable = ("order",)


@admin.register(models.QuickLink)
class QuickLinkAdmin(admin.ModelAdmin):
    list_display = ("label", "url", "order")
    list_editable = ("order",)


# --------------------------------------------------------------------------- pages / notices

@admin.register(models.Page)
class PageAdmin(admin.ModelAdmin):
    list_display = ("title", "category", "slug", "order", "published")
    list_editable = ("category", "order", "published")
    list_filter = ("category", "published")
    search_fields = ("title", "body")
    prepopulated_fields = {"slug": ("title",)}


@admin.register(models.NoticeEvent)
class NoticeEventAdmin(admin.ModelAdmin):
    list_display = ("title", "kind", "date", "event_start", "pinned", "published")
    list_editable = ("pinned", "published")
    list_filter = ("kind", "published", "pinned")
    search_fields = ("title", "body")
    date_hierarchy = "date"


@admin.register(models.Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ("name", "designation", "category", "order", "visible")
    list_editable = ("order", "visible")
    list_filter = ("category", "visible")
    search_fields = ("name", "designation")


@admin.register(models.FeeRow)
class FeeRowAdmin(admin.ModelAdmin):
    list_display = ("label", "admission_fee", "monthly_fee", "annual_fee", "order")
    list_editable = ("order",)


# --------------------------------------------------------------------------- admissions / careers

@admin.register(models.AdmissionEntry)
class AdmissionEntryAdmin(admin.ModelAdmin):
    list_display = ("student_name", "class_applied", "parent_name", "phone", "status", "created_at")
    list_editable = ("status",)
    list_filter = ("status", "class_applied", "created_at")
    search_fields = ("student_name", "parent_name", "phone", "email")
    actions = [export_to_excel]
    readonly_fields = ("created_at", "updated_at")


class JobApplicationInline(admin.TabularInline):
    model = models.JobApplication
    extra = 0
    readonly_fields = ("name", "email", "phone", "resume", "cover_letter", "created_at")
    can_delete = False


@admin.register(models.CareerPosting)
class CareerPostingAdmin(admin.ModelAdmin):
    list_display = ("title", "location", "employment_type", "deadline", "published")
    list_editable = ("published",)
    prepopulated_fields = {"slug": ("title",)}
    inlines = [JobApplicationInline]


@admin.register(models.JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = ("name", "posting", "phone", "status", "created_at")
    list_editable = ("status",)
    list_filter = ("status", "posting")
    search_fields = ("name", "email", "phone")
    actions = [export_to_excel]


# --------------------------------------------------------------------------- gallery

class GalleryImageInline(admin.TabularInline):
    model = models.GalleryImage
    extra = 1


@admin.register(models.GalleryAlbum)
class GalleryAlbumAdmin(admin.ModelAdmin):
    list_display = ("title", "order", "published")
    list_editable = ("order", "published")
    prepopulated_fields = {"slug": ("title",)}
    inlines = [GalleryImageInline]


# --------------------------------------------------------------------------- donations / contact / newsletter

@admin.register(models.Donation)
class DonationAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "amount", "name", "status", "razorpay_payment_id")
    list_filter = ("kind", "status", "created_at")
    search_fields = ("name", "email", "phone", "razorpay_order_id", "razorpay_payment_id")
    readonly_fields = ("created_at", "updated_at", "razorpay_order_id", "razorpay_payment_id")
    actions = [export_to_excel]


@admin.register(models.ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "subject", "phone", "handled", "created_at")
    list_editable = ("handled",)
    list_filter = ("handled", "created_at")
    search_fields = ("name", "email", "phone", "message")
    actions = [export_to_excel]


@admin.register(models.NewsletterSubscriber)
class NewsletterSubscriberAdmin(admin.ModelAdmin):
    list_display = ("email", "active", "created_at")
    list_editable = ("active",)
    search_fields = ("email",)
    actions = [export_to_excel]


admin.site.site_header = "School website admin"
admin.site.site_title = "School website admin"
admin.site.index_title = "Manage the website"
