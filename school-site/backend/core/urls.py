"""Public API routes. Everything lives under /api/. Reads are GET; the five public forms and the two donation steps
are POST."""
from django.urls import path

from . import views

urlpatterns = [
    path("site/", views.site),
    path("home/", views.home),
    path("pages/", views.PageList.as_view()),
    path("pages/<slug:slug>/", views.PageDetail.as_view()),
    path("notices/", views.NoticeList.as_view()),
    path("notices/<slug:slug>/", views.NoticeDetail.as_view()),
    path("people/", views.PeopleList.as_view()),
    path("fees/", views.FeeList.as_view()),
    path("careers/", views.CareerList.as_view()),
    path("careers/<slug:slug>/", views.CareerDetail.as_view()),
    path("careers/<slug:slug>/apply/", views.apply_job),
    path("gallery/", views.GalleryList.as_view()),
    # public form submissions
    path("admissions/", views.AdmissionCreate.as_view()),
    path("contact/", views.ContactCreate.as_view()),
    path("newsletter/", views.NewsletterCreate.as_view()),
    path("donations/create/", views.donation_create),
    path("donations/verify/", views.donation_verify),
]
