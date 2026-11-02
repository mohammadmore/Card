<?php
declare(strict_types=1);
// صفحه‌ی معرفی عمومی (/card/ و /card/en) و صفحه‌های قوانین، حریم خصوصی و تماس.
// سمت سرور ساخته می‌شود تا سریع باز شود و گوگل محتوا را ببیند. برنامه‌ی اصلی (پنل‌ها، درگاه سازمان‌ها، سفارش)
// همچنان index.html است؛ اگر نشانی مربوط به آن باشد (?org=، ?verify=، ?view=) همان را تحویل می‌دهیم.
define('CARD_LANDING', true);
ini_set('display_errors', '0');

$spaParams = ['org', 'verify', 'view', 'admin'];
foreach ($spaParams as $p) if (isset($_GET[$p])) { serve_spa(); }
function serve_spa(): void {
    header('Content-Type: text/html; charset=utf-8'); header('Cache-Control: no-cache');
    readfile(__DIR__ . '/index.html'); exit;
}

// --- پیکربندی و دیتابیس (فقط خواندن تنظیمات) ---
function lp_config(): array {
    foreach ([dirname(__DIR__, 2) . '/superadmin_config.php', dirname(__DIR__) . '/superadmin_config.php', __DIR__ . '/config.php'] as $f) { if (is_file($f)) { $c = require $f; if (is_array($c)) return $c; } }
    return [];
}
$config = lp_config();
date_default_timezone_set((string)($config['timezone'] ?? 'Asia/Tehran'));
$settings = [];
try {
    $db = $config['db'] ?? null;
    if ($db) {
        $pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $settings = $pdo->query("SELECT k, v FROM platform_settings WHERE k IN ('platform', 'logoUrl', 'landing', 'plans')")->fetchAll(PDO::FETCH_KEY_PAIR);
    }
} catch (Throwable $e) { error_log('[landing] ' . $e->getMessage()); }
require __DIR__ . '/landing_defaults.php';

$plat = json_decode($settings['platform'] ?? '', true) ?: [];
$platName = (string)($plat['name'] ?? 'پلتفرم یکپارچه صدور کارت');
$logo = (string)($plat['logoUrl'] ?? ($settings['logoUrl'] ?? '')); $logoDark = (string)($plat['logoUrlDark'] ?? '');
$favicon = (string)($plat['faviconUrl'] ?? '');
$theme = is_array($plat['superTheme'] ?? null) ? $plat['superTheme'] : ['c1' => '#f472b6', 'c2' => '#38bdf8', 'c3' => '#a855f7'];
foreach (['c1', 'c2', 'c3'] as $k) if (!preg_match('/^#[0-9a-fA-F]{6}$/', (string)($theme[$k] ?? ''))) $theme[$k] = ['c1' => '#f472b6', 'c2' => '#38bdf8', 'c3' => '#a855f7'][$k];
$footer = is_array($plat['footer'] ?? null) ? $plat['footer'] : ['show' => true, 'line1' => 'Powered by Asva Studio', 'line2' => '', 'phone' => '', 'link' => ''];

$def = landing_default_content(); $saved = json_decode($settings['landing'] ?? '', true) ?: [];
$L = $def;
foreach (['fa', 'en', 'common'] as $part) if (is_array($saved[$part] ?? null)) foreach ($def[$part] as $k => $v) if (array_key_exists($k, $saved[$part])) $L[$part][$k] = $saved[$part][$k];
$common = $L['common'];
$plans = isset($settings['plans']) ? (json_decode($settings['plans'], true) ?: []) : landing_default_plans();
$plans = array_values(array_filter($plans, fn($p) => is_array($p) && ($p['active'] ?? true) !== false));

$lang = (($_GET['lang'] ?? '') === 'en' || ($_GET['lang'] ?? '') === 'en/') && $common['showEnglish'] ? 'en' : 'fa';
$C = $L[$lang]; $rtl = $lang === 'fa';
$page = in_array($_GET['page'] ?? '', ['terms', 'privacy', 'contact', 'sitemap'], true) ? $_GET['page'] : '';

// --- نشانی‌ها ---
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
$basePath = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/') . '/';
$origin = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
if (!empty($config['base_url'])) { $u = parse_url((string)$config['base_url']); $origin = ($u['scheme'] ?? 'https') . '://' . ($u['host'] ?? '') . (isset($u['port']) ? ':' . $u['port'] : ''); $basePath = rtrim($u['path'] ?? '/', '/') . '/'; }
$abs = fn(string $p = '') => $origin . $basePath . $p;
$link = fn(string $p = '', ?string $lg = null) => $basePath . ((($lg ?? $lang) === 'en') ? 'en' . ($p !== '' ? '/' . $p : '') : $p);
$asset = function (string $f) use ($basePath) { $path = __DIR__ . '/' . $f; return $basePath . $f . (is_file($path) ? '?v=' . substr(md5((string)filemtime($path) . filesize($path)), 0, 10) : ''); };
$imgUrl = fn(string $u) => $u === '' ? '' : (preg_match('#^https?://#i', $u) ? $u : $basePath . ltrim($u, './'));

if ($page === 'sitemap') {
    header('Content-Type: application/xml; charset=utf-8');
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n";
    foreach (['', 'terms', 'privacy', 'contact'] as $p) { echo '  <url><loc>' . htmlspecialchars($abs($p)) . "</loc></url>\n"; if ($common['showEnglish']) echo '  <url><loc>' . htmlspecialchars($abs('en' . ($p ? "/$p" : ''))) . "</loc></url>\n"; }
    echo "</urlset>\n"; exit;
}

// --- ابزارهای نمایش ---
function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
$ICONS = json_decode((string)@file_get_contents(__DIR__ . '/assets/landing-icons.json'), true) ?: [];
$ic = fn(string $k, string $cls = 'w-5 h-5') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="' . h($cls) . '" aria-hidden="true">' . ($ICONS[$k] ?? ($ICONS['sparkles'] ?? '')) . '</svg>';
$num = fn($s) => $lang === 'fa' ? strtr((string)$s, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹', ',' => '٬']) : (string)$s;
$paras = fn(string $t) => implode('', array_map(fn($p) => '<p>' . nl2br(h(trim($p))) . '</p>', array_filter(preg_split('/\n\s*\n/', $t) ?: [], fn($p) => trim($p) !== '')));
$UI = [
    'fa' => ['features' => 'امکانات', 'demo' => 'امتحان کنید', 'pricing' => 'قیمت‌ها', 'faq' => 'سؤالات', 'contact' => 'تماس', 'order' => 'سفارش', 'track' => 'پیگیری سفارش', 'theme' => 'حالت نمایش', 'menu' => 'منو',
        'name' => 'نام و نام خانوادگی', 'role' => 'سمت', 'photo' => 'عکس (اختیاری)', 'make' => 'کارتم را بساز', 'making' => 'در حال ساخت…', 'again' => 'دوباره', 'demo_name' => 'مثلاً: سارا محمدی', 'demo_role' => 'مثلاً: مدیر طراحی',
        'sample_org' => 'سازمان نمونه', 'cta_order' => 'این کارت را با طرح سازمان خودم می‌خواهم', 'per' => 'تومان', 'contact_us' => 'تماس بگیرید', 'order_now' => 'سفارش آنلاین', 'popular' => 'پیشنهاد ما',
        'cards' => 'کارت', 'unlimited' => 'نامحدود', 'days' => 'روز', 'mobile' => 'شماره‌ی موبایل', 'org' => 'نام سازمان', 'email' => 'ایمیل (اختیاری)', 'count' => 'تعداد تقریبی کارت', 'msg' => 'توضیحات', 'send' => 'ارسال درخواست', 'sending' => 'در حال ارسال…',
        'sent' => 'درخواست شما ثبت شد. به‌زودی با شما تماس می‌گیریم.', 'err' => 'ارسال انجام نشد. دوباره تلاش کنید.', 'terms' => 'قوانین و مقررات', 'privacy' => 'حریم خصوصی', 'about' => 'تماس با ما', 'rights' => 'تمامی حقوق محفوظ است.',
        'problem' => 'امروز', 'solution' => 'با این سامانه', 'home' => 'صفحه‌ی اصلی', 'lang' => 'English', 'show_front' => 'روی کارت', 'show_back' => 'پشت کارت', 'pause_rotation' => 'توقف چرخش', 'play_rotation' => 'چرخش خودکار', 'view_3d' => 'نمایش سه‌بعدی کارت', 'showcase_hint' => 'برای چرخاندن، کارت را بکشید', 'phone' => 'تلفن', 'address' => 'نشانی', 'need_name' => 'نام را بنویسید.'],
    'en' => ['features' => 'Features', 'demo' => 'Try it', 'pricing' => 'Pricing', 'faq' => 'FAQ', 'contact' => 'Contact', 'order' => 'Order', 'track' => 'Track order', 'theme' => 'Theme', 'menu' => 'Menu',
        'name' => 'Full name', 'role' => 'Job title', 'photo' => 'Photo (optional)', 'make' => 'Make my card', 'making' => 'Creating…', 'again' => 'Again', 'demo_name' => 'e.g. Sara Mohammadi', 'demo_role' => 'e.g. Design Lead',
        'sample_org' => 'Sample Organization', 'cta_order' => 'I want this with my own design', 'per' => 'Toman', 'contact_us' => 'Contact us', 'order_now' => 'Order online', 'popular' => 'Most popular',
        'cards' => 'cards', 'unlimited' => 'Unlimited', 'days' => 'days', 'mobile' => 'Mobile number', 'org' => 'Organization', 'email' => 'Email (optional)', 'count' => 'Approx. number of cards', 'msg' => 'Message', 'send' => 'Send request', 'sending' => 'Sending…',
        'sent' => 'Thanks! We will contact you shortly.', 'err' => 'Could not send. Please try again.', 'terms' => 'Terms', 'privacy' => 'Privacy', 'about' => 'Contact us', 'rights' => 'All rights reserved.',
        'problem' => 'Today', 'solution' => 'With this platform', 'home' => 'Home', 'lang' => 'فارسی', 'show_front' => 'Front', 'show_back' => 'Back', 'pause_rotation' => 'Pause', 'play_rotation' => 'Auto-rotate', 'view_3d' => '3D card view', 'showcase_hint' => 'Drag the card to rotate it', 'phone' => 'Phone', 'address' => 'Address', 'need_name' => 'Please enter a name.'],
][$lang];

$title = $page === '' ? $C['seoTitle'] . ' | ' . $platName : $UI[$page === 'contact' ? 'about' : $page] . ' | ' . $platName;
$pageUrl = $abs(($lang === 'en' ? 'en' . ($page ? "/$page" : '') : $page));
$altUrl = fn(string $lg) => $abs(($lg === 'en' ? 'en' . ($page ? "/$page" : '') : $page));
$logoSrc = $imgUrl($logo) ?: $basePath . 'assets/logo.svg'; $logoDarkSrc = $imgUrl($logoDark);
$orderUrl = fn(string $planId = '') => $basePath . 'order?' . http_build_query(array_filter(['plan' => $planId, 'lang' => $lang === 'en' ? 'en' : ''])) ;
$contactLinks = array_filter([
    'phone' => $common['phone'] !== '' ? ['tel:' . preg_replace('/[^\d+]/', '', $common['phone']), $num($common['phone']), 'phone'] : null,
    'email' => $common['email'] !== '' ? ['mailto:' . $common['email'], $common['email'], 'mail'] : null,
    'telegram' => $common['telegram'] !== '' ? [preg_match('#^https?://#', $common['telegram']) ? $common['telegram'] : 'https://t.me/' . ltrim($common['telegram'], '@'), 'Telegram', 'send'] : null,
    'whatsapp' => $common['whatsapp'] !== '' ? [preg_match('#^https?://#', $common['whatsapp']) ? $common['whatsapp'] : 'https://wa.me/' . preg_replace('/\D/', '', preg_replace('/^0/', '98', $common['whatsapp'])), 'WhatsApp', 'message'] : null,
    'bale' => $common['bale'] !== '' ? [preg_match('#^https?://#', $common['bale']) ? $common['bale'] : 'https://ble.ir/' . ltrim($common['bale'], '@'), $lang === 'fa' ? 'بله' : 'Bale', 'message'] : null,
    'eitaa' => $common['eitaa'] !== '' ? [preg_match('#^https?://#', $common['eitaa']) ? $common['eitaa'] : 'https://eitaa.com/' . ltrim($common['eitaa'], '@'), $lang === 'fa' ? 'ایتا' : 'Eitaa', 'message'] : null,
    'instagram' => $common['instagram'] !== '' ? [preg_match('#^https?://#', $common['instagram']) ? $common['instagram'] : 'https://instagram.com/' . ltrim($common['instagram'], '@'), 'Instagram', 'camera'] : null,
]);

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
$jsonLd = [
    '@context' => 'https://schema.org', '@graph' => array_values(array_filter([
        ['@type' => 'Organization', 'name' => $platName, 'url' => $abs(), 'logo' => preg_match('#^https?://#', $logoSrc) ? $logoSrc : $origin . $logoSrc] + ($common['phone'] ? ['telephone' => $common['phone']] : []),
        ['@type' => 'WebSite', 'name' => $platName, 'url' => $abs(), 'inLanguage' => $lang],
        $page === '' && $C['faq'] ? ['@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => $f['q'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f['a']]], $C['faq'])] : null,
    ])),
];
?><!DOCTYPE html>
<html lang="<?= $lang ?>" dir="<?= $rtl ? 'rtl' : 'ltr' ?>" class="no-js">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= h($title) ?></title>
<meta name="description" content="<?= h($page === '' ? $C['seoDescription'] : mb_substr(strip_tags($page === 'contact' ? $C['contactText'] : $C[$page . 'Text']), 0, 160)) ?>">
<link rel="canonical" href="<?= h($pageUrl) ?>">
<?php if ($common['showEnglish']): ?><link rel="alternate" hreflang="fa" href="<?= h($altUrl('fa')) ?>"><link rel="alternate" hreflang="en" href="<?= h($altUrl('en')) ?>"><link rel="alternate" hreflang="x-default" href="<?= h($altUrl('fa')) ?>"><?php endif; ?>
<meta property="og:type" content="website"><meta property="og:title" content="<?= h($C['seoTitle']) ?>"><meta property="og:description" content="<?= h($C['seoDescription']) ?>"><meta property="og:url" content="<?= h($pageUrl) ?>"><meta property="og:site_name" content="<?= h($platName) ?>"><meta property="og:locale" content="<?= $lang === 'fa' ? 'fa_IR' : 'en_US' ?>">
<?php if ($common['ogImage'] !== ''): $og = $imgUrl($common['ogImage']); ?><meta property="og:image" content="<?= h(preg_match('#^https?://#', $og) ? $og : $origin . $og) ?>"><meta name="twitter:card" content="summary_large_image"><?php endif; ?>
<meta name="theme-color" content="<?= h($theme['c3']) ?>">
<link rel="icon" href="<?= h($favicon !== '' ? $imgUrl($favicon) : $basePath . 'assets/logo.svg') ?>">
<link rel="preload" href="<?= h($basePath) ?>assets/fonts/Vazirmatn-Variable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="<?= h($asset('assets/landing.css')) ?>">
<style>:root{--g1:<?= h($theme['c1']) ?>;--g2:<?= h($theme['c2']) ?>;--g3:<?= h($theme['c3']) ?>}</style>
<script>document.documentElement.classList.remove('no-js');try{var m=localStorage.getItem('ui_theme');if(m==='dark'||((!m||m==='system')&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}</script>
<script type="application/ld+json"><?= json_encode($jsonLd, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) ?></script>
</head>
<body class="min-h-screen">
<a href="#main" class="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 lp-card rounded-lg px-3 py-2"><?= $lang === 'fa' ? 'رفتن به محتوا' : 'Skip to content' ?></a>
<header class="lp-header sticky top-0 z-40">
  <div class="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
    <a href="<?= h($link('')) ?>" class="flex items-center gap-2.5 min-w-0 me-auto">
      <img src="<?= h($logoSrc) ?>" alt="" class="w-9 h-9 object-contain <?= $logoDarkSrc ? 'dark:hidden' : '' ?>" width="36" height="36">
      <?php if ($logoDarkSrc): ?><img src="<?= h($logoDarkSrc) ?>" alt="" class="w-9 h-9 object-contain hidden dark:block" width="36" height="36"><?php endif; ?>
      <span class="font-extrabold truncate text-[15px]"><?= h($platName) ?></span>
    </a>
    <nav class="hidden md:flex items-center gap-1 text-sm font-semibold lp-muted" aria-label="<?= h($UI['menu']) ?>">
      <?php foreach ([['features', '#features'], ['demo', '#demo'], ['pricing', '#pricing'], ['faq', '#faq'], ['contact', '#contact']] as [$k, $a]): if ($k === 'pricing' && !$common['showPricing']) continue; if ($k === 'demo' && !$common['demoEnabled']) continue; ?>
        <a href="<?= h(($page === '' ? '' : $link('')) . $a) ?>" class="px-3 py-2 rounded-lg hover:text-[var(--fg)]"><?= h($UI[$k]) ?></a>
      <?php endforeach; ?>
    </nav>
    <?php if ($common['showEnglish']): ?><a href="<?= h($link($page === 'sitemap' ? '' : $page, $lang === 'fa' ? 'en' : 'fa')) ?>" hreflang="<?= $lang === 'fa' ? 'en' : 'fa' ?>" class="text-sm font-bold px-2.5 py-2 rounded-lg lp-btn-ghost" lang="<?= $lang === 'fa' ? 'en' : 'fa' ?>"><?= h($UI['lang']) ?></a><?php endif; ?>
    <button type="button" id="lp-theme" class="w-9 h-9 inline-flex items-center justify-center rounded-lg lp-btn-ghost" aria-label="<?= h($UI['theme']) ?>" title="<?= h($UI['theme']) ?>"><span class="dark:hidden"><?= $ic('moon', 'w-4 h-4') ?></span><span class="hidden dark:inline"><?= $ic('sun', 'w-4 h-4') ?></span></button>
    <a href="<?= h($common['showPricing'] ? ($page === '' ? '#pricing' : $link('') . '#pricing') : $orderUrl()) ?>" class="hidden sm:inline-flex lp-btn rounded-xl px-4 py-2 text-sm font-bold"><?= h($UI['order']) ?></a>
    <details class="md:hidden relative">
      <summary class="list-none w-9 h-9 inline-flex items-center justify-center rounded-lg lp-btn-ghost cursor-pointer" aria-label="<?= h($UI['menu']) ?>"><?= $ic('menu', 'w-5 h-5') ?></summary>
      <div class="absolute end-0 mt-2 w-52 lp-card rounded-2xl p-2 shadow-xl flex flex-col text-sm font-semibold">
        <?php foreach ([['features', '#features'], ['demo', '#demo'], ['pricing', '#pricing'], ['faq', '#faq'], ['contact', '#contact']] as [$k, $a]): if ($k === 'pricing' && !$common['showPricing']) continue; if ($k === 'demo' && !$common['demoEnabled']) continue; ?>
          <a href="<?= h(($page === '' ? '' : $link('')) . $a) ?>" class="px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><?= h($UI[$k]) ?></a>
        <?php endforeach; ?>
        <a href="<?= h($basePath . 'track' . ($lang === 'en' ? '?lang=en' : '')) ?>" class="px-3 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><?= h($UI['track']) ?></a>
      </div>
    </details>
  </div>
</header>

<main id="main">
<?php if ($page !== ''): ?>
  <section class="relative">
    <div class="lp-aurora" aria-hidden="true"><i></i><i></i></div>
    <div class="relative max-w-3xl mx-auto px-4 py-14">
      <a href="<?= h($link('')) ?>" class="text-sm font-bold lp-muted inline-flex items-center gap-1"><?= $ic($rtl ? 'arrowR' : 'arrowL', 'w-4 h-4') ?> <?= h($UI['home']) ?></a>
      <h1 class="text-3xl font-black mt-4 mb-8"><?= h($UI[$page === 'contact' ? 'about' : $page]) ?></h1>
      <?php if ($page === 'contact'): ?>
        <div class="lp-prose lp-muted text-[15px]"><?= $paras($C['aboutText']) ?></div>
        <div class="grid sm:grid-cols-2 gap-3 mt-6">
          <?php foreach ($contactLinks as [$href, $label, $icon]): ?><a href="<?= h($href) ?>" class="lp-card rounded-2xl p-4 flex items-center gap-3 font-bold" <?= str_starts_with($href, 'http') ? 'target="_blank" rel="noopener"' : '' ?>><span class="lp-icon w-10 h-10 rounded-xl inline-flex items-center justify-center"><?= $ic($icon) ?></span><span dir="ltr"><?= h($label) ?></span></a><?php endforeach; ?>
          <?php if ($common['address'] !== ''): ?><div class="lp-card rounded-2xl p-4 flex items-center gap-3 sm:col-span-2"><span class="lp-icon w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0"><?= $ic('map') ?></span><span><?= h($common['address']) ?></span></div><?php endif; ?>
        </div>
        <p class="mt-8"><a href="<?= h($link('') . '#contact') ?>" class="lp-btn rounded-xl px-5 py-3 font-bold inline-flex"><?= h($C['contactTitle']) ?></a></p>
      <?php else: ?>
        <article class="lp-card rounded-3xl p-6 sm:p-8 lp-prose text-[15px]"><?= $paras($C[$page . 'Text']) ?></article>
      <?php endif; ?>
    </div>
  </section>
<?php else: ?>
  <!-- ========== بالای صفحه ========== -->
  <section class="relative overflow-hidden">
    <div class="lp-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="relative max-w-6xl mx-auto px-4 pt-14 pb-16 lg:pt-20 lg:pb-24 grid lg:grid-cols-2 gap-12 items-center">
      <div>
        <span class="lp-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"><?= $ic('sparkles', 'w-3.5 h-3.5') ?> <?= h($C['heroBadge']) ?></span>
        <h1 class="mt-5 text-4xl sm:text-5xl font-black leading-[1.35] sm:leading-[1.3]"><span class="lp-grad-text"><?= h($C['heroTitle']) ?></span></h1>
        <p class="mt-5 text-lg lp-muted leading-loose"><?= h($C['heroSubtitle']) ?></p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a href="<?= h($common['showPricing'] ? '#pricing' : $orderUrl()) ?>" class="lp-btn rounded-2xl px-6 py-3.5 font-bold inline-flex items-center gap-2"><?= $ic('rocket', 'w-5 h-5') ?> <?= h($C['ctaPrimary']) ?></a>
          <?php if ($common['demoEnabled']): ?><a href="#demo" class="lp-btn-ghost rounded-2xl px-6 py-3.5 font-bold inline-flex items-center gap-2"><?= $ic('wand', 'w-5 h-5') ?> <?= h($C['ctaSecondary']) ?></a><?php endif; ?>
        </div>
      </div>
      <div class="lp-hero-stage flex flex-col items-center" aria-hidden="true">
        <div class="lp-hero-card">
          <div class="lp-hero-front"><span class="lp-shine"></span>
            <div class="absolute inset-0 p-[7%] flex flex-col text-white">
              <div class="flex items-center gap-2"><span class="w-8 h-8 rounded-lg bg-white/90 inline-flex items-center justify-center text-[var(--g3)]"><?= $ic('building', 'w-5 h-5') ?></span><span class="font-extrabold text-sm"><?= h($UI['sample_org']) ?></span></div>
              <div class="mt-auto flex items-end gap-4">
                <div class="w-[24%] aspect-[4/5] rounded-xl bg-white/85 flex items-end justify-center overflow-hidden"><span class="w-[70%] aspect-square rounded-full bg-slate-300 translate-y-[35%]"></span></div>
                <div class="flex-1 space-y-2 pb-1"><div class="h-3.5 w-3/4 rounded-full bg-white/90"></div><div class="h-2.5 w-1/2 rounded-full bg-white/60"></div><div class="h-2 w-2/5 rounded-full bg-white/40"></div></div>
              </div>
            </div>
          </div>
          <div class="lp-hero-back"><div class="absolute inset-0 flex items-center justify-center"><span class="w-1/3 aspect-square rounded-2xl bg-white/90 text-[#1e1b4b] inline-flex items-center justify-center"><?= $ic('qr', 'w-3/4 h-3/4') ?></span></div></div>
        </div>
        <div class="lp-hero-shadow"></div>
      </div>
    </div>
  </section>

  <!-- ========== مشکل و راه‌حل ========== -->
  <section class="max-w-6xl mx-auto px-4 py-16 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['problemTitle']) ?></h2>
    <div class="grid md:grid-cols-2 gap-5 mt-10">
      <div class="lp-card rounded-3xl p-6"><h3 class="font-bold lp-muted mb-4"><?= h($UI['problem']) ?></h3><ul class="space-y-3"><?php foreach ($C['problemItems'] as $it): ?><li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 inline-flex items-center justify-center shrink-0 mt-0.5"><?= $ic('x', 'w-3.5 h-3.5') ?></span><span><?= h($it) ?></span></li><?php endforeach; ?></ul></div>
      <div class="lp-card rounded-3xl p-6"><h3 class="font-bold mb-4 lp-grad-text"><?= h($UI['solution']) ?></h3><ul class="space-y-3"><?php foreach ($C['solutionItems'] as $it): ?><li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center shrink-0 mt-0.5"><?= $ic('check', 'w-3.5 h-3.5') ?></span><span><?= h($it) ?></span></li><?php endforeach; ?></ul></div>
    </div>
  </section>

  <!-- ========== سه قدم ========== -->
  <section class="max-w-6xl mx-auto px-4 py-16 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['stepsTitle']) ?></h2>
    <ol class="grid md:grid-cols-3 gap-5 mt-10">
      <?php foreach ($C['steps'] as $i => $s): ?>
        <li class="lp-card rounded-3xl p-6 relative"><span class="lp-btn w-10 h-10 rounded-2xl inline-flex items-center justify-center font-black text-lg"><?= $num($i + 1) ?></span><h3 class="font-extrabold text-lg mt-4"><?= h($s['title']) ?></h3><p class="lp-muted mt-2 leading-loose text-[15px]"><?= h($s['text']) ?></p></li>
      <?php endforeach; ?>
    </ol>
  </section>

  <!-- ========== امکانات ========== -->
  <section id="features" class="max-w-6xl mx-auto px-4 py-16 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['featuresTitle']) ?></h2>
    <p class="text-center lp-muted mt-3"><?= h($C['featuresSubtitle']) ?></p>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
      <?php foreach ($C['features'] as $f): ?>
        <div class="lp-card rounded-3xl p-5"><span class="lp-icon w-11 h-11 rounded-2xl inline-flex items-center justify-center"><?= $ic($f['icon'] ?: 'sparkles', 'w-5 h-5') ?></span><h3 class="font-extrabold mt-4"><?= h($f['title']) ?></h3><p class="lp-muted text-sm mt-2 leading-7"><?= h($f['text']) ?></p></div>
      <?php endforeach; ?>
    </div>
  </section>

  <!-- ========== کاربردها ========== -->
  <section class="max-w-6xl mx-auto px-4 py-12 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['useCasesTitle']) ?></h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
      <?php foreach ($C['useCases'] as $u): ?>
        <div class="lp-card rounded-3xl p-5 text-center"><span class="lp-icon w-12 h-12 rounded-2xl inline-flex items-center justify-center"><?= $ic($u['icon'] ?: 'badge', 'w-6 h-6') ?></span><h3 class="font-extrabold mt-3"><?= h($u['title']) ?></h3><p class="lp-muted text-sm mt-1 leading-6"><?= h($u['text']) ?></p></div>
      <?php endforeach; ?>
    </div>
  </section>

  <?php if ($common['demoEnabled']): ?>
  <!-- ========== دموی زنده ========== -->
  <section id="demo" class="relative py-16">
    <div class="max-w-5xl mx-auto px-4 lp-reveal">
      <div class="lp-card rounded-[2rem] p-6 sm:p-10">
        <div class="text-center max-w-2xl mx-auto"><span class="lp-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"><?= $ic('wand', 'w-3.5 h-3.5') ?> <?= h($UI['demo']) ?></span><h2 class="text-3xl font-black mt-4"><?= h($C['demoTitle']) ?></h2><p class="lp-muted mt-3 leading-loose"><?= h($C['demoText']) ?></p></div>
        <form id="lp-demo-form" class="mt-8 grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end" novalidate>
          <label class="block"><span class="text-sm font-bold"><?= h($UI['name']) ?></span><input name="name" maxlength="40" required class="lp-input mt-1.5 w-full rounded-xl px-4 py-3" placeholder="<?= h($UI['demo_name']) ?>" autocomplete="name"></label>
          <label class="block"><span class="text-sm font-bold"><?= h($UI['role']) ?></span><input name="role" maxlength="40" class="lp-input mt-1.5 w-full rounded-xl px-4 py-3" placeholder="<?= h($UI['demo_role']) ?>" autocomplete="organization-title"></label>
          <button type="submit" class="lp-btn rounded-xl px-6 py-3 font-bold inline-flex items-center justify-center gap-2 h-[50px]"><?= $ic('sparkles', 'w-5 h-5') ?> <span><?= h($UI['make']) ?></span></button>
          <label class="sm:col-span-3 inline-flex items-center gap-2 text-sm font-semibold cursor-pointer w-fit lp-btn-ghost rounded-xl px-3 py-2 focus-within:ring-2"><?= $ic('camera', 'w-4 h-4') ?> <span id="lp-photo-name"><?= h($UI['photo']) ?></span><input type="file" name="photo" accept="image/*" class="sr-only"></label>
          <p id="lp-demo-err" class="sm:col-span-3 text-sm text-rose-600 hidden" role="alert"></p>
        </form>
        <div id="lp-demo-stage" class="relative mt-6 min-h-[40px]" aria-live="polite"></div>
      </div>
    </div>
  </section>
  <?php endif; ?>

  <?php if ($common['customers']): ?>
  <section class="max-w-6xl mx-auto px-4 py-12 lp-reveal">
    <h2 class="text-center font-bold lp-muted"><?= h($C['customersTitle']) ?></h2>
    <div class="flex flex-wrap justify-center items-center gap-8 mt-6">
      <?php foreach ($common['customers'] as $cu): ?><figure class="flex flex-col items-center gap-2 opacity-80 hover:opacity-100 transition"><?php if ($cu['logoUrl'] !== ''): ?><img src="<?= h($imgUrl($cu['logoUrl'])) ?>" alt="<?= h($cu['name']) ?>" class="h-12 w-auto object-contain" loading="lazy"><?php endif; ?><figcaption class="text-xs lp-muted"><?= h($cu['name']) ?></figcaption></figure><?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if ($C['testimonials']): ?>
  <section class="max-w-6xl mx-auto px-4 py-12 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['testimonialsTitle']) ?></h2>
    <div class="grid md:grid-cols-3 gap-4 mt-10">
      <?php foreach ($C['testimonials'] as $tm): ?><figure class="lp-card rounded-3xl p-6"><span class="lp-muted"><?= $ic('quote', 'w-6 h-6') ?></span><blockquote class="mt-3 leading-loose"><?= h($tm['text']) ?></blockquote><figcaption class="mt-4 text-sm"><b><?= h($tm['name']) ?></b><?php if ($tm['role'] !== ''): ?> <span class="lp-muted">— <?= h($tm['role']) ?></span><?php endif; ?></figcaption></figure><?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <?php if ($common['showPricing'] && $plans): ?>
  <!-- ========== قیمت‌ها ========== -->
  <section id="pricing" class="max-w-6xl mx-auto px-4 py-16 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['pricingTitle']) ?></h2>
    <p class="text-center lp-muted mt-3"><?= h($C['pricingSubtitle']) ?></p>
    <div class="grid md:grid-cols-<?= min(3, count($plans)) ?> gap-5 mt-10 items-stretch">
      <?php foreach ($plans as $p): $pname = ($p['name'][$lang] ?? '') ?: ($p['name']['fa'] ?? ''); $pdesc = ($p['desc'][$lang] ?? '') ?: ($p['desc']['fa'] ?? ''); $feats = ($p['features'][$lang] ?? []) ?: ($p['features']['fa'] ?? []); $hl = !empty($p['highlight']); ?>
        <div class="rounded-3xl p-6 flex flex-col relative <?= $hl ? 'lp-price-hl shadow-xl' : 'lp-card' ?>">
          <?php if ($hl): ?><span class="lp-btn absolute -top-3 start-6 rounded-full px-3 py-1 text-xs font-bold"><?= h($UI['popular']) ?></span><?php endif; ?>
          <h3 class="font-black text-xl"><?= h($pname) ?></h3>
          <?php if ($pdesc !== ''): ?><p class="lp-muted text-sm mt-1"><?= h($pdesc) ?></p><?php endif; ?>
          <div class="mt-5 mb-5"><?php if ((int)$p['price'] > 0): ?><span class="text-3xl font-black"><?= $num(number_format((int)$p['price'])) ?></span> <span class="lp-muted text-sm"><?= h($UI['per']) ?></span><?php else: ?><span class="text-2xl font-black"><?= h($UI['contact_us']) ?></span><?php endif; ?></div>
          <ul class="space-y-2.5 text-[15px] mb-6">
            <?php foreach ($feats as $ft): ?><li class="flex gap-2.5"><span class="text-emerald-600 dark:text-emerald-400 mt-1 shrink-0"><?= $ic('check', 'w-4 h-4') ?></span><span><?= h($ft) ?></span></li><?php endforeach; ?>
          </ul>
          <a href="<?= h((int)$p['price'] > 0 ? $orderUrl((string)$p['id']) : '#contact') ?>" class="mt-auto <?= $hl ? 'lp-btn' : 'lp-btn-ghost' ?> rounded-2xl px-5 py-3 font-bold text-center" data-plan="<?= h($p['id']) ?>"><?= h((int)$p['price'] > 0 ? $UI['order_now'] : $UI['contact_us']) ?></a>
        </div>
      <?php endforeach; ?>
    </div>
    <?php if ($C['pricingNote'] !== ''): ?><p class="text-center lp-muted text-sm mt-6"><?= h($C['pricingNote']) ?></p><?php endif; ?>
  </section>
  <?php endif; ?>

  <!-- ========== سؤالات متداول ========== -->
  <?php if ($C['faq']): ?>
  <section id="faq" class="max-w-3xl mx-auto px-4 py-16 lp-reveal">
    <h2 class="text-3xl font-black text-center"><?= h($C['faqTitle']) ?></h2>
    <div class="mt-10 space-y-3">
      <?php foreach ($C['faq'] as $f): ?><details class="lp-faq lp-card rounded-2xl px-5 py-4"><summary class="flex items-center justify-between gap-4 font-bold"><span><?= h($f['q']) ?></span><span class="lp-chev transition-transform lp-muted"><?= $ic('chevron', 'w-5 h-5') ?></span></summary><p class="lp-muted mt-3 leading-loose"><?= h($f['a']) ?></p></details><?php endforeach; ?>
    </div>
  </section>
  <?php endif; ?>

  <!-- ========== دعوت پایانی و فرم تماس ========== -->
  <section id="contact" class="max-w-6xl mx-auto px-4 py-16 lp-reveal">
    <div class="lp-card rounded-[2rem] p-6 sm:p-10 grid lg:grid-cols-2 gap-10">
      <div>
        <h2 class="text-3xl font-black"><?= h($C['ctaBandTitle']) ?></h2>
        <p class="lp-muted mt-3 leading-loose"><?= h($C['ctaBandText']) ?></p>
        <?php if ($common['showPricing']): ?><a href="#pricing" class="lp-btn rounded-2xl px-6 py-3 font-bold inline-flex items-center gap-2 mt-6"><?= $ic('rocket', 'w-5 h-5') ?> <?= h($C['ctaPrimary']) ?></a><?php endif; ?>
        <div class="mt-8 space-y-2">
          <?php foreach ($contactLinks as [$href, $label, $icon]): ?><a href="<?= h($href) ?>" class="flex items-center gap-3 font-semibold w-fit" <?= str_starts_with($href, 'http') ? 'target="_blank" rel="noopener"' : '' ?>><span class="lp-icon w-9 h-9 rounded-xl inline-flex items-center justify-center"><?= $ic($icon, 'w-4 h-4') ?></span><span dir="ltr"><?= h($label) ?></span></a><?php endforeach; ?>
        </div>
      </div>
      <form id="lp-lead" class="space-y-3" novalidate>
        <h3 class="font-extrabold text-xl"><?= h($C['contactTitle']) ?></h3>
        <p class="lp-muted text-sm leading-7"><?= h($C['contactText']) ?></p>
        <div class="grid sm:grid-cols-2 gap-3">
          <label class="block"><span class="text-sm font-bold"><?= h($UI['name']) ?> *</span><input name="name" required maxlength="120" autocomplete="name" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5"></label>
          <label class="block"><span class="text-sm font-bold"><?= h($UI['mobile']) ?> *</span><input name="mobile" required inputmode="tel" dir="ltr" maxlength="20" autocomplete="tel" placeholder="09xxxxxxxxx" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5 text-start"></label>
          <label class="block"><span class="text-sm font-bold"><?= h($UI['org']) ?></span><input name="org" maxlength="200" autocomplete="organization" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5"></label>
          <label class="block"><span class="text-sm font-bold"><?= h($UI['count']) ?></span><input name="cards" maxlength="40" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5"></label>
        </div>
        <label class="block"><span class="text-sm font-bold"><?= h($UI['email']) ?></span><input name="email" type="email" dir="ltr" maxlength="190" autocomplete="email" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5 text-start"></label>
        <label class="block"><span class="text-sm font-bold"><?= h($UI['msg']) ?></span><textarea name="message" rows="3" maxlength="3000" class="lp-input mt-1 w-full rounded-xl px-4 py-2.5"></textarea></label>
        <div class="hidden" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <input type="hidden" name="ts" value="">
        <p id="lp-lead-msg" class="text-sm hidden" role="status"></p>
        <button type="submit" class="lp-btn rounded-xl px-6 py-3 font-bold w-full sm:w-auto inline-flex items-center justify-center gap-2"><?= $ic('send', 'w-4 h-4') ?> <span><?= h($UI['send']) ?></span></button>
      </form>
    </div>
  </section>
<?php endif; ?>
</main>

<footer class="border-t lp-line mt-10">
  <div class="max-w-6xl mx-auto px-4 py-10 grid md:grid-cols-[1fr_auto] gap-8 items-start">
    <div>
      <div class="flex items-center gap-2.5"><img src="<?= h($logoSrc) ?>" alt="" class="w-8 h-8 object-contain <?= $logoDarkSrc ? 'dark:hidden' : '' ?>" loading="lazy"><?php if ($logoDarkSrc): ?><img src="<?= h($logoDarkSrc) ?>" alt="" class="w-8 h-8 object-contain hidden dark:block" loading="lazy"><?php endif; ?><b><?= h($platName) ?></b></div>
      <nav class="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-sm lp-muted" aria-label="footer">
        <a href="<?= h($link('terms')) ?>" class="hover:underline"><?= h($UI['terms']) ?></a>
        <a href="<?= h($link('privacy')) ?>" class="hover:underline"><?= h($UI['privacy']) ?></a>
        <a href="<?= h($link('contact')) ?>" class="hover:underline"><?= h($UI['about']) ?></a>
        <a href="<?= h($basePath . 'track' . ($lang === 'en' ? '?lang=en' : '')) ?>" class="hover:underline"><?= h($UI['track']) ?></a>
      </nav>
      <p class="text-xs lp-muted mt-4">© <?= $num(date('Y')) ?> <?= h($platName) ?> — <?= h($UI['rights']) ?><?php if (!empty($footer['show']) && ($footer['line1'] ?? '') !== ''): ?> · <span dir="auto"><?= h($footer['line1']) ?></span><?php endif; ?></p>
    </div>
    <?php if ($common['enamadId'] !== '' && $common['enamadCode'] !== ''): ?>
      <a referrerpolicy="origin" target="_blank" rel="noopener" href="https://trustseal.enamad.ir/?id=<?= h($common['enamadId']) ?>&amp;Code=<?= h($common['enamadCode']) ?>" class="lp-card rounded-2xl p-2 inline-block"><img referrerpolicy="origin" src="https://trustseal.enamad.ir/logo.aspx?id=<?= h($common['enamadId']) ?>&amp;Code=<?= h($common['enamadCode']) ?>" alt="eNamad" style="cursor:pointer" width="90" height="90" loading="lazy" code="<?= h($common['enamadCode']) ?>"></a>
    <?php endif; ?>
  </div>
</footer>

<script>
(function () {
  var UI = <?= json_encode(['make' => $UI['make'], 'making' => $UI['making'], 'send' => $UI['send'], 'sending' => $UI['sending'], 'sent' => $UI['sent'], 'err' => $UI['err'], 'need_name' => $UI['need_name']], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
  var BASE = <?= json_encode($basePath) ?>;
  // حالت نمایش (همان کلید ui_theme برنامه): روشن ↔ تیره
  document.getElementById('lp-theme').addEventListener('click', function () {
    var dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('ui_theme', dark ? 'dark' : 'light'); } catch (e) {}
  });
  // ظاهر شدن تدریجی بخش‌ها
  var els = document.querySelectorAll('.lp-reveal');
  if ('IntersectionObserver' in window) { var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('lp-in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' }); els.forEach(function (el) { io.observe(el); }); }
  else els.forEach(function (el) { el.classList.add('lp-in'); });
  document.querySelectorAll('details:not(.lp-faq) a').forEach(function (a) { a.addEventListener('click', function () { var d = a.closest('details'); if (d) d.open = false; }); });

  // فرم درخواست مشاوره
  var lead = document.getElementById('lp-lead');
  if (lead) {
    lead.ts.value = String(Date.now());
    lead.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = document.getElementById('lp-lead-msg'), btn = lead.querySelector('button[type=submit] span');
      var body = {}; ['name', 'mobile', 'org', 'cards', 'email', 'message', 'website', 'ts'].forEach(function (k) { body[k] = lead[k].value; }); body.lang = <?= json_encode($lang) ?>;
      lead.querySelector('button[type=submit]').disabled = true; btn.textContent = UI.sending; msg.classList.add('hidden');
      fetch(BASE + 'api.php?action=submit_lead', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok && !d.error, d: d }; }); })
        .then(function (res) {
          msg.classList.remove('hidden', 'text-rose-600', 'text-emerald-600');
          if (res.ok) { msg.textContent = UI.sent; msg.classList.add('text-emerald-600'); lead.reset(); lead.ts.value = String(Date.now()); }
          else { msg.textContent = res.d.error || UI.err; msg.classList.add('text-rose-600'); if (res.d.field && lead[res.d.field]) lead[res.d.field].focus(); }
        })
        .catch(function () { msg.classList.remove('hidden'); msg.textContent = UI.err; msg.classList.add('text-rose-600'); })
        .finally(function () { lead.querySelector('button[type=submit]').disabled = false; btn.textContent = UI.send; });
    });
  }

  // دموی زنده: فایل‌های لازم فقط با اولین کلیک بارگذاری می‌شوند
  var demo = document.getElementById('lp-demo-form');
  if (demo) {
    var loading = null;
    var load = function (src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); };
    var scripts = <?= json_encode([$asset('assets/react.production.min.js'), $asset('assets/react-dom.production.min.js'), $asset('assets/icons.js'), $asset('assets/qrious.min.js'), $asset('assets/demo.js')]) ?>;
    var ensure = function () { if (!loading) loading = scripts.reduce(function (p, s) { return p.then(function () { return load(s); }); }, Promise.resolve()); return loading; };
    demo.photo.addEventListener('change', function () { var f = demo.photo.files[0]; document.getElementById('lp-photo-name').textContent = f ? '✓ ' + f.name : <?= json_encode($UI['photo'], JSON_UNESCAPED_UNICODE) ?>; });
    demo.addEventListener('pointerenter', function () { ensure().catch(function () { loading = null; }); }, { once: true });
    demo.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var err = document.getElementById('lp-demo-err'), btn = demo.querySelector('button[type=submit]'), label = btn.querySelector('span');
      var name = demo.name.value.trim(); if (!name) { err.textContent = UI.need_name; err.classList.remove('hidden'); demo.name.focus(); return; }
      err.classList.add('hidden'); btn.disabled = true; label.textContent = UI.making;
      var stage = document.getElementById('lp-demo-stage');
      ensure().then(function () {
        return window.CardDemo.render(stage, {
          name: name, role: demo.role.value.trim(), photoFile: demo.photo.files[0] || null, lang: <?= json_encode($lang) ?>,
          org: <?= json_encode($UI['sample_org'], JSON_UNESCAPED_UNICODE) ?>, logoUrl: <?= json_encode($logoSrc) ?>,
          colors: <?= json_encode($theme) ?>, siteUrl: <?= json_encode($abs($lang === 'en' ? 'en' : '')) ?>,
          orderHref: <?= json_encode($common['showPricing'] ? '#pricing' : $orderUrl()) ?>,
          labels: <?= json_encode(array_intersect_key($UI, array_flip(['show_front', 'show_back', 'pause_rotation', 'play_rotation', 'view_3d', 'showcase_hint', 'cta_order', 'again'])) + ['2d' => '2D', 'canvas' => 'canvas'], JSON_UNESCAPED_UNICODE) ?>,
          onAgain: function () { demo.name.focus(); demo.name.select(); }
        });
      }).then(function () {
        // جرقه‌های کوچک در لحظه‌ی ظاهر شدن کارت
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) for (var i = 0; i < 18; i++) { var s = document.createElement('span'); s.className = 'lp-sparkle'; var a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 160; s.style.left = '50%'; s.style.top = '45%'; s.style.setProperty('--dx', Math.cos(a) * d + 'px'); s.style.setProperty('--dy', Math.sin(a) * d + 'px'); stage.appendChild(s); setTimeout(function (el) { el.remove(); }.bind(null, s), 1300); }
        stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(function (e) { err.textContent = UI.err; err.classList.remove('hidden'); loading = null; })
        .finally(function () { btn.disabled = false; label.textContent = UI.make; });
    });
  }
})();
</script>
</body>
</html>
