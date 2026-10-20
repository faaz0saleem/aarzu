<?php
declare(strict_types=1);
function az_tiers(): array { return [
    ['key'=>'noor','name'=>'Noor','urdu'=>'نور','meaning'=>'light','min'=>0,'multiplier'=>1,'perks'=>['1 point for every Rs 100 you spend','200 welcome points when you join','Saved addresses for one-tap checkout','All your orders in one place']],
    ['key'=>'zar','name'=>'Zar','urdu'=>'زر','meaning'=>'gold','min'=>2500,'multiplier'=>1.25,'perks'=>['1.25× points on every order','Everything in Noor']],
    ['key'=>'shahi','name'=>'Shahi','urdu'=>'شاہی','meaning'=>'royal','min'=>7500,'multiplier'=>1.5,'perks'=>['1.5× points on every order','Everything in Zar']],
]; }
function az_tier(int $points): array { $out=az_tiers()[0]; foreach(az_tiers() as $t) if($points>=$t['min']) $out=$t; return $out; }
function az_earn($total,array $a): int { return (int)floor(max(0,round($total))*az_tier($a['lifetimePoints'])['multiplier']/100); }
function az_entry(array &$a,array $e): void { $a['ledger'][]=array_merge($e,['at'=>az_now()]); $a['points']=max(0,$a['points']+$e['points']); }
function az_net(array $a,string $id,array $types): int { return array_sum(array_column(array_filter($a['ledger'],fn($e)=>($e['orderId']??null)===$id&&in_array($e['type'],$types,true)),'points')); }
function az_link(array &$a,string $id): void { if(!in_array($id,$a['orderIds']??[],true)) $a['orderIds'][]=$id; }
function az_save_account(array $a): void { $list=az_db('accounts'); $i=az_index($list,fn($x)=>$x['id']===$a['id']); if($i===null) $list[]=$a; else $list[$i]=$a; az_set('accounts',$list); }
function az_owner(string $id): ?array { return az_find(az_db('accounts'),fn($a)=>in_array($id,$a['orderIds']??[],true)); }
function az_current_account(): ?array {
    $token=$_COOKIE['az_session']??''; if(!preg_match('/^[a-f0-9]{64}$/',$token)) return null;
    $session=az_find(az_db('sessions'),fn($s)=>hash_equals($s['token'],hash('sha256',$token))&&az_time($s['expiresAt'])>time());
    return $session?az_find(az_db('accounts'),fn($a)=>$a['id']===$session['accountId']):null;
}
function az_cookies(?string $token): void {
    $secure=!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off'; $opts=['expires'=>$token?time()+2592000:time()-3600,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Lax'];
    setcookie('az_session',$token??'',$opts); $opts['httponly']=false; setcookie('az_in',$token?'1':'',$opts);
}
function az_session(string $accountId): void {
    $token=bin2hex(random_bytes(32)); $list=array_values(array_filter(az_db('sessions'),fn($s)=>az_time($s['expiresAt'])>time()));
    $mine=array_values(array_filter($list,fn($s)=>$s['accountId']===$accountId)); $drop=array_column(array_slice($mine,0,max(0,count($mine)-9)),'token');
    $list=array_values(array_filter($list,fn($s)=>!in_array($s['token'],$drop,true))); $list[]=['token'=>hash('sha256',$token),'accountId'=>$accountId,'createdAt'=>az_now(),'expiresAt'=>gmdate('Y-m-d\TH:i:s.000\Z',time()+2592000)]; az_set('sessions',$list); az_cookies($token);
}
function az_check_password(array $a,string $pw): bool {
    if(password_verify($pw,$a['hash']??'')) return true;
    // Existing Node accounts use scrypt(N=16384,r=8,p=1) with a 32-byte text salt.
    if(function_exists('sodium_crypto_pwhash_scryptsalsa208sha256')&&preg_match('/^[a-f0-9]{128}$/',$a['hash']??'')&&strlen($a['salt']??'')===32) {
        try { return hash_equals($a['hash'],bin2hex(sodium_crypto_pwhash_scryptsalsa208sha256(64,$pw,$a['salt'],524288,16777216))); } catch(Throwable $e) { return false; }
    }
    return false;
}
function az_password(array &$a,string $pw): void { $a['hash']=password_hash($pw,PASSWORD_DEFAULT); unset($a['salt']); }
function az_valid_password($pw): bool { return is_string($pw)&&strlen($pw)>=8&&strlen($pw)<=128; }
function az_reconcile(array &$a,array $o): void {
    $earned=az_net($a,$o['id'],['earn','reverse']);
    if($o['status']==='delivered'&&$earned<=0) { $pts=az_earn($o['total'],$a); if($pts>0) { az_entry($a,['type'=>'earn','points'=>$pts,'orderId'=>$o['id']]); $a['lifetimePoints']+=$pts; } }
    if($o['status']==='cancelled'&&$earned>0) { az_entry($a,['type'=>'reverse','points'=>-$earned,'orderId'=>$o['id']]); $a['lifetimePoints']=max(0,$a['lifetimePoints']-$earned); }
    $used=az_find($o['credits']??[],fn($c)=>$c['key']==='points')['amount']??0; $spent=-az_net($a,$o['id'],['redeem','refund']); $target=$o['status']==='cancelled'?0:$used;
    if($spent>$target) az_entry($a,['type'=>'refund','points'=>$spent-$target,'orderId'=>$o['id']]);
    elseif($spent<$target&&$a['points']>0) az_entry($a,['type'=>'redeem','points'=>-min($target-$spent,$a['points']),'orderId'=>$o['id']]);
}
function az_profile(array $a): array {
    $tier=az_tier($a['lifetimePoints']); $next=az_find(az_tiers(),fn($t)=>$t['min']>$a['lifetimePoints']); if($next) $next['toGo']=$next['min']-$a['lifetimePoints'];
    $mine=array_values(array_filter(az_db('orders'),fn($o)=>in_array($o['id'],$a['orderIds']??[],true))); usort($mine,fn($x,$y)=>strcmp($y['createdAt'],$x['createdAt']));
    $orders=array_map(function($o)use($a){ $live=!in_array($o['status'],['delivered','cancelled']); $earned=az_net($a,$o['id'],['earn','reverse']); $first=$o['items'][0]??[]; return ['id'=>$o['id'],'createdAt'=>$o['createdAt'],'total'=>$o['total'],'status'=>$o['status'],'city'=>$o['customer']['city']??'','items'=>array_sum(array_column($o['items'],'qty')),'lines'=>count($o['items']),'image'=>$first['image']??'','title'=>$first['title']??'','points'=>$live?az_earn($o['total'],$a):max(0,$earned),'pointsState'=>$live?'pending':($earned>0?'earned':'none'),'usedPoints'=>max(0,-az_net($a,$o['id'],['redeem','refund']))]; },$mine);
    return ['id'=>$a['id'],'name'=>$a['name'],'phone'=>$a['phone'],'phoneDisplay'=>'0'.substr($a['phone'],2,3).' '.substr($a['phone'],5),'email'=>$a['email']??'','createdAt'=>$a['createdAt'],'addresses'=>$a['addresses']??[],'points'=>$a['points'],'lifetimePoints'=>$a['lifetimePoints'],'tier'=>$tier,'nextTier'=>$next,'pending'=>array_sum(array_column(array_filter($orders,fn($o)=>$o['pointsState']==='pending'),'points')),'ledger'=>array_reverse(array_slice($a['ledger'],-20)),'orders'=>$orders,'program'=>['welcome'=>200,'minRedeem'=>500,'perRupees'=>100]];
}
function az_claim(array &$a,$raw): array {
    $id=strtoupper(trim((string)$raw)); if(!preg_match('/^[A-Z0-9]{4,20}$/',$id)) az_fail(400,'Enter your order number, e.g. AZ1A2B3C45.',['id'=>'Enter your order number.']);
    $o=az_find(az_db('orders'),fn($o)=>$o['id']===$id); if(!$o||$o['customer']['phone']!==$a['phone']) az_fail(404,"We couldn't find that order for your mobile number.",['id'=>"We couldn't find that order for your mobile number."]);
    $owner=az_owner($id); if($owner&&$owner['id']!==$a['id']) az_fail(409,'This order is already in another Aarzu account.');
    if($owner) return ['already'=>true,'id'=>$id]; az_link($a,$id); az_reconcile($a,$o); return ['claimed'=>true,'id'=>$id];
}
function az_accounts_api(string $p,string $method,array $b): void {
    if($p==='/api/account/program'&&$method==='GET') az_json(200,['welcome'=>200,'minRedeem'=>500,'perRupees'=>100,'tiers'=>az_tiers()]);
    if(in_array($p,['/api/account/register','/api/account/login'])&&$method==='POST') {
        $register=str_ends_with($p,'register'); $phone=az_phone($b['phone']??null); $errors=[];
        if(az_limited('auth-ip:'.az_ip(),30,900)||(!$register&&az_limited('login:'.($phone??'?'),8,900))) az_fail(429,'Too many attempts. Please try again in 15 min.');
        if(!$phone) $errors['phone']='Enter a valid Pakistani mobile number, e.g. 0300 1234567.';
        if($register&&strlen(az_clean($b['name']??'',60))<2) $errors['name']='Please enter your name.';
        if($register&&!empty($b['email'])&&(!az_email($b['email'])||strlen($b['email'])>120)) $errors['email']="That email doesn't look right.";
        if(($register&&!az_valid_password($b['password']??null))||!is_string($b['password']??null)||empty($b['password'])) $errors['password']=$register?'Use at least 8 characters.':'Enter your password.';
        if($errors) az_fail(422,'Please check the highlighted fields.',$errors);
        $a=az_find(az_db('accounts'),fn($a)=>$a['phone']===$phone);
        if($register) {
            if($a) az_fail(409,'An account with this number already exists. Please sign in.',['phone'=>'This number already has an account. Sign in instead.']);
            $a=['id'=>'AC'.strtoupper(bin2hex(random_bytes(6))),'name'=>az_clean($b['name'],60),'phone'=>$phone,'email'=>az_clean($b['email']??'',120),'createdAt'=>az_now(),'lastLoginAt'=>az_now(),'addresses'=>[],'points'=>200,'lifetimePoints'=>200,'ledger'=>[['type'=>'welcome','points'=>200,'at'=>az_now()]],'orderIds'=>[]]; az_password($a,$b['password']);
        } else { if(!$a||!az_check_password($a,substr($b['password'],0,128))) az_fail(401,"That number and password don't match.",['password'=>"That number and password don't match."]); $a['lastLoginAt']=az_now(); }
        $claim=null;
        if(!empty($b['claim'])) { $id=strtoupper(trim((string)$b['claim'])); $o=az_find(az_db('orders'),fn($o)=>$o['id']===$id); if($o&&$o['customer']['phone']===$phone&&!az_owner($id)) { az_link($a,$id); az_reconcile($a,$o); $claim=true; } }
        az_save_account($a); az_session($a['id']); az_json($register?201:200,array_merge(az_profile($a),['claimed'=>(bool)$claim]));
    }
    if($p==='/api/account/logout'&&$method==='POST') { $hash=hash('sha256',$_COOKIE['az_session']??''); az_set('sessions',array_values(array_filter(az_db('sessions'),fn($s)=>$s['token']!==$hash))); az_cookies(null); az_json(200,['ok'=>true]); }
    if(str_starts_with($p,'/api/account/')) {
        $a=az_current_account(); if(!$a) { az_cookies(null); az_fail(401,'Please sign in.'); }
        if($p==='/api/account/me'&&$method==='GET') az_json(200,az_profile($a));
        if($p==='/api/account/me'&&$method==='PUT') {
            $errors=[]; if(array_key_exists('name',$b)&&strlen(az_clean($b['name'],60))<2) $errors['name']='Please enter your name.';
            if(!empty($b['email'])&&(!az_email($b['email'])||strlen($b['email'])>120)) $errors['email']="That email doesn't look right.";
            if(isset($b['addresses'])) {
                if(!is_array($b['addresses'])||count($b['addresses'])>5) $errors['addresses']='You can save up to 5 addresses.';
                else { $addresses=[]; foreach($b['addresses'] as $x) { $city=az_clean($x['city']??'',60); $address=az_clean($x['address']??'',500); if(!in_array($city,array_column(az_store()['cities'],'name'))) $errors['addresses']='Choose a city for every address.'; if(strlen($address)<8) $errors['addresses']='Please enter the full address: house, street, area.'; $addresses[]=['label'=>az_clean($x['label']??'Home',30),'city'=>$city,'address'=>$address]; } }
            }
            if($errors) az_fail(422,$errors['addresses']??'Please check the highlighted fields.',$errors);
            foreach(['name'=>60,'email'=>120] as $k=>$n) if(array_key_exists($k,$b)) $a[$k]=az_clean($b[$k],$n);
            if(isset($addresses)) $a['addresses']=$addresses; az_save_account($a); az_json(200,az_profile($a));
        }
        if($p==='/api/account/password'&&$method==='POST') {
            if(az_limited('password:'.$a['id'],8,900)) az_fail(429,'Too many attempts. Please try again in 15 min.');
            if(!is_string($b['current']??null)||!az_check_password($a,substr($b['current'],0,128))) az_fail(422,"Your current password isn't right.",['current'=>"That isn't your current password."]);
            if(!az_valid_password($b['next']??null)) az_fail(422,'Use at least 8 characters.',['next'=>'Use at least 8 characters.']);
            az_password($a,$b['next']); az_save_account($a); $token=hash('sha256',$_COOKIE['az_session']??''); az_set('sessions',array_values(array_filter(az_db('sessions'),fn($s)=>$s['accountId']!==$a['id']||$s['token']===$token))); az_json(200,['ok'=>true]);
        }
        if($p==='/api/account/claim'&&$method==='POST') { if(az_limited('claim:'.$a['id'],10,3600)) az_fail(429,'Too many tries. Please try again in an hour.'); $claim=az_claim($a,$b['id']??''); az_save_account($a); az_json(200,array_merge(az_profile($a),['claimed'=>!empty($claim['claimed']),'already'=>!empty($claim['already'])])); }
    }
    if($p==='/api/admin/accounts'&&$method==='GET') {
        $rows=[]; foreach(az_db('accounts') as $a) { $mine=array_filter(az_db('orders'),fn($o)=>in_array($o['id'],$a['orderIds']??[],true)); $live=array_filter($mine,fn($o)=>$o['status']!=='cancelled'); $rows[]=['id'=>$a['id'],'name'=>$a['name'],'phone'=>$a['phone'],'email'=>$a['email']??'','createdAt'=>$a['createdAt'],'lastLoginAt'=>$a['lastLoginAt']??null,'points'=>$a['points'],'lifetimePoints'=>$a['lifetimePoints'],'tier'=>az_tier($a['lifetimePoints'])['name'],'orders'=>count($mine),'delivered'=>count(array_filter($mine,fn($o)=>$o['status']==='delivered')),'spend'=>array_sum(array_column($live,'total')),'phoneOrders'=>count(array_filter(az_db('orders'),fn($o)=>$o['customer']['phone']===$a['phone'])),'addresses'=>count($a['addresses']??[]),'redeemed'=>max(0,-array_sum(array_column(array_filter($a['ledger'],fn($e)=>in_array($e['type'],['redeem','refund'])),'points')))]; } az_json(200,array_reverse($rows));
    }
    if(preg_match('~^/api/admin/accounts/(AC[A-F0-9]{12})/(points|password)$~',$p,$m)&&$method==='POST') {
        $a=az_find(az_db('accounts'),fn($a)=>$a['id']===$m[1]); if(!$a) az_fail(404,'No such customer');
        if($m[2]==='points') { $delta=(int)($b['delta']??0); if(!$delta||abs($delta)>100000) az_fail(400,'Enter a whole number of points between -100,000 and 100,000.'); az_entry($a,['type'=>'adjust','points'=>$delta,'note'=>az_clean($b['note']??'',120)?:'Adjusted by Aarzu']); az_save_account($a); az_json(200,['id'=>$a['id'],'points'=>$a['points']]); }
        $temp=substr(bin2hex(random_bytes(10)),0,10); az_password($a,$temp); az_save_account($a); az_set('sessions',array_values(array_filter(az_db('sessions'),fn($s)=>$s['accountId']!==$a['id']))); az_json(200,['id'=>$a['id'],'temp'=>$temp]);
    }
}
