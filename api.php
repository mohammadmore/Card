<?php
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');
// عمداً هیچ هدر CORS ارسال نمی‌شود: API فقط از همین دامنه قابل استفاده است.

// ==========================================
// 0. پیکربندی و ابزارهای پایه
// ==========================================
function load_config(): array {
    $candidates = [dirname(__DIR__, 2) . '/superadmin_config.php', dirname(__DIR__) . '/superadmin_config.php', __DIR__ . '/config.php'];
    foreach ($candidates as $file) { if (is_file($file)) { $cfg = require $file; if (is_array($cfg)) return $cfg; } }
    return [];
}

function respond(array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400): void { respond(['error' => $msg], $code); }
/** خطای اعتبارسنجی همراه شناسه‌ی فیلد، تا فرم به همان فیلد اسکرول کند. */
function fail_field(string $msg, string $fieldId): void { respond(['error' => $msg, 'field' => $fieldId], 400); }

/** پاسخ را برای کاربر می‌فرستد ولی اسکریپت برای کارهای پس‌زمینه (وب‌هوک) ادامه پیدا می‌کند. */
function respond_and_continue(array $data): void {
    $body = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (session_status() === PHP_SESSION_ACTIVE) session_write_close();
    ignore_user_abort(true);
    header('Content-Length: ' . strlen($body));
    header('Connection: close');
    echo $body;
    if (function_exists('fastcgi_finish_request')) { fastcgi_finish_request(); }
    elseif (function_exists('litespeed_finish_request')) { litespeed_finish_request(); }
    else { while (ob_get_level() > 0) ob_end_flush(); flush(); }
}

function in_str(array $src, string $key, int $max = 1000): string {
    $v = $src[$key] ?? '';
    if (!is_scalar($v)) return '';
    $v = trim((string)$v);
    return mb_substr($v, 0, $max);
}
function in_raw(array $src, string $key): string { $v = $src[$key] ?? ''; return is_string($v) ? $v : ''; }
function in_arr(array $src, string $key): array { $v = $src[$key] ?? []; return is_array($v) ? $v : []; }
function valid_id(string $id): bool { return (bool)preg_match('/^[A-Za-z0-9_.\-]{1,64}$/', $id); }
function new_id(string $prefix): string { return $prefix . bin2hex(random_bytes(8)); }
function json_enc($v): string { return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); }

$config = load_config();
date_default_timezone_set((string)($config['timezone'] ?? 'Asia/Tehran'));
ini_set('log_errors', '1');
if (!empty($config['error_log'])) ini_set('error_log', (string)$config['error_log']);

set_exception_handler(function (Throwable $e) {
    error_log('[api] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) { http_response_code(500); header('Content-Type: application/json; charset=utf-8'); }
    echo json_encode(['error' => 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.'], JSON_UNESCAPED_UNICODE);
});

if (empty($config['db'])) { error_log('[api] config file not found'); fail('پیکربندی سرور انجام نشده است.', 500); }

// ==========================================
// 1. قفل دامنه (سمت سرور)
// ==========================================
$host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
$allowedHosts = array_map('strtolower', $config['allowed_hosts'] ?? []);
if ($allowedHosts) {
    $ok = false;
    foreach ($allowedHosts as $h) { if ($host === $h || str_ends_with($host, '.' . $h)) { $ok = true; break; } }
    if (!$ok) fail('این دامنه مجاز به استفاده از پلتفرم نیست.', 403);
}

// ==========================================
// 2. سشن و محافظت CSRF
// ==========================================
$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('CARDPLATFORM');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $isHttps, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
session_start();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = is_string($_GET['action'] ?? null) ? $_GET['action'] : '';

if ($method === 'POST') {
    // درخواست‌های بین‌دامنه‌ای نمی‌توانند این هدر را بدون preflight بفرستند و preflight هم پذیرفته نمی‌شود.
    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') fail('درخواست نامعتبر است.', 403);
    $input = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($input)) $input = [];
} elseif ($method === 'GET') {
    $input = [];
} else {
    fail('متد درخواست پشتیبانی نمی‌شود.', 405);
}

// ==========================================
// 3. دیتابیس
// ==========================================
$db = $config['db'];
try {
    $pdo = new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    // هم‌زمانی منطقه‌ی زمانی MySQL با PHP تا تاریخ صدور/انقضا و زمان ثبت یکسان باشند
    $pdo->exec("SET time_zone = '" . date('P') . "'");
} catch (PDOException $e) {
    error_log('[api] DB connect: ' . $e->getMessage());
    fail('خطا در اتصال به دیتابیس', 500);
}

function ensure_aux_schema(PDO $pdo): void {
    static $done = false; if ($done) return; $done = true;
    $pdo->exec("CREATE TABLE IF NOT EXISTS login_attempts (k CHAR(40) PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, locked_until DATETIME NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS card_counters (tenant_id VARCHAR(64) NOT NULL, field_id VARCHAR(64) NOT NULL, next_val BIGINT NOT NULL, PRIMARY KEY (tenant_id, field_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL DEFAULT '', actor VARCHAR(20) NOT NULL, action VARCHAR(40) NOT NULL, target VARCHAR(64) NOT NULL DEFAULT '', details TEXT NULL, ip VARCHAR(64) NOT NULL DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_audit_tenant (tenant_id, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $pdo->exec("CREATE TABLE IF NOT EXISTS webhook_logs (id BIGINT AUTO_INCREMENT PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL DEFAULT '', card_id VARCHAR(64) NOT NULL DEFAULT '', url TEXT NOT NULL, http_code INT NOT NULL DEFAULT 0, error VARCHAR(500) NOT NULL DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_wh_tenant (tenant_id, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

// ==========================================
// 4. احراز هویت و دسترسی
// ==========================================
function is_super(): bool { return !empty($_SESSION['super']); }
function tenant_role(string $tenantId): ?string { return $_SESSION['tenants'][$tenantId] ?? null; }
function require_super(): void { if (!is_super()) fail('دسترسی غیرمجاز. لطفاً وارد شوید.', 401); }
function require_tenant(string $tenantId, array $roles = ['ADMIN', 'USER']): string {
    $role = tenant_role($tenantId);
    if ($role === null || !in_array($role, $roles, true)) fail('دسترسی غیرمجاز. لطفاً وارد شوید.', 401);
    return $role;
}
function own_card(string $cardId): bool { return in_array($cardId, $_SESSION['own_cards'] ?? [], true); }

function throttle_check(PDO $pdo, string $scope): string {
    ensure_aux_schema($pdo);
    $key = sha1(($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $scope);
    $stmt = $pdo->prepare("SELECT TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS remaining FROM login_attempts WHERE k = ? AND locked_until > NOW()");
    $stmt->execute([$key]);
    if ($row = $stmt->fetch()) {
        $sec = max(1, (int)$row['remaining']);
        respond(['error' => 'تعداد تلاش‌های ناموفق زیاد بود. ورود به‌طور موقت قفل شده است.', 'retryAfter' => $sec], 429);
    }
    return $key;
}
function throttle_fail(PDO $pdo, string $key): void {
    global $config;
    $max = (int)($config['login_max_attempts'] ?? 5); $lock = (int)($config['login_lock_seconds'] ?? 900);
    $pdo->prepare("INSERT INTO login_attempts (k, attempts) VALUES (?, 1) ON DUPLICATE KEY UPDATE attempts = attempts + 1")->execute([$key]);
    $pdo->prepare("UPDATE login_attempts SET locked_until = DATE_ADD(NOW(), INTERVAL ? SECOND), attempts = 0 WHERE k = ? AND attempts >= ?")->execute([$lock, $key, $max]);
    usleep(300000);
}
function throttle_clear(PDO $pdo, string $key): void { $pdo->prepare("DELETE FROM login_attempts WHERE k = ?")->execute([$key]); }

function session_info(): array {
    return ['super' => is_super(), 'tenants' => (object)($_SESSION['tenants'] ?? [])];
}

// ==========================================
// 5. سازمان‌ها (tenants)
// ==========================================
function load_tenant(PDO $pdo, string $id): ?array {
    if (!valid_id($id)) return null;
    $stmt = $pdo->prepare("SELECT data FROM tenants WHERE id = ?"); $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $t = json_decode($row['data'], true);
    return is_array($t) ? $t : null;
}
function store_tenant(PDO $pdo, string $id, array $data): void {
    $data['id'] = $id;
    ensure_slug_column($pdo);
    $slug = ($data['slug'] ?? '') !== '' ? (string)$data['slug'] : null;
    // created_at فقط در اولین ثبت مقدار می‌گیرد و با ویرایش تغییر نمی‌کند
    $pdo->prepare("INSERT INTO tenants (id, data, created_at, slug) VALUES (?, ?, NOW(), ?) ON DUPLICATE KEY UPDATE data = VALUES(data), slug = VALUES(slug)")->execute([$id, json_enc($data), $slug]);
}

// --- آدرس اختصاصی (slug) سازمان: لینک خوانا مثل /superadmin/acme به‌جای شناسه‌ی تصادفی ---
const RESERVED_SLUGS = ['assets', 'uploads', 'tools', 'src', 'api', 'index', 'admin', 'superadmin', 'node_modules', 'verify', 'login', 'logout', 'public', 'static'];
function ensure_slug_column(PDO $pdo): void {
    static $done = false; if ($done) return; $done = true;
    if (!$pdo->query("SHOW COLUMNS FROM tenants LIKE 'slug'")->fetch()) $pdo->exec("ALTER TABLE tenants ADD COLUMN slug VARCHAR(64) NULL, ADD UNIQUE KEY uq_tenants_slug (slug)");
}
/** خطای قالب آدرس یا null اگر معتبر است. */
function slug_format_error(string $slug): ?string {
    if (!preg_match('/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/', $slug) || str_contains($slug, '--')) return 'آدرس باید ۳ تا ۴۰ حرف کوچک انگلیسی، عدد یا خط تیره باشد و با حرف یا عدد شروع و تمام شود.';
    if (in_array($slug, RESERVED_SLUGS, true)) return 'این آدرس رزرو شده است؛ آدرس دیگری انتخاب کنید.';
    return null;
}
function slug_taken(PDO $pdo, string $slug, string $exceptId): bool {
    ensure_slug_column($pdo);
    $stmt = $pdo->prepare("SELECT id FROM tenants WHERE (slug = ? OR id = ?) AND id <> ?"); $stmt->execute([$slug, $slug, $exceptId]);
    return (bool)$stmt->fetch();
}
/** یافتن سازمان با شناسه یا آدرس اختصاصی. */
function find_tenant(PDO $pdo, string $key): ?array {
    $t = load_tenant($pdo, $key); if ($t) return $t;
    if ($key === '' || slug_format_error(strtolower($key)) !== null) return null;
    ensure_slug_column($pdo);
    $stmt = $pdo->prepare("SELECT data FROM tenants WHERE slug = ?"); $stmt->execute([strtolower($key)]);
    $row = $stmt->fetch(); if (!$row) return null;
    $t = json_decode($row['data'], true); return is_array($t) ? $t : null;
}
const DEFAULT_THEME = ['c1' => '#f472b6', 'c2' => '#38bdf8', 'c3' => '#a855f7'];
function sanitize_theme($theme): array {
    $out = DEFAULT_THEME;
    if (is_array($theme)) foreach ($out as $k => $_) { $v = $theme[$k] ?? null; if (is_string($v) && preg_match('/^#[0-9a-fA-F]{6}$/', $v)) $out[$k] = strtolower($v); }
    return $out;
}
/** رمزهای قدیمی ذخیره‌شده به‌صورت متن ساده را به هش تبدیل می‌کند. */
function migrate_passwords(array &$t): bool {
    $changed = false;
    foreach (['adminPass' => 'adminPassHash', 'publicPass' => 'publicPassHash'] as $plain => $hash) {
        if (array_key_exists($plain, $t)) {
            if (empty($t[$hash]) && is_scalar($t[$plain]) && (string)$t[$plain] !== '') $t[$hash] = password_hash((string)$t[$plain], PASSWORD_DEFAULT);
            unset($t[$plain]); $changed = true;
        }
    }
    return $changed;
}
function tenant_client_view(array $t, bool $withWebhooks): array {
    $t['hasAdminPass'] = !empty($t['adminPassHash']) || !empty($t['adminPass']);
    $t['hasPublicPass'] = !empty($t['publicPassHash']) || !empty($t['publicPass']);
    unset($t['adminPass'], $t['publicPass'], $t['adminPassHash'], $t['publicPassHash']);
    if (!$withWebhooks) unset($t['webhooks']);
    $t['closedReason'] = tenant_closed_reason($t);
    return $t;
}
function tenant_public_view(array $t): array {
    return array_intersect_key($t, array_flip(['id', 'slug', 'orgName', 'logoUrl', 'welcomeText', 'langCode', 'allowLangSwitch'])) + ['closedReason' => tenant_closed_reason($t), 'theme' => sanitize_theme($t['theme'] ?? null)];
}
/** اعتبارسنجی و اعمال رمزهای جدید روی رکورد سازمان. */
function apply_passwords(array &$t, string $adminPass, string $publicPass, bool $isNew): void {
    if ($isNew && ($adminPass === '' || $publicPass === '')) fail('تعیین رمز مدیر و رمز عمومی الزامی است.');
    foreach ([$adminPass, $publicPass] as $p) { if ($p !== '' && mb_strlen($p) < 4) fail('رمز باید حداقل ۴ کاراکتر باشد.'); }
    if ($adminPass !== '' && $adminPass === $publicPass) fail('رمز مدیر و رمز عمومی نمی‌توانند یکسان باشند.');
    if ($adminPass !== '' && $publicPass === '' && !empty($t['publicPassHash']) && password_verify($adminPass, $t['publicPassHash'])) fail('رمز مدیر و رمز عمومی نمی‌توانند یکسان باشند.');
    if ($publicPass !== '' && $adminPass === '' && !empty($t['adminPassHash']) && password_verify($publicPass, $t['adminPassHash'])) fail('رمز مدیر و رمز عمومی نمی‌توانند یکسان باشند.');
    if ($adminPass !== '') $t['adminPassHash'] = password_hash($adminPass, PASSWORD_DEFAULT);
    if ($publicPass !== '') $t['publicPassHash'] = password_hash($publicPass, PASSWORD_DEFAULT);
}
function sanitize_webhooks(array $hooks): array {
    global $config;
    $out = [];
    foreach ($hooks as $wh) {
        if (!is_array($wh)) continue;
        $url = in_str($wh, 'url', 2000);
        if ($url !== '' && !webhook_url_syntax_ok($url, !empty($config['webhook_allow_http']))) fail('آدرس وب‌هوک نامعتبر است: ' . $url);
        $methodWh = strtoupper(in_str($wh, 'method', 10));
        if (!in_array($methodWh, ['POST', 'GET', 'PUT', 'PATCH'], true)) $methodWh = 'POST';
        $out[] = [
            'isActive' => !empty($wh['isActive']),
            'url' => $url,
            'method' => $methodWh,
            'headers' => is_string($wh['headers'] ?? null) ? mb_substr($wh['headers'], 0, 4000) : '',
            'payloadTemplate' => is_string($wh['payloadTemplate'] ?? null) ? mb_substr($wh['payloadTemplate'], 0, 20000) : '{}',
        ];
    }
    return $out;
}

// ==========================================
// 6. وب‌هوک‌ها (با محافظت SSRF)
// ==========================================
function webhook_url_syntax_ok(string $url, bool $allowHttp): bool {
    $p = parse_url($url);
    if (!$p || empty($p['host']) || empty($p['scheme'])) return false;
    $scheme = strtolower($p['scheme']);
    if (!($scheme === 'https' || ($allowHttp && $scheme === 'http'))) return false;
    if (isset($p['user']) || isset($p['pass'])) return false;
    $host = trim($p['host'], '[]');
    if (filter_var($host, FILTER_VALIDATE_IP) && !ip_is_public($host)) return false;
    if (in_array(strtolower($host), ['localhost', 'localhost.localdomain'], true)) return false;
    return true;
}
function ip_is_public(string $ip): bool {
    return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
}
/** نام دامنه را resolve می‌کند و فقط در صورتی که همه‌ی IPها عمومی باشند، یکی را برمی‌گرداند. */
function resolve_public_ip(string $host): ?string {
    $host = trim($host, '[]');
    if (filter_var($host, FILTER_VALIDATE_IP)) return ip_is_public($host) ? $host : null;
    $ips = gethostbynamel($host);
    if (!$ips) return null;
    foreach ($ips as $ip) { if (!ip_is_public($ip)) return null; }
    return $ips[0];
}
function build_webhook_payload(string $tpl, array $vars): string {
    return preg_replace_callback('/\{([A-Za-z0-9_]+)\}/', function ($m) use ($vars) {
        if (!array_key_exists($m[1], $vars)) return $m[0];
        // مقدار به‌صورت رشته‌ی JSON escape می‌شود تا ساختار JSON خراب نشود
        return substr(json_enc((string)$vars[$m[1]]), 1, -1);
    }, $tpl);
}
/**
 * ارسال هم‌زمان وب‌هوک‌ها؛ نتیجه‌ی هر ارسال برگردانده می‌شود: [url, http_code, error, body].
 * آدرس‌های غیرعمومی (شبکه‌ی داخلی) مسدود و به‌عنوان خطا گزارش می‌شوند.
 */
function send_webhooks(array $hooks, array $vars): array {
    global $config;
    $results = []; $mh = curl_multi_init(); $handles = [];
    foreach ($hooks as $wh) {
        $url = (string)$wh['url'];
        if (!webhook_url_syntax_ok($url, !empty($config['webhook_allow_http']))) { $results[] = ['url' => $url, 'code' => 0, 'error' => 'آدرس نامعتبر یا غیرمجاز', 'body' => '']; continue; }
        $p = parse_url($url); $ip = resolve_public_ip($p['host']);
        if ($ip === null) { $results[] = ['url' => $url, 'code' => 0, 'error' => 'دامنه پیدا نشد یا به شبکه‌ی داخلی اشاره می‌کند (مسدود شد)', 'body' => '']; continue; }
        $port = $p['port'] ?? (strtolower($p['scheme']) === 'https' ? 443 : 80);
        $ch = curl_init($url);
        $whMethod = in_array($wh['method'] ?? 'POST', ['POST', 'GET', 'PUT', 'PATCH'], true) ? $wh['method'] : 'POST';
        $headers = ['Content-Type: application/json'];
        foreach (preg_split('/\r?\n/', (string)($wh['headers'] ?? '')) as $h) {
            $h = trim($h);
            if ($h === '' || !str_contains($h, ':') || preg_match('/^(host|content-length)\s*:/i', $h)) continue;
            $headers[] = $h;
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $whMethod,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_RESOLVE => ["{$p['host']}:{$port}:{$ip}"], // جلوگیری از DNS rebinding
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        if ($whMethod !== 'GET') curl_setopt($ch, CURLOPT_POSTFIELDS, build_webhook_payload((string)($wh['payloadTemplate'] ?? '{}'), $vars));
        curl_multi_add_handle($mh, $ch); $handles[] = [$ch, $url];
    }
    do { $status = curl_multi_exec($mh, $running); if ($running) curl_multi_select($mh, 1.0); } while ($running && $status === CURLM_OK);
    foreach ($handles as [$ch, $url]) {
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_errno($ch) ? curl_error($ch) : '';
        if (!$err && ($code < 200 || $code >= 300)) $err = "پاسخ HTTP $code";
        $results[] = ['url' => $url, 'code' => $code, 'error' => $err, 'body' => mb_substr((string)curl_multi_getcontent($ch), 0, 500)];
        curl_multi_remove_handle($mh, $ch); curl_close($ch);
    }
    curl_multi_close($mh);
    return $results;
}
function webhook_vars(string $cardId, string $requesterName, array $cardData): array {
    $vars = ['requesterName' => $requesterName, 'cardId' => $cardId];
    foreach ($cardData as $k => $v) {
        if (is_bool($v)) $v = $v ? '1' : '0';
        elseif (!is_scalar($v)) $v = json_enc($v);
        $v = (string)$v;
        if (str_starts_with($v, 'data:')) $v = ''; // عکس‌ها وارد payload نمی‌شوند
        $vars[(string)$k] = $v;
    }
    return $vars;
}
function log_webhook_results(PDO $pdo, string $tenantId, string $cardId, array $results): void {
    try {
        ensure_aux_schema($pdo);
        $stmt = $pdo->prepare("INSERT INTO webhook_logs (tenant_id, card_id, url, http_code, error) VALUES (?, ?, ?, ?, ?)");
        foreach ($results as $r) { $stmt->execute([$tenantId, $cardId, mb_substr($r['url'], 0, 2000), $r['code'], mb_substr($r['error'], 0, 500)]); if ($r['error']) error_log("[webhook] {$r['url']}: {$r['error']}"); }
    } catch (Throwable $e) { error_log('[webhook-log] ' . $e->getMessage()); }
}
function fire_webhooks(PDO $pdo, array $tenant, string $cardId, string $requesterName, array $cardData): void {
    $hooks = array_filter($tenant['webhooks'] ?? [], fn($wh) => is_array($wh) && !empty($wh['isActive']) && !empty($wh['url']));
    if (!$hooks) return;
    log_webhook_results($pdo, (string)$tenant['id'], $cardId, send_webhooks($hooks, webhook_vars($cardId, $requesterName, $cardData)));
}

// ==========================================
// 7. کارت‌ها: اعتبارسنجی و سریال خودکار
// ==========================================
function js_regex_to_pcre(string $pattern): string {
    return '~' . preg_replace('/(?<!\\\\)~/', '\\~', $pattern) . '~u';
}
function load_validations(PDO $pdo): array {
    $rules = [];
    foreach ($pdo->query("SELECT id, pattern, error_msg FROM card_validations") as $r) $rules[(string)$r['id']] = $r;
    return $rules;
}
/**
 * داده‌های کارت را با تعریف فیلدهای سازمان تطبیق و اعتبارسنجی می‌کند.
 * فیلدهای سریال خودکار از کلاینت پذیرفته نمی‌شوند (روی ایجاد، سرور مقدار می‌دهد؛ روی ویرایش، مقدار قبلی حفظ می‌شود).
 */
/** مجموع ستاره‌های یک المان «ستاره‌ها» (همان محاسبه‌ی سمت کلاینت). */
function stars_total(array $f): int {
    $max = 1000;
    if (($f['starLayout'] ?? 'circle') === 'circle') {
        $sum = 0; foreach ((array)($f['starRows'] ?? []) as $r) { if (is_array($r)) $sum += max(0, min($max, (int)($r['count'] ?? 0))); }
        return min($max, $sum);
    }
    return max(0, min($max, (int)($f['starCount'] ?? 0)));
}
/** مقادیری که سرور تعیین می‌کند و از کلاینت پذیرفته نمی‌شوند: سریال خودکار و ستاره‌های «تعداد کارت‌های صادرشده». */
function is_server_assigned(array $f): bool {
    return !empty($f['autoIncrement']) || (($f['type'] ?? '') === 'stars' && ($f['litSource'] ?? 'input') === 'issued');
}
/** کلیدهای مدیریتی کارت داخل card_data: شناسه، کد استعلام، تاریخ صدور، تاریخ انقضا، باطل‌شده. */
const CARD_META_KEYS = ['_cid', '_vt', '_issued', '_exp', '_rev'];
function card_status(array $data): string {
    if (!empty($data['_rev'])) return 'revoked';
    if (!empty($data['_exp']) && date('Y-m-d') > $data['_exp']) return 'expired';
    return 'active';
}
function card_access_key(string $id): string {
    global $config;
    $secret = (string)($config['app_secret'] ?? '') ?: hash('sha256', ($config['db']['pass'] ?? '') . '|' . __FILE__);
    return substr(hash_hmac('sha256', $id, $secret), 0, 32);
}
function valid_date(string $d): bool { return (bool)preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4)); }
/** دلیل بسته بودن سامانه‌ی سازمان (غیرفعال یا پایان مهلت)؛ null یعنی باز است. */
function tenant_closed_reason(array $t): ?string {
    if (($t['isActive'] ?? true) === false) return 'این سامانه در حال حاضر غیرفعال است.';
    $until = (string)($t['activeUntil'] ?? '');
    if ($until !== '' && date('Y-m-d') > $until) return 'مهلت استفاده از این سامانه به پایان رسیده است.';
    return null;
}
/** ثبت رویداد در گزارش فعالیت (خطای ثبت، عملیات اصلی را متوقف نمی‌کند). */
function audit(PDO $pdo, string $tenantId, string $action, string $target = '', array $details = []): void {
    try {
        ensure_aux_schema($pdo);
        $actor = is_super() ? 'super' : (strtolower((string)tenant_role($tenantId)) ?: 'guest');
        $pdo->prepare("INSERT INTO audit_log (tenant_id, actor, action, target, details, ip) VALUES (?, ?, ?, ?, ?, ?)")->execute([$tenantId, $actor, $action, $target, json_enc((object)$details), (string)($_SERVER['REMOTE_ADDR'] ?? '')]);
    } catch (Throwable $e) { error_log('[audit] ' . $e->getMessage()); }
}
function validate_card_data(PDO $pdo, array $tenant, array $cardData, ?array $existing): array {
    $fields = [];
    foreach ($tenant['fields'] ?? [] as $f) { if (is_array($f) && isset($f['id'])) $fields[(string)$f['id']] = $f; }
    $rules = null; $clean = [];
    foreach ($cardData as $key => $val) {
        $key = (string)$key;
        if ($key === '_fontError') { $clean[$key] = (bool)$val; continue; }
        if (!isset($fields[$key])) continue; // کلیدهای ناشناخته حذف می‌شوند
        $f = $fields[$key]; $label = (string)($f['label'] ?? $key);
        if (is_server_assigned($f)) continue;
        if (!is_scalar($val)) continue;
        $val = (string)$val;
        if (($f['type'] ?? '') === 'photo') {
            if ($val === '' || $val === '[DELETED_48H]' || ($existing !== null && ($existing[$key] ?? null) === $val)) { $clean[$key] = $val; continue; }
            if (strlen($val) > 3 * 1024 * 1024) fail_field("فیلد «{$label}»: حجم تصویر بیش از حد مجاز است.", $key);
            $comma = strpos($val, ',');
            $okImg = $comma !== false && preg_match('#^data:image/(jpeg|png|webp);base64$#', substr($val, 0, $comma))
                && strspn($val, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=', $comma + 1) === strlen($val) - $comma - 1;
            if (!$okImg) fail_field("فیلد «{$label}»: فرمت تصویر نامعتبر است.", $key);
            $clean[$key] = $val; continue;
        }
        $val = mb_substr(trim($val), 0, 2000);
        if (($f['type'] ?? '') === 'stars') {
            $val = strtr($val, ['۰' => '0', '۱' => '1', '۲' => '2', '۳' => '3', '۴' => '4', '۵' => '5', '۶' => '6', '۷' => '7', '۸' => '8', '۹' => '9']);
            $total = stars_total($f);
            if ($val !== '' && (!ctype_digit($val) || (int)$val > $total)) fail_field("فیلد «{$label}»: عدد باید بین ۰ تا {$total} باشد.", $key);
            $clean[$key] = $val === '' ? '' : (string)(int)$val; continue;
        }
        if ($val !== '') {
            $textType = $f['textType'] ?? 'free';
            if (($f['type'] ?? '') === 'text' && empty($f['linkedFieldId'])) {
                if ($textType === 'en_num' && !preg_match('/^[0-9]+$/', $val)) fail_field("فیلد «{$label}»: فقط عدد مجاز است.", $key);
                if ($textType === 'fa_num' && !preg_match('/^[۰-۹]+$/u', $val)) fail_field("فیلد «{$label}»: فقط عدد مجاز است.", $key);
                if (!empty($f['hasLengthLimit'])) {
                    $limits = array_values(array_filter(array_map('intval', (array)($f['lengthLimits'] ?? (isset($f['lengthLimit']) ? [$f['lengthLimit']] : []))), fn($n) => $n > 0));
                    if ($limits && !in_array(mb_strlen($val), $limits, true)) fail_field("فیلد «{$label}»: تعداد ارقام باید دقیقاً " . implode(' یا ', $limits) . ' باشد.', $key);
                }
                if (!empty($f['validationId']) && $textType !== 'free') {
                    $rules ??= load_validations($pdo);
                    $rule = $rules[(string)$f['validationId']] ?? null;
                    if ($rule) {
                        $ok = @preg_match(js_regex_to_pcre((string)$rule['pattern']), $val);
                        if ($ok === 0) fail_field("فیلد «{$label}»: " . ($rule['error_msg'] ?: 'مقدار نامعتبر است.'), $key);
                    }
                }
            }
        }
        $clean[$key] = $val;
    }
    // حفظ مقادیر تعیین‌شده توسط سرور (سریال، ستاره‌های خودکار) در ویرایش
    if ($existing !== null) {
        foreach ($fields as $id => $f) { if (is_server_assigned($f) && isset($existing[$id])) $clean[$id] = $existing[$id]; }
    }
    // فیلدهای الزامی (و المان ستاره با ورودی کاربر که همیشه الزامی است)؛ المان‌های پشت کارت در حالت تک‌رو نمایش داده نمی‌شوند
    $single = ($tenant['cardLayout'] ?? '') === 'single';
    foreach ($fields as $id => $f) {
        $type = $f['type'] ?? '';
        if (is_server_assigned($f) || !empty($f['linkedFieldId']) || ($single && ($f['side'] ?? '') === 'back')) continue;
        $val = trim((string)($clean[$id] ?? ''));
        if ($type === 'stars') { if ($val === '') fail_field('فیلد «' . ($f['label'] ?? $id) . '»: تعداد ستاره‌های روشن را وارد کنید.', $id); continue; }
        if (empty($f['required'])) continue;
        $missing = $val === '' || ($type === 'date' && !preg_match('#^\d+/\d+/\d+$#', $val));
        if ($missing) fail_field('فیلد «' . ($f['label'] ?? $id) . '» الزامی است.', $id);
    }
    // اطلاعات مدیریتی کارت (اعتبار، کد استعلام) فقط توسط سرور تعیین و در ویرایش حفظ می‌شود
    if ($existing !== null) { foreach (CARD_META_KEYS as $mk) { if (array_key_exists($mk, $existing)) $clean[$mk] = $existing[$mk]; } }
    return $clean;
}
/** برای فیلدهای سریال خودکار و ستاره‌های خودکار، مقدار بعدی را به‌صورت اتمیک (داخل تراکنش) اختصاص می‌دهد. */
function assign_serials(PDO $pdo, array $tenant, array &$cardData): void {
    foreach ($tenant['fields'] ?? [] as $f) {
        if (!is_array($f) || empty($f['autoIncrement'])) continue;
        $fid = (string)$f['id']; $start = max(1, (int)($f['autoIncStart'] ?? 1));
        $pdo->prepare("INSERT IGNORE INTO card_counters (tenant_id, field_id, next_val) VALUES (?, ?, ?)")->execute([$tenant['id'], $fid, $start]);
        $stmt = $pdo->prepare("SELECT next_val FROM card_counters WHERE tenant_id = ? AND field_id = ? FOR UPDATE");
        $stmt->execute([$tenant['id'], $fid]);
        $val = max((int)$stmt->fetchColumn(), $start);
        $pdo->prepare("UPDATE card_counters SET next_val = ? WHERE tenant_id = ? AND field_id = ?")->execute([$val + 1, $tenant['id'], $fid]);
        $cardData[$fid] = ($f['autoIncPrefix'] ?? '') . $val;
    }
    // ستاره‌های «تعداد کارت‌های صادرشده»: کارت n‌ام سازمان n ستاره‌ی روشن می‌گیرد.
    // شمارنده در اولین استفاده از تعداد کارت‌های موجود ادامه می‌دهد.
    foreach ($tenant['fields'] ?? [] as $f) {
        if (!is_array($f) || ($f['type'] ?? '') !== 'stars' || ($f['litSource'] ?? 'input') !== 'issued') continue;
        $fid = (string)$f['id'];
        $cnt = $pdo->prepare("SELECT COUNT(*) FROM cards WHERE tenant_id = ?"); $cnt->execute([$tenant['id']]);
        $pdo->prepare("INSERT IGNORE INTO card_counters (tenant_id, field_id, next_val) VALUES (?, ?, ?)")->execute([$tenant['id'], $fid, (int)$cnt->fetchColumn() + 1]);
        $stmt = $pdo->prepare("SELECT next_val FROM card_counters WHERE tenant_id = ? AND field_id = ? FOR UPDATE");
        $stmt->execute([$tenant['id'], $fid]);
        $val = max(1, (int)$stmt->fetchColumn());
        $pdo->prepare("UPDATE card_counters SET next_val = ? WHERE tenant_id = ? AND field_id = ?")->execute([$val + 1, $tenant['id'], $fid]);
        $cardData[$fid] = (string)$val;
    }
}
/** تنظیمات قالب خروجی ذخیره‌شده همراه بوم آماده. */
function template_settings(array $st): string {
    return json_enc([
        'cardLayout' => ($st['cardLayout'] ?? '') === 'single' ? 'single' : 'double',
        'canvasW' => max(50, min(10000, (int)($st['canvasW'] ?? 800) ?: 800)),
        'canvasH' => max(50, min(10000, (int)($st['canvasH'] ?? 500) ?: 500)),
        'canvasMode' => ($st['canvasMode'] ?? '') === 'fixed' ? 'fixed' : 'auto',
        'bgFit' => in_array($st['bgFit'] ?? '', ['stretch', 'cover', 'contain'], true) ? $st['bgFit'] : 'stretch',
    ]);
}
function load_card(PDO $pdo, string $id): ?array {
    if (!valid_id($id)) return null;
    $stmt = $pdo->prepare("SELECT * FROM cards WHERE id = ?"); $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}
function card_view(array $row, bool $light): array {
    $data = json_decode((string)$row['card_data'], true);
    if (!is_array($data)) $data = [];
    if ($light) {
        // در فهرست، تصاویر base64 حذف می‌شوند تا پاسخ سبک بماند (نمایش کامل با get_card_full)
        foreach ($data as $k => $v) { if (is_string($v) && str_starts_with($v, 'data:')) $data[$k] = '[IMAGE]'; }
    }
    return ['id' => $row['id'], 'tenantId' => $row['tenant_id'], 'requesterName' => $row['requester_name'], 'cardData' => (object)$data, 'issuedAt' => $row['issued_at'], 'status' => card_status($data), 'expiresAt' => $data['_exp'] ?? null];
}

// ==========================================
// 8. آپلود فایل
// ==========================================
function decode_data_url(string $dataUrl, int $maxBytes): string {
    $b64 = str_contains($dataUrl, ',') ? substr($dataUrl, strpos($dataUrl, ',') + 1) : $dataUrl;
    if (strlen($b64) > (int)ceil($maxBytes * 4 / 3) + 16) fail('حجم فایل بیش از حد مجاز است.', 413);
    $bin = base64_decode($b64, true);
    if ($bin === false || $bin === '') fail('داده فایل نامعتبر است.');
    if (strlen($bin) > $maxBytes) fail('حجم فایل بیش از حد مجاز است.', 413);
    return $bin;
}
function store_upload(string $subdir, string $bin, string $ext): string {
    $dir = __DIR__ . '/uploads/' . $subdir;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) throw new RuntimeException("cannot create $dir");
    $name = bin2hex(random_bytes(16)) . '.' . $ext;
    if (file_put_contents("$dir/$name", $bin) === false) throw new RuntimeException("cannot write upload");
    chmod("$dir/$name", 0644);
    // مسیر نسبی برمی‌گردد (بدون وابستگی به هدر Host)
    return "uploads/$subdir/$name";
}
function font_ext_from_magic(string $bin): ?string {
    $sig = substr($bin, 0, 4);
    if ($sig === "\x00\x01\x00\x00" || $sig === 'true') return 'ttf';
    if ($sig === 'OTTO') return 'otf';
    if ($sig === 'wOFF') return 'woff';
    if ($sig === 'wOF2') return 'woff2';
    return null;
}
function valid_asset_url(string $url): bool {
    if (preg_match('#^uploads/[A-Za-z0-9_/\-]+\.[A-Za-z0-9]{2,5}$#', $url)) return true;
    $p = parse_url($url);
    return $p && in_array(strtolower($p['scheme'] ?? ''), ['http', 'https'], true) && !empty($p['host']);
}

// ==========================================
// 9. مسیریابی
// ==========================================
$routes = [
    // --- سشن ---
    'GET get_session' => function () { respond(session_info()); },
    'POST login_super' => function () use ($pdo, $input, $config) {
        $key = throttle_check($pdo, 'super');
        $hash = (string)($config['superadmin_password_hash'] ?? '');
        $pass = is_string($input['passcode'] ?? null) ? $input['passcode'] : '';
        if ($hash === '' || $pass === '' || !password_verify($pass, $hash)) { throttle_fail($pdo, $key); audit($pdo, '', 'super_login_failed'); fail('رمز وارد شده معتبر نیست.', 401); }
        throttle_clear($pdo, $key);
        session_regenerate_id(true);
        $_SESSION['super'] = true;
        audit($pdo, '', 'super_login');
        respond(['success' => true] + session_info());
    },
    'POST login_tenant' => function () use ($pdo, $input) {
        $orgId = in_str($input, 'orgId', 64);
        $pass = is_string($input['passcode'] ?? null) ? $input['passcode'] : '';
        $t = find_tenant($pdo, $orgId);
        if (!$t) fail('سازمان یافت نشد', 404);
        $orgId = (string)$t['id'];
        $key = throttle_check($pdo, 'tenant:' . $orgId);
        if (migrate_passwords($t)) store_tenant($pdo, $orgId, $t);
        $role = null;
        if ($pass !== '' && !empty($t['adminPassHash']) && password_verify($pass, $t['adminPassHash'])) $role = 'ADMIN';
        elseif ($pass !== '' && !empty($t['publicPassHash']) && password_verify($pass, $t['publicPassHash'])) $role = 'USER';
        if ($role === null) { throttle_fail($pdo, $key); audit($pdo, $orgId, 'login_failed'); fail('کد وارد شده معتبر نیست.', 401); }
        throttle_clear($pdo, $key);
        // سامانه‌ی غیرفعال/منقضی: کاربران عادی وارد نمی‌شوند؛ مدیر سازمان فقط برای مشاهده و خروجی وارد می‌شود
        $closed = tenant_closed_reason($t);
        if ($closed !== null && $role === 'USER') fail($closed, 403);
        session_regenerate_id(true);
        $_SESSION['tenants'][$orgId] = $role;
        audit($pdo, $orgId, 'login', '', ['role' => $role]);
        respond(['success' => true, 'role' => $role, 'tenant' => tenant_client_view($t, is_super())]);
    },
    'POST logout' => function () use ($input) {
        $tenantId = in_str($input, 'tenantId', 64);
        if ($tenantId !== '') unset($_SESSION['tenants'][$tenantId]); else unset($_SESSION['super']);
        if (empty($_SESSION['super']) && empty($_SESSION['tenants'])) { $_SESSION = []; session_regenerate_id(true); }
        respond(['success' => true]);
    },

    // --- آپلود ---
    'POST upload_image' => function () use ($input, $config) {
        require_super();
        $bin = decode_data_url(in_raw($input, 'image'), (int)($config['max_image_bytes'] ?? 5242880));
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bin);
        $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];
        if (!isset($exts[$mime]) || @getimagesizefromstring($bin) === false) fail('فقط فایل تصویری (JPG/PNG/WEBP/GIF) مجاز است.');
        respond(['success' => true, 'url' => store_upload('images', $bin, $exts[$mime])]);
    },
    'POST upload_font' => function () use ($input, $config) {
        require_super();
        $bin = decode_data_url(in_raw($input, 'file'), (int)($config['max_font_bytes'] ?? 10485760));
        $ext = font_ext_from_magic($bin);
        if ($ext === null) fail('فقط فایل فونت معتبر (TTF/OTF/WOFF/WOFF2) مجاز است.');
        respond(['success' => true, 'url' => store_upload('fonts', $bin, $ext)]);
    },

    // --- سازمان‌ها ---
    'GET get_tenants' => function () use ($pdo) {
        require_super();
        $stats = [];
        foreach ($pdo->query("SELECT tenant_id, COUNT(*) AS c, MAX(issued_at) AS last FROM cards GROUP BY tenant_id") as $r) $stats[$r['tenant_id']] = $r;
        $out = [];
        foreach ($pdo->query("SELECT data, created_at FROM tenants ORDER BY created_at DESC") as $row) {
            $t = json_decode($row['data'], true);
            if (!is_array($t)) continue;
            $v = tenant_client_view($t, true);
            $st = $stats[$t['id'] ?? ''] ?? null;
            $v['stats'] = ['cardCount' => $st ? (int)$st['c'] : 0, 'lastIssuedAt' => $st ? $st['last'] : null, 'createdAt' => $row['created_at']];
            $out[] = $v;
        }
        respond($out);
    },
    'GET ping' => function () { respond(['ok' => true]); },
    'GET check_slug' => function () use ($pdo) {
        require_super();
        $slug = strtolower(trim(is_string($_GET['slug'] ?? null) ? $_GET['slug'] : ''));
        $err = slug_format_error($slug);
        if ($err === null && slug_taken($pdo, $slug, is_string($_GET['id'] ?? null) ? $_GET['id'] : '')) $err = 'این آدرس قبلاً برای سازمان دیگری ثبت شده است.';
        respond(['available' => $err === null, 'error' => null, 'reason' => $err]);
    },
    'GET get_tenant_public' => function () use ($pdo) {
        $t = find_tenant($pdo, is_string($_GET['id'] ?? null) ? $_GET['id'] : '');
        if (!$t) fail('سازمان یافت نشد', 404);
        respond(tenant_public_view($t));
    },
    'GET get_tenant' => function () use ($pdo) {
        $id = is_string($_GET['id'] ?? null) ? $_GET['id'] : '';
        if (!is_super()) require_tenant($id);
        $t = load_tenant($pdo, $id);
        if (!$t) fail('سازمان یافت نشد', 404);
        respond(tenant_client_view($t, is_super()));
    },
    'POST save_tenant' => function () use ($pdo, $input) {
        require_super();
        $id = in_str($input, 'id', 64);
        $existing = null;
        if ($id !== '') { $existing = load_tenant($pdo, $id); if (!$existing) fail('سازمان یافت نشد', 404); migrate_passwords($existing); }
        else $id = new_id('org_');
        $data = $input;
        unset($data['adminPass'], $data['publicPass'], $data['adminPassHash'], $data['publicPassHash'], $data['hasAdminPass'], $data['hasPublicPass']);
        $data['orgName'] = in_str($input, 'orgName', 200);
        if ($data['orgName'] === '') fail('نام سازمان الزامی است.');
        $data['webhooks'] = sanitize_webhooks(in_arr($input, 'webhooks'));
        // قالب خروجی: دورو (پیش‌فرض) یا تک‌رو؛ ابعاد بوم برای حالت بدون تصویر پس‌زمینه
        $data['cardLayout'] = ($input['cardLayout'] ?? '') === 'single' ? 'single' : 'double';
        // نمایش حرفه‌ای سه‌بعدی کارت بعد از صدور (فقط برای کارت دورو معنا دارد)
        $data['showcase3d'] = $data['cardLayout'] === 'double' && !empty($input['showcase3d']);
        $data['canvasW'] = max(50, min(10000, (int)($input['canvasW'] ?? 800) ?: 800));
        $data['canvasH'] = max(50, min(10000, (int)($input['canvasH'] ?? 500) ?: 500));
        // حالت ابعاد بوم: auto (از عکس زمینه) یا fixed (ابعاد ثابت + نحوه‌ی جای‌گیری عکس زمینه)
        $data['canvasMode'] = ($input['canvasMode'] ?? '') === 'fixed' ? 'fixed' : 'auto';
        $data['bgFit'] = in_array($input['bgFit'] ?? '', ['stretch', 'cover', 'contain'], true) ? $input['bgFit'] : 'stretch';
        // اندازه‌ی چاپ واقعی (میلی‌متر؛ ۰ = خودکار روی A4)، اعتبار کارت (روز؛ ۰ = نامحدود)، وضعیت سامانه، امکان تغییر زبان
        $data['printW'] = max(0, min(2000, round((float)($input['printW'] ?? 0), 1)));
        $data['printH'] = max(0, min(2000, round((float)($input['printH'] ?? 0), 1)));
        $data['validityDays'] = max(0, min(36500, (int)($input['validityDays'] ?? 0)));
        $data['isActive'] = ($input['isActive'] ?? true) !== false;
        $until = in_str($input, 'activeUntil', 10);
        $data['activeUntil'] = valid_date($until) ? $until : '';
        $data['allowLangSwitch'] = ($input['allowLangSwitch'] ?? true) !== false;
        // رنگ‌های گرادیانت پس‌زمینه‌ی پنل این سازمان
        $data['theme'] = sanitize_theme($input['theme'] ?? null);
        // آدرس اختصاصی لینک (خالی = لینک با شناسه‌ی تصادفی)
        $slug = strtolower(in_str($input, 'slug', 64));
        if ($slug !== '') {
            if (($err = slug_format_error($slug)) !== null) fail_field($err, 'slug');
            if (slug_taken($pdo, $slug, $id)) fail_field('این آدرس قبلاً برای سازمان دیگری ثبت شده است.', 'slug');
        }
        $data['slug'] = $slug;
        $data['adminPassHash'] = $existing['adminPassHash'] ?? null;
        $data['publicPassHash'] = $existing['publicPassHash'] ?? null;
        apply_passwords($data, in_str($input, 'adminPass', 200), in_str($input, 'publicPass', 200), $existing === null || empty($data['adminPassHash']) || empty($data['publicPassHash']));
        store_tenant($pdo, $id, $data);
        audit($pdo, $id, $existing ? 'tenant_update' : 'tenant_create', $id, ['orgName' => $data['orgName']]);
        respond(['success' => true, 'id' => $id]);
    },
    'POST change_tenant_passwords' => function () use ($pdo, $input) {
        $id = in_str($input, 'tenantId', 64);
        if (!is_super()) require_tenant($id, ['ADMIN']);
        $t = load_tenant($pdo, $id);
        if (!$t) fail('سازمان یافت نشد', 404);
        migrate_passwords($t);
        $a = in_str($input, 'adminPass', 200); $p = in_str($input, 'publicPass', 200);
        if ($a === '' && $p === '') fail('حداقل یکی از رمزها را وارد کنید.');
        apply_passwords($t, $a, $p, false);
        store_tenant($pdo, $id, $t);
        audit($pdo, $id, 'passwords_change', '', ['admin' => $a !== '', 'public' => $p !== '']);
        respond(['success' => true]);
    },
    'POST delete_tenant' => function () use ($pdo, $input) {
        require_super();
        $id = in_str($input, 'id', 64);
        if (!valid_id($id)) fail('شناسه نامعتبر');
        ensure_aux_schema($pdo);
        $pdo->beginTransaction();
        $pdo->prepare("DELETE FROM cards WHERE tenant_id = ?")->execute([$id]);
        $pdo->prepare("DELETE FROM card_counters WHERE tenant_id = ?")->execute([$id]);
        $stmt = $pdo->prepare("DELETE FROM tenants WHERE id = ?"); $stmt->execute([$id]);
        $pdo->commit();
        if ($stmt->rowCount() === 0) fail('سازمان یافت نشد', 404);
        audit($pdo, $id, 'tenant_delete', $id);
        respond(['success' => true]);
    },
    'POST test_webhook' => function () use ($pdo, $input) {
        // ارسال آزمایشی با داده‌ی نمونه (بدون ذخیره‌ی تنظیمات)
        require_super();
        $hooks = sanitize_webhooks([in_arr($input, 'webhook')]);
        if (!$hooks || $hooks[0]['url'] === '') fail('آدرس وب‌هوک را وارد کنید.');
        $sample = [];
        foreach (in_arr($input, 'sampleData') as $k => $v) { if (is_scalar($v)) $sample[(string)$k] = (string)$v; }
        $results = send_webhooks($hooks, webhook_vars('card_test', 'درخواست آزمایشی', $sample));
        $tenantId = in_str($input, 'tenantId', 64);
        log_webhook_results($pdo, $tenantId !== '' ? $tenantId : '_test', 'test', $results);
        respond(['success' => true, 'result' => $results[0]]);
    },
    'GET get_webhook_logs' => function () use ($pdo) {
        require_super();
        ensure_aux_schema($pdo);
        $stmt = $pdo->prepare("SELECT * FROM webhook_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 50");
        $stmt->execute([is_string($_GET['tenant_id'] ?? null) ? $_GET['tenant_id'] : '']);
        respond($stmt->fetchAll());
    },
    'POST set_tenant_active' => function () use ($pdo, $input) {
        require_super();
        $id = in_str($input, 'id', 64);
        $t = load_tenant($pdo, $id);
        if (!$t) fail('سازمان یافت نشد', 404);
        $t['isActive'] = !empty($input['isActive']);
        if (array_key_exists('activeUntil', $input)) { $u = in_str($input, 'activeUntil', 10); $t['activeUntil'] = valid_date($u) ? $u : ''; }
        store_tenant($pdo, $id, $t);
        audit($pdo, $id, 'tenant_active', $id, ['isActive' => $t['isActive'], 'activeUntil' => $t['activeUntil'] ?? '']);
        respond(['success' => true, 'closedReason' => tenant_closed_reason($t)]);
    },

    // --- کارت‌ها ---
    'POST save_card' => function () use ($pdo, $input) {
        $tenantId = in_str($input, 'tenantId', 64);
        require_tenant($tenantId);
        $tenant = load_tenant($pdo, $tenantId);
        if (!$tenant) fail('سازمان یافت نشد', 404);
        if (!is_super() && ($closed = tenant_closed_reason($tenant)) !== null) fail($closed, 403);
        $requesterName = in_str($input, 'requesterName', 200);
        if ($requesterName === '') fail_field('نام درخواست‌دهنده الزامی است.', '_requester');
        $cardData = validate_card_data($pdo, $tenant, in_arr($input, 'cardData'), null);
        ensure_aux_schema($pdo);
        $id = new_id('card_');
        $cardData['_cid'] = $id; $cardData['_vt'] = bin2hex(random_bytes(8)); $cardData['_issued'] = date('Y-m-d');
        $days = (int)($tenant['validityDays'] ?? 0);
        if ($days > 0) $cardData['_exp'] = date('Y-m-d', strtotime("+{$days} days"));
        $pdo->beginTransaction();
        try {
            assign_serials($pdo, $tenant, $cardData);
            $pdo->prepare("INSERT INTO cards (id, tenant_id, requester_name, card_data, issued_at) VALUES (?, ?, ?, ?, NOW())")->execute([$id, $tenantId, $requesterName, json_enc((object)$cardData)]);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        $_SESSION['own_cards'] = array_slice(array_merge($_SESSION['own_cards'] ?? [], [$id]), -200);
        audit($pdo, $tenantId, 'card_create', $id, ['requester' => $requesterName]);
        respond_and_continue(['success' => true, 'id' => $id, 'accessKey' => card_access_key($id), 'cardData' => (object)$cardData, 'issuedAt' => date('Y-m-d H:i:s')]);
        try { fire_webhooks($pdo, $tenant, $id, $requesterName, $cardData); } catch (Throwable $e) { error_log('[webhook] ' . $e->getMessage()); }
        exit;
    },
    'POST update_card' => function () use ($pdo, $input) {
        $card = load_card($pdo, in_str($input, 'id', 64));
        if (!$card) fail('کارت یافت نشد', 404);
        if (!is_super() && tenant_role($card['tenant_id']) !== 'ADMIN' && !(tenant_role($card['tenant_id']) && own_card($card['id']))) fail('دسترسی غیرمجاز.', 401);
        $tenant = load_tenant($pdo, $card['tenant_id']);
        if (!$tenant) fail('سازمان یافت نشد', 404);
        if (!is_super() && ($closed = tenant_closed_reason($tenant)) !== null) fail($closed, 403);
        $requesterName = in_str($input, 'requesterName', 200);
        if ($requesterName === '') fail_field('نام درخواست‌دهنده الزامی است.', '_requester');
        $existing = json_decode((string)$card['card_data'], true) ?: [];
        $cardData = validate_card_data($pdo, $tenant, in_arr($input, 'cardData'), $existing);
        $pdo->prepare("UPDATE cards SET requester_name = ?, card_data = ? WHERE id = ?")->execute([$requesterName, json_enc((object)$cardData), $card['id']]);
        audit($pdo, $card['tenant_id'], 'card_update', $card['id'], ['requester' => $requesterName]);
        respond(['success' => true, 'cardData' => (object)$cardData]);
    },
    'GET get_cards' => function () use ($pdo) {
        $tenantId = is_string($_GET['tenant_id'] ?? null) ? $_GET['tenant_id'] : '';
        if (!is_super()) require_tenant($tenantId, ['ADMIN']);
        $stmt = $pdo->prepare("SELECT * FROM cards WHERE tenant_id = ? ORDER BY issued_at DESC"); $stmt->execute([$tenantId]);
        $out = []; while ($row = $stmt->fetch()) $out[] = card_view($row, true);
        respond($out);
    },
    'GET get_card_full' => function () use ($pdo) {
        $card = load_card($pdo, is_string($_GET['id'] ?? null) ? $_GET['id'] : '');
        if (!$card) fail('کارت یافت نشد', 404);
        if (!is_super() && tenant_role($card['tenant_id']) !== 'ADMIN' && !(tenant_role($card['tenant_id']) && own_card($card['id']))) fail('دسترسی غیرمجاز.', 401);
        respond(card_view($card, false));
    },
    'POST delete_card' => function () use ($pdo, $input) {
        $card = load_card($pdo, in_str($input, 'id', 64));
        if (!$card) fail('کارت یافت نشد', 404);
        if (!is_super()) require_tenant($card['tenant_id'], ['ADMIN']);
        $pdo->prepare("DELETE FROM cards WHERE id = ?")->execute([$card['id']]);
        audit($pdo, $card['tenant_id'], 'card_delete', $card['id'], ['requester' => $card['requester_name']]);
        respond(['success' => true]);
    },
    'POST delete_cards' => function () use ($pdo, $input) {
        $tenantId = in_str($input, 'tenantId', 64);
        if (!is_super()) require_tenant($tenantId, ['ADMIN']);
        $ids = array_values(array_filter(array_map('strval', in_arr($input, 'ids')), 'valid_id'));
        if (!$ids || count($ids) > 1000) fail('فهرست کارت‌ها نامعتبر است.');
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("DELETE FROM cards WHERE tenant_id = ? AND id IN ($ph)"); $stmt->execute(array_merge([$tenantId], $ids));
        audit($pdo, $tenantId, 'cards_bulk_delete', '', ['count' => $stmt->rowCount()]);
        respond(['success' => true, 'deleted' => $stmt->rowCount()]);
    },
    'POST set_card_status' => function () use ($pdo, $input) {
        $card = load_card($pdo, in_str($input, 'id', 64));
        if (!$card) fail('کارت یافت نشد', 404);
        if (!is_super()) require_tenant($card['tenant_id'], ['ADMIN']);
        $data = json_decode((string)$card['card_data'], true) ?: [];
        if (array_key_exists('revoked', $input)) $data['_rev'] = !empty($input['revoked']);
        if (array_key_exists('expiresAt', $input)) {
            $exp = in_str($input, 'expiresAt', 10);
            if ($exp !== '' && !valid_date($exp)) fail('تاریخ انقضا نامعتبر است.');
            if ($exp === '') unset($data['_exp']); else $data['_exp'] = $exp;
        }
        if (empty($data['_vt'])) { $data['_vt'] = bin2hex(random_bytes(8)); $data['_cid'] = $card['id']; }
        $pdo->prepare("UPDATE cards SET card_data = ? WHERE id = ?")->execute([json_enc((object)$data), $card['id']]);
        audit($pdo, $card['tenant_id'], 'card_status', $card['id'], ['revoked' => !empty($data['_rev']), 'expiresAt' => $data['_exp'] ?? '']);
        respond(['success' => true, 'status' => card_status($data), 'cardData' => (object)$data]);
    },
    'POST get_my_cards' => function () use ($pdo, $input) {
        // تاریخچه‌ی کارت‌های همین دستگاه: هر کارت با کلید دسترسی امضاشده‌ای که هنگام صدور به همان کاربر داده شده
        $tenantId = in_str($input, 'tenantId', 64);
        require_tenant($tenantId);
        $ids = [];
        foreach (array_slice(in_arr($input, 'cards'), 0, 200) as $c) {
            if (!is_array($c)) continue;
            $cid = (string)($c['id'] ?? ''); $k = (string)($c['key'] ?? '');
            if (valid_id($cid) && hash_equals(card_access_key($cid), $k)) $ids[] = $cid;
        }
        if (!$ids) respond([]);
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $pdo->prepare("SELECT * FROM cards WHERE tenant_id = ? AND id IN ($ph) ORDER BY issued_at DESC"); $stmt->execute(array_merge([$tenantId], $ids));
        $out = []; while ($row = $stmt->fetch()) $out[] = card_view($row, true);
        $_SESSION['own_cards'] = array_slice(array_values(array_unique(array_merge($_SESSION['own_cards'] ?? [], array_column($out, 'id')))), -200);
        respond($out);
    },
    'GET verify_card' => function () use ($pdo) {
        // استعلام عمومی اعتبار کارت با کد QR (شناسه + توکن تصادفی)؛ فقط اطلاعات حداقلی نمایش داده می‌شود
        $code = is_string($_GET['code'] ?? null) ? $_GET['code'] : '';
        [$cid, $vt] = array_pad(explode('.', $code, 2), 2, '');
        $card = load_card($pdo, $cid);
        $data = $card ? (json_decode((string)$card['card_data'], true) ?: []) : [];
        if (!$card || empty($data['_vt']) || !hash_equals((string)$data['_vt'], $vt)) fail('کارتی با این کد یافت نشد.', 404);
        $t = load_tenant($pdo, $card['tenant_id']) ?? [];
        $nameIds = (array)($t['dashboardNameFormat'] ?? []);
        if (!$nameIds) { foreach ($t['fields'] ?? [] as $f) { if (($f['type'] ?? '') === 'text') { $nameIds = [$f['id']]; break; } } }
        $owner = trim(implode(' ', array_map(fn($fid) => is_scalar($data[$fid] ?? null) ? (string)$data[$fid] : '', $nameIds)));
        respond(['status' => card_status($data), 'theme' => sanitize_theme($t['theme'] ?? null), 'orgName' => $t['orgName'] ?? '', 'logoUrl' => $t['logoUrl'] ?? '', 'langCode' => $t['langCode'] ?? 'fa', 'ownerName' => $owner, 'issuedAt' => $data['_issued'] ?? substr((string)$card['issued_at'], 0, 10), 'expiresAt' => $data['_exp'] ?? null]);
    },
    'GET get_audit_log' => function () use ($pdo) {
        $tenantId = is_string($_GET['tenant_id'] ?? null) ? $_GET['tenant_id'] : '';
        if (!is_super()) require_tenant($tenantId, ['ADMIN']);
        ensure_aux_schema($pdo);
        $limit = max(1, min(500, (int)($_GET['limit'] ?? 200)));
        if ($tenantId === '' && is_super()) $stmt = $pdo->query("SELECT * FROM audit_log ORDER BY id DESC LIMIT $limit");
        else { $stmt = $pdo->prepare("SELECT * FROM audit_log WHERE tenant_id = ? ORDER BY id DESC LIMIT $limit"); $stmt->execute([$tenantId]); }
        $out = []; while ($r = $stmt->fetch()) { $r['details'] = json_decode((string)$r['details'], true); $out[] = $r; }
        respond($out);
    },

    // --- لیست‌های آماده ---
    'GET get_presets' => function () use ($pdo) {
        require_super();
        $out = [];
        foreach ($pdo->query("SELECT * FROM card_presets") as $row) {
            $out[] = ['id' => $row['id'], 'preset_key' => $row['preset_key'], 'title' => $row['title'], 'options' => json_decode((string)$row['options'], true) ?: [], 'cols' => json_decode((string)($row['cols'] ?? ''), true) ?: []];
        }
        respond($out);
    },
    'POST save_preset' => function () use ($pdo, $input) {
        require_super();
        $key = in_str($input, 'preset_key', 100); $title = in_str($input, 'title', 200);
        if ($key === '' || $title === '') fail('شناسه و عنوان الزامی است.');
        $opts = json_enc(array_values(in_arr($input, 'options')));
        $cols = json_enc(array_values(array_filter(in_arr($input, 'cols'), 'is_string')));
        $sql = "INSERT INTO card_presets (preset_key, title, options, cols) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title), options = VALUES(options), cols = VALUES(cols)";
        try { $pdo->prepare($sql)->execute([$key, $title, $opts, $cols]); }
        catch (PDOException $e) {
            if (!str_contains($e->getMessage(), 'Unknown column')) throw $e;
            // ستون cols در نسخه‌های قدیمی جدول وجود ندارد
            $pdo->exec("ALTER TABLE card_presets ADD COLUMN cols LONGTEXT NULL");
            $pdo->prepare($sql)->execute([$key, $title, $opts, $cols]);
        }
        respond(['success' => true]);
    },
    'POST delete_preset' => function () use ($pdo, $input) {
        require_super();
        $pdo->prepare("DELETE FROM card_presets WHERE id = ?")->execute([(int)($input['id'] ?? 0)]);
        respond(['success' => true]);
    },

    // --- فونت‌ها ---
    'GET get_fonts' => function () use ($pdo) {
        respond($pdo->query("SELECT id, font_key, font_name, font_url FROM global_fonts ORDER BY font_name ASC")->fetchAll());
    },
    'POST save_font' => function () use ($pdo, $input) {
        require_super();
        $key = in_str($input, 'font_key', 64); $name = in_str($input, 'font_name', 100); $url = in_str($input, 'font_url', 1000);
        if (!preg_match('/^[a-z0-9_\-]+$/', $key)) fail('شناسه فونت فقط می‌تواند شامل حروف کوچک انگلیسی، عدد، - و _ باشد.');
        if (!preg_match('/^[\p{L}\p{N} _\-]+$/u', $name)) fail('نام فونت نامعتبر است.');
        if (!valid_asset_url($url)) fail('آدرس فایل فونت نامعتبر است.');
        try {
            if (!empty($input['id'])) $pdo->prepare("UPDATE global_fonts SET font_key = ?, font_name = ?, font_url = ? WHERE id = ?")->execute([$key, $name, $url, (int)$input['id']]);
            else $pdo->prepare("INSERT INTO global_fonts (font_key, font_name, font_url) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE font_name = VALUES(font_name), font_url = VALUES(font_url)")->execute([$key, $name, $url]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail('این شناسه فونت قبلاً استفاده شده است.');
            throw $e;
        }
        respond(['success' => true]);
    },
    'POST delete_font' => function () use ($pdo, $input) {
        require_super();
        $pdo->prepare("DELETE FROM global_fonts WHERE id = ?")->execute([(int)($input['id'] ?? 0)]);
        respond(['success' => true]);
    },

    // --- دیکشنری ---
    'GET get_dictionaries' => function () use ($pdo) {
        $out = [];
        foreach ($pdo->query("SELECT id, lang_code, lang_name, translations FROM dictionaries ORDER BY id ASC") as $row) { $row['translations'] = json_decode((string)$row['translations'], true); $out[] = $row; }
        respond($out);
    },

    // --- بوم‌های آماده ---
    'GET get_templates' => function () use ($pdo) {
        require_super();
        $out = [];
        foreach ($pdo->query("SELECT * FROM card_templates ORDER BY id DESC") as $row) {
            $out[] = ['id' => $row['id'], 'title' => $row['title'], 'front_bg' => $row['front_bg'], 'back_bg' => $row['back_bg'], 'fields_data' => $row['fields_data'],
                // تنظیمات قالب خروجی (برای بوم‌های قدیمی null است)
                'settings' => json_decode((string)($row['settings'] ?? ''), true) ?: null];
        }
        respond($out);
    },
    'POST save_template' => function () use ($pdo, $input) {
        require_super();
        $title = in_str($input, 'title', 200);
        if ($title === '') fail('عنوان بوم الزامی است.');
        $settings = template_settings(in_arr($input, 'settings'));
        $sql = "INSERT INTO card_templates (title, front_bg, back_bg, fields_data, settings) VALUES (?, ?, ?, ?, ?)";
        $params = [$title, in_raw($input, 'front_bg'), in_raw($input, 'back_bg'), json_enc(array_values(in_arr($input, 'fields_data'))), $settings];
        try { $pdo->prepare($sql)->execute($params); }
        catch (PDOException $e) {
            if (!str_contains($e->getMessage(), 'Unknown column')) throw $e;
            // ستون settings در نسخه‌های قدیمی جدول وجود ندارد
            $pdo->exec("ALTER TABLE card_templates ADD COLUMN settings LONGTEXT NULL");
            $pdo->prepare($sql)->execute($params);
        }
        respond(['success' => true]);
    },
    'POST update_template' => function () use ($pdo, $input) {
        require_super();
        $id = (int)($input['id'] ?? 0);
        $stmt = $pdo->prepare("SELECT id FROM card_templates WHERE id = ?"); $stmt->execute([$id]);
        if (!$stmt->fetch()) fail('بوم یافت نشد', 404);
        if (array_key_exists('title', $input)) {
            $title = in_str($input, 'title', 200);
            if ($title === '') fail('عنوان بوم الزامی است.');
            $pdo->prepare("UPDATE card_templates SET title = ? WHERE id = ?")->execute([$title, $id]);
        }
        // جایگزینی محتوا با طرح فعلی
        if (array_key_exists('fields_data', $input)) {
            $params = [in_raw($input, 'front_bg'), in_raw($input, 'back_bg'), json_enc(array_values(in_arr($input, 'fields_data'))), template_settings(in_arr($input, 'settings')), $id];
            $sql = "UPDATE card_templates SET front_bg = ?, back_bg = ?, fields_data = ?, settings = ? WHERE id = ?";
            try { $pdo->prepare($sql)->execute($params); }
            catch (PDOException $e) {
                if (!str_contains($e->getMessage(), 'Unknown column')) throw $e;
                $pdo->exec("ALTER TABLE card_templates ADD COLUMN settings LONGTEXT NULL");
                $pdo->prepare($sql)->execute($params);
            }
        }
        respond(['success' => true]);
    },
    'POST delete_template' => function () use ($pdo, $input) {
        require_super();
        $pdo->prepare("DELETE FROM card_templates WHERE id = ?")->execute([(int)($input['id'] ?? 0)]);
        respond(['success' => true]);
    },

    // --- قوانین اعتبارسنجی ---
    'GET get_validations' => function () use ($pdo) {
        respond($pdo->query("SELECT id, title, pattern, error_msg FROM card_validations ORDER BY id DESC")->fetchAll());
    },
    'POST save_validation' => function () use ($pdo, $input) {
        require_super();
        $title = in_str($input, 'title', 200); $pat = in_str($input, 'pattern', 1000); $msg = in_str($input, 'error_msg', 500);
        if ($title === '' || $pat === '') fail('عنوان و الگو الزامی است.');
        if (@preg_match(js_regex_to_pcre($pat), '') === false) fail('الگوی Regex نامعتبر است.');
        if (!empty($input['id'])) $pdo->prepare("UPDATE card_validations SET title = ?, pattern = ?, error_msg = ? WHERE id = ?")->execute([$title, $pat, $msg, (int)$input['id']]);
        else $pdo->prepare("INSERT INTO card_validations (title, pattern, error_msg) VALUES (?, ?, ?)")->execute([$title, $pat, $msg]);
        respond(['success' => true]);
    },
    'POST delete_validation' => function () use ($pdo, $input) {
        require_super();
        $pdo->prepare("DELETE FROM card_validations WHERE id = ?")->execute([(int)($input['id'] ?? 0)]);
        respond(['success' => true]);
    },
];

$handler = $routes["$method $action"] ?? null;
if (!$handler) fail('درخواست معتبر نیست', 404);
$handler();
