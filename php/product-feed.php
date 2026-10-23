<?php
declare(strict_types=1);
function az_feed_escape($value): string { return htmlspecialchars(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/','',(string)$value),ENT_QUOTES|ENT_XML1,'UTF-8'); }
function az_feed_tag(string $key,$value): string { return '<g:'.$key.'>'.az_feed_escape($value).'</g:'.$key.'>'; }
function az_product_feed(): never {
 if(strtolower(explode(':',$_SERVER['HTTP_HOST']??'')[0])===strtolower(az_env('ADMIN_HOST','admin.aarzu.store'))) az_text(404,'Not found');
 if(!in_array($_SERVER['REQUEST_METHOD']??'GET',['GET','HEAD'],true)){header('Allow: GET, HEAD');az_text(405,'Use GET for the product feed.');}
 az_open();$store=az_store();$origin='https://aarzu.store';$items=[];
 foreach(az_catalog() as $p){
 if(!empty($p['unlisted'])||($p['gender']??'')!=='women'||$p['category']==='giftcard'||empty($p['images'])||!is_numeric($p['price'])||$p['price']<=0)continue;
 $url=$origin.'/product/'.rawurlencode($p['slug']);$fee=$p['price']>=$store['freeShippingThreshold']?0:$store['shippingFee'];
 $fields=[az_feed_tag('id',$p['id']),az_feed_tag('title',substr(preg_replace('/\s+/',' ',$p['title'].' - '.($p['pieces']??3).'-Piece Unstitched '.($p['fabric']??'').' Suit'),0,150)),az_feed_tag('description',substr(implode("\n",array_filter(array_merge([$p['description']??''],$p['details']??[]))),0,5000)),az_feed_tag('link',$url),az_feed_tag('canonical_link',$url),az_feed_tag('image_link',str_starts_with($p['images'][0],'/')?$origin.$p['images'][0]:$p['images'][0]),az_feed_tag('availability',count(array_filter($p['stock']??[],fn($n)=>$n>0))?'in_stock':'out_of_stock'),az_feed_tag('price',number_format((float)$p['price'],2,'.','').' PKR'),az_feed_tag('condition','new'),az_feed_tag('gender','female'),az_feed_tag('age_group','adult'),az_feed_tag('size',implode('/',$p['sizes']??['Unstitched'])),az_feed_tag('material',$p['fabric']??'Fabric'),az_feed_tag('product_type','Women > Unstitched > '.($p['pieces']??3).'-Piece Suits')];
 foreach(array_slice($p['images'],1,10) as $image)$fields[]=az_feed_tag('additional_image_link',str_starts_with($image,'/')?$origin.$image:$image);
 if(!empty($p['colors']))$fields[]=az_feed_tag('color',implode('/',array_slice($p['colors'],0,3)));
 $fields[]='<g:shipping>'.az_feed_tag('country','PK').az_feed_tag('price',number_format((float)$fee,2,'.','').' PKR').'</g:shipping>';$items[]='<item>'.implode('',$fields).'</item>';
 }
 header('Cache-Control: no-cache');header('X-Robots-Tag: noindex');az_flush();az_release();az_text(200,'<?xml version="1.0" encoding="UTF-8"?>'."\n".'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Aarzu products</title><link>'.$origin.'/</link><description>Current Aarzu clothing catalogue. Prices in Pakistani rupees.</description>'.implode("\n",$items).'</channel></rss>','application/xml; charset=utf-8');
}
