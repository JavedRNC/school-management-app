"""The public API the website reads from, and the handful of public form submissions it writes.

Reads are open (GET). Writes are the public forms only: admission enquiry, contact message, newsletter sign-up, job
application, and starting a donation. Nothing here can touch content — editing is the admin's job.
"""
from django.conf import settings
from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import models, serializers


def _ctx(request):
    return {"request": request}


# ------------------------------------------------------------------ reads

@api_view(["GET"])
@permission_classes([AllowAny])
def site(request):
    """Everything the header, footer and shell need: settings + the header/footer menus."""
    s = models.SiteSettings.load()
    top = models.MenuItem.objects.filter(location="header", parent__isnull=True, visible=True)
    foot = models.MenuItem.objects.filter(location="footer", parent__isnull=True, visible=True)
    return Response({
        "settings": serializers.SiteSettingsSerializer(s, context=_ctx(request)).data,
        "menu": serializers.MenuItemSerializer(top, many=True, context=_ctx(request)).data,
        "footer_menu": serializers.MenuItemSerializer(foot, many=True, context=_ctx(request)).data,
    })


@api_view(["GET"])
@permission_classes([AllowAny])
def home(request):
    """One call with everything the homepage renders, so the front page is a single request."""
    c = _ctx(request)
    sections = {s.key: serializers.HomeSectionSerializer(s, context=c).data
                for s in models.HomeSection.objects.filter(enabled=True)}
    notices = models.NoticeEvent.objects.filter(published=True)[:6]
    return Response({
        "slides": serializers.SlideSerializer(models.Slide.objects.filter(active=True), many=True, context=c).data,
        "sections": sections,
        "stats": serializers.StatSerializer(models.Stat.objects.all(), many=True, context=c).data,
        "experience": serializers.ExperienceCardSerializer(models.ExperienceCard.objects.filter(active=True), many=True, context=c).data,
        "learn": serializers.LearnStepSerializer(models.LearnStep.objects.all(), many=True, context=c).data,
        "quick_links": serializers.QuickLinkSerializer(models.QuickLink.objects.all(), many=True, context=c).data,
        "notices": serializers.NoticeEventSerializer(notices, many=True, context=c).data,
    })


class PageList(generics.ListAPIView):
    serializer_class = serializers.PageListSerializer
    permission_classes = [AllowAny]
    queryset = models.Page.objects.filter(published=True)


class PageDetail(generics.RetrieveAPIView):
    serializer_class = serializers.PageSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"
    queryset = models.Page.objects.filter(published=True)


class NoticeList(generics.ListAPIView):
    serializer_class = serializers.NoticeEventSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = models.NoticeEvent.objects.filter(published=True)
        kind = self.request.query_params.get("kind")
        return qs.filter(kind=kind) if kind in ("notice", "event") else qs


class NoticeDetail(generics.RetrieveAPIView):
    serializer_class = serializers.NoticeEventSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"
    queryset = models.NoticeEvent.objects.filter(published=True)


class PeopleList(generics.ListAPIView):
    serializer_class = serializers.PersonSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = models.Person.objects.filter(visible=True)
        cat = self.request.query_params.get("category")
        return qs.filter(category=cat) if cat else qs


class FeeList(generics.ListAPIView):
    serializer_class = serializers.FeeRowSerializer
    permission_classes = [AllowAny]
    queryset = models.FeeRow.objects.all()


class CareerList(generics.ListAPIView):
    serializer_class = serializers.CareerPostingSerializer
    permission_classes = [AllowAny]
    queryset = models.CareerPosting.objects.filter(published=True)


class CareerDetail(generics.RetrieveAPIView):
    serializer_class = serializers.CareerPostingSerializer
    permission_classes = [AllowAny]
    lookup_field = "slug"
    queryset = models.CareerPosting.objects.filter(published=True)


class GalleryList(generics.ListAPIView):
    serializer_class = serializers.GalleryAlbumSerializer
    permission_classes = [AllowAny]
    queryset = models.GalleryAlbum.objects.filter(published=True).prefetch_related("images")


# ------------------------------------------------------------------ public form writes

class AdmissionCreate(generics.CreateAPIView):
    serializer_class = serializers.AdmissionEntrySerializer
    permission_classes = [AllowAny]


class ContactCreate(generics.CreateAPIView):
    serializer_class = serializers.ContactMessageSerializer
    permission_classes = [AllowAny]


class NewsletterCreate(generics.CreateAPIView):
    serializer_class = serializers.NewsletterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        email = (request.data.get("email") or "").strip().lower()
        if email:
            models.NewsletterSubscriber.objects.get_or_create(email=email, defaults={"active": True})
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def apply_job(request, slug):
    try:
        posting = models.CareerPosting.objects.get(slug=slug, published=True)
    except models.CareerPosting.DoesNotExist:
        return Response({"detail": "Posting not found"}, status=404)
    ser = serializers.JobApplicationSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    ser.save(posting=posting)
    return Response({"ok": True}, status=201)


# ------------------------------------------------------------------ donations (Razorpay)

def _razorpay_client():
    key, secret = settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET
    if not (key and secret):
        return None
    import razorpay
    return razorpay.Client(auth=(key, secret))


@api_view(["POST"])
@permission_classes([AllowAny])
def donation_create(request):
    """Records the donation as 'created' and opens a Razorpay order the browser then pays. Without keys configured it
    still records the intent and tells the frontend payments aren't set up yet (so the demo works offline)."""
    ser = serializers.DonationCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    donation = ser.save()
    client = _razorpay_client()
    if client is None:
        return Response({"id": donation.id, "payment_configured": False,
                         "detail": "Payments are not configured yet."}, status=201)
    order = client.order.create({"amount": int(donation.amount * 100), "currency": "INR",
                                 "notes": {"kind": donation.kind, "donation_id": str(donation.id)}})
    donation.razorpay_order_id = order["id"]
    donation.save(update_fields=["razorpay_order_id"])
    return Response({"id": donation.id, "payment_configured": True, "order_id": order["id"],
                     "amount": order["amount"], "currency": order["currency"], "key_id": settings.RAZORPAY_KEY_ID}, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def donation_verify(request):
    """Confirms a payment: checks Razorpay's signature before marking the donation paid (never trust the browser)."""
    client = _razorpay_client()
    if client is None:
        return Response({"detail": "Payments are not configured."}, status=400)
    data = request.data
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": data["razorpay_order_id"],
            "razorpay_payment_id": data["razorpay_payment_id"],
            "razorpay_signature": data["razorpay_signature"],
        })
    except Exception:
        models.Donation.objects.filter(razorpay_order_id=data.get("razorpay_order_id", "")).update(status="failed")
        return Response({"ok": False, "detail": "Signature verification failed"}, status=400)
    models.Donation.objects.filter(razorpay_order_id=data["razorpay_order_id"]).update(
        status="paid", razorpay_payment_id=data["razorpay_payment_id"])
    return Response({"ok": True})
