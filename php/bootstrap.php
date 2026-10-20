<?php
declare(strict_types=1);
date_default_timezone_set('UTC');
define('AZ_ROOT', dirname(__DIR__));
define('AZ_JSON', JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
foreach (is_file(AZ_ROOT.'/.env') ? file(AZ_ROOT.'/.env', FILE_IGNORE_NEW_LINES) : [] as $line) {
    if (!preg_match('/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/', $line, $m)) continue;
    $value = $m[2];
    if (strlen($value) >= 2 && (($value[0] === '"' && substr($value,-1) === '"') || ($value[0] === "'" && substr($value,-1) === "'"))) $value = substr($value,1,-1);
    else $value = preg_replace('/\s+#.*$/', '', $value);
    if (getenv($m[1]) === false) putenv($m[1].'='.$value);
}
function az_env(string $key, string $default=''): string { $v=getenv($key); return $v===false ? $default : $v; }
define('AZ_RUNTIME', az_env('RUNTIME_DIR', AZ_ROOT.'/data/runtime'));
$GLOBALS['az_cache']=[]; $GLOBALS['az_dirty']=[]; $GLOBALS['az_after']=[];
function az_now(): string { return gmdate('Y-m-d\TH:i:s.000\Z'); }
function az_time(?string $v): int { return $v ? (strtotime($v) ?: 0) : 0; }
function az_clean($v, int $n=300): string { $s=trim(str_replace(['<','>'],'',is_scalar($v)?(string)$v:'')); return function_exists('mb_substr')?mb_substr($s,0,$n):implode('',array_slice(preg_split('//u',$s,-1,PREG_SPLIT_NO_EMPTY)?:[],0,$n)); }
function az_phone($v): ?string { $s=preg_replace('/\D/','',is_scalar($v)?(string)$v:''); return preg_match('/^03\d{9}$/',$s)?'92'.substr($s,1):(preg_match('/^923\d{9}$/',$s)?$s:null); }
function az_email($v): bool { return is_string($v) && (bool)preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/',$v); }
function az_h($v): string { return htmlspecialchars((string)($v??''),ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8'); }
function az_rs($v): string { return 'Rs '.number_format(round((float)$v),0,'.',','); }
function az_find(array $list, callable $fn) { foreach($list as $x) if($fn($x)) return $x; return null; }
function az_index(array $list, callable $fn): ?int { foreach($list as $i=>$x) if($fn($x)) return $i; return null; }
function az_read(string $file, $default=[]) { if(!is_file($file)) return $default; return json_decode(file_get_contents($file),true,512,JSON_THROW_ON_ERROR); }
function az_atomic(string $file, string $data): void {
    $tmp=$file.'.'.bin2hex(random_bytes(6)).'.tmp';
    if(file_put_contents($tmp,$data)===false || !rename($tmp,$file)) throw new RuntimeException('Cannot save store data');
    @chmod($file,0600);
}
function az_open(): void {
    if(!is_dir(AZ_RUNTIME) && !mkdir(AZ_RUNTIME,0700,true) && !is_dir(AZ_RUNTIME)) throw new RuntimeException('Runtime directory is not writable');
    $lock=fopen(AZ_RUNTIME.'/.lock','c');
    if(!$lock || !flock($lock,LOCK_EX)) throw new RuntimeException('Cannot lock store data');
    $GLOBALS['az_lock']=$lock;
    $GLOBALS['az_cache']=[]; $GLOBALS['az_dirty']=[];
    // Complete an interrupted multi-file commit before accepting another request.
    $journal=AZ_RUNTIME.'/.transaction.json';
    if(is_file($journal)) { foreach(az_read($journal) as $name=>$value) az_atomic(AZ_RUNTIME.'/'.$name.'.json',json_encode($value,AZ_JSON)); unlink($journal); }
}
function az_db(string $name, $default=[]) { if(!array_key_exists($name,$GLOBALS['az_cache'])) $GLOBALS['az_cache'][$name]=az_read(AZ_RUNTIME.'/'.$name.'.json',$default); return $GLOBALS['az_cache'][$name]; }
function az_set(string $name, $value): void { $GLOBALS['az_cache'][$name]=$value; $GLOBALS['az_dirty'][$name]=$value; }
function az_push(string $name, array $value): int { $list=az_db($name); $list[]=$value; az_set($name,$list); return count($list); }
function az_flush(): void {
    if(!$GLOBALS['az_dirty']) return;
    $journal=AZ_RUNTIME.'/.transaction.json';
    az_atomic($journal,json_encode($GLOBALS['az_dirty'],AZ_JSON));
    foreach($GLOBALS['az_dirty'] as $name=>$value) az_atomic(AZ_RUNTIME.'/'.$name.'.json',json_encode($value,AZ_JSON));
    unlink($journal); $GLOBALS['az_dirty']=[];
}
function az_backup(): void {
    $stamp=AZ_RUNTIME.'/.last-backup';
    if(is_file($stamp) && time()-filemtime($stamp)<21600) return;
    $dest=az_env('BACKUP_DIR',dirname(AZ_RUNTIME).'/backups'); $dir=$dest.'/'.gmdate('Y-m-d');
    if(!is_dir($dir) && !mkdir($dir,0700,true) && !is_dir($dir)) return;
    foreach(glob(AZ_RUNTIME.'/*.json')?:[] as $f) if(!str_starts_with(basename($f),'.')) copy($f,$dir.'/'.basename($f));
    $days=array_filter(glob($dest.'/*',GLOB_ONLYDIR)?:[],fn($d)=>preg_match('/^\d{4}-\d{2}-\d{2}$/',basename($d))); sort($days);
    foreach(array_slice($days,0,max(0,count($days)-max(1,(int)az_env('BACKUP_KEEP','30')))) as $d) { foreach(glob($d.'/*.json')?:[] as $f) unlink($f); @rmdir($d); }
    touch($stamp);
}
function az_release(): void { if(isset($GLOBALS['az_lock'])) { flock($GLOBALS['az_lock'],LOCK_UN); fclose($GLOBALS['az_lock']); unset($GLOBALS['az_lock']); } }
function az_json(int $status, $data): never {
    az_flush();
    if($status<400 && isset($GLOBALS['az_lock'])) { try { az_backup(); } catch(Throwable $e) { error_log('[backup] '.$e->getMessage()); } }
    az_release();
    http_response_code($status); header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: '.(parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH)==='/api/catalog'?'no-cache':'no-store')); header('X-Content-Type-Options: nosniff');
    echo json_encode($data,AZ_JSON);
    if(function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    foreach($GLOBALS['az_after'] as $fn) { try { $fn(); } catch(Throwable $e) { error_log('[notify] '.$e->getMessage()); } }
    exit;
}
function az_fail(int $status,string $message,array $errors=[]): never { az_json($status,$errors?['error'=>$message,'errors'=>$errors]:['error'=>$message]); }
function az_text(int $status,string $text,string $type='text/plain; charset=utf-8'): never { az_flush(); az_release(); http_response_code($status); header('Content-Type: '.$type); header('X-Content-Type-Options: nosniff'); echo $text; exit; }
function az_body(): array {
    if(!in_array($_SERVER['REQUEST_METHOD']??'GET',['POST','PUT','PATCH','DELETE'])) return [];
    if(isset($_SERVER['HTTP_ORIGIN']) && strtolower(parse_url($_SERVER['HTTP_ORIGIN'],PHP_URL_HOST)??'')!==strtolower(explode(':',$_SERVER['HTTP_HOST']??'')[0])) az_fail(403,'Please submit this request from the store.');
    $raw=file_get_contents('php://input',false,null,0,100001);
    if(strlen($raw)>100000) az_fail(413,'Payload too large');
    try { $b=$raw===''?[]:json_decode($raw,true,64,JSON_THROW_ON_ERROR); } catch(Throwable $e) { az_fail(400,'Invalid JSON'); }
    if(!is_array($b)) az_fail(400,'Invalid JSON'); return $b;
}
function az_ip(): string { return $_SERVER['REMOTE_ADDR']??'?'; }
function az_limited(string $key,int $max,int $seconds): bool {
    $all=az_db('rate-limits'); $now=time();
    foreach($all as $k=>$v) { $times=array_values(array_filter($v['times']??[],fn($t)=>$t>$now-($v['window']??86400))); if(!$times) unset($all[$k]); else $all[$k]['times']=$times; }
    $list=array_values(array_filter($all[$key]['times']??[],fn($t)=>$t>$now-$seconds)); $list[]=$now; $all[$key]=['window'=>$seconds,'times'=>$list];
    if(count($all)>5000) $all=array_slice($all,-5000,null,true);
    az_set('rate-limits',$all); return count($list)>$max;
}
function az_admin(): void {
    $pw=az_env('ADMIN_PASSWORD');
    if(strlen($pw)<10 || $pw==='aarzu-admin') az_fail(503,'Set a strong ADMIN_PASSWORD (10+ characters) in .env before opening the admin dashboard.');
    $given=preg_replace('/^Bearer\s+/i','',$_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
    if(!hash_equals($pw,$given)) az_fail(401,'Wrong password');
}
function az_store(): array { return az_read(AZ_ROOT.'/data/store.json'); }
function az_origin(): string { $configured=rtrim(az_env('SITE_URL'),'/'); if($configured) return $configured; $host=$_SERVER['HTTP_HOST']??'localhost'; if(!preg_match('/^[a-zA-Z0-9.\-:\[\]]+$/',$host)) $host='localhost'; return ((!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')?'https':'http').'://'.$host; }
function az_catalog(): array {
    $files=array_merge(['originals.json','catalog.brands.json'],array_map('basename',array_filter(glob(AZ_ROOT.'/data/catalog.*.json')?:[],fn($f)=>basename($f)!=='catalog.brands.json')));
    $all=[]; $inventory=az_db('inventory');
    foreach($files as $f) foreach(az_read(AZ_ROOT.'/data/'.$f) as $p) {
        // Men's clothing is paused; excluded collections cannot be ordered either.
        if(($p['gender']??'')==='men' || preg_match('/sanam[\\s_-]*saeed/i',json_encode($p,AZ_JSON))) continue;
        if(($p['collection']??'')==='originals') {
            $photos=[];
            foreach(glob(AZ_ROOT.'/public/images/originals/photos/*')?:[] as $photo) if(preg_match('/^'.preg_quote($p['slug'],'/').'(-(\d+))?\.(jpe?g|png|webp|avif)$/i',basename($photo),$m)) $photos[(int)($m[2]??1)]='/images/originals/photos/'.basename($photo);
            ksort($photos); $p['images']=array_values($photos);
        }
        if(empty($p['images'])&&!az_env('SHOW_UNPHOTOGRAPHED')) continue;
        $p['stock']=array_replace($p['stock']??[],$inventory[$p['id']]??[]); $all[$p['id']]=$p;
    }
    return $all;
}
function az_public_catalog(): array {
    $reviews=az_db('reviews'); $sold=[]; $ratings=[];
    foreach(az_db('orders') as $o) if($o['status']!=='cancelled') foreach($o['items'] as $i) $sold[$i['id']]=($sold[$i['id']]??0)+$i['qty'];
    foreach($reviews as $r) { $ratings[$r['productId']]['sum']=($ratings[$r['productId']]['sum']??0)+$r['rating']; $ratings[$r['productId']]['count']=($ratings[$r['productId']]['count']??0)+1; }
    $products=[]; foreach(az_catalog() as $p) { unset($p['source']); $r=$ratings[$p['id']]??null; $p['sold']=$sold[$p['id']]??0; $p['rating']=$r?['avg'=>round($r['sum']/$r['count'],1),'count'=>$r['count']]:null; $products[]=$p; }
    $s=az_store(); unset($s['coupons']); $s['wheel']=array_map(fn($w)=>array_intersect_key($w,array_flip(['label','color','weight'])),$s['wheel']);
    return ['products'=>$products,'media'=>az_read(AZ_ROOT.'/data/media.json'),'store'=>$s];
}
