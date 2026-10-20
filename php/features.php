<?php
declare(strict_types=1);
function az_gift_code($raw): ?string {
    $s=preg_replace('/[^A-Z0-9]/','',strtoupper(is_scalar($raw)?(string)$raw:'')); if(strlen($s)===12&&str_starts_with($s,'AZGC')) $s=substr($s,4);
    return preg_match('/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/',$s)?'AZGC-'.substr($s,0,4).'-'.substr($s,4):null;
}
function az_gift_status(array $c): string { return $c['status']==='active'&&az_time($c['expiresAt']??null)<time()?'expired':$c['status']; }
function az_gift_lookup($raw): array {
    $key='gift-miss:'.az_ip(); $limits=az_db('rate-limits'); $record=$limits[$key]??[];
    $times=$record['times']??[]; if(count(array_filter($times,fn($t)=>$t>time()-900))>=20) throw new RuntimeException('Too many gift card tries. Please wait a few minutes and try again.');
    $code=az_gift_code($raw); $c=$code?az_find(az_db('giftcards'),fn($c)=>$c['code']===$code):null;
    if(!$c) { az_limited($key,20,900); throw new RuntimeException("We couldn't find that gift card. Please check the code and try again."); } return $c;
}
function az_activate(array &$c): void { $c['status']=$c['balance']>0?'active':'redeemed'; if(empty($c['activatedAt'])) { $c['activatedAt']=az_now(); $c['expiresAt']=gmdate('Y-m-d\TH:i:s.000\Z',strtotime('+12 months')); } unset($c['voidReason'],$c['voidedAt']); }
function az_stock(string $id,string $size,$qty): void {
    $products=az_catalog(); $p=$products[$id]??null; if(!$p) az_fail(404,'No such product'); $prev=$p['stock'][$size]??0;
    $inv=az_db('inventory'); $inv[$id]=array_replace($p['stock'],$inv[$id]??[]); $inv[$id][$size]=max(0,(int)$qty); az_set('inventory',$inv);
    if($prev<=0&&$qty>0) {
        $list=az_db('restock'); $due=[];
        foreach($list as &$r) if($r['productId']===$id&&$r['size']===$size&&$r['status']==='pending') { $r['status']='notified'; $r['notifiedAt']=az_now(); $due[]=$r; } unset($r);
        if($due) { az_set('restock',$list); $GLOBALS['az_after'][]=fn()=>az_restock_notify($p,$due); }
    }
}
function az_drafts(): array { $list=az_db('checkout-drafts'); $kept=array_values(array_filter($list,fn($d)=>az_time($d['updatedAt']??$d['createdAt'])>time()-2592000)); if(count($kept)!==count($list)) az_set('checkout-drafts',$kept); return $kept; }
function az_restock_groups(): array {
    $groups=[]; $products=az_catalog();
    foreach(az_db('restock') as $r) { $key=$r['productId'].'|'.$r['size']; $p=$products[$r['productId']]??null; if(!isset($groups[$key])) $groups[$key]=['key'=>$key,'productId'=>$r['productId'],'size'=>$r['size'],'oneSize'=>!empty($r['oneSize']),'title'=>$p['title']??$r['title'],'slug'=>$p['slug']??$r['slug'],'image'=>$p['images'][0]??null,'inStock'=>$p?($p['stock'][$r['size']]??0):null,'people'=>[]]; $groups[$key]['people'][]=array_intersect_key($r,array_flip(['id','phone','email','at','status','notifiedAt','emailedAt','contactedAt'])); }
    foreach($groups as &$g) { usort($g['people'],fn($a,$b)=>strcmp($b['at'],$a['at'])); $g['waiting']=count(array_filter($g['people'],fn($r)=>$r['status']==='pending')); $g['toContact']=count(array_filter($g['people'],fn($r)=>empty($r['contactedAt'])&&($r['status']==='notified'||$g['inStock']>0))); $g['contacted']=count(array_filter($g['people'],fn($r)=>!empty($r['contactedAt']))); $g['latest']=$g['people'][0]['at']??null; } unset($g);
    $out=array_values($groups); usort($out,fn($a,$b)=>(($b['toContact']>0)<=>($a['toContact']>0))?:($b['waiting']<=>$a['waiting'])?:strcmp($b['latest'],$a['latest'])); return $out;
}
function az_features_api(string $p,string $method,array $b): void {
    if(preg_match('~^/api/giftcards/([^/]{1,60})$~',$p,$m)&&$method==='GET') {
        try { $c=az_gift_lookup($m[1]); } catch(RuntimeException $e) { az_fail(str_starts_with($e->getMessage(),'Too many')?429:404,$e->getMessage()); }
        $status=az_gift_status($c); az_json(200,['code'=>'AZGC-••••-'.substr($c['code'],-4),'last4'=>substr($c['code'],-4),'value'=>$c['initial'],'balance'=>$status==='active'?$c['balance']:0,'status'=>$status,'expiresAt'=>$c['expiresAt']]);
    }
    if($p==='/api/admin/giftcards'&&$method==='GET') {
        $orders=array_column(az_db('orders'),null,'id'); az_json(200,array_map(fn($c)=>array_merge($c,['status'=>az_gift_status($c),'orderStatus'=>$orders[$c['orderId']]['status']??null,'buyer'=>$orders[$c['orderId']]['customer']['name']??null]),array_reverse(az_db('giftcards'))));
    }
    if(preg_match('~^/api/admin/giftcards/([^/]{1,60})$~',$p,$m)&&$method==='POST') {
        $code=az_gift_code($m[1]); $list=az_db('giftcards'); $i=az_index($list,fn($c)=>$c['code']===$code); if($i===null) az_fail(404,'No such gift card'); $c=&$list[$i]; $action=$b['action']??'';
        if($action==='sent') { if(in_array($c['status'],['pending','void'])) az_fail(400,"This card isn't active, so it can't be sent yet."); $c['sentAt']=az_now(); }
        elseif($action==='void') { $c['status']='void'; $c['voidedAt']=az_now(); $c['voidReason']='admin'; }
        elseif($action==='activate') { if(!in_array($c['status'],['pending','void'])) az_fail(400,'Only pending or cancelled cards can be activated.'); az_activate($c); }
        else az_fail(400,'Unknown action'); az_set('giftcards',$list); $out=$c; $out['status']=az_gift_status($c); unset($c); az_json(200,$out);
    }
    if($p==='/api/alerts/restock'&&$method==='POST') {
        $product=az_catalog()[az_clean($b['id']??'',40)]??null; if(!$product||$product['category']==='giftcard') az_fail(404,"We couldn't find that piece.");
        $size=trim((string)($b['size']??'')); if(!in_array($size,$product['sizes'],true)) az_fail(422,'Please choose a size.',['size'=>'Please choose a size.']); $phone=az_phone($b['phone']??null); $email=strtolower(trim((string)($b['email']??''))); $errors=[];
        if(!$phone) $errors['phone']='Enter a valid Pakistani mobile number, e.g. 0300 1234567.'; if($email&&(!az_email($email)||strlen($email)>120)) $errors['email']="That email doesn't look right."; if($errors) az_fail(422,array_values($errors)[0],$errors);
        if(az_limited('restock:'.az_ip(),12,600)) az_fail(429,'Too many requests. Please try again in a few minutes.'); $left=$product['stock'][$size]??0; if($left>0) az_json(409,['error'=>'Good news: '.(count($product['sizes'])>1?$size:'it').' is in stock right now, so you can order it today.','inStock'=>$left]);
        $list=az_db('restock'); $i=az_index($list,fn($r)=>$r['productId']===$product['id']&&$r['size']===$size&&$r['phone']===$phone&&$r['status']==='pending');
        if($i!==null) { if($email) $list[$i]['email']=$email; az_set('restock',$list); az_json(200,['ok'=>true,'already'=>true]); }
        if(count(array_filter($list,fn($r)=>$r['phone']===$phone&&$r['status']==='pending'))>=20) az_fail(429,"This number is already waiting for 20 pieces. We'll message you as they come back.");
        $list[]=['id'=>bin2hex(random_bytes(6)),'productId'=>$product['id'],'size'=>$size,'oneSize'=>count($product['sizes'])===1,'title'=>$product['title'],'slug'=>$product['slug'],'phone'=>$phone,'email'=>$email,'at'=>az_now(),'status'=>'pending','notifiedAt'=>null,'emailedAt'=>null,'contactedAt'=>null];
        $list=array_values(array_filter($list,fn($r)=>$r['status']==='pending'||az_time($r['notifiedAt']??$r['at'])>time()-15552000)); az_set('restock',array_slice($list,-20000)); az_json(201,['ok'=>true]);
    }
    if($p==='/api/alerts/checkout-draft'&&$method==='POST') {
        $sid=(string)($b['sid']??''); if(!preg_match('/^[a-z0-9]{6,64}$/i',$sid)) az_fail(400,'Missing session.'); $name=az_clean($b['name']??'',80); $phone=az_phone($b['phone']??null); if(strlen($name)<2||!$phone) az_fail(422,'A name and a valid mobile number are needed.');
        $products=az_catalog(); $items=[]; foreach(array_slice(is_array($b['items']??null)?$b['items']:[],0,30) as $i) { $product=$products[$i['id']??'']??null; $title=$product['title']??az_clean($i['title']??'',120); if($title) $items[]=['id'=>$product['id']??null,'slug'=>$product['slug']??null,'title'=>$title,'size'=>az_clean($i['size']??'',40),'qty'=>max(1,min(99,(int)round((float)($i['qty']??1))))]; }
        if(!$items) az_fail(400,'Your bag is empty.'); if(az_limited('draft-ip:'.az_ip(),60,600)||az_limited('draft:'.$sid,30,600)) az_fail(429,'Too many saves. Please try again shortly.');
        $list=az_drafts(); $i=az_index($list,fn($d)=>$d['sid']===$sid); $d=$i!==null?$list[$i]:['sid'=>$sid,'createdAt'=>az_now()]; if(!empty($d['recovered'])&&az_time($d['recoveredAt'])>time()-600) az_json(200,['ok'=>true]);
        if(!empty($d['recovered'])) $d=array_merge($d,['createdAt'=>az_now(),'recoveredAt'=>null,'orderId'=>null,'contactedAt'=>null]);
        $d=array_merge($d,['name'=>$name,'phone'=>$phone,'city'=>az_clean($b['city']??'',60),'items'=>$items,'total'=>max(0,min(10000000,(int)round((float)($b['total']??0)))),'updatedAt'=>az_now(),'recovered'=>false,'contactedAt'=>$d['contactedAt']??null]); if($i!==null) $list[$i]=$d; else $list[]=$d; az_set('checkout-drafts',array_slice($list,-5000)); setcookie('az_draft',$sid,['expires'=>time()+2592000,'path'=>'/api','httponly'=>true,'secure'=>!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off','samesite'=>'Lax']); az_json(200,['ok'=>true]);
    }
    if($p==='/api/admin/alerts/restock'&&$method==='GET') az_json(200,['site'=>az_origin(),'groups'=>az_restock_groups()]);
    if($p==='/api/admin/alerts/drafts'&&$method==='GET') { $list=az_drafts(); $quiet=fn($d)=>az_time($d['updatedAt'])<time()-1800; $abandoned=array_values(array_filter($list,fn($d)=>empty($d['recovered'])&&$quiet($d))); usort($abandoned,fn($a,$b)=>strcmp($b['updatedAt'],$a['updatedAt'])); $recovered=array_filter($list,fn($d)=>!empty($d['recovered'])); az_json(200,['site'=>az_origin(),'abandoned'=>$abandoned,'inProgress'=>count(array_filter($list,fn($d)=>empty($d['recovered'])&&!$quiet($d))),'recovered'=>count($recovered),'recoveredValue'=>array_sum(array_column($recovered,'total')),'days'=>30]); }
    if(preg_match('~^/api/admin/alerts/(restock|drafts)/([a-z0-9]{6,64})$~i',$p,$m)&&$method==='POST') { $name=$m[1]==='restock'?'restock':'checkout-drafts'; $key=$m[1]==='restock'?'id':'sid'; $list=az_db($name); $i=az_index($list,fn($r)=>$r[$key]===$m[2]); if($i===null) az_fail(404,'No such request'); $list[$i]['contactedAt']=!empty($b['contacted'])?az_now():null; az_set($name,$list); az_json(200,$list[$i]); }
}
function az_order_created(array $o,array $credits): void {
    $account=az_current_account();
    foreach($o['credits'] as $used) {
        $credit=az_find($credits,fn($c)=>$c['key']===$used['key']);
        if($used['key']==='points'&&$account) { az_entry($account,['type'=>'redeem','points'=>-min($used['amount'],$account['points']),'orderId'=>$o['id']]); az_link($account,$o['id']); }
        if($used['key']==='giftcard'&&$credit) { $cards=az_db('giftcards'); foreach($cards as &$c) if($c['code']===$credit['code']) { $take=min($c['balance'],$used['amount']); $c['balance']-=$take; $c['history'][]=['orderId'=>$o['id'],'amount'=>$take,'at'=>az_now()]; if($c['balance']<=0) $c['status']='redeemed'; } unset($c); az_set('giftcards',$cards); }
    }
    if($account) { az_link($account,$o['id']); az_save_account($account); }
    $products=az_catalog(); $cards=az_db('giftcards'); $taken=array_column($cards,'code'); $alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    foreach($o['items'] as $i) if(($products[$i['id']]['category']??'')==='giftcard') for($n=0;$n<$i['qty'];$n++) {
        do { $raw=''; for($k=0;$k<8;$k++) $raw.=$alphabet[random_int(0,strlen($alphabet)-1)]; $code=az_gift_code($raw); } while(in_array($code,$taken,true)); $taken[]=$code; $m=$i['meta']??[];
        $cards[]=['code'=>$code,'initial'=>$products[$i['id']]['price'],'balance'=>$products[$i['id']]['price'],'status'=>'pending','orderId'=>$o['id'],'to'=>az_clean($m['to']??'',60),'toContact'=>az_clean($m['toContact']??'',120),'from'=>az_clean($m['from']??'',60)?:$o['customer']['name'],'message'=>az_clean($m['message']??'',200),'createdAt'=>az_now(),'expiresAt'=>gmdate('Y-m-d\TH:i:s.000\Z',strtotime('+12 months')),'history'=>[]];
    }
    az_set('giftcards',$cards);
    $drafts=az_drafts(); foreach($drafts as &$d) if(empty($d['recovered'])&&($d['phone']===$o['customer']['phone']||$d['sid']===($_COOKIE['az_draft']??''))) { $d['recovered']=true; $d['recoveredAt']=az_now(); $d['orderId']=$o['id']; } unset($d); az_set('checkout-drafts',$drafts);
}
function az_status_changed(array $o,string $prev): void {
    if($a=az_owner($o['id'])) { az_reconcile($a,$o); az_save_account($a); }
    $cards=az_db('giftcards'); $cancel=$o['status']==='cancelled'&&$prev!=='cancelled'; $reinstate=$prev==='cancelled'&&$o['status']!=='cancelled';
    foreach($cards as &$c) {
        if($c['orderId']===$o['id']) {
            if(in_array($o['status'],['confirmed','dispatched','delivered'])&&($c['status']==='pending'||($c['status']==='void'&&($c['voidReason']??'')==='order-cancelled'))) az_activate($c);
            elseif($cancel&&in_array($c['status'],['pending','active','redeemed'])) { $c['status']='void'; $c['voidedAt']=az_now(); $c['voidReason']='order-cancelled'; }
        }
        $history=array_filter($c['history'],fn($h)=>$h['orderId']===$o['id']); $net=array_sum(array_column($history,'amount'));
        if($cancel&&$net>0) { $c['balance']+=$net; $c['history'][]=['orderId'=>$o['id'],'amount'=>-$net,'at'=>az_now(),'note'=>'Order cancelled: refunded to card']; if($c['status']==='redeemed') $c['status']='active'; }
        elseif($reinstate&&$history&&$net===0) { $refunded=-array_sum(array_column(array_filter($history,fn($h)=>$h['amount']<0),'amount')); $take=min($c['balance'],$refunded); if($take>0) { $c['balance']-=$take; $c['history'][]=['orderId'=>$o['id'],'amount'=>$take,'at'=>az_now(),'note'=>'Order reinstated']; if($c['balance']<=0&&$c['status']==='active') $c['status']='redeemed'; } }
    }
    unset($c); az_set('giftcards',$cards); if($prev!==$o['status']) $GLOBALS['az_after'][]=fn()=>az_notify($o,$o['status']);
}
