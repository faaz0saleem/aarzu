<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/php/bootstrap.php';
require dirname(__DIR__).'/php/notifications.php';
try {
    $sent=az_mail(array_map('trim',explode(',',az_env('ORDER_ALERT_EMAIL'))),'Aarzu notification test',az_mail_shell('Notification test','<p>Your Aarzu email notifications are working.</p>'));
    echo $sent ? "Email sent.\n" : "Email is not configured.\n";
    echo az_telegram('Aarzu notification test: Telegram alerts are working.') ? "Telegram sent.\n" : "Telegram is not configured.\n";
} catch (Throwable $e) { fwrite(STDERR,$e->getMessage()."\n"); exit(1); }
