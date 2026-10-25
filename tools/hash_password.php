<?php
// ساخت هش برای رمز سوپرادمین:  php tools/hash_password.php 'رمز جدید'
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$pass = $argv[1] ?? '';
if (mb_strlen($pass) < 8) { fwrite(STDERR, "رمز را به‌عنوان آرگومان بدهید (حداقل ۸ کاراکتر).\n"); exit(1); }
echo password_hash($pass, PASSWORD_DEFAULT), "\n";
echo "این مقدار را در superadmin_password_hash فایل پیکربندی قرار دهید.\n";
