# Prangan on Google Play

Everything needed to publish the Android app. Publisher: **Javed** (personal account). Package: `com.javedrnc.prangan`. Free app.

## 1. The file to upload

The PROD build (push to `main` that touches `mobile/**` or the APK workflow) also makes **Prangan-<build>.aab**.
GitHub → Actions → the latest "Android APK" run on `main` → Artifacts → **Prangan-play-bundle-<build>** → download and unzip.
It is signed with the Prangan key (Play calls this the *upload key*). Keep the key file and its password safe: Play will
only accept later uploads signed with the same key. Accept **Play App Signing** when Play Console offers it.

## 2. Links Play asks for

| Field | Value |
|---|---|
| Privacy policy | https://javedrnc.github.io/school-management-app/privacy.html |
| Account deletion | https://javedrnc.github.io/school-management-app/delete-account.html |
| Website | https://javedrnc.github.io/school-management-app/ |
| Support email | javedansarirnc@gmail.com |
| Phone | (leave empty) |

## 3. Store listing

**App name (30):** Prangan: School App

**Short description (80):** Attendance, marks, fees, timetable and notices for your school, in one app.

**Full description:**

Prangan (प्रांगण) is one app for the whole school: principal, teachers, parents and students.

Your school gives you a school code and a login. Sign in to see what matters to you.

FOR PARENTS AND STUDENTS
• Daily attendance and monthly summary
• Marks for every exam, subject by subject
• Timetable with period timings
• Homework and notices from the school
• Fee dues and receipts; pay the school by UPI and send the reference number
• Apply for leave and see the answer
• Bus route, stop and pick-up time
• Holidays and school events

FOR TEACHERS
• Mark attendance for your class in seconds
• Enter marks and post homework
• See your own timetable for the day
• Apply for leave; check in when you reach school

FOR PRINCIPALS
• A dashboard of attendance, results and fee collection
• Add students, teachers and parents, one by one or from Excel
• Classes, subjects and the weekly timetable
• Fees: monthly billing, receipts, dues, one-time charges
• Approve leave, send notices, run polls and consent forms
• Transport routes, vehicles and paper expiry reminders
• Everything also on the web portal

PRIVATE BY DESIGN
• Each school's data is separate
• A parent sees only their own child
• Passwords cannot be read by anyone
• No advertisements

Prangan is for schools that have registered. To register your school, visit our website.

**Hindi listing (hi-IN)**

**App name:** प्रांगण: स्कूल ऐप

**Short description:** आपके स्कूल की उपस्थिति, अंक, फ़ीस, समय-सारणी और सूचनाएँ, एक ही ऐप में।

**Full description:**

प्रांगण पूरे स्कूल के लिए एक ऐप है: प्रधानाचार्य, शिक्षक, अभिभावक और छात्र।

आपका स्कूल आपको स्कूल कोड और लॉगिन देता है। लॉगिन करें और अपने काम की जानकारी देखें।

अभिभावकों और छात्रों के लिए
• रोज़ की उपस्थिति और महीने का सार
• हर परीक्षा के अंक, विषयवार
• समय-सारणी और पीरियड का समय
• गृहकार्य और स्कूल की सूचनाएँ
• फ़ीस का बकाया और रसीदें; स्कूल को UPI से भुगतान करें और संदर्भ नंबर भेजें
• छुट्टी के लिए आवेदन करें और उत्तर देखें
• बस का मार्ग, स्टॉप और समय
• छुट्टियाँ और स्कूल के कार्यक्रम

शिक्षकों के लिए
• अपनी कक्षा की उपस्थिति कुछ ही सेकंड में
• अंक दर्ज करें और गृहकार्य दें
• आज की अपनी समय-सारणी देखें
• छुट्टी का आवेदन; स्कूल पहुँचकर चेक इन

प्रधानाचार्य के लिए
• उपस्थिति, परिणाम और फ़ीस संग्रह का डैशबोर्ड
• छात्र, शिक्षक और अभिभावक जोड़ें, एक-एक करके या Excel से
• कक्षाएँ, विषय और साप्ताहिक समय-सारणी
• फ़ीस: मासिक बिल, रसीदें, बकाया, एकमुश्त शुल्क
• छुट्टी स्वीकृत करें, सूचना भेजें, पोल और सहमति-पत्र चलाएँ
• परिवहन मार्ग, वाहन और काग़ज़ात की समाप्ति की याद
• सब कुछ वेब पोर्टल पर भी

निजता का ध्यान
• हर स्कूल का डेटा अलग
• अभिभावक केवल अपने बच्चे की जानकारी देखते हैं
• पासवर्ड कोई नहीं पढ़ सकता
• कोई विज्ञापन नहीं

प्रांगण पंजीकृत स्कूलों के लिए है। अपने स्कूल का पंजीकरण करने के लिए हमारी वेबसाइट देखें।

**Category:** Education · **Tags:** Education · **Contains ads:** No · **In-app purchases:** No

**Graphics needed**
- App icon 512×512 PNG (from `mobile/assets/icon.png`)
- Feature graphic 1024×500 PNG
- At least 2 phone screenshots (4 to 6 is better): principal dashboard, attendance, fees, timetable, notices, parent home

## 4. App content forms

**App access:** "All or some functionality is restricted" → add instructions:
> Accounts are created by schools; there is no self sign-up. Use this demo school. School code: DEMO01. Login ID: principal. Password: (the demo password).

(Put the real demo password in Play Console only, never in this file. If the demo forces a password change at first login, set a fixed reviewer account first.)

**Ads:** No ads.

**Content rating questionnaire:** Category "Reference, News or Educational". Violence, sexual content, profanity, drugs, gambling: No. Users can interact or exchange content: Yes (school notices and leave reasons, moderated by the school); shares location with other users: No. Expected rating: Everyone / 3+.

**Target audience:** choose **13–15, 16–17 and 18+**. Do not tick under 13: that puts the app in the Families programme with extra rules. Younger children's records are in the app, but they are used through a parent's account. "Appeals to children": No.

**News app:** No. **Health app:** No. **Financial features:** none (the app records fee payments made outside it; it does not process payments or offer loans). **Government app:** No.

**Data safety**

Collects data: Yes. Encrypted in transit: Yes. Users can request deletion: Yes (deletion URL above). Shared with third parties: No (hosting and push providers act as service providers).

| Data type | Collected | Required | Purpose |
|---|---|---|---|
| Name | Yes | Required | App functionality, Account management |
| Email address | Yes | Optional | App functionality |
| User IDs (login ID) | Yes | Required | App functionality, Account management |
| Address | Yes | Optional | App functionality |
| Phone number | Yes | Optional | App functionality |
| Other personal info (date of birth, class, roll number) | Yes | Optional | App functionality |
| Health info (blood group) | Yes | Optional | App functionality |
| Financial info → Other financial info (school fee records, UPI reference number, staff salary records) | Yes | Optional | App functionality |
| Location → Approximate and Precise (staff check-in only; only the distance from school is stored) | Yes | Optional | App functionality |
| Device or other IDs (push notification token) | Yes | Optional | App functionality |
| Messages, photos, files, contacts, calendar, web history, app activity for analytics, diagnostics | No | | |

For every collected type: "Is this data processed ephemerally?" No, except Location: Yes (the coordinates are used to work out the distance and are not stored).

**Permissions declared by the app:** location (foreground only), notifications. No background location, no "install unknown apps".

## 5. Testing track (personal account)

Google requires a **closed test with at least 12 testers opted in for 14 days in a row** before production access can be requested.

1. Play Console → **Create app** (name, English (India) default language, App, Free).
2. Finish the "Set up your app" tasks with section 2–4 above.
3. **Testing → Closed testing → Create track** → **Testers** → create an email list → paste the 14 Gmail addresses.
4. **Create new release** → upload the `.aab` → release notes → Save → Review → **Start roll-out to Closed testing**.
5. After Google's review (hours to a few days), copy the **"Join on the web"** link from the Testers tab and send it to all 14.
   Each tester must open it, tap **Become a tester**, and install Prangan from Play.
6. Check the count of opted-in testers stays at 12 or more for 14 days. Ask testers to open the app a few times.
7. After 14 days: Dashboard → **Apply for production access** (answer the questions about the test), then create the production release.

## 6. After the app is on Play

- Portal → Admin → **App updates** → set the download link to `https://play.google.com/store/apps/details?id=com.javedrnc.prangan`
  so the in-app "update available" message opens Play. Google does not allow a Play app to update from elsewhere.
- Change the website's "Get the app" button to the Play link.
- People who installed the APK from the website must uninstall it once and install from Play (the Play copy is signed by Google).
- Deletion requests by email: remove the person in the portal (People → Remove), then erase their phone, email, address,
  date of birth and blood group. Until an "erase person" button exists this is done by the developer in the database.
