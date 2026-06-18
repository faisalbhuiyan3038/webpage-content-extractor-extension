(()=>{(function(){if(window.__decantPickerActive)return;window.__decantPickerActive=!0;const c="#8B5CF6",P="rgba(139, 92, 246, 0.08)",F="rgba(139, 92, 246, 0.6)",t="decant-picker";let a=null,N=!1,Y=[];const p=/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),u=document.createElement("style");u.id=`${t}-styles`,u.textContent=`
    .${t}-overlay {
      position: fixed;
      pointer-events: none;
      border: 2px solid ${c};
      background: ${P};
      border-radius: 3px;
      z-index: 2147483646;
      transition: all 80ms ease-out;
      box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.2),
                  0 0 12px rgba(139, 92, 246, 0.15);
    }

    .${t}-tooltip {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 500;
      line-height: 1;
      color: #fff;
      background: rgba(15, 15, 20, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 5px 8px;
      border-radius: 4px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(139, 92, 246, 0.3);
      transition: opacity 80ms ease-out;
    }

    .${t}-tooltip-tag {
      color: ${c};
      font-weight: 600;
    }

    .${t}-tooltip-dim {
      color: rgba(255, 255, 255, 0.5);
      margin-left: 6px;
    }

    .${t}-tooltip-class {
      color: #06b6d4;
      margin-left: 4px;
    }

    .${t}-selected-mark {
      position: absolute;
      pointer-events: none;
      border: 2px dashed ${c};
      background: rgba(139, 92, 246, 0.05);
      border-radius: 3px;
      z-index: 2147483645;
    }

    .${t}-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 10px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 13px;
      color: #e8e8ed;
      background: rgba(15, 15, 20, 0.94);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border-bottom: 1px solid rgba(139, 92, 246, 0.3);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      animation: ${t}-slideDown 250ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    .${t}-banner-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .${t}-banner-text {
      flex: 1;
      text-align: center;
    }

    .${t}-banner-text strong {
      color: ${c};
    }

    .${t}-banner-text kbd {
      display: inline-block;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 3px;
      padding: 1px 5px;
      font-family: inherit;
      font-size: 11px;
      margin: 0 2px;
    }

    .${t}-banner-btn {
      padding: 5px 12px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      color: #e8e8ed;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 150ms ease;
      flex-shrink: 0;
    }

    .${t}-banner-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.25);
    }

    .${t}-banner-btn-primary {
      background: ${c};
      border-color: ${c};
      color: #fff;
    }

    .${t}-banner-btn-primary:hover {
      background: #7c3aed;
      border-color: #7c3aed;
    }

    @keyframes ${t}-slideDown {
      from {
        opacity: 0;
        transform: translateY(-100%);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Prevent page interactions while picker is active */
    .${t}-active {
      cursor: crosshair !important;
    }
    .${t}-active * {
      cursor: crosshair !important;
    }
  `,document.head.appendChild(u);const s=document.createElement("div");s.className=`${t}-overlay`,document.body.appendChild(s);const i=document.createElement("div");i.className=`${t}-tooltip`,i.style.opacity="0",document.body.appendChild(i);const m=document.createElement("div");m.className=`${t}-banner`,m.innerHTML=`
    <svg class="${t}-banner-icon" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
      <path d="M13 13l6 6"/>
    </svg>
    <span class="${t}-banner-text">
      <strong>Decant Picker</strong> \u2014 ${p?"Tap an element":"Click an element"} to extract it. ${p?"":"Press <kbd>Esc</kbd> to cancel."}
    </span>
    ${p?`<button class="${t}-banner-btn ${t}-banner-btn-primary" id="${t}-confirm" style="display: none; margin-right: 8px;">Confirm</button>`:""}
    <button class="${t}-banner-btn" id="${t}-cancel">Cancel</button>
  `,document.body.appendChild(m),document.getElementById(`${t}-cancel`).addEventListener("click",e=>{e.stopPropagation(),f(null)}),document.documentElement.classList.add(`${t}-active`);function v(e){const n=e.target;h(n)||(a=n,w(n),g(n,e))}function k(e){a&&!h(e.target)&&g(a,e)}function w(e){const n=e.getBoundingClientRect();s.style.top=`${n.top}px`,s.style.left=`${n.left}px`,s.style.width=`${n.width}px`,s.style.height=`${n.height}px`,s.style.opacity="1"}function g(e,n){const o=e.tagName.toLowerCase(),r=e.getBoundingClientRect(),l=Math.round(r.width),d=Math.round(r.height);let b="";if(e.classList.length>0){const B=Array.from(e.classList).filter(D=>!D.startsWith(t)).slice(0,2);B.length>0&&(b="."+B.join("."))}const y=e.id&&!e.id.startsWith(t)?`#${e.id}`:"";i.innerHTML=`
      <span class="${t}-tooltip-tag">&lt;${o}${y}${b}&gt;</span>
      <span class="${t}-tooltip-dim">${l} \xD7 ${d}</span>
    `,i.style.opacity="1";const $=n.clientX+12,T=n.clientY+16,A=i.getBoundingClientRect(),I=window.innerWidth-A.width-8,j=window.innerHeight-A.height-8;i.style.left=`${Math.min($,I)}px`,i.style.top=`${Math.min(T,j)}px`}function E(e){const n=e.target;if(h(n)){n.id===`${t}-confirm`&&(e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),C());return}e.preventDefault(),e.stopPropagation(),e.stopImmediatePropagation(),a=n,w(n);const o=n.getBoundingClientRect();if(g(n,{clientX:o.left,clientY:o.top}),p){const r=document.getElementById(`${t}-confirm`);r&&(r.style.display="inline-block")}else C()}function C(){if(!a)return;const e=a.cloneNode(!0);S(e);const n=e.outerHTML,o=document.title,r=window.location.href;f({html:`<html><head><title>${z(o)}</title></head><body>${n}</body></html>`,url:r,title:o,domain:window.location.hostname,selector:R(a)})}function L(e){e.key==="Escape"&&(e.preventDefault(),e.stopPropagation(),f(null))}function M(e){e.preventDefault(),e.stopPropagation(),f(null)}document.addEventListener("mouseover",v,!0),document.addEventListener("mousemove",k,!0),document.addEventListener("click",E,!0),document.addEventListener("keydown",L,!0),document.addEventListener("contextmenu",M,!0);function f(e){document.removeEventListener("mouseover",v,!0),document.removeEventListener("mousemove",k,!0),document.removeEventListener("click",E,!0),document.removeEventListener("keydown",L,!0),document.removeEventListener("contextmenu",M,!0),s.remove(),i.remove(),m.remove(),u.remove(),document.documentElement.classList.remove(`${t}-active`),document.querySelectorAll(`.${t}-selected-mark`).forEach(n=>n.remove()),window.__decantPickerActive=!1,a=null,e?chrome.runtime.sendMessage({action:"pickerResult",data:e},n=>{if(chrome.runtime.lastError){x(!1);return}n?.success?x(!0,n.result?.metadata):x(!1)}):chrome.runtime.sendMessage({action:"pickerCancelled"})}function h(e){return e?e.closest(`.${t}-overlay, .${t}-tooltip, .${t}-banner`)!==null||e.classList?.contains(`${t}-overlay`)||e.classList?.contains(`${t}-tooltip`)||e.classList?.contains(`${t}-banner`):!1}function R(e){const n=[];let o=e;for(;o&&o!==document.body&&n.length<5;){let r=o.tagName.toLowerCase();if(o.id){r+=`#${o.id}`,n.unshift(r);break}if(o.classList.length>0){const l=Array.from(o.classList).filter(d=>!d.startsWith(t)).slice(0,2);l.length&&(r+="."+l.join("."))}n.unshift(r),o=o.parentElement}return n.join(" > ")}function S(e){const n=window.location.href;e.querySelectorAll("img[src]").forEach(o=>{try{o.src=new URL(o.getAttribute("src"),n).href}catch{}}),e.querySelectorAll("img[data-src]").forEach(o=>{try{o.setAttribute("data-src",new URL(o.getAttribute("data-src"),n).href)}catch{}}),e.querySelectorAll("a[href]").forEach(o=>{try{const r=o.getAttribute("href");r&&!r.startsWith("#")&&!r.startsWith("javascript:")&&(o.href=new URL(r,n).href)}catch{}})}function z(e){return e?e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"):""}function x(e,n){const o=document.createElement("div"),r=n?.wordCount||0,l=e?"rgba(139, 92, 246, 0.4)":"rgba(239, 68, 68, 0.4)";o.setAttribute("style",["position: fixed","bottom: 24px","right: 24px","z-index: 2147483647","display: flex","align-items: center","gap: 10px","padding: 12px 18px","font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif","font-size: 13px","font-weight: 500","color: #e8e8ed","background: rgba(15, 15, 20, 0.94)","backdrop-filter: blur(16px) saturate(180%)","-webkit-backdrop-filter: blur(16px) saturate(180%)",`border: 1px solid ${l}`,"border-radius: 12px","box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)","transform: translateY(20px)","opacity: 0","transition: all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)","pointer-events: none"].join("; "));const d=e?"#8B5CF6":"#EF4444",b=e?`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${d}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${d}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,y=e&&r?`<span style="color: rgba(255,255,255,0.4); margin-left: 2px;">${r} words</span>`:"",$=e?`Extracted! Copied to clipboard. ${y}`:"Extraction failed";o.innerHTML=`${b}<span>${$}</span>`,document.body.appendChild(o),requestAnimationFrame(()=>{requestAnimationFrame(()=>{o.style.transform="translateY(0)",o.style.opacity="1"})}),setTimeout(()=>{o.style.transform="translateY(20px)",o.style.opacity="0",setTimeout(()=>o.remove(),350)},3500)}})();})();
