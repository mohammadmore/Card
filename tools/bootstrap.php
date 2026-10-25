<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

function tools_config(): array {
    $root = dirname(__DIR__);
    foreach ([dirname($root, 2) . '/superadmin_config.php', dirname($root) . '/superadmin_config.php', $root . '/config.php'] as $f) {
        if (is_file($f)) { $c = require $f; if (is_array($c)) return $c; }
    }
    fwrite(STDERR, "فایل پیکربندی پیدا نشد. config.sample.php را ببینید.\n"); exit(1);
}

function tools_pdo(): PDO {
    $db = tools_config()['db'];
    return new PDO("mysql:host={$db['host']};dbname={$db['name']};charset=utf8mb4", $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}
