<?php
declare(strict_types=1);
require_once __DIR__.'/accounts.php';
require_once __DIR__.'/pricing.php';
require_once __DIR__.'/features.php';
require_once __DIR__.'/admin.php';
require_once __DIR__.'/notifications.php';
function az_api(string $p,string $method,array $b): void {
    if(str_starts_with($p,'/api/admin/')) az_admin();
    az_accounts_api($p,$method,$b); az_features_api($p,$method,$b); az_admin_api($p,$method,$b);
    if($p==='/api/catalog'&&$method==='GET') az_json(200,az_public_catalog());
    if($p==='/api/coupon'&&$method==='POST') { try { $c=az_coupon($b['code']??null,$b['phone']??null); } catch(RuntimeException $e) { az_fail(400,$e->getMessage()); } az_json(200,$c); }
    if($p==='/api/quote'&&$method==='POST') {
        $error=null; try { $coupon=az_coupon($b['code']??null,$b['phone']??null); } catch(RuntimeException $e) { $coupon=null; $error=$e->getMessage(); }
        try { $credits=az_credits($b); } catch(RuntimeException $e) { az_fail(422,$e->getMessage()); }
        az_json(200,array_merge(az_price(is_array($b['items']??null)?$b['items']:[],$coupon,$credits),['couponError'=>$error]));
    }
    if($p==='/api/spin'&&$method==='POST') {
        $wheel=az_store()['wheel']; $x=random_int(0,array_sum(array_column($wheel,'weight'))-1); $index=0;
        foreach($wheel as $i=>$w) { $x-=$w['weight']; if($x<0) { $index=$i; break; } }
        if(!empty($b['contact'])) az_push('leads',['contact'=>az_clean($b['contact'],120),'prize'=>$wheel[$index]['code'],'at'=>az_now()]);
        az_json(200,['index'=>$index,'prize'=>$wheel[$index]]);
    }
    if($p==='/api/orders'&&$method==='POST') az_place_order($b);
    if(preg_match('~^/api/orders/([A-Z0-9]+)$~',$p,$m)&&$method==='GET') {
        $o=az_find(az_db('orders'),fn($o)=>$o['id']===$m[1]); $phone=az_phone($_GET['phone']??null);
        if(!$o||!$phone||$o['customer']['phone']!==$phone) az_fail(404,"We couldn't find an order with that number and phone.");
        unset($o['adminNote']); $o['customer']=array_intersect_key($o['customer'],array_flip(['name','city'])); $courier=az_find(az_store()['couriers']??[],fn($c)=>$c['name']===($o['courier']??null)); $o['trackUrl']=isset($courier['track'])?str_replace('{cn}',rawurlencode($o['tracking']??''),$courier['track']):null; az_json(200,$o);
    }
    if($p==='/api/activity'&&$method==='GET') {
        $orders=array_reverse(array_slice(array_values(array_filter(az_db('orders'),fn($o)=>az_time($o['createdAt'])>time()-259200&&$o['status']!=='cancelled')),-12)); $products=az_catalog();
        az_json(200,array_map(fn($o)=>['city'=>$o['customer']['city'],'title'=>$o['items'][0]['title'],'image'=>$o['items'][0]['image'],'slug'=>$products[$o['items'][0]['id']]['slug']??null,'at'=>$o['createdAt']],$orders));
    }
    if($p==='/api/presence'&&$method==='POST') {
        $presence=az_db('presence'); $now=time(); foreach($presence as $id=>$visitors) { $presence[$id]=array_filter($visitors,fn($t)=>$t>$now-40); if(!$presence[$id]) unset($presence[$id]); }
        $id=az_clean($b['productId']??'',40); $sid=az_clean($b['sid']??'',64); if($sid) $presence[$id][$sid]=$now; az_set('presence',$presence); az_json(200,['others'=>max(0,count($presence[$id]??[])-($sid?1:0))]);
    }
    if(preg_match('~^/api/reviews/([\w-]+)$~',$p,$m)) {
        if($method==='GET') az_json(200,array_reverse(array_values(array_filter(az_db('reviews'),fn($r)=>$r['productId']===$m[1]))));
        if($method==='POST') { if(!isset(az_catalog()[$m[1]])) az_fail(404,'Unknown product'); $rating=(int)round((float)($b['rating']??0)); if($rating<1||$rating>5) az_fail(400,'Choose a star rating.'); if(strlen(az_clean($b['name']??''))<2||strlen(az_clean($b['text']??'',1000))<4) az_fail(400,'Please add your name and a few words.'); $r=['productId'=>$m[1],'name'=>az_clean($b['name'],60),'city'=>az_clean($b['city']??'',60),'rating'=>$rating,'text'=>az_clean($b['text'],1000),'at'=>az_now()]; az_push('reviews',$r); az_json(201,$r); }
    }
    if(in_array($p,['/api/waitlist','/api/newsletter'])&&$method==='POST') {
        $contact=az_clean($b['contact']??'',120); if(!az_email($contact)&&!az_phone($contact)) az_fail(400,'Enter an email or a mobile number.'); $name=substr($p,5); $list=az_db($name); $i=az_index($list,fn($r)=>strtolower($r['contact'])===strtolower($contact)); if($i!==null) az_json(200,['position'=>$i+1,'already'=>true]); az_json(201,['position'=>az_push($name,['contact'=>$contact,'interest'=>az_clean($b['interest']??'',60),'at'=>az_now()])]);
    }
    if($p==='/api/contact'&&$method==='POST') { if(strlen(az_clean($b['name']??''))<2||!az_email($b['email']??null)||strlen(az_clean($b['message']??'',2000))<5) az_fail(400,'Please fill in your name, email and message.'); az_push('messages',['name'=>az_clean($b['name'],80),'email'=>az_clean($b['email'],120),'message'=>az_clean($b['message'],2000),'at'=>az_now()]); az_json(201,['ok'=>true]); }
}
function az_place_order(array $b): never {
    $c=is_array($b['customer']??null)?$b['customer']:[]; $phone=az_phone($c['phone']??null); $errors=[];
    if(!empty($b['website'])) az_fail(400,'Something went wrong. Please try again.');
    if(strlen(az_clean($c['name']??''))<2) $errors['name']='Please enter your full name.';
    if(!$phone) $errors['phone']='Enter a valid Pakistani mobile number, e.g. 0300 1234567.';
    if(!empty($c['email'])&&!az_email($c['email'])) $errors['email']="That email doesn't look right.";
    if(!az_clean($c['city']??'')) $errors['city']='Choose your city.';
    if(strlen(az_clean($c['address']??'',500))<8) $errors['address']='Please enter your full delivery address.';
    if(!in_array($b['payment']??'',['cod','bank','wallet'])) $errors['payment']='Choose a payment method.';
    if($errors) az_fail(422,'Please check the highlighted fields.',$errors);
    if(az_limited('order-ip:'.az_ip(),30,3600)||az_limited('order-phone:'.$phone,5,86400)) az_fail(429,"Too many orders in a short time. Please WhatsApp us and we'll help.");
    try { $coupon=az_coupon($b['code']??null,$phone); } catch(RuntimeException $e) { az_fail(422,$e->getMessage(),['code'=>$e->getMessage()]); }
    try { $credits=az_credits($b); } catch(RuntimeException $e) { az_fail(422,$e->getMessage(),['credit'=>$e->getMessage()]); }
    $q=az_price(is_array($b['items']??null)?$b['items']:[],$coupon,$credits); if(!$q['items']) az_fail(400,'Your bag is empty.');
    $rules=az_store()['cod']??[];
    if($b['payment']==='cod') {
        $why=!empty($rules['maxTotal'])&&$q['total']>$rules['maxTotal']?'Cash on delivery is available up to '.az_rs($rules['maxTotal']).'. Please pay by bank transfer or JazzCash/Easypaisa.':null;
        foreach($q['items'] as $i) foreach($i['addons'] as $a) if(in_array($a['key'],$rules['advanceForAddons']??[],true)) $why='Stitched-to-measure orders need advance payment by bank transfer or JazzCash/Easypaisa.';
        if($why) az_fail(422,$why,['payment'=>$why]);
    }
    $need=[]; $products=az_catalog();
    foreach($q['items'] as $i) { $key=$i['id'].'|'.$i['size']; $need[$key]=($need[$key]??0)+$i['qty']; }
    foreach($need as $key=>$qty) { [$id,$size]=explode('|',$key,2); $left=$products[$id]['stock'][$size]??0; if($left<$qty) az_fail(409,'Sorry, only '.$left.' left of '.$products[$id]['title'].' ('.$size.').'); }
    foreach($need as $key=>$qty) { [$id,$size]=explode('|',$key,2); az_stock($id,$size,$products[$id]['stock'][$size]-$qty); }
    $o=['id'=>'AZ'.strtoupper(substr(base_convert((string)(int)(microtime(true)*1000),10,36),-6)).random_int(10,99),'createdAt'=>az_now(),'status'=>'placed','history'=>[['status'=>'placed','at'=>az_now()]],'payment'=>$b['payment'],'customer'=>['name'=>az_clean($c['name'],80),'phone'=>$phone,'email'=>az_clean($c['email']??'',120),'city'=>az_clean($c['city'],60),'address'=>az_clean($c['address'],500),'notes'=>az_clean($c['notes']??'',500)],'items'=>array_map(fn($i)=>array_intersect_key($i,array_flip(['id','title','image','size','qty','unit','line','addons','meta'])),$q['items'])];
    foreach(['subtotal','discounts','shipping','credits','total','coupon'] as $k) $o[$k]=$q[$k];
    az_push('orders',$o); az_order_created($o,$credits);
    $GLOBALS['az_after'][]=fn()=>az_notify($o,'placed');
    az_json(201,array_intersect_key($o,array_flip(['id','total','payment'])));
}
