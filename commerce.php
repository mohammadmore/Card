<?php
declare(strict_types=1);
// فروش آنلاین: صفحه‌ی معرفی، پلن‌ها، درخواست مشاوره، سفارش با پرداخت (زرین‌پال)، کد تأیید پیامکی (ایران پیامک)
// و اعلان‌ها (پنل، ایمیل، پیامک، بله، ایتا). این فایل فقط از داخل api.php بارگذاری می‌شود.
if (!defined('CARD_API')) { http_response_code(404); exit; }

require_once __DIR__ . '/landing_defaults.php';

const SHOP_LANGS = ['fa', 'en'];
const ORDER_STATUSES = ['pending_payment', 'paid', 'in_progress', 'delivered', 'cancelled'];
const ORDER_FIELD_TYPES = ['text', 'select', 'date', 'photo', 'number'];

// ==========================================
// ابزارهای عمومی
// ==========================================
/** نشانی پایه‌ی برنامه (مثلاً https://studio.asvashop.com/card/) برای لینک‌های پیامک، ایمیل و بازگشت از درگاه. */
function app_base_url(): string {
    global $config;
    if (!empty($config['base_url'])) return rtrim((string)$config['base_url'], '/') . '/';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    return ($https ? 'https' : 'http') . "://$host$dir/";
}
function fa_to_en_digits(string $s): string { return strtr($s, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9', '٠' => '0', '١' => '1', '٢' => '2', '٣' => '3', '٤' => '4', '٥' => '5', '٦' => '6', '٧' => '7', '٨' => '8', '٩' => '9']); }
/** موبایل ایران به شکل 09xxxxxxxxx (یا null). */
function normalize_mobile(string $m): ?string {
    $m = preg_replace('/[\s\-()]/', '', fa_to_en_digits(trim($m)));
    $m = preg_replace('/^(\+98|0098|98)/', '0', $m);
    if (preg_match('/^9\d{9}$/', $m)) $m = "0$m";
    return preg_match('/^09\d{9}$/', $m) ? $m : null;
}
function valid_email(string $e): bool { return $e !== '' && filter_var($e, FILTER_VALIDATE_EMAIL) !== false && mb_strlen($e) <= 190; }
function json_setting(PDO $pdo, string $key): array { $v = json_decode(get_setting($pdo, $key), true); return is_array($v) ? $v : []; }
function split_list(string $s): array { return array_values(array_filter(array_map('trim', preg_split('/[\s,،;]+/u', $s) ?: []), fn($x) => $x !== '')); }
function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }
function money_fa(int $toman): string { return number_format($toman) . ' تومان'; }
function fa_digits(string $s): string { return strtr($s, ['0' => '۰', '1' => '۱', '2' => '۲', '3' => '۳', '4' => '۴', '5' => '۵', '6' => '۶', '7' => '۷', '8' => '۸', '9' => '۹']); }

/** محدودیت تعداد در بازه‌ی زمانی (مثلاً ۵ درخواست در ساعت از هر IP). اگر از حد گذشت، خطای ۴۲۹ برمی‌گرداند. */
function rate_limit(PDO $pdo, string $scope, int $max, int $windowSec, string $msg = 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.'): void {
    ensure_aux_schema($pdo);
    $k = sha1($scope);
    $row = $pdo->prepare("SELECT cnt, TIMESTAMPDIFF(SECOND, window_start, NOW()) AS age FROM rate_limits WHERE k = ?"); $row->execute([$k]); $r = $row->fetch();
    if (!$r || (int)$r['age'] >= $windowSec) {
        $pdo->prepare("INSERT INTO rate_limits (k, cnt, window_start) VALUES (?, 1, NOW()) ON DUPLICATE KEY UPDATE cnt = 1, window_start = NOW()")->execute([$k]);
        return;
    }
    if ((int)$r['cnt'] >= $max) respond(['error' => $msg, 'retryAfter' => max(1, $windowSec - (int)$r['age'])], 429);
    $pdo->prepare("UPDATE rate_limits SET cnt = cnt + 1 WHERE k = ?")->execute([$k]);
}

/** درخواست HTTP با بدنه‌ی JSON (یا فرم). خروجی: [کد HTTP، JSON، متن خام، خطا] */
function http_request(string $url, $body, array $headers = [], bool $json = true, int $timeout = 20): array {
    if (!function_exists('curl_init')) return [0, null, '', 'curl در سرور فعال نیست'];
    $ch = curl_init($url);
    $h = array_merge(['Accept: application/json'], $headers);
    if ($json) $h[] = 'Content-Type: application/json';
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => $json ? json_enc($body) : http_build_query($body),
        CURLOPT_HTTPHEADER => $h, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
    ]);
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($raw === false) return [0, null, '', $err ?: 'اتصال برقرار نشد'];
    $data = json_decode((string)$raw, true);
    return [$code, is_array($data) ? $data : null, (string)$raw, ''];
}
/** نشانی سرویس‌های بیرونی؛ برای تست می‌توان در config.php با shop_endpoints عوضشان کرد. */
function endpoint(string $name, string $default): string { global $config; return rtrim((string)($config['shop_endpoints'][$name] ?? $default), '/'); }

// ==========================================
// تنظیمات اتصال‌ها (فقط سوپرادمین)
// ==========================================
function integrations_defaults(): array {
    return [
        'zarinpal' => ['merchantId' => '', 'sandbox' => false],
        'sms' => ['enabled' => false, 'apiKey' => '', 'line' => '', 'otpPattern' => '', 'otpVar' => 'code'],
        'email' => ['enabled' => false, 'from' => '', 'fromName' => ''],
        'bale' => ['enabled' => false, 'token' => '', 'chatIds' => ''],
        'eitaa' => ['enabled' => false, 'token' => '', 'chatIds' => ''],
        'notify' => ['emails' => '', 'mobiles' => '', 'sms' => true, 'email' => true, 'bale' => true, 'eitaa' => true],
        'shop' => ['enabled' => true, 'reminderDays' => 14, 'unpaidHours' => 72, 'cronKey' => ''],
    ];
}
const SECRET_FIELDS = [['zarinpal', 'merchantId'], ['sms', 'apiKey'], ['bale', 'token'], ['eitaa', 'token']];
function integrations_get(PDO $pdo): array {
    $out = integrations_defaults(); $saved = json_setting($pdo, 'integrations');
    foreach ($out as $g => $vals) if (isset($saved[$g]) && is_array($saved[$g])) $out[$g] = array_merge($vals, array_intersect_key($saved[$g], $vals));
    if ($out['shop']['cronKey'] === '') { $out['shop']['cronKey'] = bin2hex(random_bytes(12)); set_setting($pdo, 'integrations', json_enc($out)); }
    return $out;
}
/** نسخه‌ی قابل نمایش در پنل: رمزها و کلیدها پنهان می‌شوند (فقط چهار نویسه‌ی آخر). */
function integrations_masked(array $in): array {
    foreach (SECRET_FIELDS as [$g, $k]) { $v = (string)$in[$g][$k]; $in[$g][$k] = ''; $in[$g][$k . 'Set'] = $v !== ''; $in[$g][$k . 'Hint'] = $v !== '' ? '…' . mb_substr($v, -4) : ''; }
    return $in;
}
function integrations_save(PDO $pdo, array $input): array {
    $cur = integrations_get($pdo); $new = $cur; $def = integrations_defaults();
    foreach ($def as $g => $vals) {
        $src = is_array($input[$g] ?? null) ? $input[$g] : [];
        foreach ($vals as $k => $dv) {
            if (!array_key_exists($k, $src)) continue;
            $isSecret = in_array([$g, $k], SECRET_FIELDS, true);
            if (is_bool($dv)) $new[$g][$k] = !empty($src[$k]);
            elseif (is_int($dv)) $new[$g][$k] = max(0, min(100000, (int)$src[$k]));
            else {
                $v = trim(in_str($src, $k, 2000));
                if ($isSecret && $v === '') continue;                 // خالی = بدون تغییر
                if ($isSecret && $v === '__clear__') $v = '';
                $new[$g][$k] = $v;
            }
        }
    }
    if ($new['email']['from'] !== '' && !valid_email($new['email']['from'])) fail_field('ایمیل فرستنده معتبر نیست.', 'email.from');
    foreach (split_list($new['notify']['emails']) as $e) if (!valid_email($e)) fail_field("ایمیل «{$e}» معتبر نیست.", 'notify.emails');
    foreach (split_list($new['notify']['mobiles']) as $m) if (!normalize_mobile($m)) fail_field("شماره‌ی «{$m}» معتبر نیست (مثل 09121234567).", 'notify.mobiles');
    if ($new['sms']['line'] !== '' && !preg_match('/^\+?\d{4,20}$/', $new['sms']['line'])) fail_field('شماره‌ی خط پیامک فقط عدد است.', 'sms.line');
    if ($new['zarinpal']['merchantId'] !== '' && !preg_match('/^[A-Za-z0-9-]{20,64}$/', $new['zarinpal']['merchantId'])) fail_field('مرچنت کد زرین‌پال معتبر نیست (۳۶ نویسه با خط تیره).', 'zarinpal.merchantId');
    if (!preg_match('/^[A-Za-z0-9]{12,64}$/', $new['shop']['cronKey'])) $new['shop']['cronKey'] = $cur['shop']['cronKey'];
    $new['shop']['reminderDays'] = max(1, min(90, (int)$new['shop']['reminderDays']));
    $new['shop']['unpaidHours'] = max(1, min(720, (int)$new['shop']['unpaidHours']));
    set_setting($pdo, 'integrations', json_enc($new));
    return $new;
}

// ==========================================
// ارسال: پیامک، ایمیل، بله، ایتا + گزارش ارسال
// ==========================================
function notify_log(PDO $pdo, string $channel, string $target, string $subject, bool $ok, string $err = ''): void {
    try { ensure_aux_schema($pdo); $pdo->prepare("INSERT INTO notify_log (channel, target, subject, ok, error) VALUES (?, ?, ?, ?, ?)")->execute([$channel, mb_substr($target, 0, 190), mb_substr($subject, 0, 190), $ok ? 1 : 0, mb_substr($err, 0, 500)]); }
    catch (Throwable $e) { error_log('[notify_log] ' . $e->getMessage()); }
}
function ipm_error(?array $d, string $raw, int $code): string {
    if (is_array($d)) { $m = $d['message'] ?? ($d['messages'] ?? ($d['error'] ?? '')); if (is_array($m)) $m = implode(' ', array_map(fn($x) => is_scalar($x) ? (string)$x : json_enc($x), $m)); if ($m !== '') return (string)$m; }
    return "HTTP $code " . mb_substr($raw, 0, 200);
}
/** ایران پیامک (api.iranpayamak.com): پیامک الگو (برای کد تأیید). */
function sms_send_pattern(PDO $pdo, string $mobile, string $pattern, array $attrs, string $subject): bool {
    $s = integrations_get($pdo)['sms'];
    if (!$s['enabled'] || $s['apiKey'] === '' || $pattern === '') { notify_log($pdo, 'sms', $mobile, $subject, false, 'پیامک تنظیم نشده است'); return false; }
    [$code, $d, $raw, $err] = http_request(endpoint('sms', 'https://api.iranpayamak.com') . '/ws/v1/sms/pattern',
        ['code' => $pattern, 'attributes' => (object)$attrs, 'recipient' => $mobile, 'line_number' => $s['line'], 'number_format' => 'english'], ['Api-Key: ' . $s['apiKey']]);
    $ok = $err === '' && $code >= 200 && $code < 300 && !(is_array($d) && (($d['status'] ?? '') === 'error'));
    notify_log($pdo, 'sms', $mobile, $subject, $ok, $ok ? '' : ($err ?: ipm_error($d, $raw, $code)));
    return $ok;
}
/** ایران پیامک: پیامک متنی ساده. */
function sms_send_text(PDO $pdo, array $mobiles, string $text, string $subject): bool {
    $s = integrations_get($pdo)['sms'];
    $mobiles = array_values(array_unique(array_filter(array_map(fn($m) => normalize_mobile((string)$m), $mobiles))));
    if (!$mobiles) return false;
    if (!$s['enabled'] || $s['apiKey'] === '') { notify_log($pdo, 'sms', implode(',', $mobiles), $subject, false, 'پیامک تنظیم نشده است'); return false; }
    [$code, $d, $raw, $err] = http_request(endpoint('sms', 'https://api.iranpayamak.com') . '/ws/v1/sms/simple',
        ['text' => $text, 'line_number' => $s['line'], 'recipients' => $mobiles, 'number_format' => 'english'], ['Api-Key: ' . $s['apiKey']]);
    $ok = $err === '' && $code >= 200 && $code < 300 && !(is_array($d) && (($d['status'] ?? '') === 'error'));
    notify_log($pdo, 'sms', implode(',', $mobiles), $subject, $ok, $ok ? '' : ($err ?: ipm_error($d, $raw, $code)));
    return $ok;
}
/** ایمیل با تابع mail() هاست (cPanel). */
function mail_send(PDO $pdo, array $to, string $subject, string $text): bool {
    $e = integrations_get($pdo)['email'];
    $to = array_values(array_unique(array_filter($to, 'valid_email')));
    if (!$to) return false;
    if (!$e['enabled'] || $e['from'] === '') { notify_log($pdo, 'email', implode(',', $to), $subject, false, 'ایمیل تنظیم نشده است'); return false; }
    $fromName = $e['fromName'] !== '' ? '=?UTF-8?B?' . base64_encode($e['fromName']) . '?=' : '';
    $headers = implode("\r\n", ['MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', 'From: ' . ($fromName ? "$fromName <{$e['from']}>" : $e['from']), 'Reply-To: ' . $e['from'], 'X-Mailer: CardPlatform']);
    $ok = true; $err = '';
    foreach ($to as $addr) {
        $r = @mail($addr, '=?UTF-8?B?' . base64_encode($subject) . '?=', chunk_split(base64_encode($text)), $headers, '-f' . $e['from']);
        if (!$r) { $ok = false; $err = 'تابع mail() هاست ایمیل را نپذیرفت'; }
    }
    notify_log($pdo, 'email', implode(',', $to), $subject, $ok, $err);
    return $ok;
}
/** پیام‌رسان بله (API سازگار با تلگرام) یا ایتا (ایتایار). */
function messenger_send(PDO $pdo, string $which, string $text, string $subject, ?string $onlyChat = null): bool {
    $c = integrations_get($pdo)[$which];
    $chats = $onlyChat !== null ? [$onlyChat] : split_list((string)$c['chatIds']);
    if (!$c['enabled'] || $c['token'] === '' || !$chats) { if ($onlyChat !== null || $c['enabled']) notify_log($pdo, $which, implode(',', $chats), $subject, false, 'تنظیم نشده است'); return false; }
    $all = true;
    foreach ($chats as $chat) {
        if ($which === 'bale') { [$code, $d, $raw, $err] = http_request(endpoint('bale', 'https://tapi.bale.ai') . '/bot' . $c['token'] . '/sendMessage', ['chat_id' => $chat, 'text' => $text]); }
        else { [$code, $d, $raw, $err] = http_request(endpoint('eitaa', 'https://eitaayar.ir') . '/api/' . $c['token'] . '/sendMessage', ['chat_id' => $chat, 'text' => $text], [], false); }
        $ok = $err === '' && $code >= 200 && $code < 300 && is_array($d) && !empty($d['ok']);
        $all = $all && $ok;
        notify_log($pdo, $which, $chat, $subject, $ok, $ok ? '' : ($err ?: (is_array($d) ? (string)($d['description'] ?? json_enc($d)) : "HTTP $code")));
    }
    return $all;
}
/** اعلان به مدیر پلتفرم از همه‌ی راه‌های فعال (پنل همیشه؛ چون رکورد در دیتابیس ذخیره شده است). */
function notify_admins(PDO $pdo, string $subject, string $text): void {
    $in = integrations_get($pdo); $n = $in['notify'];
    $full = "$subject\n\n$text";
    try {
        if ($n['email']) mail_send($pdo, split_list($n['emails']), $subject, $full);
        if ($n['sms']) sms_send_text($pdo, split_list($n['mobiles']), mb_substr($full, 0, 600), $subject);
        if ($n['bale'] && $in['bale']['enabled']) messenger_send($pdo, 'bale', $full, $subject);
        if ($n['eitaa'] && $in['eitaa']['enabled']) messenger_send($pdo, 'eitaa', $full, $subject);
    } catch (Throwable $e) { error_log('[notify_admins] ' . $e->getMessage()); }
}
function notify_customer(PDO $pdo, string $mobile, string $email, string $subject, string $text): void {
    try {
        if ($mobile !== '') sms_send_text($pdo, [$mobile], $text, $subject);
        if ($email !== '') mail_send($pdo, [$email], $subject, $text);
    } catch (Throwable $e) { error_log('[notify_customer] ' . $e->getMessage()); }
}

// ==========================================
// پلن‌ها و محتوای صفحه‌ی معرفی
// ==========================================
function plan_sanitize(array $p, int $i): array {
    $txt = fn($v, $max) => is_scalar($v) ? mb_substr(trim((string)$v), 0, $max) : '';
    $loc = function ($v, $max) use ($txt) { $v = is_array($v) ? $v : []; return ['fa' => $txt($v['fa'] ?? '', $max), 'en' => $txt($v['en'] ?? '', $max)]; };
    $feat = function ($v) use ($txt) { $v = is_array($v) ? $v : []; $o = []; foreach (SHOP_LANGS as $l) { $lines = is_array($v[$l] ?? null) ? $v[$l] : preg_split('/\r?\n/', (string)($v[$l] ?? '')); $o[$l] = array_values(array_filter(array_map(fn($x) => $txt($x, 200), array_slice($lines, 0, 20)), fn($x) => $x !== '')); } return $o; };
    $id = preg_match('/^[a-z0-9_-]{1,32}$/', (string)($p['id'] ?? '')) ? (string)$p['id'] : 'plan' . ($i + 1) . '_' . bin2hex(random_bytes(2));
    return [
        'id' => $id, 'active' => ($p['active'] ?? true) !== false, 'highlight' => !empty($p['highlight']),
        'name' => $loc($p['name'] ?? [], 80), 'desc' => $loc($p['desc'] ?? [], 300),
        'price' => max(0, min(10_000_000_000, (int)($p['price'] ?? 0))),
        'cardLimit' => max(0, min(10_000_000, (int)($p['cardLimit'] ?? 0))),
        'durationDays' => max(0, min(3650, (int)($p['durationDays'] ?? 365))),
        'maxVariants' => max(0, min(100, (int)($p['maxVariants'] ?? 0))),
        'features' => $feat($p['features'] ?? []),
    ];
}
function plans_get(PDO $pdo): array {
    $raw = get_setting($pdo, 'plans');
    $list = $raw === '' ? landing_default_plans() : (json_decode($raw, true) ?: []);
    return array_values(array_map(fn($p, $i) => plan_sanitize(is_array($p) ? $p : [], $i), $list, array_keys($list)));
}
function plan_find(PDO $pdo, string $id): ?array { foreach (plans_get($pdo) as $p) if ($p['id'] === $id) return $p; return null; }
function plan_label(array $p, string $lang = 'fa'): string { return $p['name'][$lang] ?: ($p['name']['fa'] ?: $p['id']); }

/** محتوای صفحه‌ی معرفی (پیش‌فرض‌ها + آنچه سوپرادمین ذخیره کرده). */
function landing_get(PDO $pdo): array {
    $def = landing_default_content(); $saved = json_setting($pdo, 'landing');
    $out = $def;
    foreach (['fa', 'en', 'common'] as $part) if (isset($saved[$part]) && is_array($saved[$part])) foreach ($def[$part] as $k => $v) if (array_key_exists($k, $saved[$part])) $out[$part][$k] = $saved[$part][$k];
    return $out;
}
/** پاک‌سازی محتوای ارسالی پنل؛ ساختار باید همان ساختار پیش‌فرض باشد (متن یا فهرستی از اشیای متنی). */
function landing_sanitize(array $in): array {
    $def = landing_default_content(); $protos = landing_list_protos(); $out = [];
    $txt = fn($v, $max) => is_scalar($v) ? mb_substr(trim((string)$v), 0, $max) : '';
    $item = function ($proto, $x) use ($txt) {
        if (!is_array($proto)) return $txt($x, 2000);
        $x = is_array($x) ? $x : []; $o = [];
        foreach ($proto as $k => $_) $o[$k] = $txt($x[$k] ?? '', 4000);
        return $o;
    };
    foreach (['fa', 'en', 'common'] as $part) {
        $src = is_array($in[$part] ?? null) ? $in[$part] : [];
        foreach ($def[$part] as $k => $dv) {
            $v = $src[$k] ?? null;
            if (is_bool($dv)) $out[$part][$k] = !empty($v);
            elseif (is_array($dv)) {
                $proto = $protos[$k] ?? ($dv[0] ?? '');
                $list = is_array($v) ? array_slice(array_values($v), 0, 60) : [];
                $out[$part][$k] = array_values(array_filter(array_map(fn($x) => $item($proto, $x), $list), fn($x) => is_array($x) ? implode('', $x) !== '' : $x !== ''));
            } else $out[$part][$k] = $txt($v, 30000);
        }
    }
    foreach (['ogImage'] as $k) if ($out['common'][$k] !== '' && !valid_image_url($out['common'][$k])) fail_field('تصویر اشتراک‌گذاری معتبر نیست.', "common.$k");
    foreach ($out['common']['customers'] as $c) if ($c['logoUrl'] !== '' && !valid_image_url($c['logoUrl'])) fail_field('لوگوی یکی از مشتریان معتبر نیست.', 'common.customers');
    if ($out['common']['enamadId'] !== '' && !preg_match('/^\d{1,12}$/', $out['common']['enamadId'])) fail_field('شناسه‌ی اینماد فقط عدد است.', 'common.enamadId');
    if ($out['common']['enamadCode'] !== '' && !preg_match('/^[A-Za-z0-9]{1,64}$/', $out['common']['enamadCode'])) fail_field('کد اینماد فقط حرف انگلیسی و عدد است.', 'common.enamadCode');
    return $out;
}

// ==========================================
// کد تأیید پیامکی
// ==========================================
function verified_mobile(): ?string {
    $m = $_SESSION['shop_mobile'] ?? null; $at = (int)($_SESSION['shop_mobile_at'] ?? 0);
    return is_string($m) && time() - $at < 3 * 3600 ? $m : null;
}
function require_verified_mobile(): string { $m = verified_mobile(); if (!$m) fail('ابتدا شماره‌ی موبایل خود را تأیید کنید.', 401); return $m; }

// ==========================================
// سفارش‌ها
// ==========================================
function order_load(PDO $pdo, string $id): ?array {
    if (!preg_match('/^ord_[a-f0-9]{16}$/', $id)) return null;
    ensure_aux_schema($pdo);
    $st = $pdo->prepare("SELECT * FROM orders WHERE id = ?"); $st->execute([$id]); $r = $st->fetch();
    if (!$r) return null;
    foreach (['data', 'plan', 'payment'] as $k) { $r[$k] = json_decode((string)$r[$k], true) ?: []; }
    return $r;
}
function order_save_json(PDO $pdo, string $id, string $col, array $v): void {
    if (!in_array($col, ['data', 'plan', 'payment'], true)) return;
    $pdo->prepare("UPDATE orders SET $col = ? WHERE id = ?")->execute([json_enc((object)$v), $id]);
}
function order_link(array $o): string { return app_base_url() . '?view=order&o=' . $o['id'] . '&k=' . $o['token']; }
function tenant_link_url(array $t): string { $slug = (string)($t['slug'] ?? ''); return app_base_url() . ($slug !== '' ? $slug : '?org=' . rawurlencode((string)$t['id'])); }
/** نمای سفارش برای مشتری (بدون یادداشت داخلی مدیر). */
function order_public(array $o, string $lang = 'fa'): array {
    $d = $o['data'];
    $view = [
        'id' => $o['id'], 'code' => $o['code'], 'token' => $o['token'], 'type' => $o['type'], 'status' => $o['status'],
        'amount' => (int)$o['amount'], 'planName' => isset($o['plan']['name']) ? ($o['plan']['name'][$lang] ?: $o['plan']['name']['fa']) : '',
        'planId' => $o['plan']['id'] ?? '', 'orgName' => $d['org']['name'] ?? '', 'createdAt' => $o['created_at'], 'paidAt' => $o['paid_at'], 'deliveredAt' => $o['delivered_at'],
        'refId' => $o['payment']['refId'] ?? '', 'payError' => $o['payment']['lastError'] ?? '', 'variants' => count($d['variants'] ?? []),
    ];
    if ($o['tenant_id']) {
        global $pdo; $t = load_tenant($pdo, (string)$o['tenant_id']);
        if ($t) { $view['tenantLink'] = tenant_link_url($t); $view['activeUntil'] = (string)($t['activeUntil'] ?? ''); $view['cardLimit'] = (int)($t['cardLimit'] ?? 0); $view['tenantId'] = $t['id']; }
    }
    return $view;
}
function order_new_code(PDO $pdo): string {
    for ($i = 0; $i < 20; $i++) { $c = (string)random_int(10000000, 99999999); $st = $pdo->prepare("SELECT 1 FROM orders WHERE code = ?"); $st->execute([$c]); if (!$st->fetch()) return $c; }
    throw new RuntimeException('cannot allocate order code');
}
/** فایلی که همین کاربر در همین نشست آپلود کرده است؟ */
function own_upload(string $url, array $kinds): bool {
    foreach ($_SESSION['shop_uploads'] ?? [] as $u) if ($u['url'] === $url && in_array($u['kind'], $kinds, true)) return true;
    return false;
}
function order_insert(PDO $pdo, string $type, array $plan, string $mobile, array $data, ?string $tenantId): array {
    ensure_aux_schema($pdo);
    $id = 'ord_' . bin2hex(random_bytes(8)); $code = order_new_code($pdo); $token = bin2hex(random_bytes(16));
    $pdo->prepare("INSERT INTO orders (id, code, token, type, tenant_id, plan, amount, status, mobile, data, payment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, '{}', NOW())")
        ->execute([$id, $code, $token, $type, $tenantId, json_enc($plan), $plan['price'], $mobile, json_enc($data)]);
    return order_load($pdo, $id);
}
/** بعد از پرداخت موفق: اعلان‌ها و (برای تمدید) اعمال پلن روی سازمان. */
function order_after_paid(PDO $pdo, array $o): void {
    $d = $o['data']; $lang = $d['lang'] ?? 'fa'; $plan = $o['plan'];
    $base = app_base_url();
    if ($o['type'] === 'renewal' && $o['tenant_id']) {
        $t = load_tenant($pdo, (string)$o['tenant_id']);
        if ($t) {
            $start = max(date('Y-m-d'), (string)($t['activeUntil'] ?? '') ?: date('Y-m-d'));
            if ((int)$plan['durationDays'] > 0) $t['activeUntil'] = date('Y-m-d', strtotime("$start +{$plan['durationDays']} days")); else $t['activeUntil'] = '';
            $issued = (int)$pdo->query("SELECT COUNT(*) FROM cards WHERE tenant_id = " . $pdo->quote((string)$t['id']))->fetchColumn();
            $t['cardLimit'] = (int)$plan['cardLimit'] > 0 ? $issued + (int)$plan['cardLimit'] : 0;
            $t['planName'] = plan_label($plan); $t['isActive'] = true;
            store_tenant($pdo, (string)$t['id'], $t);
            $pdo->prepare("UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ?")->execute([$o['id']]);
            audit($pdo, (string)$t['id'], 'tenant_renewed', $o['id'], ['plan' => $plan['id'], 'activeUntil' => $t['activeUntil']]);
            $until = $t['activeUntil'] !== '' ? $t['activeUntil'] : 'نامحدود';
            notify_customer($pdo, (string)$o['mobile'], (string)($d['applicant']['email'] ?? ''), 'تمدید سامانه کارت',
                "پرداخت شما با موفقیت انجام شد و سامانه‌ی «{$t['orgName']}» تمدید شد.\nاعتبار تا: {$until}\nکد پیگیری: {$o['code']}\n{$base}");
            notify_admins($pdo, "تمدید پرداخت‌شده: {$t['orgName']}", "پلن: " . plan_label($plan) . "\nمبلغ: " . money_fa((int)$o['amount']) . "\nکد سفارش: {$o['code']}\nموبایل: {$o['mobile']}");
            return;
        }
    }
    $org = $d['org']['name'] ?? '';
    notify_customer($pdo, (string)$o['mobile'], (string)($d['applicant']['email'] ?? ''), $lang === 'en' ? 'Your card order' : 'سفارش کارت',
        $lang === 'en'
            ? "Payment received. Your order {$o['code']} for \"{$org}\" is now being prepared. We will send you the link when it is ready.\nTrack: " . order_link($o)
            : "پرداخت شما انجام شد. سفارش {$o['code']} برای «{$org}» در حال آماده‌سازی است و پس از آماده شدن، لینک سامانه برایتان ارسال می‌شود.\nپیگیری: " . order_link($o));
    notify_admins($pdo, "سفارش جدید پرداخت‌شده: {$org}",
        "کد سفارش: {$o['code']}\nپلن: " . plan_label($plan) . "\nمبلغ: " . money_fa((int)$o['amount']) . "\nدرخواست‌دهنده: " . ($d['applicant']['name'] ?? '') . " — {$o['mobile']}\nتعداد رده‌ها: " . count($d['variants'] ?? []) . "\nپنل: {$base}admin");
}
/** وقتی سوپرادمین سازمانِ یک سفارش را منتشر می‌کند: سفارش «تحویل‌شده» و لینک/رمزها برای مشتری ارسال می‌شود. */
function order_deliver(PDO $pdo, string $orderId, array $tenant, string $adminPass, string $publicPass): void {
    $o = order_load($pdo, $orderId); if (!$o) return;
    $pdo->prepare("UPDATE orders SET tenant_id = ? WHERE id = ?")->execute([$tenant['id'], $orderId]);
    if ($o['status'] === 'delivered' || $o['type'] !== 'new') return;
    $pdo->prepare("UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = ?")->execute([$orderId]);
    $d = $o['data']; $lang = $d['lang'] ?? 'fa'; $link = tenant_link_url($tenant);
    $en = $lang === 'en';
    $lines = [$en ? "Your card system \"{$tenant['orgName']}\" is ready." : "سامانه‌ی کارت «{$tenant['orgName']}» آماده است.", ($en ? 'Link: ' : 'لینک: ') . $link];
    if ($adminPass !== '') $lines[] = ($en ? 'Admin password: ' : 'رمز مدیر: ') . $adminPass;
    if ($publicPass !== '') $lines[] = ($en ? 'Members password: ' : 'رمز اعضا: ') . $publicPass;
    $lines[] = ($en ? 'Order: ' : 'کد سفارش: ') . $o['code'];
    notify_customer($pdo, (string)$o['mobile'], (string)($d['applicant']['email'] ?? ''), $en ? 'Your card system is ready' : 'سامانه‌ی کارت شما آماده است', implode("\n", $lines));
    audit($pdo, (string)$tenant['id'], 'order_delivered', $orderId, ['code' => $o['code']]);
}

// --- زرین‌پال ---
function zp_base(PDO $pdo): string { $z = integrations_get($pdo)['zarinpal']; return endpoint('zarinpal', $z['sandbox'] ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com'); }
function zp_request(PDO $pdo, array $o): string {
    $z = integrations_get($pdo)['zarinpal'];
    if ($z['merchantId'] === '') fail('درگاه پرداخت هنوز تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.', 503);
    $d = $o['data'];
    $meta = ['mobile' => (string)$o['mobile']]; if (!empty($d['applicant']['email'])) $meta['email'] = $d['applicant']['email'];
    [$code, $res, $raw, $err] = http_request(zp_base($pdo) . '/pg/v4/payment/request.json', [
        'merchant_id' => $z['merchantId'], 'amount' => (int)$o['amount'] * 10, 'currency' => 'IRR',
        'callback_url' => app_base_url() . 'api.php?action=zp_callback&o=' . $o['id'],
        'description' => 'سفارش کارت ' . $o['code'], 'metadata' => $meta,
    ]);
    $authority = $res['data']['authority'] ?? '';
    if ($err !== '' || (int)($res['data']['code'] ?? 0) !== 100 || $authority === '') {
        $msg = $err ?: (is_array($res['errors'] ?? null) ? (string)($res['errors']['message'] ?? json_enc($res['errors'])) : "HTTP $code");
        error_log('[zarinpal request] ' . $msg . ' ' . mb_substr($raw, 0, 300));
        fail('اتصال به درگاه پرداخت انجام نشد. چند لحظه بعد دوباره تلاش کنید.', 502);
    }
    $pay = $o['payment']; $pay['authority'] = $authority; $pay['requestedAt'] = date('Y-m-d H:i:s'); unset($pay['lastError']);
    order_save_json($pdo, $o['id'], 'payment', $pay);
    return zp_base($pdo) . '/pg/StartPay/' . $authority;
}
/** تأیید پرداخت؛ true اگر موفق (یا قبلاً تأییدشده). */
function zp_verify(PDO $pdo, array $o, string $authority): array {
    $z = integrations_get($pdo)['zarinpal'];
    [$code, $res, $raw, $err] = http_request(zp_base($pdo) . '/pg/v4/payment/verify.json', ['merchant_id' => $z['merchantId'], 'amount' => (int)$o['amount'] * 10, 'authority' => $authority]);
    $c = (int)($res['data']['code'] ?? 0);
    if ($err === '' && ($c === 100 || $c === 101)) return [true, (string)($res['data']['ref_id'] ?? ''), (string)($res['data']['card_pan'] ?? ''), ''];
    $msg = $err ?: (is_array($res['errors'] ?? null) ? (string)($res['errors']['message'] ?? '') : '') ?: "HTTP $code";
    error_log('[zarinpal verify] ' . $msg . ' ' . mb_substr($raw, 0, 300));
    return [false, '', '', $msg];
}

/** کارهای زمان‌بندی‌شده: یادآوری تمدید، لغو سفارش‌های پرداخت‌نشده‌ی قدیمی، پاک‌سازی. */
function shop_cron(PDO $pdo): array {
    ensure_aux_schema($pdo); $in = integrations_get($pdo); $out = ['reminders' => 0, 'cancelled' => 0];
    $days = (int)$in['shop']['reminderDays']; $today = date('Y-m-d'); $limit = date('Y-m-d', strtotime("+$days days"));
    foreach ($pdo->query("SELECT id, data FROM tenants") as $row) {
        $t = json_decode($row['data'], true); if (!is_array($t)) continue;
        $until = (string)($t['activeUntil'] ?? ''); if ($until === '' || $until < $today || $until > $limit) continue;
        if (($t['remindedFor'] ?? '') === $until) continue;
        $st = $pdo->prepare("SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1"); $st->execute([$t['id']]); $o = $st->fetch();
        $left = (int)round((strtotime($until) - strtotime($today)) / 86400);
        if ($o) {
            $od = json_decode((string)$o['data'], true) ?: [];
            notify_customer($pdo, (string)$o['mobile'], (string)($od['applicant']['email'] ?? ''), 'یادآوری تمدید سامانه کارت',
                "اعتبار سامانه‌ی «{$t['orgName']}» {$left} روز دیگر ({$until}) تمام می‌شود. برای تمدید وارد صفحه‌ی پیگیری شوید:\n" . app_base_url() . "?view=track");
        }
        notify_admins($pdo, "پایان نزدیک اعتبار: {$t['orgName']}", "تاریخ پایان: {$until} ({$left} روز دیگر)" . ($o ? "\nموبایل مشتری: {$o['mobile']}" : ''));
        $t['remindedFor'] = $until; store_tenant($pdo, (string)$t['id'], $t); $out['reminders']++;
    }
    $st = $pdo->prepare("UPDATE orders SET status = 'cancelled' WHERE status = 'pending_payment' AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR)");
    $st->execute([(int)$in['shop']['unpaidHours']]); $out['cancelled'] = $st->rowCount();
    $pdo->exec("DELETE FROM otp_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)");
    $pdo->exec("DELETE FROM rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL 2 DAY)");
    $pdo->exec("DELETE FROM notify_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY)");
    set_setting($pdo, 'cron_last_run', date('Y-m-d H:i:s'));
    return $out;
}

/** داده‌ی عمومی فروشگاه برای صفحه‌ی سفارش (پلن‌های فعال، تماس، متن قوانین). */
function shop_public(PDO $pdo): array {
    $l = landing_get($pdo); $in = integrations_get($pdo);
    return [
        'enabled' => (bool)$in['shop']['enabled'], 'payReady' => $in['zarinpal']['merchantId'] !== '', 'smsReady' => $in['sms']['enabled'] && $in['sms']['apiKey'] !== '' && $in['sms']['otpPattern'] !== '',
        'plans' => array_values(array_filter(plans_get($pdo), fn($p) => $p['active'])),
        'contact' => array_intersect_key($l['common'], array_flip(['phone', 'email', 'telegram', 'whatsapp', 'bale', 'eitaa'])),
        'terms' => ['fa' => $l['fa']['termsText'], 'en' => $l['en']['termsText']],
        'maxFileMb' => (int)round(order_max_bytes() / 1048576),
    ];
}
function order_max_bytes(): int { global $config; return (int)($config['max_order_file_bytes'] ?? 10485760); }

// ==========================================
// مسیرهای API
// ==========================================
function commerce_routes(PDO $pdo, array $input, array $config): array {
    return [
        // ---------- عمومی ----------
        'GET shop_info' => function () use ($pdo) { respond(shop_public($pdo) + ['verifiedMobile' => verified_mobile()]); },

        'POST submit_lead' => function () use ($pdo, $input) {
            ensure_aux_schema($pdo);
            if (in_str($input, 'website', 200) !== '') respond(['success' => true]);                    // فیلد مخفی برای ربات‌ها
            $ts = (int)($input['ts'] ?? 0); if ($ts > 0 && time() - intdiv($ts, 1000) < 3) respond(['success' => true]); // پر شدن غیرانسانی سریع
            rate_limit($pdo, 'lead|' . client_ip(), 5, 3600);
            $name = in_str($input, 'name', 120); $mobile = normalize_mobile(in_str($input, 'mobile', 30)); $email = in_str($input, 'email', 190);
            if ($name === '') fail_field('نام را وارد کنید.', 'name');
            if (!$mobile) fail_field('شماره‌ی موبایل معتبر نیست (مثل 09121234567).', 'mobile');
            if ($email !== '' && !valid_email($email)) fail_field('ایمیل معتبر نیست.', 'email');
            $org = in_str($input, 'org', 200); $cards = in_str($input, 'cards', 40); $msg = in_str($input, 'message', 3000); $lang = in_array($input['lang'] ?? '', SHOP_LANGS, true) ? $input['lang'] : 'fa';
            $pdo->prepare("INSERT INTO leads (name, org, mobile, email, cards, message, lang, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")->execute([$name, $org, $mobile, $email, $cards, $msg, $lang, client_ip()]);
            respond_and_continue(['success' => true]);
            notify_admins($pdo, "درخواست مشاوره‌ی جدید: {$name}", "سازمان: {$org}\nموبایل: {$mobile}" . ($email ? "\nایمیل: {$email}" : '') . ($cards ? "\nتعداد تقریبی کارت: {$cards}" : '') . ($msg ? "\n\n{$msg}" : '') . "\n\nپنل: " . app_base_url() . 'admin');
            exit;
        },

        'POST otp_send' => function () use ($pdo, $input) {
            ensure_aux_schema($pdo);
            $mobile = normalize_mobile(in_str($input, 'mobile', 30));
            if (!$mobile) fail_field('شماره‌ی موبایل معتبر نیست (مثل 09121234567).', 'mobile');
            $in = integrations_get($pdo);
            if (!$in['sms']['enabled'] || $in['sms']['apiKey'] === '' || $in['sms']['otpPattern'] === '') fail('ارسال پیامک هنوز تنظیم نشده است. لطفاً با پشتیبانی تماس بگیرید.', 503);
            rate_limit($pdo, 'otpip|' . client_ip(), 10, 3600);
            rate_limit($pdo, 'otpm|' . $mobile, 6, 86400, 'برای این شماره امروز پیامک‌های زیادی فرستاده شده است. فردا دوباره تلاش کنید.');
            $st = $pdo->prepare("SELECT TIMESTAMPDIFF(SECOND, sent_at, NOW()) AS age FROM otp_codes WHERE mobile = ?"); $st->execute([$mobile]); $r = $st->fetch();
            if ($r && (int)$r['age'] < 60) respond(['error' => 'کد قبلی همین الان ارسال شد؛ کمی صبر کنید.', 'retryAfter' => 60 - (int)$r['age']], 429);
            $code = (string)random_int(10000, 99999);
            $pdo->prepare("INSERT INTO otp_codes (mobile, code_hash, expires_at, attempts, sent_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, NOW()) ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, sent_at = NOW()")
                ->execute([$mobile, password_hash($code, PASSWORD_DEFAULT)]);
            if (!sms_send_pattern($pdo, $mobile, $in['sms']['otpPattern'], [$in['sms']['otpVar'] ?: 'code' => $code], 'کد تأیید')) fail('ارسال پیامک انجام نشد. چند لحظه بعد دوباره تلاش کنید.', 502);
            respond(['success' => true, 'mobile' => $mobile, 'retryAfter' => 60]);
        },
        'POST otp_verify' => function () use ($pdo, $input) {
            ensure_aux_schema($pdo);
            $mobile = normalize_mobile(in_str($input, 'mobile', 30)); $code = fa_to_en_digits(in_str($input, 'code', 10));
            if (!$mobile) fail_field('شماره‌ی موبایل معتبر نیست.', 'mobile');
            $st = $pdo->prepare("SELECT code_hash, attempts, expires_at > NOW() AS live FROM otp_codes WHERE mobile = ?"); $st->execute([$mobile]); $r = $st->fetch();
            if (!$r || !(int)$r['live']) fail_field('کد منقضی شده است؛ دوباره درخواست کد بدهید.', 'code');
            if ((int)$r['attempts'] >= 5) fail_field('تعداد تلاش زیاد بود؛ دوباره درخواست کد بدهید.', 'code');
            if (!password_verify($code, (string)$r['code_hash'])) { $pdo->prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE mobile = ?")->execute([$mobile]); usleep(300000); fail_field('کد واردشده درست نیست.', 'code'); }
            $pdo->prepare("DELETE FROM otp_codes WHERE mobile = ?")->execute([$mobile]);
            session_regenerate_id(true);
            $_SESSION['shop_mobile'] = $mobile; $_SESSION['shop_mobile_at'] = time();
            respond(['success' => true, 'mobile' => $mobile]);
        },
        'POST otp_logout' => function () { unset($_SESSION['shop_mobile'], $_SESSION['shop_mobile_at'], $_SESSION['shop_uploads']); respond(['success' => true]); },

        // آپلود فایل خام کارت (فقط JPG) یا لوگو، با فرم multipart
        'POST order_upload' => function () use ($pdo) {
            require_verified_mobile();
            rate_limit($pdo, 'upl|' . client_ip(), 120, 3600);
            $kind = ($_POST['kind'] ?? '') === 'logo' ? 'logo' : 'design';
            $f = $_FILES['file'] ?? null;
            if (!$f || !is_array($f) || ($f['error'] ?? 1) !== UPLOAD_ERR_OK) {
                $e = (int)($f['error'] ?? 0);
                fail(in_array($e, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 'حجم فایل بیشتر از حد مجاز هاست است.' : 'فایل دریافت نشد.');
            }
            if ((int)$f['size'] > order_max_bytes()) fail('حجم فایل بیشتر از ' . (int)round(order_max_bytes() / 1048576) . ' مگابایت است.');
            $bin = (string)file_get_contents((string)$f['tmp_name']);
            $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bin); $size = @getimagesizefromstring($bin);
            $allowed = $kind === 'design' ? ['image/jpeg' => 'jpg'] : ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
            if (!isset($allowed[$mime]) || $size === false) fail($kind === 'design' ? 'فایل طرح کارت باید JPG باشد.' : 'لوگو باید JPG، PNG یا WEBP باشد.');
            $url = store_upload('orders', $bin, $allowed[$mime]);
            $_SESSION['shop_uploads'] = array_slice(array_merge($_SESSION['shop_uploads'] ?? [], [['url' => $url, 'kind' => $kind]]), -300);
            respond(['success' => true, 'url' => $url, 'width' => (int)$size[0], 'height' => (int)$size[1]]);
        },

        'POST order_create' => function () use ($pdo, $input) {
            $mobile = require_verified_mobile();
            rate_limit($pdo, 'ordc|' . $mobile, 20, 86400);
            $in = integrations_get($pdo); if (!$in['shop']['enabled']) fail('ثبت سفارش آنلاین فعلاً غیرفعال است.', 403);
            $plan = plan_find($pdo, in_str($input, 'planId', 40));
            if (!$plan || !$plan['active'] || $plan['price'] <= 0) fail_field('پلن انتخاب‌شده معتبر نیست.', 'plan');
            $lang = in_array($input['lang'] ?? '', SHOP_LANGS, true) ? $input['lang'] : 'fa';
            $a = in_arr($input, 'applicant'); $o = in_arr($input, 'org');
            $applicant = ['name' => in_str($a, 'name', 120), 'email' => in_str($a, 'email', 190), 'role' => in_str($a, 'role', 120), 'nationalId' => fa_to_en_digits(in_str($a, 'nationalId', 20))];
            if ($applicant['name'] === '') fail_field('نام و نام خانوادگی را وارد کنید.', 'applicant.name');
            if ($applicant['email'] !== '' && !valid_email($applicant['email'])) fail_field('ایمیل معتبر نیست.', 'applicant.email');
            $org = ['name' => in_str($o, 'name', 200), 'phone' => in_str($o, 'phone', 40), 'address' => in_str($o, 'address', 500), 'website' => in_str($o, 'website', 200), 'logo' => in_str($o, 'logo', 300), 'cardLang' => in_array($o['cardLang'] ?? '', ['fa', 'en', 'ar', 'tr'], true) ? $o['cardLang'] : 'fa'];
            if ($org['name'] === '') fail_field('نام سازمان را وارد کنید.', 'org.name');
            if ($org['logo'] !== '' && !own_upload($org['logo'], ['logo', 'design'])) fail_field('لوگو را دوباره آپلود کنید.', 'org.logo');
            $layout = ($input['layout'] ?? '') === 'single' ? 'single' : 'double';
            $variants = [];
            foreach (array_slice(in_arr($input, 'variants'), 0, 100) as $i => $v) {
                if (!is_array($v)) continue;
                $name = in_str($v, 'name', 120); $front = in_str($v, 'front', 300); $back = in_str($v, 'back', 300);
                if (!own_upload($front, ['design'])) fail_field('طرح روی کارت' . ($name ? " «{$name}»" : '') . ' را آپلود کنید.', "variants.$i.front");
                if ($layout === 'double' && !own_upload($back, ['design'])) fail_field('طرح پشت کارت' . ($name ? " «{$name}»" : '') . ' را آپلود کنید.', "variants.$i.back");
                $variants[] = ['name' => $name, 'front' => $front, 'back' => $layout === 'double' ? $back : ''];
            }
            if (!$variants) fail_field('حداقل یک طرح کارت آپلود کنید.', 'variants');
            if ($plan['maxVariants'] > 0 && count($variants) > $plan['maxVariants']) fail_field("این پلن حداکثر {$plan['maxVariants']} نوع کارت دارد.", 'variants');
            $variantField = in_str($input, 'variantField', 120);
            if (count($variants) > 1) {
                if ($variantField === '') fail_field('نام فیلدی که نوع کارت را تعیین می‌کند (مثلاً «رده سازمانی») را وارد کنید.', 'variantField');
                $names = array_map(fn($v) => $v['name'], $variants);
                foreach ($names as $i => $n) if ($n === '') fail_field('برای هر نوع کارت یک نام بنویسید (مثلاً «مدیر»).', "variants.$i.name");
                if (count(array_unique($names)) !== count($names)) fail_field('نام نوع‌های کارت نباید تکراری باشد.', 'variants');
            }
            $fields = [];
            foreach (array_slice(in_arr($input, 'fields'), 0, 40) as $i => $f) {
                if (!is_array($f)) continue;
                $label = in_str($f, 'label', 120); if ($label === '') continue;
                $type = in_array($f['type'] ?? '', ORDER_FIELD_TYPES, true) ? $f['type'] : 'text';
                $opts = $type === 'select' ? array_values(array_filter(array_map(fn($x) => mb_substr(trim((string)$x), 0, 120), array_slice(preg_split('/\r?\n|[,،]/u', in_str($f, 'options', 5000)) ?: [], 0, 300)), fn($x) => $x !== '')) : [];
                $fields[] = ['label' => $label, 'type' => $type, 'required' => !empty($f['required']), 'options' => $opts, 'onCard' => ($f['onCard'] ?? true) !== false];
            }
            if (!$fields) fail_field('حداقل یک فیلد (مثلاً نام و نام خانوادگی) تعریف کنید.', 'fields');
            if (empty($input['acceptTerms'])) fail_field('برای ادامه، قوانین و مقررات را بپذیرید.', 'acceptTerms');
            $data = ['lang' => $lang, 'applicant' => $applicant, 'org' => $org, 'layout' => $layout, 'variantField' => $variantField, 'variants' => $variants, 'fields' => $fields, 'notes' => in_str($input, 'notes', 3000)];
            $order = order_insert($pdo, 'new', $plan, $mobile, $data, null);
            respond(['success' => true, 'order' => order_public($order, $lang)]);
        },

        'POST order_renew' => function () use ($pdo, $input) {
            $mobile = require_verified_mobile();
            $base = order_load($pdo, in_str($input, 'orderId', 40));
            if (!$base || $base['mobile'] !== $mobile || !$base['tenant_id']) fail('سفارش پیدا نشد.', 404);
            $t = load_tenant($pdo, (string)$base['tenant_id']); if (!$t) fail('سامانه‌ی این سفارش دیگر وجود ندارد.', 404);
            $plan = plan_find($pdo, in_str($input, 'planId', 40));
            if (!$plan || !$plan['active'] || $plan['price'] <= 0) fail_field('پلن انتخاب‌شده معتبر نیست.', 'plan');
            $lang = in_array($input['lang'] ?? '', SHOP_LANGS, true) ? $input['lang'] : 'fa';
            $data = ['lang' => $lang, 'applicant' => $base['data']['applicant'] ?? [], 'org' => ['name' => $t['orgName'] ?? ''], 'renewOf' => $base['id']];
            $order = order_insert($pdo, 'renewal', $plan, $mobile, $data, (string)$t['id']);
            respond(['success' => true, 'order' => order_public($order, $lang)]);
        },

        'POST order_pay' => function () use ($pdo, $input) {
            $o = order_load($pdo, in_str($input, 'id', 40));
            if (!$o || !hash_equals((string)$o['token'], in_str($input, 'token', 64))) fail('سفارش پیدا نشد.', 404);
            if ($o['status'] !== 'pending_payment') fail('این سفارش در انتظار پرداخت نیست.', 409);
            rate_limit($pdo, 'pay|' . $o['id'], 15, 3600);
            respond(['success' => true, 'url' => zp_request($pdo, $o)]);
        },
        // بازگشت از زرین‌پال (مرورگر کاربر به این نشانی هدایت می‌شود)
        'GET zp_callback' => function () use ($pdo) {
            $o = order_load($pdo, is_string($_GET['o'] ?? null) ? $_GET['o'] : '');
            if (!$o) { header('Location: ' . app_base_url()); exit; }
            $back = fn(string $r) => app_base_url() . '?view=order&o=' . $o['id'] . '&k=' . $o['token'] . '&pay=' . $r;
            $authority = is_string($_GET['Authority'] ?? null) ? $_GET['Authority'] : '';
            if ($o['status'] !== 'pending_payment') { header('Location: ' . $back('ok')); exit; }
            if (($_GET['Status'] ?? '') !== 'OK' || $authority === '' || $authority !== ($o['payment']['authority'] ?? '')) {
                $p = $o['payment']; $p['lastError'] = 'پرداخت انجام نشد یا لغو شد.'; order_save_json($pdo, $o['id'], 'payment', $p);
                header('Location: ' . $back('failed')); exit;
            }
            [$ok, $ref, $pan, $err] = zp_verify($pdo, $o, $authority);
            $p = $o['payment'];
            if (!$ok) { $p['lastError'] = 'پرداخت تأیید نشد. اگر مبلغ از حسابتان کم شده، ظرف ۷۲ ساعت برمی‌گردد.'; order_save_json($pdo, $o['id'], 'payment', $p); header('Location: ' . $back('failed')); exit; }
            $p['refId'] = $ref; $p['cardPan'] = $pan; $p['verifiedAt'] = date('Y-m-d H:i:s'); unset($p['lastError']);
            $st = $pdo->prepare("UPDATE orders SET status = 'paid', paid_at = NOW(), payment = ? WHERE id = ? AND status = 'pending_payment'");
            $st->execute([json_enc($p), $o['id']]);
            if ($st->rowCount() > 0) { $o = order_load($pdo, $o['id']); try { order_after_paid($pdo, $o); } catch (Throwable $e) { error_log('[order_after_paid] ' . $e->getMessage()); } }
            header('Location: ' . $back('ok')); exit;
        },
        'GET order_status' => function () use ($pdo) {
            $o = order_load($pdo, is_string($_GET['o'] ?? null) ? $_GET['o'] : '');
            $k = is_string($_GET['k'] ?? null) ? $_GET['k'] : '';
            if (!$o || !(hash_equals((string)$o['token'], $k) || verified_mobile() === $o['mobile'])) fail('سفارش پیدا نشد.', 404);
            $lang = ($_GET['lang'] ?? '') === 'en' ? 'en' : 'fa';
            respond(['order' => order_public($o, $lang)]);
        },
        'GET my_orders' => function () use ($pdo) {
            $mobile = require_verified_mobile(); ensure_aux_schema($pdo);
            $lang = ($_GET['lang'] ?? '') === 'en' ? 'en' : 'fa';
            $st = $pdo->prepare("SELECT id FROM orders WHERE mobile = ? ORDER BY created_at DESC LIMIT 100"); $st->execute([$mobile]);
            respond(['mobile' => $mobile, 'orders' => array_map(fn($r) => order_public(order_load($pdo, $r['id']), $lang), $st->fetchAll())]);
        },

        // کارهای زمان‌بندی‌شده (Cron Job هاست این نشانی را صدا می‌زند)
        'GET cron' => function () use ($pdo) {
            $key = is_string($_GET['key'] ?? null) ? $_GET['key'] : '';
            if ($key === '' || !hash_equals(integrations_get($pdo)['shop']['cronKey'], $key)) fail('کلید نامعتبر است.', 403);
            respond(['success' => true] + shop_cron($pdo));
        },

        // ---------- سوپرادمین ----------
        // کارت متحرک بالای صفحه‌ی معرفی: چهار نفر نمونه (عکس، رنگ، نام، سن، سمت)
        'GET hero_settings' => function () use ($pdo) { require_super(); respond(['people' => hero_people_merge(json_decode(get_setting($pdo, 'hero_cards'), true), 'valid_image_url')]); },
        'POST save_hero' => function () use ($pdo, $input) {
            require_super();
            $in = array_values(in_arr($input, 'people'));
            if (count($in) < 1) fail('حداقل یک نفر لازم است.');
            if (count($in) > 12) fail('حداکثر ۱۲ نفر.');
            foreach ($in as $i => $p) { if (!is_array($p) || trim((string)($p['name']['fa'] ?? '')) === '') fail_field('نام فارسی نفر ' . ($i + 1) . ' را وارد کنید.', "hero.$i.name"); }
            foreach ($in as $i => $p) { $ph = is_array($p) ? trim((string)($p['photo'] ?? '')) : ''; if ($ph !== '' && !valid_image_url($ph)) fail_field('عکس نفر ' . ($i + 1) . ' معتبر نیست. دوباره آپلود کنید.', "hero.$i.photo"); }
            $people = hero_people_merge($in, 'valid_image_url');
            set_setting($pdo, 'hero_cards', json_enc($people)); audit($pdo, '', 'hero_saved');
            respond(['success' => true, 'people' => $people]);
        },
        'GET sales_counts' => function () use ($pdo) {
            require_super(); ensure_aux_schema($pdo);
            respond(['newLeads' => (int)$pdo->query("SELECT COUNT(*) FROM leads WHERE status = 'new'")->fetchColumn(), 'paidOrders' => (int)$pdo->query("SELECT COUNT(*) FROM orders WHERE status = 'paid'")->fetchColumn()]);
        },
        'GET sales_settings' => function () use ($pdo) {
            require_super();
            respond(['landing' => landing_get($pdo), 'plans' => plans_get($pdo), 'integrations' => integrations_masked(integrations_get($pdo)), 'baseUrl' => app_base_url(), 'cronLastRun' => get_setting($pdo, 'cron_last_run')]);
        },
        'POST save_landing' => function () use ($pdo, $input) {
            require_super();
            $l = landing_sanitize(in_arr($input, 'landing'));
            set_setting($pdo, 'landing', json_enc($l)); audit($pdo, '', 'landing_saved');
            respond(['success' => true, 'landing' => landing_get($pdo)]);
        },
        'POST save_plans' => function () use ($pdo, $input) {
            require_super();
            $list = array_slice(in_arr($input, 'plans'), 0, 20); $out = []; $ids = [];
            foreach (array_values($list) as $i => $p) {
                $p = plan_sanitize(is_array($p) ? $p : [], $i);
                if ($p['name']['fa'] === '') fail_field('نام فارسی هر پلن الزامی است.', "plans.$i.name");
                if (isset($ids[$p['id']])) $p['id'] .= '_' . bin2hex(random_bytes(2));
                $ids[$p['id']] = true; $out[] = $p;
            }
            set_setting($pdo, 'plans', json_enc($out)); audit($pdo, '', 'plans_saved', '', ['count' => count($out)]);
            respond(['success' => true, 'plans' => plans_get($pdo)]);
        },
        'POST save_integrations' => function () use ($pdo, $input) {
            require_super();
            $new = integrations_save($pdo, in_arr($input, 'integrations')); audit($pdo, '', 'integrations_saved');
            respond(['success' => true, 'integrations' => integrations_masked($new)]);
        },
        'POST test_integration' => function () use ($pdo, $input) {
            require_super();
            $ch = in_str($input, 'channel', 20); $target = in_str($input, 'target', 190);
            $subject = 'پیام آزمایشی'; $text = 'این یک پیام آزمایشی از پلتفرم صدور کارت است. ' . date('H:i');
            if ($ch === 'sms') { $m = normalize_mobile($target); if (!$m) fail_field('شماره‌ی موبایل معتبر نیست.', 'target'); $ok = sms_send_text($pdo, [$m], $text, $subject); }
            elseif ($ch === 'otp') { $m = normalize_mobile($target); if (!$m) fail_field('شماره‌ی موبایل معتبر نیست.', 'target'); $s = integrations_get($pdo)['sms']; $ok = sms_send_pattern($pdo, $m, $s['otpPattern'], [$s['otpVar'] ?: 'code' => '12345'], 'آزمایش الگوی کد تأیید'); }
            elseif ($ch === 'email') { if (!valid_email($target)) fail_field('ایمیل معتبر نیست.', 'target'); $ok = mail_send($pdo, [$target], $subject, $text); }
            elseif ($ch === 'bale' || $ch === 'eitaa') { $ok = messenger_send($pdo, $ch, $text, $subject, $target !== '' ? $target : null); }
            elseif ($ch === 'zarinpal') {
                $z = integrations_get($pdo)['zarinpal']; if ($z['merchantId'] === '') fail('مرچنت کد وارد نشده است.');
                [$code, $res, $raw, $err] = http_request(zp_base($pdo) . '/pg/v4/payment/request.json', ['merchant_id' => $z['merchantId'], 'amount' => 10000, 'callback_url' => app_base_url(), 'description' => 'آزمایش اتصال']);
                $ok = $err === '' && (int)($res['data']['code'] ?? 0) === 100;
                notify_log($pdo, 'zarinpal', 'test', 'آزمایش اتصال درگاه', $ok, $ok ? '' : ($err ?: (string)($res['errors']['message'] ?? "HTTP $code")));
            } else fail('کانال نامعتبر است.');
            $st = $pdo->query("SELECT ok, error FROM notify_log ORDER BY id DESC LIMIT 1"); $last = $st->fetch();
            respond(['success' => (bool)$ok, 'error' => $ok ? null : ($last['error'] ?? 'ناموفق')]);
        },
        'GET notify_log' => function () use ($pdo) {
            require_super(); ensure_aux_schema($pdo);
            respond($pdo->query("SELECT id, channel, target, subject, ok, error, created_at FROM notify_log ORDER BY id DESC LIMIT 300")->fetchAll());
        },
        'GET sales_leads' => function () use ($pdo) { require_super(); ensure_aux_schema($pdo); respond($pdo->query("SELECT * FROM leads ORDER BY id DESC LIMIT 1000")->fetchAll()); },
        'POST sales_lead_update' => function () use ($pdo, $input) {
            require_super(); ensure_aux_schema($pdo);
            $status = in_array($input['status'] ?? '', ['new', 'contacted', 'won', 'lost'], true) ? $input['status'] : 'new';
            $pdo->prepare("UPDATE leads SET status = ?, note = ? WHERE id = ?")->execute([$status, in_str($input, 'note', 3000), (int)($input['id'] ?? 0)]);
            respond(['success' => true]);
        },
        'POST sales_lead_delete' => function () use ($pdo, $input) { require_super(); ensure_aux_schema($pdo); $pdo->prepare("DELETE FROM leads WHERE id = ?")->execute([(int)($input['id'] ?? 0)]); respond(['success' => true]); },
        'GET sales_orders' => function () use ($pdo) {
            require_super(); ensure_aux_schema($pdo);
            $rows = $pdo->query("SELECT id FROM orders ORDER BY created_at DESC LIMIT 1000")->fetchAll();
            respond(array_map(function ($r) use ($pdo) { $o = order_load($pdo, $r['id']); $o['tenantName'] = ''; if ($o['tenant_id']) { $t = load_tenant($pdo, (string)$o['tenant_id']); $o['tenantName'] = $t['orgName'] ?? ''; $o['tenantLink'] = $t ? tenant_link_url($t) : ''; } return $o; }, $rows));
        },
        'POST sales_order_update' => function () use ($pdo, $input) {
            require_super();
            $o = order_load($pdo, in_str($input, 'id', 40)); if (!$o) fail('سفارش پیدا نشد.', 404);
            $status = in_array($input['status'] ?? '', ORDER_STATUSES, true) ? $input['status'] : $o['status'];
            $pdo->prepare("UPDATE orders SET status = ?, admin_note = ? WHERE id = ?")->execute([$status, in_str($input, 'note', 5000), $o['id']]);
            if ($status !== $o['status']) {
                audit($pdo, (string)($o['tenant_id'] ?? ''), 'order_status', $o['id'], ['from' => $o['status'], 'to' => $status]);
                if ($status === 'in_progress' && !empty($input['notifyCustomer'])) notify_customer($pdo, (string)$o['mobile'], (string)($o['data']['applicant']['email'] ?? ''), 'سفارش کارت', "سفارش {$o['code']} در حال طراحی و آماده‌سازی است.\nپیگیری: " . order_link($o));
            }
            respond(['success' => true]);
        },
        'POST sales_order_delete' => function () use ($pdo, $input) {
            require_super();
            $o = order_load($pdo, in_str($input, 'id', 40)); if (!$o) fail('سفارش پیدا نشد.', 404);
            if (in_array($o['status'], ['paid', 'in_progress', 'delivered'], true)) fail('سفارش پرداخت‌شده حذف نمی‌شود؛ می‌توانید آن را «لغو‌شده» علامت بزنید.');
            $pdo->prepare("DELETE FROM orders WHERE id = ?")->execute([$o['id']]);
            respond(['success' => true]);
        },
    ];
}
