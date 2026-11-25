// Customer pages only. Preference stays on this device; no server writes.
(()=>{
 const key='teplo:buyer-theme',root=document.documentElement;
 let theme='light';
 const read=()=>{try{return localStorage.getItem(key)==='dark'?'dark':'light'}catch{return theme}};
 function apply(value){
  theme=value==='dark'?'dark':'light';root.dataset.buyerTheme=theme;
  const button=document.getElementById('buyerThemeToggle');
  if(button){
   const label=theme==='dark'?'Включить светлый режим':'Включить тёмный режим';
   button.textContent=theme==='dark'?'☀':'☾';button.setAttribute('aria-label',label);button.setAttribute('title',label);button.setAttribute('aria-pressed',String(theme==='dark'));
  }
  const color=document.querySelector('meta[name="theme-color"]'),scheme=document.querySelector('meta[name="color-scheme"]');
  if(color)color.setAttribute('content',theme==='dark'?'#0b090f':'#ffffff');
  if(scheme)scheme.setAttribute('content',theme);
 }
 apply(read());
 function bind(){
  const button=document.getElementById('buyerThemeToggle');
  if(button)button.addEventListener('click',()=>{
   apply(theme==='dark'?'light':'dark');try{localStorage.setItem(key,theme)}catch{}
  });
  apply(theme);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
 window.addEventListener('pageshow',()=>apply(read()));
 window.addEventListener('storage',event=>{if(event.key===key||event.key===null)apply(read())});
})();
