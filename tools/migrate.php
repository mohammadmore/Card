<?php
// به‌روزرسانی نصب موجود:  php tools/migrate.php
// - ساخت جداول جدید (login_attempts, card_counters, audit_log, webhook_logs)، ستون cols در card_presets و ستون settings در card_templates
// - تبدیل رمزهای متن‌ساده‌ی سازمان‌ها به هش
// - تنظیم شمارنده‌ی سریال خودکار بر اساس بیشترین مقدار ثبت‌شده
// - گزارش فایل‌های مشکوک در پوشه uploads
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/bootstrap.php';
$pdo = tools_pdo();

foreach (array_filter(array_map('trim', explode(';', file_get_contents(__DIR__ . '/schema.sql')))) as $sql) {
    $sql = trim(preg_replace('/^--.*$/m', '', $sql));
    if ($sql !== '') $pdo->exec($sql);
}
$hasCols = $pdo->query("SHOW COLUMNS FROM card_presets LIKE 'cols'")->fetch();
if (!$hasCols) { $pdo->exec("ALTER TABLE card_presets ADD COLUMN cols LONGTEXT NULL"); echo "ستون cols به card_presets اضافه شد.\n"; }
if (!$pdo->query("SHOW COLUMNS FROM tenants LIKE 'slug'")->fetch()) { $pdo->exec("ALTER TABLE tenants ADD COLUMN slug VARCHAR(64) NULL, ADD UNIQUE KEY uq_tenants_slug (slug)"); echo "ستون slug به tenants اضافه شد.\n"; }
$hasSettings = $pdo->query("SHOW COLUMNS FROM card_templates LIKE 'settings'")->fetch();
if (!$hasSettings) { $pdo->exec("ALTER TABLE card_templates ADD COLUMN settings LONGTEXT NULL"); echo "ستون settings به card_templates اضافه شد.\n"; }
echo "جداول بررسی شدند.\n";

$migrated = 0;
foreach ($pdo->query("SELECT id, data FROM tenants")->fetchAll() as $row) {
    $t = json_decode($row['data'], true);
    if (!is_array($t)) continue;
    $changed = false;
    foreach (['adminPass' => 'adminPassHash', 'publicPass' => 'publicPassHash'] as $plain => $hash) {
        if (array_key_exists($plain, $t)) {
            if (empty($t[$hash]) && (string)$t[$plain] !== '') $t[$hash] = password_hash((string)$t[$plain], PASSWORD_DEFAULT);
            unset($t[$plain]); $changed = true;
        }
    }
    if ($changed) { $pdo->prepare("UPDATE tenants SET data = ? WHERE id = ?")->execute([json_encode($t, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $row['id']]); $migrated++; }

    // شمارنده سریال: از بزرگ‌ترین عدد موجود در کارت‌های قبلی ادامه می‌دهد
    foreach ($t['fields'] ?? [] as $f) {
        if (empty($f['autoIncrement'])) continue;
        $prefix = (string)($f['autoIncPrefix'] ?? ''); $max = (int)($f['autoIncStart'] ?? 1) - 1;
        $stmt = $pdo->prepare("SELECT card_data FROM cards WHERE tenant_id = ?"); $stmt->execute([$row['id']]);
        while ($c = $stmt->fetch()) {
            $v = (string)((json_decode($c['card_data'], true) ?: [])[$f['id']] ?? '');
            if ($prefix !== '' && str_starts_with($v, $prefix)) $v = substr($v, strlen($prefix));
            if (ctype_digit($v)) $max = max($max, (int)$v);
        }
        $pdo->prepare("INSERT INTO card_counters (tenant_id, field_id, next_val) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE next_val = GREATEST(next_val, VALUES(next_val))")->execute([$row['id'], (string)$f['id'], $max + 1]);
    }
}
echo "رمزهای {$migrated} سازمان به هش تبدیل شد.\n";

$suspicious = [];
$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(dirname(__DIR__) . '/uploads', FilesystemIterator::SKIP_DOTS));
foreach ($it as $file) {
    if ($file->getFilename() === '.htaccess') continue;
    if (!preg_match('/\.(jpe?g|png|webp|gif|ttf|otf|woff2?)$/i', $file->getFilename())) $suspicious[] = $file->getPathname();
}
if ($suspicious) { echo "⚠️ فایل‌های مشکوک در uploads (احتمالاً آپلود مخرب؛ بررسی و حذف کنید):\n  " . implode("\n  ", $suspicious) . "\n"; }
else echo "پوشه uploads فایل مشکوکی ندارد.\n";
echo "پایان.\n";
