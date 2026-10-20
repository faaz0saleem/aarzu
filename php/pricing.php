<?php
declare(strict_types=1);
function az_coupon($raw,$phone=null): ?array {
    if(!$raw) return null;
    $code=strtoupper(trim((string)$raw)); $s=az_store(); $c=$s['coupons'][$code]??null;
    if(!$c) { $saved=az_find(az_db('coupons'),fn($v)=>$v['code']===$code); if($saved && az_coupon_state($saved)==='active') $c=$saved; }
    if(!$c) throw new RuntimeException("That code isn't valid.");
    if($code===($s['launchOffer']['code']??'') && time()>az_time($s['launchOffer']['endsAt']??null)) throw new RuntimeException('This launch offer has ended.');
    if(!empty($c['firstOrderOnly']) && ($p=az_phone($phone)) && az_find(az_db('orders'),fn($o)=>$o['customer']['phone']===$p&&$o['status']!=='cancelled')) throw new RuntimeException('This code is for first orders only.');
    return array_merge($c,['code'=>$code,'label'=>($c['label']??'')?:az_coupon_label($c)]);
}
function az_coupon_uses(string $code): int { return count(array_filter(az_db('orders'),fn($o)=>($o['coupon']??null)===$code&&$o['status']!=='cancelled')); }
function az_coupon_state(array $c): string {
    if(empty($c['active'])) return 'disabled';
    if(!empty($c['expiresOn']) && time()>strtotime($c['expiresOn'].'T23:59:59+05:00')) return 'expired';
    if(!empty($c['maxUses']) && az_coupon_uses($c['code'])>=$c['maxUses']) return 'used-up';
    return 'active';
}
function az_coupon_label(array $c): string { return $c['type']==='percent'?$c['value'].'% off':($c['type']==='fixed'?az_rs($c['value']).' off':'Free delivery'); }
function az_meta($raw): ?array {
    if(!is_array($raw)) return null; $out=[];
    foreach(array_slice($raw,0,30,true) as $k=>$v) if(is_scalar($v)) $out[az_clean($k,40)]=is_string($v)?az_clean($v,300):$v;
    return $out;
}
function az_price(array $lines,?array $coupon=null,array $credits=[]): array {
    $products=az_catalog(); $s=az_store(); $items=[];
    foreach($lines as $l) {
        if(!is_array($l) || !isset($products[$l['id']??''])) continue;
        $p=$products[$l['id']]; $qty=max(1,min(10,(int)floor((float)($l['qty']??1)))); $addons=[];
        foreach(is_array($l['addons']??null)?$l['addons']:[] as $a) {
            $def=$s['addons'][$a['key']??'']??null; $opt=$def['options'][$a['option']??'']??null;
            if(!$def||!$opt||(!empty($def['appliesTo'])&&!in_array($p['category'],$def['appliesTo'],true))) continue;
            $addons[]=['key'=>$a['key'],'option'=>$a['option'],'label'=>$opt['label'],'price'=>$opt['price']];
        }
        $meta=az_meta($l['meta']??null); $unit=$p['price']+array_sum(array_column($addons,'price'));
        $items[]=['key'=>implode('|',[$p['id'],(string)($l['size']??''),json_encode($l['addons']??[],AZ_JSON),json_encode($meta?:new stdClass(),AZ_JSON)]),'id'=>$p['id'],'slug'=>$p['slug'],'title'=>$p['title'],'image'=>$p['images'][0]??'','size'=>(string)($l['size']??''),'qty'=>$qty,'unit'=>$unit,'base'=>$p['price'],'addons'=>$addons,'meta'=>$meta,'compareAt'=>$p['compareAt']??null,'line'=>$unit*$qty,'baseLine'=>$p['price']*$qty,'suit'=>in_array($p['category'],['unstitched','ready-to-wear']),'accessory'=>$p['category']==='accessory','noDiscount'=>!empty($p['noDiscount'])];
    }
    $subtotal=array_sum(array_column($items,'line')); $suits=array_filter($items,fn($i)=>$i['suit']); $suitQty=array_sum(array_column($suits,'qty')); $suitSub=array_sum(array_column($suits,'baseLine')); $accSub=array_sum(array_column(array_filter($items,fn($i)=>$i['accessory']),'baseLine')); $discounts=[];
    $tiers=$s['multiBuy']??[]; usort($tiers,fn($a,$b)=>$a['minItems']<=>$b['minItems']); $tier=null;
    foreach($tiers as $t) if($suitQty>=$t['minItems']) $tier=$t;
    if($tier) $discounts[]=['key'=>'multibuy','label'=>'Buy '.$tier['minItems'].'+ suits: '.$tier['percent'].'% off','amount'=>(int)round($suitSub*$tier['percent']/100)];
    if($suitQty>0 && $accSub>0 && !empty($s['bundle'])) $discounts[]=['key'=>'bundle','label'=>$s['bundle']['label'].': '.$s['bundle']['percent'].'% off accessories','amount'=>(int)round($accSub*$s['bundle']['percent']/100)];
    $after=$subtotal-array_sum(array_column($discounts,'amount')); $base=max(0,$after-array_sum(array_column(array_filter($items,fn($i)=>$i['noDiscount']),'line'))); $applied=null;
    if($coupon && in_array($coupon['type'],['percent','fixed']) && $base>=($coupon['minSubtotal']??0)) { $amount=$coupon['type']==='percent'?(int)round($base*$coupon['value']/100):min($base,(int)round($coupon['value'])); $discounts[]=['key'=>'coupon','label'=>$coupon['label'],'amount'=>$amount]; $applied=$coupon['code']; }
    $discounted=$subtotal-array_sum(array_column($discounts,'amount')); $free=($coupon['type']??'')==='freeship'||$discounted>=$s['freeShippingThreshold'];
    if(($coupon['type']??'')==='freeship') $applied=$coupon['code'];
    $shippable=(bool)az_find($items,fn($i)=>($products[$i['id']]['category']??'')!=='giftcard');
    $shipping=!$items||$free||!$shippable?0:$s['shippingFee']; $due=$discounted+$shipping; $used=[];
    foreach($credits as $c) { $amount=max(0,min($due,(int)round($c['amount']))); if($amount) { $used[]=['key'=>$c['key'],'label'=>$c['label'],'amount'=>$amount]; $due-=$amount; } }
    return ['items'=>$items,'count'=>array_sum(array_column($items,'qty')),'suitQty'=>$suitQty,'subtotal'=>$subtotal,'discounts'=>$discounts,'savings'=>array_sum(array_column($discounts,'amount'))+array_sum(array_map(fn($i)=>$i['compareAt']?($i['compareAt']-$i['base'])*$i['qty']:0,$items)),'shipping'=>$shipping,'freeShippingRemaining'=>$free||!$shippable?0:max(0,$s['freeShippingThreshold']-$discounted),'coupon'=>$applied,'couponRejected'=>$coupon&&!$applied?'Spend '.$s['currency'].' '.number_format($coupon['minSubtotal']??0).' to use this code':null,'credits'=>$used,'totalBeforeCredits'=>$discounted+$shipping,'total'=>$due];
}
function az_credits(array $body): array {
    $out=[]; $products=az_catalog();
    foreach($body['items']??[] as $line) if(($products[$line['id']??'']['category']??'')==='giftcard') {
        $m=$line['meta']??[]; if(strlen(az_clean($m['to']??'',60))<2) throw new RuntimeException('Please add the name of the person each gift card is for.');
        if(!az_phone($m['toContact']??null)&&!az_email($m['toContact']??null)) throw new RuntimeException('Please add a WhatsApp number or email for the gift card recipient.');
        $message=(string)($m['message']??'');
        if((function_exists('mb_strlen')?mb_strlen($message):strlen($message))>200) throw new RuntimeException('Gift card messages can be up to 200 characters.');
    }
    $wanted=is_array($body['credits']??null)?$body['credits']:[];
    $points=az_find($wanted,fn($c)=>($c['key']??'')==='points');
    if($points && ($n=(int)floor((float)($points['payload']['points']??0)))>0) {
        $a=az_current_account(); if(!$a) throw new RuntimeException('Please sign in again to use your Aarzu Rewards points.');
        if($a['points']<500) throw new RuntimeException('You need at least 500 points to redeem. You have '.$a['points'].'.');
        $out[]=['key'=>'points','label'=>'Aarzu Rewards points','amount'=>min($n,$a['points']),'accountId'=>$a['id']];
    }
    $gift=az_find($wanted,fn($c)=>($c['key']??'')==='giftcard');
    if($gift) { $card=az_gift_lookup($gift['payload']['code']??''); $st=az_gift_status($card); if($st!=='active'||$card['balance']<=0) throw new RuntimeException(['pending'=>"This gift card isn't active yet. It switches on as soon as the order it came from is confirmed.",'void'=>'This gift card has been cancelled.','expired'=>'This gift card has expired.','redeemed'=>'This gift card has been fully used.'][$st]??"This gift card can't be used right now."); $out[]=['key'=>'giftcard','label'=>'Gift card ••'.substr($card['code'],-4),'amount'=>$card['balance'],'code'=>$card['code']]; }
    return $out;
}
