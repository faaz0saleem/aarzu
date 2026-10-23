<?php
declare(strict_types=1);
function az_partner_program(): array { static $p=null; return $p??=az_read(AZ_ROOT.'/data/partner-program.json'); }
function az_partner_book(): array { $b=az_db('partner-book',['partners'=>[],'payouts'=>[],'settlements'=>[],'visits'=>[],'audit'=>[]]); if(!is_array($b)) throw new RuntimeException('Partnership records unavailable'); foreach(['partners','payouts','settlements','visits','audit'] as $key) if(!is_array($b[$key]??null)) throw new RuntimeException('Partnership records unavailable'); return $b; }
function az_partner_save(array $b): void { az_set('partner-book',$b); }
function az_partner_audit(array &$b,string $type,array $detail): void { $b['audit'][]=array_merge(['type'=>$type],$detail,['at'=>az_now()]); $b['audit']=array_slice($b['audit'],-10000); }
function az_partner_code($raw): string { return strtoupper(trim(is_scalar($raw)?(string)$raw:'')); }
function az_partner_active($raw): ?array { $code=az_partner_code($raw); if(!preg_match('/^AZP[A-F0-9]{10}$/',$code)) return null; return az_find(az_partner_book()['partners'],fn($p)=>$p['code']===$code&&$p['status']==='active'); }
function az_partner_coupon($raw): ?array { return az_partner_active($raw)?['type'=>'percent','value'=>az_partner_program()['viewerDiscountPercent'],'label'=>'Creator discount · '.az_partner_program()['viewerDiscountPercent'].'% off']:null; }
function az_partner_cookie_code(): ?string { $p=az_partner_active($_COOKIE['az_partner']??''); return $p?$p['code']:null; }
function az_partner_public(array $p): array { return array_intersect_key($p,array_flip(['id','name','email','channel','code','status','statusNote','createdAt','acceptedVersion','visits'])); }
function az_partner_cookie(?string $code): void { $https=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')||strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']??'')==='https'; setcookie('az_partner',$code??'',['expires'=>$code?time()+az_partner_program()['attributionDays']*86400:time()-3600,'path'=>'/','httponly'=>true,'secure'=>$https,'samesite'=>'Lax']); }
function az_partner_base(array $o,array $products): int {
    $eligible=0; foreach($o['items']??[] as $i) { $p=$products[$i['id']]??null; if(!$p||$p['category']==='giftcard'||!empty($p['unlisted'])||!empty($i['meta']['digital'])) continue; $eligible+=max(0,$i['unit']-array_sum(array_column($i['addons']??[],'price')))*$i['qty']; }
    $subtotal=$o['subtotal']??0; $discount=array_sum(array_column($o['discounts']??[],'amount')); $credit=array_sum(array_column($o['credits']??[],'amount'));
    return $subtotal>0?max(0,(int)round($eligible*max(0,$subtotal-$discount-$credit)/$subtotal)):0;
}
function az_partner_attach(array &$o): void {
    $byCode=az_partner_active($o['coupon']??null); $p=$byCode?:az_partner_active($_COOKIE['az_partner']??null); if(!$p) return; $a=az_current_account();
    if($p['accountId']===($a['id']??null)||$p['phone']===$o['customer']['phone']||(!empty($o['customer']['email'])&&strtolower($p['email'])===strtolower($o['customer']['email']))) return;
    $base=az_partner_base($o,az_catalog()); if(!$base) return; $program=az_partner_program();
    $o['partner']=['id'=>$p['id'],'code'=>$p['code'],'base'=>$base,'commission'=>(int)round($base*$program['commissionPercent']/100),'rate'=>$program['commissionPercent'],'holdDays'=>$program['holdDays'],'source'=>$byCode?'code':'link','termsVersion'=>$program['version']];
}
function az_partner_entry(array $o,array $b,?int $time=null): ?array {
    $p=$o['partner']??null; if(!$p) return null; $settlement=$b['settlements'][$o['id']]??null; $refunded=max(0,min($p['base'],(int)($settlement['refunded']??0))); $commission=(int)round(max(0,$p['base']-$refunded)*$p['rate']/100);
    $delivered=null; foreach($o['history']??[] as $h) if($h['status']==='delivered') $delivered=$h['at']; $deliveryTime=az_time($delivered); $availableTime=$deliveryTime?$deliveryTime+$p['holdDays']*86400:null; $availableAt=$availableTime?gmdate('Y-m-d\TH:i:s.000\Z',$availableTime):null;
    $state=in_array($o['status'],['cancelled','returned'])||$refunded>=$p['base']?'reversed':($o['status']!=='delivered'||!$deliveryTime?'pending':(empty($settlement['receivedAt'])?'awaiting_payment':(($time??time())<$availableTime?'holding':'available')));
    return ['orderId'=>$o['id'],'createdAt'=>$o['createdAt'],'status'=>$o['status'],'base'=>$p['base'],'refunded'=>$refunded,'commission'=>$commission,'originalCommission'=>$p['commission'],'rate'=>$p['rate'],'state'=>$state,'availableAt'=>$availableAt,'paymentConfirmedAt'=>$settlement['receivedAt']??null,'source'=>$p['source']];
}
function az_partner_summary(array $p,?array $b=null): array {
    $b??=az_partner_book(); $entries=[]; foreach(az_db('orders') as $o) if(($o['partner']['id']??null)===$p['id']) $entries[]=az_partner_entry($o,$b); usort($entries,fn($a,$b)=>strcmp($b['createdAt'],$a['createdAt']));
    $payouts=array_values(array_filter($b['payouts'],fn($x)=>$x['partnerId']===$p['id'])); $paid=array_sum(array_column(array_filter($payouts,fn($x)=>$x['status']==='paid'),'amount')); $reserved=array_sum(array_column(array_filter($payouts,fn($x)=>$x['status']==='requested'),'amount')); $earned=array_sum(array_column(array_filter($entries,fn($e)=>$e['state']==='available'),'commission'));
    $publicPayouts=array_map(function($x){ $bank=$x['bank']; unset($x['bank']); return array_merge($x,['bankName'=>$bank['bankName'],'accountTitle'=>$bank['accountTitle'],'accountLast4'=>substr($bank['account'],-4)]); },array_reverse($payouts));
    return ['partner'=>az_partner_public($p),'program'=>az_partner_program(),'entries'=>$entries,'payouts'=>$publicPayouts,'totals'=>['visits'=>$p['visits']??0,'orders'=>count($entries),'pending'=>array_sum(array_column(array_filter($entries,fn($e)=>!in_array($e['state'],['available','reversed'])),'commission')),'earned'=>$earned,'paid'=>$paid,'reserved'=>$reserved,'available'=>max(0,$earned-$paid-$reserved),'adjustment'=>max(0,$paid-$earned),'reversed'=>array_sum(array_column(array_filter($entries,fn($e)=>$e['state']==='reversed'),'originalCommission'))]];
}
function az_partner_channel($raw): ?string { if(!is_string($raw)) return null; $u=parse_url($raw); return ($u['scheme']??'')==='https'&&in_array(strtolower($u['host']??''),['youtube.com','www.youtube.com','m.youtube.com','youtu.be'])&&strlen($u['path']??'')>1?substr($raw,0,250):null; }
function az_partner_bank(array $v): array {
    $bank=['bankName'=>az_clean($v['bankName']??'',80),'accountTitle'=>az_clean($v['accountTitle']??'',100),'account'=>strtoupper(preg_replace('/\s/','',(string)($v['account']??'')))];
    if(strlen($bank['bankName'])<2||strlen($bank['accountTitle'])<2||!preg_match('/^(?:[0-9]{6,24}|PK\d{2}[A-Z]{4}[A-Z0-9]{16})$/',$bank['account'])) az_fail(422,'Enter the bank name, account title and a valid Pakistani account number or 24-character IBAN.');
    if(($v['confirmBank']??false)!==true) az_fail(422,'Please confirm these are your correct bank details.'); return $bank;
}
function az_partners_api(string $path,string $method,array $body): void {
    if(!str_starts_with($path,'/api/partners/')&&!str_starts_with($path,'/api/admin/partners')) return;
    $program=az_partner_program(); if($path==='/api/partners/program'&&$method==='GET') az_json(200,$program);
    if($path==='/api/partners/referral'&&in_array($method,['GET','POST'])) {
        $code=az_partner_code($method==='POST'?($body['code']??''):($_COOKIE['az_partner']??'')); $p=az_partner_active($code);
        if(!$p) { az_partner_cookie(null); az_json(200,['coupon'=>null]); }
        if($method==='POST') {
            if(preg_match('/^[a-zA-Z0-9_-]{10,64}$/',(string)($body['sid']??''))&&!az_limited('partner-ref:'.az_ip(),300,3600)) {
                $b=az_partner_book(); $key=hash('sha256',gmdate('Y-m-d').':'.$code.':'.$body['sid']);
                if(!isset($b['visits'][$key])) { $b['visits'][$key]=time()*1000; foreach($b['partners'] as &$partner) if($partner['id']===$p['id']) $partner['visits']=($partner['visits']??0)+1; unset($partner); }
                foreach($b['visits'] as $k=>$t) if(time()*1000-$t>$program['attributionDays']*86400000) unset($b['visits'][$k]); if(count($b['visits'])>20000) $b['visits']=array_slice($b['visits'],-20000,null,true); az_partner_save($b);
            }
            az_partner_cookie($code);
        }
        az_json(200,['coupon'=>array_merge(az_partner_coupon($code),['code'=>$code])]);
    }
    $admin=str_starts_with($path,'/api/admin/'); $a=$admin?null:az_current_account(); if(!$admin&&!$a) az_fail(401,'Please sign in to your Aarzu account.');
    $b=az_partner_book(); $mine=$a?az_find($b['partners'],fn($p)=>$p['accountId']===$a['id']):null;
    if($path==='/api/partners/me'&&$method==='GET') az_json(200,$mine?az_partner_summary($mine,$b):['partner'=>null,'program'=>$program,'account'=>['name'=>$a['name'],'email'=>$a['email']??'','phone'=>$a['phone']]]);
    if($path==='/api/partners/join'&&$method==='POST') {
        if($mine) az_json(200,az_partner_summary($mine,$b)); if(az_limited('partner-join:'.az_ip(),20,3600)) az_fail(429,'Too many requests. Please try later.');
        $channel=az_partner_channel($body['channel']??null); $name=az_clean($body['name']??$a['name'],80); $email=strtolower(az_clean($body['email']??($a['email']??''),120)); if(!$channel||strlen($name)<2||!az_email($email)) az_fail(422,'Enter your name, a valid email and your public YouTube channel link.');
        if(($body['acceptTerms']??false)!==true) az_fail(422,'Please read and accept the partnership terms.');
        if(az_find($b['partners'],fn($p)=>strtolower($p['email'])===$email||rtrim(strtolower($p['channel']),'/')===rtrim(strtolower($channel),'/'))) az_fail(409,'An application already uses that email or channel. Sign in to the original account or contact Aarzu by email.');
        do { $code='AZP'.strtoupper(bin2hex(random_bytes(5))); } while(az_find($b['partners'],fn($p)=>$p['code']===$code));
        $p=['id'=>'PT'.strtoupper(bin2hex(random_bytes(8))),'accountId'=>$a['id'],'name'=>$name,'email'=>$email,'phone'=>$a['phone'],'channel'=>$channel,'code'=>$code,'status'=>'pending','createdAt'=>az_now(),'acceptedVersion'=>$program['version'],'visits'=>0]; $b['partners'][]=$p; az_partner_audit($b,'application',['partnerId'=>$p['id']]); az_partner_save($b); az_json(201,az_partner_summary($p,$b));
    }
    if($path==='/api/partners/payouts'&&$method==='POST') {
        if(!$mine||$mine['status']!=='active') az_fail(403,'Your partnership must be active before requesting a payout.');
        if(az_find($b['payouts'],fn($x)=>$x['partnerId']===$mine['id']&&$x['status']==='requested')) az_fail(409,'You already have a payout request being reviewed.');
        $s=az_partner_summary($mine,$b); $amount=$s['totals']['available']; if($amount<$program['minimumPayout']) az_fail(422,'The minimum available balance is PKR '.$program['minimumPayout'].'.');
        $bank=az_partner_bank($body); $p=['id'=>'PO'.strtoupper(bin2hex(random_bytes(8))),'partnerId'=>$mine['id'],'amount'=>$amount,'status'=>'requested','createdAt'=>az_now(),'bank'=>$bank,'termsVersion'=>$program['version']]; $b['payouts'][]=$p; az_partner_audit($b,'payout_requested',['partnerId'=>$mine['id'],'payoutId'=>$p['id'],'amount'=>$amount]); az_partner_save($b); az_json(201,az_partner_summary($mine,$b));
    }
    if($path==='/api/admin/partners'&&$method==='GET') {
        $partners=array_map(fn($p)=>array_merge(az_partner_summary($p,$b),['phone'=>$p['phone']]),array_reverse($b['partners'])); $payouts=array_map(fn($p)=>array_merge($p,['partnerName'=>az_find($b['partners'],fn($x)=>$x['id']===$p['partnerId'])['name']??'']),array_reverse($b['payouts']));
        az_json(200,['program'=>$program,'partners'=>$partners,'payouts'=>$payouts,'audit'=>array_reverse(array_slice($b['audit'],-100))]);
    }
    if(preg_match('~^/api/admin/partners/(PT[A-F0-9]{16})/status$~',$path,$m)&&$method==='PATCH') {
        $index=az_index($b['partners'],fn($x)=>$x['id']===$m[1]); if($index===null) az_fail(404,'Creator not found.'); $status=$body['status']??''; if(!in_array($status,['active','paused','rejected'])) az_fail(422,'Choose an active, paused or rejected status.'); $note=az_clean($body['note']??'',300); if($status!=='active'&&strlen($note)<3) az_fail(422,'Add a reason for the creator.');
        $b['partners'][$index]['status']=$status; $b['partners'][$index]['statusNote']=$note; $b['partners'][$index]['updatedAt']=az_now(); az_partner_audit($b,'creator_status',['partnerId'=>$m[1],'status'=>$status,'note'=>$note]); az_partner_save($b); az_json(200,az_partner_summary($b['partners'][$index],$b));
    }
    if(preg_match('~^/api/admin/partners/orders/([A-Z0-9]+)/payment$~',$path,$m)&&$method==='POST') {
        $o=az_find(az_db('orders'),fn($o)=>$o['id']===$m[1]&&!empty($o['partner'])); if(!$o) az_fail(404,'Referral order not found.'); if($o['status']!=='delivered') az_fail(409,'Only a delivered order can have its collected payment confirmed.'); $reference=az_clean($body['reference']??'',120); if(strlen($reference)<3||($body['confirmReceived']??false)!==true) az_fail(422,'Confirm the payment was collected and enter its settlement reference.');
        $refunded=$body['refunded']??0; if(!is_int($refunded)||$refunded<0||$refunded>$o['partner']['base']) az_fail(422,'Refunded product amount must be between zero and the eligible product amount.');
        $b['settlements'][$o['id']]=['receivedAt'=>$b['settlements'][$o['id']]['receivedAt']??az_now(),'reference'=>$reference,'refunded'=>$refunded,'updatedAt'=>az_now()]; az_partner_audit($b,'order_payment',['orderId'=>$o['id'],'partnerId'=>$o['partner']['id'],'refunded'=>$refunded,'reference'=>$reference]); az_partner_save($b); az_json(200,az_partner_entry($o,$b));
    }
    if(preg_match('~^/api/admin/partners/payouts/(PO[A-F0-9]{16})$~',$path,$m)&&$method==='PATCH') {
        $index=az_index($b['payouts'],fn($x)=>$x['id']===$m[1]); if($index===null) az_fail(404,'Payout not found.'); $p=$b['payouts'][$index]; if($p['status']!=='requested') az_fail(409,'This payout has already been processed.');
        if(($body['status']??'')==='paid') {
            $creator=az_find($b['partners'],fn($x)=>$x['id']===$p['partnerId']); $s=az_partner_summary($creator,$b); $t=$s['totals']; if($creator['status']!=='active'||$t['earned']-$t['paid']-$t['reserved']+$p['amount']<$p['amount']) az_fail(409,'This balance is no longer payable. Review returned/refunded orders and reject the request with a reason.');
            $reference=az_clean($body['reference']??'',120); if(strlen($reference)<3||($body['confirmTransferred']??false)!==true) az_fail(422,'Make the bank transfer first, then confirm it and enter the bank transaction reference.'); $p['status']='paid'; $p['reference']=$reference; $p['paidAt']=az_now();
        } elseif(($body['status']??'')==='rejected') { $reason=az_clean($body['reason']??'',300); if(strlen($reason)<3) az_fail(422,'Enter the reason shown to the creator.'); $p['status']='rejected'; $p['reason']=$reason; $p['reviewedAt']=az_now(); }
        else az_fail(422,'Choose paid or rejected.');
        $b['payouts'][$index]=$p; az_partner_audit($b,'payout_'.$p['status'],['partnerId'=>$p['partnerId'],'payoutId'=>$p['id'],'amount'=>$p['amount'],'reference'=>$p['reference']??null,'reason'=>$p['reason']??null]); az_partner_save($b); az_json(200,['id'=>$p['id'],'status'=>$p['status']]);
    }
    az_fail(404,'Partnership route not found.');
}
