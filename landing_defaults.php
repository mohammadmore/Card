<?php
declare(strict_types=1);
// متن‌ها و پلن‌های پیش‌فرض صفحه‌ی معرفی. همه از پنل سوپرادمین («فروش و صفحه‌ی معرفی») قابل ویرایش‌اند؛
// این مقادیر فقط تا زمانی استفاده می‌شوند که چیزی ذخیره نشده باشد.
if (!defined('CARD_API') && !defined('CARD_LANDING')) { http_response_code(404); exit; }

/** نمونه‌ی خالی هر فهرست (برای وقتی که فهرست پیش‌فرض خالی است). */
function landing_list_protos(): array {
    return [
        'problemItems' => '', 'solutionItems' => '',
        'steps' => ['title' => '', 'text' => ''],
        'features' => ['icon' => '', 'title' => '', 'text' => ''],
        'useCases' => ['icon' => '', 'title' => '', 'text' => ''],
        'testimonials' => ['name' => '', 'role' => '', 'text' => ''],
        'faq' => ['q' => '', 'a' => ''],
        'customers' => ['name' => '', 'logoUrl' => ''],
    ];
}

function landing_default_content(): array {
    return [
        'common' => [
            'phone' => '09966697806', 'email' => '', 'address' => '', 'telegram' => '', 'whatsapp' => '', 'bale' => '', 'eitaa' => '', 'instagram' => '',
            'ogImage' => '', 'enamadId' => '', 'enamadCode' => '',
            'showPricing' => true, 'demoEnabled' => true, 'showEnglish' => true,
            'customers' => [],
        ],
        'fa' => [
            'seoTitle' => 'صدور آنلاین کارت سازمانی، پرسنلی و همایش',
            'seoDescription' => 'کارت پرسنلی، عضویت و همایش را بدون طراح و چاپخانه، آنلاین و در چند دقیقه صادر کنید: فرم اختصاصی برای اعضا، خروجی آماده‌ی چاپ، استعلام اصالت با QR و گزارش لحظه‌ای.',
            'heroBadge' => 'سامانه‌ی صدور کارت آنلاین',
            'heroTitle' => 'کارت سازمانی، بدون طراح، بدون صف، در چند دقیقه',
            'heroSubtitle' => 'طرح کارت‌تان را یک بار بدهید؛ اعضا خودشان اطلاعات و عکس را وارد می‌کنند و کارت آماده‌ی چاپ، دقیقاً با طراحی سازمان شما، همان لحظه ساخته می‌شود.',
            'ctaPrimary' => 'سفارش آنلاین',
            'ctaSecondary' => 'کارت خودت را بساز',
            'problemTitle' => 'صدور کارت نباید این‌قدر دردسر داشته باشد',
            'problemItems' => [
                'جمع کردن اطلاعات و عکس‌ها در اکسل و پیام‌رسان',
                'غلط تایپی در نام و کد پرسنلی و چاپ دوباره',
                'انتظار برای طراح و رفت‌وبرگشت فایل‌ها',
                'عکس‌های بی‌کیفیت و ابعاد نامناسب',
            ],
            'solutionItems' => [
                'هر عضو با یک لینک، اطلاعات خودش را وارد می‌کند',
                'اعتبارسنجی خودکار کد ملی، موبایل و فیلدهای الزامی',
                'کارت همان لحظه با طرح سازمان ساخته می‌شود',
                'برش و تنظیم خودکار عکس و خروجی باکیفیت چاپ',
            ],
            'stepsTitle' => 'در سه قدم',
            'steps' => [
                ['title' => 'طرح کارت را بفرستید', 'text' => 'فایل خام روی و پشت کارت را برای هر رده (مثلاً کارشناس، مدیر، مهمان) آپلود کنید. سامانه‌ی شما را بر اساس همین طرح آماده می‌کنیم.'],
                ['title' => 'لینک را برای اعضا بفرستید', 'text' => 'هر عضو با رمز سازمان وارد می‌شود، اطلاعات و عکسش را وارد می‌کند و کارتش را می‌بیند.'],
                ['title' => 'کارت‌ها را تحویل بگیرید', 'text' => 'خروجی PDF با اندازه‌ی واقعی چاپ، تصویر، اکسل و گزارش‌های لحظه‌ای در داشبورد مدیر.'],
            ],
            'featuresTitle' => 'هر آنچه برای صدور کارت لازم دارید',
            'featuresSubtitle' => 'یک سامانه‌ی کامل، با پنل اختصاصی برای سازمان شما',
            'features' => [
                ['icon' => 'layers', 'title' => 'طرح متفاوت برای هر رده', 'text' => 'با انتخاب رده یا سمت در فرم، طرح روی و پشت کارت خودکار عوض می‌شود.'],
                ['icon' => 'qr', 'title' => 'استعلام اصالت با QR', 'text' => 'هر کارت یک کد QR دارد که با اسکن آن، اعتبار و تاریخ انقضای کارت نمایش داده می‌شود.'],
                ['icon' => 'languages', 'title' => 'فرم چندزبانه', 'text' => 'فارسی، انگلیسی، عربی و ترکی؛ عضو هر زبانی را که بخواهد انتخاب می‌کند.'],
                ['icon' => 'cube', 'title' => 'نمایش سه‌بعدی کارت', 'text' => 'کارت دورو بعد از صدور به صورت سه‌بعدی می‌چرخد؛ لحظه‌ای که همه به خاطر می‌سپارند.'],
                ['icon' => 'chart', 'title' => 'گزارش و نمودار', 'text' => 'آمار صدور بر اساس تاریخ، رده، استان و هر فیلد انتخابی، با خروجی اکسل.'],
                ['icon' => 'printer', 'title' => 'آماده‌ی چاپ', 'text' => 'PDF با اندازه‌ی واقعی کارت، دانلود گروهی و تصویر باکیفیت برای هر کارت.'],
                ['icon' => 'shield', 'title' => 'امن و خصوصی', 'text' => 'رمز جداگانه برای مدیر و اعضا، قفل خودکار در برابر حدس رمز و گزارش فعالیت.'],
                ['icon' => 'table', 'title' => 'ورود از اکسل', 'text' => 'فهرست‌های پایه (مثل رده‌ها و استان‌ها) را با یک فایل اکسل وارد کنید.'],
            ],
            'useCasesTitle' => 'برای چه کسانی؟',
            'useCases' => [
                ['icon' => 'badge', 'title' => 'کارت پرسنلی', 'text' => 'سازمان‌ها، شرکت‌ها و ادارات با رده‌های مختلف'],
                ['icon' => 'ticket', 'title' => 'همایش و رویداد', 'text' => 'کارت ورود شرکت‌کنندگان، سخنرانان و مهمانان'],
                ['icon' => 'users', 'title' => 'کارت عضویت', 'text' => 'باشگاه‌ها، انجمن‌ها، کانون‌ها و سازمان‌های مردم‌نهاد'],
                ['icon' => 'school', 'title' => 'کارت دانشجویی و آموزشی', 'text' => 'دانشگاه‌ها، مدارس و آموزشگاه‌ها'],
            ],
            'demoTitle' => 'همین حالا امتحان کنید',
            'demoText' => 'نام و سمت خود را بنویسید و دکمه را بزنید. کارت شما همین‌جا ساخته می‌شود؛ هیچ اطلاعاتی از دستگاه شما خارج نمی‌شود.',
            'customersTitle' => 'به ما اعتماد کرده‌اند',
            'testimonialsTitle' => 'نظر مشتریان',
            'testimonials' => [],
            'pricingTitle' => 'پلن‌ها و قیمت‌ها',
            'pricingSubtitle' => 'پلن مناسب سازمان‌تان را انتخاب کنید و آنلاین سفارش دهید.',
            'pricingNote' => 'قیمت‌ها به تومان است. آماده‌سازی سامانه بر اساس طرح شما در همه‌ی پلن‌ها انجام می‌شود.',
            'faqTitle' => 'سؤالات متداول',
            'faq' => [
                ['q' => 'برای سفارش چه چیزی لازم است؟', 'a' => 'فایل خام روی و پشت کارت (JPG) برای هر رده، نام سازمان و فهرست اطلاعاتی که روی کارت می‌آید؛ مثل نام، کد پرسنلی و عکس.'],
                ['q' => 'سامانه چقدر بعد از پرداخت آماده می‌شود؟', 'a' => 'معمولاً ظرف یک تا دو روز کاری. لینک سامانه و رمزها با پیامک و ایمیل برایتان ارسال می‌شود.'],
                ['q' => 'اطلاعات و عکس اعضا کجا نگهداری می‌شود؟', 'a' => 'روی سرور داخل ایران و فقط در دسترس مدیر سازمان شما. دسترسی اعضا با رمز جداگانه است.'],
                ['q' => 'آیا خودمان می‌توانیم کارت‌ها را چاپ کنیم؟', 'a' => 'بله. خروجی PDF با اندازه‌ی واقعی کارت یا روی کاغذ A4 در دسترس است و با هر چاپگر کارت یا چاپخانه‌ای سازگار است.'],
                ['q' => 'اگر تعداد کارت‌ها تمام شود چه می‌شود؟', 'a' => 'از صفحه‌ی پیگیری سفارش، با چند کلیک پلن را تمدید یا ارتقا می‌دهید؛ کارت‌های قبلی سر جایشان می‌مانند.'],
            ],
            'ctaBandTitle' => 'آماده‌اید کارت‌های سازمان‌تان را آنلاین کنید؟',
            'ctaBandText' => 'سفارش آنلاین در چند دقیقه؛ یا شماره‌تان را بگذارید تا با شما تماس بگیریم.',
            'contactTitle' => 'درخواست مشاوره',
            'contactText' => 'سؤالی دارید یا پلن سازمانی می‌خواهید؟ فرم را پر کنید تا کارشناسان ما با شما تماس بگیرند.',
            'termsText' => "۱. موضوع خدمت: راه‌اندازی و ارائه‌ی سامانه‌ی آنلاین صدور کارت بر اساس طرح ارسالی مشتری، در مدت و تعداد کارت پلن خریداری‌شده.\n\n۲. مسئولیت محتوا: مسئولیت درستی اطلاعات، طرح‌ها، لوگوها و عکس‌های ارسالی و داشتن حق استفاده از آن‌ها بر عهده‌ی مشتری است.\n\n۳. زمان آماده‌سازی: سامانه معمولاً ظرف ۱ تا ۲ روز کاری پس از پرداخت و دریافت فایل‌های کامل آماده و لینک آن ارسال می‌شود.\n\n۴. انصراف و بازگشت وجه: تا پیش از شروع آماده‌سازی سامانه، امکان انصراف و بازگشت کامل وجه وجود دارد. پس از تحویل سامانه، وجه پرداختی قابل بازگشت نیست مگر در صورت عدم ارائه‌ی خدمت از طرف ما.\n\n۵. مدت اعتبار: پس از پایان مدت پلن یا رسیدن به سقف تعداد کارت، صدور کارت جدید متوقف می‌شود و با تمدید ادامه پیدا می‌کند.\n\n۶. پشتیبانی: از طریق راه‌های ارتباطی درج‌شده در سایت انجام می‌شود.",
            'privacyText' => "۱. اطلاعاتی که در سفارش و فرم‌های سامانه وارد می‌کنید فقط برای ارائه‌ی همین خدمت استفاده می‌شود و در اختیار شخص سومی قرار نمی‌گیرد، مگر به حکم مراجع قانونی.\n\n۲. اطلاعات و عکس اعضای هر سازمان فقط برای مدیر همان سازمان قابل مشاهده است.\n\n۳. اطلاعات روی سرورهای داخل ایران نگهداری می‌شود و ارتباط با سایت رمزنگاری‌شده (HTTPS) است.\n\n۴. شماره‌ی موبایل شما برای ارسال کد تأیید و اطلاع‌رسانی درباره‌ی سفارش استفاده می‌شود.\n\n۵. برای حذف اطلاعات سازمان یا سفارش خود می‌توانید از طریق راه‌های ارتباطی با ما تماس بگیرید.",
            'aboutText' => 'سامانه‌ی صدور کارت، محصول استودیو اسوا است. برای پشتیبانی، مشاوره و سفارش‌های سازمانی با ما در تماس باشید.',
        ],
        'en' => [
            'seoTitle' => 'Online ID, staff & event card issuing',
            'seoDescription' => 'Issue staff, membership and event cards online in minutes — no designer, no queues: a custom form for your members, print-ready output, QR verification and live reports.',
            'heroBadge' => 'Online card issuing platform',
            'heroTitle' => 'Organization cards in minutes. No designer, no queues.',
            'heroSubtitle' => 'Send us your card design once. Members enter their details and photo, and a print-ready card in your exact design appears instantly.',
            'ctaPrimary' => 'Order online',
            'ctaSecondary' => 'Make your own card',
            'problemTitle' => 'Issuing cards shouldn’t be this painful',
            'problemItems' => ['Collecting data and photos over spreadsheets and chat', 'Typos in names and IDs, then reprinting', 'Waiting on a designer and back-and-forth files', 'Low-quality photos in the wrong size'],
            'solutionItems' => ['Every member fills in their own details with one link', 'Automatic validation of IDs, phone numbers and required fields', 'The card is generated instantly with your design', 'Automatic photo cropping and print-quality output'],
            'stepsTitle' => 'Three steps',
            'steps' => [
                ['title' => 'Send your card design', 'text' => 'Upload the blank front and back of the card for each category (e.g. staff, manager, guest). We set up your system from it.'],
                ['title' => 'Share the link with members', 'text' => 'Members sign in with your organization password, enter their details and photo, and see their card.'],
                ['title' => 'Collect the cards', 'text' => 'True-size print PDFs, images, Excel exports and live reports in the admin dashboard.'],
            ],
            'featuresTitle' => 'Everything you need to issue cards',
            'featuresSubtitle' => 'A complete platform with a dedicated portal for your organization',
            'features' => [
                ['icon' => 'layers', 'title' => 'A design per category', 'text' => 'Choosing a role in the form switches the front and back design automatically.'],
                ['icon' => 'qr', 'title' => 'QR verification', 'text' => 'Each card carries a QR code that shows its validity and expiry date when scanned.'],
                ['icon' => 'languages', 'title' => 'Multilingual forms', 'text' => 'Persian, English, Arabic and Turkish — members pick their language.'],
                ['icon' => 'cube', 'title' => '3D card reveal', 'text' => 'Double-sided cards spin in 3D right after issuing — the moment everyone remembers.'],
                ['icon' => 'chart', 'title' => 'Reports & charts', 'text' => 'Issuing stats by date, role, region or any choice field, with Excel export.'],
                ['icon' => 'printer', 'title' => 'Print-ready', 'text' => 'True-size PDFs, bulk download and high-quality images for every card.'],
                ['icon' => 'shield', 'title' => 'Secure & private', 'text' => 'Separate admin and member passwords, brute-force lockout and an activity log.'],
                ['icon' => 'table', 'title' => 'Excel import', 'text' => 'Bring in base lists (like roles and provinces) from a single spreadsheet.'],
            ],
            'useCasesTitle' => 'Who is it for?',
            'useCases' => [
                ['icon' => 'badge', 'title' => 'Staff ID cards', 'text' => 'Companies and organizations with multiple roles'],
                ['icon' => 'ticket', 'title' => 'Conferences & events', 'text' => 'Badges for attendees, speakers and guests'],
                ['icon' => 'users', 'title' => 'Membership cards', 'text' => 'Clubs, associations and NGOs'],
                ['icon' => 'school', 'title' => 'Student cards', 'text' => 'Universities, schools and academies'],
            ],
            'demoTitle' => 'Try it now',
            'demoText' => 'Type your name and title, then press the button. Your card is created right here — nothing leaves your device.',
            'customersTitle' => 'Trusted by',
            'testimonialsTitle' => 'What customers say',
            'testimonials' => [],
            'pricingTitle' => 'Plans & pricing',
            'pricingSubtitle' => 'Pick the plan that fits your organization and order online.',
            'pricingNote' => 'Prices are in Iranian Toman. Setting up your system from your design is included in every plan.',
            'faqTitle' => 'Frequently asked questions',
            'faq' => [
                ['q' => 'What do I need to order?', 'a' => 'The blank front and back of the card (JPG) for each category, your organization name, and the list of details that go on the card — like name, staff number and photo.'],
                ['q' => 'How soon is the system ready after payment?', 'a' => 'Usually within one to two business days. The link and passwords are sent to you by SMS and email.'],
                ['q' => 'Where are member details and photos stored?', 'a' => 'On servers in Iran, visible only to your organization’s admin. Members sign in with a separate password.'],
                ['q' => 'Can we print the cards ourselves?', 'a' => 'Yes. True-size or A4 PDFs work with any card printer or print shop.'],
                ['q' => 'What happens when we run out of cards?', 'a' => 'Renew or upgrade your plan in a few clicks from the order tracking page; existing cards stay as they are.'],
            ],
            'ctaBandTitle' => 'Ready to take your organization’s cards online?',
            'ctaBandText' => 'Order online in minutes — or leave your number and we’ll call you.',
            'contactTitle' => 'Talk to us',
            'contactText' => 'Questions, or need an enterprise plan? Fill in the form and our team will get back to you.',
            'termsText' => "1. Service: setting up and providing an online card issuing system based on the customer's design, for the duration and card count of the purchased plan.\n\n2. Content: the customer is responsible for the accuracy of submitted data, designs, logos and photos, and for having the right to use them.\n\n3. Setup time: the system is usually ready within 1–2 business days after payment and receipt of complete files.\n\n4. Cancellation & refunds: full refunds are available before setup begins. After delivery, payments are non-refundable unless we fail to provide the service.\n\n5. Validity: when the plan expires or the card limit is reached, issuing stops until the plan is renewed.\n\n6. Support: through the contact channels listed on the website.",
            'privacyText' => "1. Information you enter in orders and forms is used only to provide this service and is not shared with third parties except by legal order.\n\n2. Member data and photos of each organization are visible only to that organization's admin.\n\n3. Data is stored on servers in Iran and all traffic is encrypted (HTTPS).\n\n4. Your mobile number is used for verification codes and order notifications.\n\n5. To delete your organization's or order's data, contact us through the channels on this site.",
            'aboutText' => 'The card issuing platform is a product of Asva Studio. Contact us for support, consulting and enterprise orders.',
        ],
    ];
}

function landing_default_plans(): array {
    return [
        ['id' => 'basic', 'active' => true, 'highlight' => false, 'name' => ['fa' => 'پایه', 'en' => 'Basic'], 'desc' => ['fa' => 'برای تیم‌ها و رویدادهای کوچک', 'en' => 'For small teams and events'],
            'price' => 2900000, 'cardLimit' => 100, 'durationDays' => 365, 'maxVariants' => 1,
            'features' => ['fa' => ['تا ۱۰۰ کارت', 'یک طرح کارت', 'اعتبار یک‌ساله', 'خروجی PDF آماده‌ی چاپ', 'استعلام با QR'], 'en' => ['Up to 100 cards', 'One card design', 'One-year access', 'Print-ready PDF', 'QR verification']]],
        ['id' => 'pro', 'active' => true, 'highlight' => true, 'name' => ['fa' => 'حرفه‌ای', 'en' => 'Pro'], 'desc' => ['fa' => 'برای سازمان‌ها با چند رده', 'en' => 'For organizations with several roles'],
            'price' => 6900000, 'cardLimit' => 500, 'durationDays' => 365, 'maxVariants' => 5,
            'features' => ['fa' => ['تا ۵۰۰ کارت', 'تا ۵ طرح (رده) متفاوت', 'اعتبار یک‌ساله', 'گزارش و نمودار', 'فرم چندزبانه', 'نمایش سه‌بعدی کارت'], 'en' => ['Up to 500 cards', 'Up to 5 designs (roles)', 'One-year access', 'Reports & charts', 'Multilingual form', '3D card reveal']]],
        ['id' => 'enterprise', 'active' => true, 'highlight' => false, 'name' => ['fa' => 'سازمانی', 'en' => 'Enterprise'], 'desc' => ['fa' => 'برای حجم بالا و نیازهای خاص', 'en' => 'For high volume and custom needs'],
            'price' => 0, 'cardLimit' => 0, 'durationDays' => 365, 'maxVariants' => 0,
            'features' => ['fa' => ['تعداد کارت نامحدود', 'طرح‌های نامحدود', 'آدرس اختصاصی', 'پشتیبانی ویژه'], 'en' => ['Unlimited cards', 'Unlimited designs', 'Custom address', 'Priority support']]],
    ];
}

/** چهار نفر نمونه‌ی کارت متحرک بالای صفحه‌ی معرفی (از «تنظیمات پلتفرم ← کارت صفحه‌ی اصلی» قابل تغییر). */
function hero_default_people(): array {
    return [
        ['photo' => '', 'color' => '#7c3aed', 'name' => ['fa' => 'سارا محمدی', 'en' => 'Sara Mohammadi'], 'age' => 29, 'role' => ['fa' => 'طراح ارشد محصول', 'en' => 'Senior Product Designer']],
        ['photo' => '', 'color' => '#0ea5e9', 'name' => ['fa' => 'رضا کریمی', 'en' => 'Reza Karimi'], 'age' => 47, 'role' => ['fa' => 'مدیر فنی', 'en' => 'Technical Director']],
        ['photo' => '', 'color' => '#10b981', 'name' => ['fa' => 'مریم احمدی', 'en' => 'Maryam Ahmadi'], 'age' => 36, 'role' => ['fa' => 'پزشک متخصص', 'en' => 'Medical Specialist']],
        ['photo' => '', 'color' => '#f43f5e', 'name' => ['fa' => 'علی رضایی', 'en' => 'Ali Rezaei'], 'age' => 61, 'role' => ['fa' => 'استاد دانشگاه', 'en' => 'University Professor']],
    ];
}
/** ادغام مقادیر ذخیره‌شده با پیش‌فرض‌ها و پاک‌سازی (هم در api و هم در landing.php). */
function hero_people_merge($saved, ?callable $validImage = null): array {
    $def = hero_default_people(); $saved = is_array($saved) ? array_values($saved) : [];
    $txt = fn($v, $max) => is_scalar($v) ? mb_substr(trim((string)$v), 0, $max) : '';
    $out = [];
    foreach ($def as $i => $d) {
        $s = is_array($saved[$i] ?? null) ? $saved[$i] : [];
        $photo = $txt($s['photo'] ?? '', 500);
        if ($photo !== '' && $validImage && !$validImage($photo)) $photo = '';
        $color = preg_match('/^#[0-9a-fA-F]{6}$/', (string)($s['color'] ?? '')) ? $s['color'] : $d['color'];
        $loc = function ($k, $max) use ($s, $d, $txt) { $v = is_array($s[$k] ?? null) ? $s[$k] : []; return ['fa' => $txt($v['fa'] ?? $d[$k]['fa'], $max), 'en' => $txt($v['en'] ?? $d[$k]['en'], $max)]; };
        $age = isset($s['age']) && is_numeric($s['age']) ? max(0, min(120, (int)$s['age'])) : $d['age'];
        $out[] = ['photo' => $photo, 'color' => $color, 'name' => $loc('name', 60), 'age' => $age, 'role' => $loc('role', 60)];
    }
    return $out;
}
