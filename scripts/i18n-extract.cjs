// Lists the English text that the guest-facing websites can show, straight from the source:
// JSX text, visible attributes, labels in data lists and messages shown to guests. Used by
// tests/site-i18n.test.mjs to make sure every string has a reviewed translation, and by hand:
//   node scripts/i18n-extract.cjs            → prints strings missing from lib/i18n/translations.json
const ts=require('typescript');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
// Every page a guest can reach (the PMS is English only and is not listed here).
const GUEST_SOURCES=['app/hotel','app/book','app/stay','app/website-chat.tsx','app/restaurant/guest/menu.tsx','app/guest-services.tsx','app/guest-stay-card.tsx','app/guest-push-notifications.tsx','app/excursion-weather.tsx','app/time-field-24.tsx','app/seat-map.tsx','app/passenger-type.tsx'];
const ATTRS=new Set(['placeholder','aria-label','title','alt','label','ariaLabel']);
const NOT_TEXT_KEYS=new Set(['id','href','src','className','icon','image','key','url','photo','type','kind','value','method','mode','variant','tone','as','target','rel','path','slug','unit','pricingUnit','status','role','name','category','group','lang','locale','timeZone','format','color','background','tab','portal','action','source','serviceType','weekday','month','day','year','hour','minute','currency','style','display']);
const human=s=>/[A-Za-z]{2}/.test(s)&&!/^(https?:|mailto:|tel:|\/|#|\.\/|[\w-]+\.(css|tsx?|png|jpe?g|svg|webp|json)$)/.test(s)&&!/^[a-z0-9]+([_-][a-z0-9]+)+$/.test(s)&&!/^[a-z]+[A-Z]\w*$/.test(s)&&!/[{}<>]|=>|\(\)/.test(s)&&!/^(nh|nv|nge|is|has|ws|ag)-/.test(s);
const looksLikeCopy=s=>/\s/.test(s)||/^[A-Z][a-z]/.test(s)||/^[A-Z]{3,}$/.test(s);
const entities=s=>s.replace(/&rsquo;/g,'’').replace(/&lsquo;/g,'‘').replace(/&ldquo;/g,'“').replace(/&rdquo;/g,'”').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&middot;/g,'·').replace(/&mdash;/g,'—').replace(/&ndash;/g,'–').replace(/&times;/g,'×').replace(/&rarr;/g,'→');

function files(){
 const out=[];
 const walk=p=>{const full=path.join(root,p);if(!fs.existsSync(full))return;if(fs.statSync(full).isDirectory()){for(const f of fs.readdirSync(full))walk(path.join(p,f));}else if(/\.tsx?$/.test(p))out.push(p);};
 GUEST_SOURCES.forEach(walk);
 return out;
}

function extract(){
 const found=new Map();
 const add=(s,f)=>{s=entities(s).replace(/\s+/g,' ').trim();if(!s||!human(s))return;if(!found.has(s))found.set(s,new Set());found.get(s).add(f);};
 for(const f of files()){
  const src=fs.readFileSync(path.join(root,f),'utf8');
  const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const inJsx=n=>{for(let p=n.parent;p;p=p.parent){if(ts.isJsxElement(p)||ts.isJsxSelfClosingElement(p)||ts.isJsxFragment(p)||ts.isJsxExpression(p))return true;if(ts.isFunctionLike(p))return false;}return false;};
  const visit=n=>{
   if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n))return;
   if(ts.isJsxText(n))add(n.text,f);
   else if(ts.isJsxAttribute(n)&&n.initializer&&ATTRS.has(n.name.getText())){
    const i=n.initializer;
    if(ts.isStringLiteral(i))add(i.text,f);
    else if(i.expression&&(ts.isStringLiteral(i.expression)||ts.isNoSubstitutionTemplateLiteral(i.expression)))add(i.expression.text,f);
   }
   else if((ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))&&!(n.parent&&ts.isJsxAttribute(n.parent))){
    const p=n.parent,text=n.text;
    const callee=p&&(ts.isCallExpression(p)||ts.isNewExpression(p))?p.expression.getText():'';
    if(p&&ts.isPropertyAssignment(p)&&p.initializer===n){if(!NOT_TEXT_KEYS.has(p.name.getText())&&looksLikeCopy(text))add(text,f);}
    else if(/^(Error|setError|setMessage|setNotice|setStatus|alert|confirm|window\.confirm|window\.alert|localizedConfirm|localizedAlert)$/.test(callee))add(text,f);
    else if(p&&ts.isReturnStatement(p)&&looksLikeCopy(text))add(text,f);
    else if(p&&ts.isArrayLiteralExpression(p)&&/\s/.test(text)&&/^[A-Z]/.test(text))add(text,f);
    else if(inJsx(n)&&looksLikeCopy(text))add(text,f);
    else if(p&&ts.isConditionalExpression(p)&&looksLikeCopy(text))add(text,f);
    else if(p&&ts.isBinaryExpression(p)&&p.operatorToken.kind===ts.SyntaxKind.BarBarToken&&looksLikeCopy(text))add(text,f);
   }
   ts.forEachChild(n,visit);
  };
  visit(sf);
 }
 return found;
}

// Strings that stay as written in every language: brand names, codes, examples, internal status
// values, the agent's WhatsApp voucher, and the reception-only screens that share guest-services.tsx.
const KEEP=new Set(['nirili','whatsapp','rf','mvr','km/h','hh:mm','cc by-sa 4.0','andres larin / saaremees','name@example.com','+960 7xx xxxx','+44 7xxx xxxxxx',
 'unsupported','blocked','enabled','error','your excursion with nirili tours','· departure time to be confirmed']);
const STAFF_ONLY=/^(pending room booking actions|this booking changed\. refresh and try again\.|settle the outstanding balance before checking out\.|guest checked (out|in)\b.*|booking (confirmed|declined)\b.*|the linked booking is no longer active.*|(guest|updated)( confirmation)? email (sent|could not be sent)\.|new bookings and guest change.*|new room bookings|no new room bookings\.|guest changes & cancellations|no guest change or cancellation requests\.|cancellation request|booking change request|confirmed booking remains active until approval|review (request|cancellation|booking changes)|decline booking|confirm & allocate room|(current|requested) (stay|contact|transport)|approved (room|nightly rate \(usd\)|accommodation total:)|the guest requested cancellation\..*|reception note \(optional\)|reject request|approve (cancellation|changes)|guest food orders)$/;

function missing(){
 const source=JSON.parse(fs.readFileSync(path.join(root,'lib/i18n/translations.json'),'utf8'));
 const have=new Set(Object.keys(source).map(k=>k.replace(/\s+/g,' ').trim().toLowerCase()));
 const out=[];
 for(const [s,where] of extract()){
  const key=s.toLowerCase();
  if(have.has(key)||KEEP.has(key)||STAFF_ONLY.test(key))continue;
  // Strings assembled around values ("{x} guests") are covered by number templates or machine translation.
  out.push([s,[...where]]);
 }
 return out;
}

module.exports={extract,missing,GUEST_SOURCES};
if(require.main===module){for(const [s,w] of missing())console.log(JSON.stringify(s),'  ←',w.join(', '));}
