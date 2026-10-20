<?php
declare(strict_types=1);
function az_image(string $url): never {
    $allowed=['cdn.shopify.com','khaadi.com','sanasafinaz.com','limelight.pk','sapphireonline.pk','mariab.pk','gulahmedshop.com','alkaramstudio.com','junaidjamshed.com','edenrobe.com','bonanzasatrangi.com','nishatlinen.com','images.unsplash.com','images.pexels.com','beechtree.pk','zellbury.com','amiradnan.com','demandware.net','cloudfront.net'];
    $u=parse_url($url); $host=strtolower($u['host']??''); $ok=false; foreach($allowed as $domain) if($host===$domain||str_ends_with($host,'.'.$domain)) $ok=true;
    if(!$ok||!in_array($u['scheme']??'',['http','https'],true)||isset($u['user'])||isset($u['pass'])||isset($u['port'])||preg_match('/[\r\n]/',$url)) az_text(400,'blocked');
    $dir=AZ_RUNTIME.'/img-cache'; if(!is_dir($dir)) mkdir($dir,0700,true); $file=$dir.'/'.sha1($url); $mime=$file.'.mime';
    if(is_file($file)&&is_file($mime)) { header('Content-Type: '.trim(file_get_contents($mime))); header('Cache-Control: public, max-age=2592000'); header('X-Content-Type-Options: nosniff'); readfile($file); exit; }
    try {
        if(!function_exists('curl_init')) throw new RuntimeException('cURL is not enabled');
        $ips=gethostbynamel($host)?:[]; if(!$ips) throw new RuntimeException('DNS lookup failed'); foreach($ips as $ip) if(!filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE)) throw new RuntimeException('Blocked address');
        $body=''; $ch=curl_init($url); curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>['User-Agent: Mozilla/5.0','Accept: image/avif,image/webp,image/*,*/*'],CURLOPT_RESOLVE=>[$host.':'.(($u['scheme']==='https')?'443':'80').':'.$ips[0]],CURLOPT_WRITEFUNCTION=>function($c,$data)use(&$body){ if(strlen($body)+strlen($data)>15*1024*1024) return 0; $body.=$data; return strlen($data); }]);
        $ok=curl_exec($ch); $status=curl_getinfo($ch,CURLINFO_HTTP_CODE); $type=explode(';',(string)curl_getinfo($ch,CURLINFO_CONTENT_TYPE))[0]; curl_close($ch);
        if(!$ok||$status!==200||!in_array($type,['image/jpeg','image/png','image/webp','image/avif','image/gif'])) throw new RuntimeException('Image unavailable');
        az_atomic($file,$body); az_atomic($mime,$type); header('Content-Type: '.$type); header('Cache-Control: public, max-age=2592000'); header('X-Content-Type-Options: nosniff'); echo $body; exit;
    } catch(Throwable $e) { header('Location: '.$url,true,302); header('Cache-Control: no-store'); exit; }
}
