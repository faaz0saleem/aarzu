<?php
declare(strict_types=1);
function az_marketing_clean($raw): ?array {
    if(!is_array($raw)) return null;
    $out=[];
    foreach(['source','medium','campaign','content'] as $key) {
        $value=is_string($raw[$key]??null)?strtolower(preg_replace('/\s+/','-',trim($raw[$key]))):'';
        if($value!==''&&preg_match('/^[a-z0-9][a-z0-9._-]{0,79}$/D',$value)) $out[$key]=$value;
    }
    return isset($out['source'],$out['medium'],$out['campaign'])?$out:null;
}
function az_marketing_report(array $orders,int $days): array {
    $groups=[]; $untagged=0; $now=time(); $cutoff=(int)floor(($now+18000)/86400)-$days+1;
    foreach($orders as $o) {
        $at=az_time($o['createdAt']??null);
        if(!$at||$at>$now||floor(($at+18000)/86400)<$cutoff) continue;
        $c=az_marketing_clean($o['marketing']??null);
        if(!$c) { $untagged++; continue; }
        $key=json_encode([$c['source'],$c['medium'],$c['campaign'],$c['content']??'']);
        if(!isset($groups[$key])) $groups[$key]=array_merge($c,['orders'=>0,'activeOrders'=>0,'delivered'=>0,'cancelled'=>0,'orderValue'=>0,'deliveredValue'=>0]);
        $g=&$groups[$key]; $g['orders']++;
        if(in_array($o['status'],['cancelled','returned'],true)) { $g['cancelled']++; unset($g); continue; }
        $value=max(0,(float)($o['total']??0)); $g['activeOrders']++; $g['orderValue']+=$value;
        if($o['status']==='delivered') { $g['delivered']++; $g['deliveredValue']+=$value; }
        unset($g);
    }
    $rows=array_values($groups); usort($rows,fn($a,$b)=>($b['orders']<=>$a['orders'])?:strcmp($a['campaign'],$b['campaign']));
    return ['days'=>$days,'generatedAt'=>az_now(),'untaggedOrders'=>$untagged,'campaigns'=>$rows];
}
