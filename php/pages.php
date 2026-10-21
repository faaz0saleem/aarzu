<?php
declare(strict_types=1);
function az_seo_config(): array {
    $c=az_read(AZ_ROOT.'/public/seo-config.json');
    $site=rtrim(az_env('SITE_URL',$c['siteUrl']),'/');
    if(preg_match('~^https?://[^/]+$~',$site)) $c['siteUrl']=$site;
    return $c;
}
function az_seo_admin(): bool {
    $host=strtolower(explode(':',$_SERVER['HTTP_HOST']??'')[0]);
    return defined('AZ_ADMIN_ENTRY') || $host==='admin.aarzu.store' || ($host!=='' && $host===strtolower(az_env('ADMIN_HOST')));
}
function az_seo_private(string $path): bool { return (bool)preg_match('~^/(?:admin|checkout|order|account|track|wishlist)(?:/|$)~',$path); }
function az_seo_image(string $origin,string $image): string { return preg_match('~^https?://~',$image)?$origin.'/img?u='.rawurlencode($image):$origin.($image?:'/brand/aarzu-logo-stacked.png'); }
function az_seo_label(array $p): string {
    return match($p['category']) {
        'unstitched'=>trim(preg_replace('/\s+/',' ',($p['pieces']??3).'-Piece Unstitched '.($p['fabric']??'').' Suit')),
        'giftcard'=>'Digital Gift Card', 'accessory'=>$p['accessoryType']??'Accessory', default=>'Shalwar Kameez'
    };
}
function az_seo_meta(string $path,array $config,array $products): array {
    $origin=$config['siteUrl']; $product=null;
    if(preg_match('~^/product/([\w-]+)$~',$path,$m)) $product=az_find(array_values($products),fn($p)=>$p['slug']===$m[1]);
    $known=$product || isset($config['pages'][$path]) || preg_match('~^/(?:admin|checkout|account|track|wishlist)$|^/order/[A-Z0-9]+$|^/admin/invoice/[A-Za-z0-9]{1,20}$~',$path);
    $private=az_seo_private($path); $settings=$config['pages'][$path]??[];
    $title=$settings['title']??($private?'Aarzu '.explode('/',$path)[1].' | Aarzu':'Page Not Found | Aarzu');
    $description=$settings['description']??'Manage your Aarzu orders and account.';
    $noindex=az_seo_admin() || !$known || $private || !empty($settings['noindex']);
    if($product) {
        $p=$product; $title=$p['category']==='giftcard'?$p['title'].' | Aarzu':$p['title'].' | '.az_seo_label($p).' | Aarzu';
        $description=$p['category']==='giftcard'?'Choose '.$p['title'].' at Aarzu and add a personal message for your recipient. Digital gift cards activate after payment confirmation.':'Shop '.$p['title'].', '.strtolower(az_seo_label($p)).', for '.az_rs($p['price']).' at Aarzu. Cash on delivery across Pakistan. Check availability and delivery details.';
        $noindex=$noindex || !empty($p['unlisted']);
    }
    if($path==='/shop') {
        $matches=array_filter($products,function($p) {
            if(!empty($p['unlisted'])) return false;
            foreach(['gender','category','collection','occasion'] as $k) if(!empty($_GET[$k]) && ($k==='occasion'?!in_array($_GET[$k],$p['occasions']??[],true):($p[$k]??null)!==$_GET[$k])) return false;
            return true;
        });
        $noindex=$noindex || isset($_GET['q']) || !$matches;
    }
    return ['path'=>$path,'origin'=>$origin,'title'=>$title,'description'=>$description,'canonical'=>$origin.$path,'image'=>az_seo_image($origin,$product['images'][0]??''),'imageAlt'=>$product['title']??'Aarzu — Wear Your Wish','noindex'=>$noindex,'status'=>$known?200:404,'product'=>$product];
}
function az_seo_graph(array $meta,array $config,array $store): array {
    $origin=$meta['origin']; $path=$meta['path']; $p=$meta['product'];
    $organization=['@type'=>'OnlineStore','@id'=>$origin.'/#organization','name'=>$config['siteName'],'alternateName'=>$config['alternateNames'],'url'=>$origin.'/','logo'=>$origin.'/brand/aarzu-logo.png','areaServed'=>['@type'=>'Country','name'=>'Pakistan']];
    $sameAs=array_values(array_filter($store['social']??[],fn($u)=>parse_url($u,PHP_URL_SCHEME)==='https' && strlen(str_replace('/','',parse_url($u,PHP_URL_PATH)??''))>0));
    if($sameAs) $organization['sameAs']=$sameAs;
    $graph=[$organization,['@type'=>'WebSite','@id'=>$origin.'/#website','name'=>$config['siteName'],'alternateName'=>$config['alternateNames'],'url'=>$origin.'/','publisher'=>['@id'=>$organization['@id']],'inLanguage'=>'en-PK']];
    if($meta['status']===404 || az_seo_private($path)) return $graph;
    $graph[]=['@type'=>$path==='/shop'?'CollectionPage':'WebPage','@id'=>$meta['canonical'].'#webpage','url'=>$meta['canonical'],'name'=>$meta['title'],'description'=>$meta['description'],'isPartOf'=>['@id'=>$origin.'/#website'],'inLanguage'=>'en-PK'];
    $crumbs=[['Home','/']];
    if($p) {
        $crumbs[]=$p['category']==='giftcard'?['Gift cards','/gift-cards']:['Shop','/shop']; $crumbs[]=[$p['title'],$path];
        $offer=['@type'=>'Offer','url'=>$meta['canonical'],'priceCurrency'=>'PKR','price'=>$p['price'],'availability'=>'https://schema.org/'.(array_sum($p['stock']??[])>0?'InStock':'OutOfStock'),'itemCondition'=>'https://schema.org/NewCondition','seller'=>['@id'=>$organization['@id']]];
        if($p['category']!=='giftcard') $offer['shippingDetails']=['@type'=>'OfferShippingDetails','shippingDestination'=>['@type'=>'DefinedRegion','addressCountry'=>'PK'],'shippingRate'=>['@type'=>'MonetaryAmount','value'=>$p['price']>=$store['freeShippingThreshold']?0:$store['shippingFee'],'currency'=>'PKR']];
        $item=['@type'=>'Product','@id'=>$meta['canonical'].'#product','name'=>$p['title'],'description'=>($p['description']??'')?:$meta['description'],'url'=>$meta['canonical'],'sku'=>$p['id'],'image'=>array_map(fn($u)=>az_seo_image($origin,$u),$p['images']??[]),'offers'=>$offer];
        if(!empty($p['fabric'])) $item['material']=$p['fabric'];
        if(($p['collection']??'')==='originals') $item['brand']=['@type'=>'Brand','name'=>$config['siteName']];
        $reviews=array_values(array_filter(az_db('reviews'),fn($r)=>$r['productId']===$p['id']&&$r['rating']>=1&&$r['rating']<=5));
        if($reviews) $item['aggregateRating']=['@type'=>'AggregateRating','ratingValue'=>round(array_sum(array_column($reviews,'rating'))/count($reviews),1),'reviewCount'=>count($reviews),'bestRating'=>5,'worstRating'=>1];
        $graph[]=$item;
    } elseif($path!=='/') $crumbs[]=[explode(' | ',$meta['title'])[0],$path];
    if(count($crumbs)>1) { $list=[]; foreach($crumbs as $i=>$c) $list[]=['@type'=>'ListItem','position'=>$i+1,'name'=>$c[0],'item'=>$origin.$c[1]]; $graph[]=['@type'=>'BreadcrumbList','itemListElement'=>$list]; }
    return $graph;
}
function az_page(string $path): never {
    $config=az_seo_config(); $origin=$config['siteUrl']; $admin=az_seo_admin();
    if($admin) header('X-Robots-Tag: noindex, nofollow');
    if(in_array($path,['/','/index.html'],true) && $admin) { header('Location: /admin',true,302); exit; }
    if($path==='/robots.txt') az_text(200,$admin?"User-agent: *\nDisallow: /\n":"User-agent: *\nAllow: /\nAllow: /api/catalog$\nDisallow: /api/\nDisallow: /data/\nDisallow: /php/\nDisallow: /lib/\nDisallow: /scripts/\nDisallow: /node_modules/\nSitemap: ".$origin."/sitemap.xml\n");
    if(preg_match('~\.[^/]+$~',$path)&&!in_array($path,['/sitemap.xml','/index.html'])) az_text(404,'Not found');
    if(preg_match('~^/(?:data|php|lib|scripts|node_modules|public)(?:/|$)~',$path)) az_text(404,'Not found');
    $clean=$path==='/index.html'?'/':(rtrim($path,'/')?:'/');
    if($clean!==$path) { $query=parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_QUERY); header('Location: '.$clean.($query?'?'.$query:''),true,301); exit; }
    az_open(); $products=az_catalog(); $store=az_store();
    if($path==='/sitemap.xml') {
        if($admin) az_text(404,'Not found');
        $pages=[]; foreach($config['pages'] as $page=>$meta) if(empty($meta['noindex'])) $pages[]=$page;
        foreach($products as $p) if(empty($p['unlisted'])) $pages[]='/product/'.$p['slug'];
        $xml='<?xml version="1.0" encoding="UTF-8"?>'."\n".'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'."\n";
        foreach(array_unique($pages) as $page) $xml.='<url><loc>'.az_h($origin.$page)."</loc></url>\n";
        az_text(200,$xml.'</urlset>','application/xml; charset=utf-8');
    }
    $meta=az_seo_meta($path,$config,$products);
    $tags='<link rel="canonical" href="'.az_h($meta['canonical']).'"><meta name="robots" content="'.($meta['noindex']?'noindex,follow':'index,follow,max-image-preview:large').'">';
    foreach(['site_name'=>$config['siteName'],'type'=>$meta['product']?'product':'website','title'=>$meta['title'],'description'=>$meta['description'],'image'=>$meta['image'],'image:alt'=>$meta['imageAlt'],'url'=>$meta['canonical'],'locale'=>'en_PK'] as $key=>$value) $tags.='<meta property="og:'.$key.'" content="'.az_h($value).'">';
    foreach(['card'=>'summary_large_image','title'=>$meta['title'],'description'=>$meta['description'],'image'=>$meta['image'],'image:alt'=>$meta['imageAlt']] as $key=>$value) $tags.='<meta name="twitter:'.$key.'" content="'.az_h($value).'">';
    if($meta['product']) $tags.='<meta property="product:price:amount" content="'.$meta['product']['price'].'"><meta property="product:price:currency" content="PKR">';
    $tags.='<script id="aarzu-seo-config" type="application/json">'.str_replace('<','\u003c',json_encode($config,AZ_JSON)).'</script>';
    $tags.='<script id="aarzu-structured-data" type="application/ld+json">'.str_replace('<','\u003c',json_encode(['@context'=>'https://schema.org','@graph'=>az_seo_graph($meta,$config,$store)],AZ_JSON)).'</script>';
    $html=file_get_contents(AZ_ROOT.'/public/index.html');
    $html=preg_replace_callback('~<title>[^<]*</title>~',fn()=>'<title>'.az_h($meta['title']).'</title>',$html);
    $html=preg_replace_callback('~<meta name="description" content="[^"]*">~',fn()=>'<meta name="description" content="'.az_h($meta['description']).'">',$html);
    $html=str_replace('</head>',$tags."\n</head>",$html);
    if($meta['noindex']) header('X-Robots-Tag: noindex, follow');
    header('Cache-Control: no-cache'); header('X-Frame-Options: SAMEORIGIN'); header('Referrer-Policy: strict-origin-when-cross-origin');
    az_text($meta['status'],$html,'text/html; charset=utf-8');
}
