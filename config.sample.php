<?php
// ==========================================
// تنظیمات پلتفرم
// ==========================================
// این فایل را با نام superadmin_config.php «بیرون از public_html» کپی کنید
// (مثلاً /home/USER/superadmin_config.php). api.php ابتدا همان‌جا را می‌خواند
// و فقط اگر پیدا نشد، به config.php کنار خودش برمی‌گردد (که با .htaccess مسدود است).

return [
    'db' => [
        'host'    => 'localhost',
        'name'    => 'DB_NAME',
        'user'    => 'DB_USER',
        'pass'    => 'CHANGE_ME',   // پسورد قبلی لو رفته است؛ حتماً پسورد جدید بگذارید
    ],

    // هش رمز سوپرادمین. برای ساخت:  php tools/hash_password.php 'رمز جدید'
    'superadmin_password_hash' => '',

    // دامنه‌های مجاز برای اجرای پلتفرم (قفل دامنه سمت سرور). خالی = بدون محدودیت
    'allowed_hosts' => ['asvashop.com', 'www.asvashop.com', 'localhost', '127.0.0.1'],

    // مسیر فایل لاگ خطاها (ترجیحاً بیرون از public_html)
    'error_log' => __DIR__ . '/superadmin_error.log',

    // محدودیت‌های آپلود (بایت)
    'max_image_bytes' => 5 * 1024 * 1024,
    'max_font_bytes'  => 10 * 1024 * 1024,

    // تعداد تلاش ناموفق ورود قبل از قفل موقت، و مدت قفل (ثانیه)
    'login_max_attempts' => 5,
    'login_lock_seconds' => 900,

    // اجازه ارسال وب‌هوک به آدرس‌های http (غیر https)
    'webhook_allow_http' => false,
];
