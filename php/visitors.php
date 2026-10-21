<?php
declare(strict_types=1);
// Visitor telemetry has its own files/lock. It must never take the order database lock.
const AZ_VISITOR_WINDOW = 120;
const AZ_VISITOR_LOG_LIMIT = 2097152;
function az_visitor_dir(): string {
    $dir=AZ_RUNTIME.'/visitors';
    if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir)) throw new RuntimeException('Visitor storage unavailable');
    return $dir;
}
function az_visitor_recover(string $dir): void {
    $file=$dir.'/.pending.json'; if(!is_file($file)) return;
    foreach(az_read($file) as $name=>$value) {
        if(!preg_match('/^(?:stats|seen-[a-f0-9]{2})\.json$/',$name)) throw new RuntimeException('Invalid visitor journal');
        az_atomic($dir.'/'.$name,json_encode($value,AZ_JSON));
    }
    if(!unlink($file)) throw new RuntimeException('Cannot finish visitor save');
}
function az_visitor_register(string $dir,string $hash,int $now): bool {
    $lock=@fopen($dir.'/.lock','c');
    if(!$lock) return false;
    if(!flock($lock,LOCK_EX|LOCK_NB)) { fclose($lock); return false; }
    try {
        az_visitor_recover($dir);
        $name='seen-'.substr($hash,0,2).'.json'; $seen=az_read($dir.'/'.$name);
        if(isset($seen[$hash])) return true;
        $stats=az_read($dir.'/stats.json',['totalVisitors'=>0,'startedAt'=>gmdate('Y-m-d\TH:i:s.000\Z',$now)]);
        $seen[$hash]=true; $stats['totalVisitors']++; $stats['updatedAt']=gmdate('Y-m-d\TH:i:s.000\Z',$now);
        $changes=[$name=>$seen,'stats.json'=>$stats];
        az_atomic($dir.'/.pending.json',json_encode($changes,AZ_JSON));
        foreach($changes as $file=>$data) az_atomic($dir.'/'.$file,json_encode($data,AZ_JSON));
        unlink($dir.'/.pending.json'); return true;
    } finally { flock($lock,LOCK_UN); fclose($lock); }
}
function az_visitor_touch(array $body,?int $at=null): bool {
    $sid=$body['sid']??null;
    if(!is_string($sid)||!preg_match('/^[a-zA-Z0-9_-]{12,80}$/',$sid)) return false;
    if(preg_match('/bot|crawler|spider|headless|lighthouse|facebookexternalhit|preview/i',$_SERVER['HTTP_USER_AGENT']??'')) return false;
    $now=$at??time(); $dir=az_visitor_dir(); $hash=substr(hash('sha256',$sid),0,24);
    if(($body['registered']??false)!==true&&!az_visitor_register($dir,$hash,$now)) return false;
    $minute=(int)floor($now/60); $file=$dir.'/live-'.$minute.'.log'; $new=!is_file($file);
    $out=@fopen($file,'ab'); if(!$out) return false;
    if(!flock($out,LOCK_EX|LOCK_NB)) { fclose($out); return false; }
    try {
        if((fstat($out)['size']??0)>=AZ_VISITOR_LOG_LIMIT) return false;
        $line=$now.' '.$hash."\n";
        if(fwrite($out,$line)!==strlen($line)) return false;
        fflush($out);
    } finally { flock($out,LOCK_UN); fclose($out); }
    if($new) foreach(glob($dir.'/live-*.log')?:[] as $old) if(preg_match('/live-(\d+)\.log$/',$old,$m)&&(int)$m[1]<$minute-4) @unlink($old);
    return true;
}
function az_visitor_summary(?int $at=null): array {
    $now=$at??time(); $dir=az_visitor_dir();
    if(is_file($dir.'/.pending.json')) {
        $lock=@fopen($dir.'/.lock','c');
        if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)) { if($lock) fclose($lock); throw new RuntimeException('Visitor update in progress'); }
        try { az_visitor_recover($dir); } finally { flock($lock,LOCK_UN); fclose($lock); }
    }
    $stats=az_read($dir.'/stats.json',['totalVisitors'=>0,'startedAt'=>null]); $live=[]; $minute=(int)floor($now/60);
    for($bucket=$minute-2;$bucket<=$minute;$bucket++) {
        $file=$dir.'/live-'.$bucket.'.log'; if(!is_file($file)) continue;
        $text=file_get_contents($file,false,null,0,AZ_VISITOR_LOG_LIMIT);
        foreach(explode("\n",$text) as $line) if(preg_match('/^(\d+) ([a-f0-9]{24})$/',$line,$m)&&(int)$m[1]>$now-AZ_VISITOR_WINDOW&&(int)$m[1]<=$now) $live[$m[2]]=true;
    }
    return ['liveVisitors'=>count($live),'totalVisitors'=>(int)$stats['totalVisitors'],'startedAt'=>$stats['startedAt'],'lastUpdated'=>gmdate('Y-m-d\TH:i:s.000\Z',$now),'liveWindowSeconds'=>AZ_VISITOR_WINDOW];
}
