/* TEPLO pilot icon polish — inline monochrome SVGs, currentColor palette. */
(() => {
 const paths = {
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h2l2.5 6.5M5.5 17.5 10 9h5l-5.5 8.5M8 6h3"/>',
  package: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="M3 8v8l9 5 9-5V8M12 13v8M7.5 5.5l9 5"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5V3h6v1.5M9 11h6M9 15h6"/>',
  store: '<path d="M3 10h18l-2-6H5l-2 6ZM4 10v10h16V10M9 20v-7h6v7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2 20a7 7 0 0 1 14 0M17 5a3 3 0 0 1 0 6M17 14a6 6 0 0 1 5 6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10h18M16 15h2M5 6V4h13"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10 21h4"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>'
 };
 function mount(root=document){
  root.querySelectorAll('[data-teplo-icon]').forEach(target=>{
   const name=target.getAttribute('data-teplo-icon');
   if(!paths[name]||target.dataset.teploIconReady==='true')return;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 24 24');
   svg.setAttribute('fill','none');
   svg.setAttribute('stroke','currentColor');
   svg.setAttribute('stroke-width','1.85');
   svg.setAttribute('stroke-linecap','round');
   svg.setAttribute('stroke-linejoin','round');
   svg.setAttribute('aria-hidden','true');
   svg.innerHTML=paths[name];
   target.replaceChildren(svg);
   target.dataset.teploIconReady='true';
  });
 }
 const css=document.createElement('style');
 css.textContent='[data-teplo-icon]{display:inline-flex;vertical-align:-.19em;align-items:center;justify-content:center;width:1.15em;height:1.15em;flex:none;line-height:1}[data-teplo-icon] svg{display:block;width:100%;height:100%}button [data-teplo-icon],a [data-teplo-icon]{margin-right:.3em}';
 document.head.append(css);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount(),{once:true});
 else mount();
 window.TEPLOIcons={mount};
})();
