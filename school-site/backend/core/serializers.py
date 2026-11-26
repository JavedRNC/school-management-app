"""How each model is turned into JSON for the public site (Next.js reads these), and how the public forms are read back
in. Only public-safe fields are exposed — admin-only fields (status, notes) are never serialised outward."""
from rest_framework import serializers

from . import models


class ImageField(serializers.ImageField):
    """Returns an absolute URL for an image, or null when empty (Next.js wants a plain URL string)."""

    def to_representation(self, value):
        if not value:
            return None
        request = self.context.get("request")
        url = value.url
        return request.build_absolute_uri(url) if request else url


class FileField(ImageField):
    pass


class SiteSettingsSerializer(serializers.ModelSerializer):
    logo = ImageField(read_only=True)
    favicon = ImageField(read_only=True)

    class Meta:
        model = models.SiteSettings
        exclude = ("id",)


class MenuItemSerializer(serializers.ModelSerializer):
    href = serializers.CharField(read_only=True)
    children = serializers.SerializerMethodField()

    class Meta:
        model = models.MenuItem
        fields = ("id", "label", "href", "location", "order", "children")

    def get_children(self, obj):
        kids = [c for c in obj.children.all() if c.visible]
        return MenuItemSerializer(kids, many=True, context=self.context).data


class SlideSerializer(serializers.ModelSerializer):
    image = ImageField(read_only=True)

    class Meta:
        model = models.Slide
        fields = ("id", "title", "subtitle", "image", "cta_label", "cta_url", "cta2_label", "cta2_url")


class StatSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Stat
        fields = ("label", "value", "suffix", "icon")


class ExperienceCardSerializer(serializers.ModelSerializer):
    image = ImageField(read_only=True)

    class Meta:
        model = models.ExperienceCard
        fields = ("id", "title", "description", "image", "icon", "color", "link")


class LearnStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.LearnStep
        fields = ("title", "description", "icon")


class QuickLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.QuickLink
        fields = ("label", "url", "icon")


class HomeSectionSerializer(serializers.ModelSerializer):
    image = ImageField(read_only=True)

    class Meta:
        model = models.HomeSection
        fields = ("key", "title", "subtitle", "body", "image", "cta_label", "cta_url", "enabled", "order")


class PageListSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Page
        fields = ("title", "slug", "category", "summary", "order")


class PageSerializer(serializers.ModelSerializer):
    hero_image = ImageField(read_only=True)

    class Meta:
        model = models.Page
        fields = ("title", "slug", "category", "summary", "body", "hero_image", "meta_title", "meta_description")


class NoticeEventSerializer(serializers.ModelSerializer):
    image = ImageField(read_only=True)
    attachment = FileField(read_only=True)

    class Meta:
        model = models.NoticeEvent
        fields = ("kind", "title", "slug", "body", "date", "event_start", "event_end", "venue", "image", "attachment", "pinned")


class PersonSerializer(serializers.ModelSerializer):
    photo = ImageField(read_only=True)

    class Meta:
        model = models.Person
        fields = ("name", "designation", "category", "photo", "bio", "email")


class FeeRowSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.FeeRow
        fields = ("label", "admission_fee", "monthly_fee", "annual_fee", "note")


class CareerPostingSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.CareerPosting
        fields = ("title", "slug", "location", "employment_type", "description", "deadline")


class GalleryImageSerializer(serializers.ModelSerializer):
    image = ImageField(read_only=True)

    class Meta:
        model = models.GalleryImage
        fields = ("image", "caption")


class GalleryAlbumSerializer(serializers.ModelSerializer):
    cover = ImageField(read_only=True)
    images = GalleryImageSerializer(many=True, read_only=True)

    class Meta:
        model = models.GalleryAlbum
        fields = ("title", "slug", "description", "cover", "images")


# ------------------------------------------------------------------ public form writes

class AdmissionEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = models.AdmissionEntry
        fields = ("student_name", "date_of_birth", "gender", "class_applied", "parent_name", "phone", "email",
                  "address", "previous_school", "message")


class JobApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.JobApplication
        fields = ("name", "email", "phone", "resume", "cover_letter")


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.ContactMessage
        fields = ("name", "email", "phone", "subject", "message")


class NewsletterSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.NewsletterSubscriber
        fields = ("email",)


class DonationCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = models.Donation
        fields = ("kind", "name", "email", "phone", "amount", "message", "anonymous")
