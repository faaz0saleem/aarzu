import { state, on, quote, registerRouteHook } from '../core.js';
import { lineKey } from '../pricing.js';
import { ecommerceItems, checkoutPayload, purchasePayload } from '../ecommerce.js';
export const css=false;
const privatePage=url=>/^admin\./i.test(url.hostname)||/^\/(?:admin|account|track|partnerships|promotions)(?:\/|$)/.test(url.pathname);
const loadScript=src=>{const s=document.createElement('script');s.async=true;s.src=src;document.head.append(s);};
export function init(){
  const settings=state.store.analytics||{},headId=document.querySelector('meta[name="aarzu-ga4-id"]')?.content;
  const ga4Id=settings.ga4Id||headId,metaPixelId=settings.metaPixelId;if(!ga4Id&&!metaPixelId)return;
  const headConfigured=!!ga4Id&&headId===ga4Id&&typeof window.gtag==='function';
  if(ga4Id&&!headConfigured){window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};if(!document.querySelector('script[src*="googletagmanager.com/gtag/js"]'))loadScript('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ga4Id));window.gtag('config',ga4Id,{send_page_view:false});}
  if(metaPixelId){if(!window.fbq){const f=window.fbq=function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments);};window._fbq=f;f.push=f;f.loaded=true;f.version='2.0';f.queue=[];loadScript('https://connect.facebook.net/en_US/fbevents.js');}window.fbq('init',metaPixelId);}
  const ga=(event,payload)=>{try{if(ga4Id)window.gtag?.('event',event,{...payload,send_to:ga4Id});}catch{}};
  const fb=(event,payload)=>{try{if(metaPixelId)window.fbq?.('track',event,payload);}catch{}};
  const seen=new Set();
  const purchase=()=>{if(privatePage(new URL(location.href)))return;const p=purchasePayload(state.lastOrder,state.byId);if(!p||seen.has(p.transaction_id))return;try{if(sessionStorage.getItem('az_purchase_'+p.transaction_id))return;}catch{}seen.add(p.transaction_id);ga('purchase',p);fb('Purchase',{currency:'PKR',value:p.value,content_type:'product',content_ids:p.items.map(i=>i.item_id)});try{sessionStorage.setItem('az_purchase_'+p.transaction_id,'1');}catch{}};
  registerRouteHook(url=>{try{if(privatePage(url))return;
    // The existing head tag owns automatic page views. Reuse its loader and configuration.
    if(!headConfigured)ga('page_view',{page_location:url.origin+url.pathname,page_title:document.title});fb('PageView');
    const m=url.pathname.match(/^\/product\/([\w-]+)\/?$/),p=m&&state.bySlug[m[1]];
    if(p){const payload={currency:'PKR',value:p.price,items:ecommerceItems([{id:p.id,unit:p.price,qty:1}],state.byId)};ga('view_item',payload);fb('ViewContent',{content_ids:[p.id],content_name:p.title,value:p.price,currency:'PKR'});}
    if(url.pathname==='/checkout'&&state.cart.length){const payload=checkoutPayload(quote(),state.byId);ga('begin_checkout',payload);fb('InitiateCheckout',{currency:'PKR',value:payload.value});}
  }catch{}});
  let previous=state.cart.map(l=>({...l}));
  on(what=>{try{if(what==='order-placed'){purchase();return;}if(what!=='cart')return;const before=new Map(previous.map(l=>[lineKey(l),Number(l.qty)||0])),added=state.cart.map(l=>({...l,qty:Math.max(0,l.qty-(before.get(lineKey(l))||0))})).filter(l=>l.qty>0);previous=state.cart.map(l=>({...l}));if(!added.length||privatePage(new URL(location.href)))return;const q=quote(),priced=added.map(l=>({...l,unit:q.items.find(i=>lineKey(i)===lineKey(l))?.unit??state.byId[l.id]?.price})),items=ecommerceItems(priced,state.byId),value=Math.round(items.reduce((n,i)=>n+i.price*i.quantity,0)*100)/100;if(items.length){ga('add_to_cart',{currency:'PKR',value,items});fb('AddToCart',{currency:'PKR',value,content_ids:items.map(i=>i.item_id),content_type:'product'});}}catch{}});
  document.addEventListener('change',e=>{try{if(e.target.matches('#co input[name="payment"]')&&['cod','bank','wallet'].includes(e.target.value))ga('add_payment_info',{...checkoutPayload(quote(),state.byId),payment_type:e.target.value});}catch{}});
}
