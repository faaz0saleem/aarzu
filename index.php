<?php
// Hostinger/PHP entry point. The original frontend and Node entry point are unchanged.
declare(strict_types=1);
require __DIR__ . '/php/bootstrap.php';
try {
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (str_contains($path, "\0") || preg_match('~(?:^|/)\.(?:\.?/|[^/])~', $path)) az_text(404, 'Not found');
    if (str_starts_with($path, '/api/')) {
        az_open();
        require __DIR__ . '/php/api.php';
        az_api($path, $_SERVER['REQUEST_METHOD'] ?? 'GET', az_body());
        az_fail(404, 'Not found');
    }
    if ($path === '/img') { require __DIR__ . '/php/images.php'; az_image((string)($_GET['u'] ?? '')); }
    if ($path === '/index.html') { require __DIR__ . '/php/pages.php'; az_page($path); }
    $public = realpath(__DIR__ . '/public');
    $file = realpath($public . $path);
    if ($file && str_starts_with($file, $public . DIRECTORY_SEPARATOR) && is_file($file)) {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $types = ['html'=>'text/html; charset=utf-8','js'=>'text/javascript; charset=utf-8','css'=>'text/css; charset=utf-8','json'=>'application/json; charset=utf-8','webmanifest'=>'application/manifest+json','svg'=>'image/svg+xml','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp','avif'=>'image/avif','woff2'=>'font/woff2','ico'=>'image/x-icon'];
        if (!isset($types[$ext])) az_text(404, 'Not found');
        header('Content-Type: ' . $types[$ext]);
        header('Cache-Control: ' . (in_array($ext, ['woff2','svg','png','jpg','jpeg','webp','avif']) ? 'public, max-age=604800' : 'no-cache'));
        header('X-Content-Type-Options: nosniff');
        if ($ext === 'json') header('X-Robots-Tag: noindex');
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') readfile($file);
        exit;
    }
    require __DIR__ . '/php/pages.php';
    az_page($path);
} catch (Throwable $e) {
    error_log('[aarzu] ' . $e->getMessage());
    $GLOBALS['az_dirty'] = [];
    az_fail(500, 'The store could not complete this request. Please try again.');
}
