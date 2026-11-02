<?php
// ساخت هش برای رمز سوپرادمین:  php tools/hash_password.php 'رمز جدید'
// فقط از خط فرمان یا Cron (حتی با php-cgi هاست)؛ از مرورگر قابل اجرا نیست
if (PHP_SAPI !== 'cli' && (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST']))) { http_response_code(404); exit; }
if (!defined('STDERR')) define('STDERR', fopen('php://stderr', 'w'));
if (!defined('STDOUT')) define('STDOUT', fopen('php://stdout', 'w'));
$pass = $argv[1] ?? '';
if (mb_strlen($pass) < 8) { fwrite(STDERR, "رمز را به‌عنوان آرگومان بدهید (حداقل ۸ کاراکتر).\n"); exit(1); }
echo password_hash($pass, PASSWORD_DEFAULT), "\n";
echo "این مقدار را در superadmin_password_hash فایل پیکربندی قرار دهید.\n";
