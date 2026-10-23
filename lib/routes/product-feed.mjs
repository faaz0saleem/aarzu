const escape=value=>String(value??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const tag=(key,value)=>`<g:${key}>${escape(value)}</g:${key}>`;
export function productFeed(products,store,origin='https://aarzu.store'){
 const items=products.filter(p=>!p.unlisted&&p.gender==='women'&&p.category!=='giftcard'&&p.images?.length&&Number.isFinite(p.price)&&p.price>0).map(p=>{
 const url=origin+'/product/'+encodeURIComponent(p.slug),fee=p.price>=store.freeShippingThreshold?0:store.shippingFee;
 const fields=[tag('id',p.id),tag('title',`${p.title} - ${p.pieces||3}-Piece Unstitched ${p.fabric||''} Suit`.replace(/\s+/g,' ').slice(0,150)),tag('description',[p.description,...(p.details||[])].filter(Boolean).join('\n').slice(0,5000)),tag('link',url),tag('canonical_link',url),tag('image_link',new URL(p.images[0],origin).href),...p.images.slice(1,11).map(u=>tag('additional_image_link',new URL(u,origin).href)),tag('availability',Object.values(p.stock||{}).some(n=>n>0)?'in_stock':'out_of_stock'),tag('price',p.price.toFixed(2)+' PKR'),tag('condition','new'),tag('gender','female'),tag('age_group','adult'),tag('size',(p.sizes||['Unstitched']).join('/')),tag('material',p.fabric||'Fabric'),tag('product_type',`Women > Unstitched > ${p.pieces||3}-Piece Suits`)];
 if(p.colors?.length)fields.push(tag('color',p.colors.slice(0,3).join('/')));
 if(Number.isFinite(fee))fields.push('<g:shipping>'+tag('country','PK')+tag('price',fee.toFixed(2)+' PKR')+'</g:shipping>');
 return '<item>'+fields.join('')+'</item>';
 });
 return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>Aarzu products</title><link>'+escape(origin)+'/</link><description>Current Aarzu clothing catalogue. Prices in Pakistani rupees.</description>'+items.join('\n')+'</channel></rss>';
}
export function handle(req,res,url,ctx){if(!['/products.xml','/google-products.xml'].includes(url.pathname))return false;if((req.headers.host||'').split(':')[0]===(process.env.ADMIN_HOST||'admin.aarzu.store'))return false;if(!['GET','HEAD'].includes(req.method)){ctx.send(req,res,405,'Use GET for the product feed.','text/plain; charset=utf-8',{'Allow':'GET, HEAD'});return true;}ctx.send(req,res,200,productFeed(ctx.catalog.publicList(),ctx.store()),'application/xml; charset=utf-8',{'Cache-Control':'no-cache','X-Robots-Tag':'noindex'});return true;}
