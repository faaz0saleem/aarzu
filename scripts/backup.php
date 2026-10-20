<?php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__).'/php/bootstrap.php';
az_open();
if (is_file(AZ_RUNTIME.'/.last-backup')) unlink(AZ_RUNTIME.'/.last-backup');
az_backup(); az_release();
echo "Aarzu backup complete.\n";
