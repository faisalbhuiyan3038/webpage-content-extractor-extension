(()=>{var L={chatgpt:{id:"chatgpt",name:"ChatGPT",url:"https://chatgpt.com",characterLimit:4e4},claude:{id:"claude",name:"Claude",url:"https://claude.ai/new",characterLimit:5e4},gemini:{id:"gemini",name:"Gemini",url:"https://gemini.google.com/app",characterLimit:32e3},grok:{id:"grok",name:"Grok",url:"https://grok.com",characterLimit:1e5},deepseek:{id:"deepseek",name:"DeepSeek",url:"https://chat.deepseek.com",characterLimit:2e5},gemini_studio:{id:"gemini_studio",name:"Gemini AI Studio",url:"https://aistudio.google.com/prompts/new_chat",characterLimit:1e5}},x=[{id:"none",name:"No Prompt (Raw Text Only)",content:"",isDefault:!0},{id:"summary",name:"Bite-Sized Summary",content:`Please summarize the following text in under 100 words.
Instructions
1. The summary should be well formatted and easily scannable.
2. Don't start the text with "Let me...", or "Here is the summary...". Just give the results.
3. Please keep it SHORT, no more than 100 words!`,isDefault:!0},{id:"5-10-points",name:"Key Point Extraction",content:`Please provide the 5-10 most important points from the text.
Use bullet points and emojis to break up the text.`,isDefault:!0},{id:"key-points-summary",name:"Full Detailed Summary",content:`Please provide a summary of the following content in its original tone:
1. First, give a concise one-sentence summary that captures the core message/theme
2. Then, share a breakdown of the main topics discussed. For each topic:
   - Expound very briefly on what was discussed on each topic
   - Include any notable quotes or statistics if any.
3. End with a brief takeaways
4. Don't go beyond 200 words.
5. Don't start the text with "Let me...", or "Here is the summary...". Just give the results.`,isDefault:!0},{id:"short-form",name:"Section-Wise Summary",content:`Summarize the following content how Blinkist would.
Keep the tone of the content. Keep it conversational.
Break the headers using relevant dynamic emojis.
Go beyond the title in giving the summary, look through entire content.
Sprinkle in quotes or excerpts to better link the summary to the content.
For less than 30 mins long content, don't go beyond 150 words.
For 1hr+ long content don't go beyond 300 words.
Don't start the text with "Let me...", or "Here is the summary...". Just give the results.`,isDefault:!0}];var r={selectedPromptId:"summary",selectedChatbotId:"chatgpt",includePrompt:!0,openChatbot:!0,extractionAlgorithm:1},I={1:{id:1,name:"Text Extraction (Lightweight)"},2:{id:2,name:"Optimized Content (Includes YT Transcript)"},3:{id:3,name:"Full Content Extraction (Readability)"}};async function P(){let n=await chrome.storage.sync.get(["settings"]);return{...r,...n.settings||{}}}async function N(n){await chrome.storage.sync.set({settings:n})}async function f(){return(await chrome.storage.sync.get(["customChatbots"])).customChatbots||{}}async function T(n){await chrome.storage.sync.set({customChatbots:n})}async function b(){return(await chrome.storage.sync.get(["customPrompts"])).customPrompts||[]}async function S(n){await chrome.storage.sync.set({customPrompts:n})}async function _(){let n=await chrome.storage.sync.get(null);return{version:"1.0.0",exportDate:new Date().toISOString(),customChatbots:n.customChatbots||{},customPrompts:n.customPrompts||[],settings:n.settings||r}}async function G(n){if(!n||!n.version)throw new Error("Invalid import data format");return await chrome.storage.sync.set({customChatbots:n.customChatbots||{},customPrompts:n.customPrompts||[],settings:n.settings||r}),!0}document.addEventListener("DOMContentLoaded",async()=>{let n=document.querySelectorAll(".tab-btn"),j=document.querySelectorAll(".tab-content"),h=document.getElementById("default-algorithm-select"),z=document.getElementById("add-prompt-btn"),k=document.getElementById("default-prompts-list"),B=document.getElementById("custom-prompts-list"),D=document.getElementById("no-custom-prompts"),q=document.getElementById("add-chatbot-btn"),A=document.getElementById("default-chatbots-list"),O=document.getElementById("custom-chatbots-list"),F=document.getElementById("no-custom-chatbots"),J=document.getElementById("open-shortcuts-btn"),K=document.getElementById("export-btn"),W=document.getElementById("import-btn"),M=document.getElementById("import-file"),Y=document.getElementById("reset-btn"),l=document.getElementById("modal-overlay"),H=document.getElementById("modal-title"),R=document.getElementById("modal-body"),Q=document.getElementById("modal-cancel"),V=document.getElementById("modal-save"),X=document.getElementById("modal-close"),v=document.getElementById("toast"),m=null,i=null;await w(),n.forEach(t=>{t.addEventListener("click",()=>{let e=t.dataset.tab;n.forEach(o=>o.classList.remove("active")),j.forEach(o=>o.classList.remove("active")),t.classList.add("active"),document.querySelector(`[data-content="${e}"]`).classList.add("active")})}),z.addEventListener("click",()=>U()),q.addEventListener("click",()=>$()),J.addEventListener("click",ct),K.addEventListener("click",rt),W.addEventListener("click",()=>M.click()),M.addEventListener("change",lt),Y.addEventListener("click",mt),Q.addEventListener("click",u),X.addEventListener("click",u),l.addEventListener("click",t=>{t.target===l&&u()}),V.addEventListener("click",ot);async function w(){let t=await P();Z(t.extractionAlgorithm||1),await tt(),await E(),await et(),await C()}function Z(t){h.innerHTML="",Object.values(I).forEach(e=>{let o=document.createElement("option");o.value=e.id,o.textContent=e.name,e.id==t&&(o.selected=!0),h.appendChild(o)}),h.addEventListener("change",async()=>{let e=await P();e.extractionAlgorithm=parseInt(h.value),await N(e),a("Default algorithm saved","success")})}async function tt(){k.innerHTML="",x.forEach(t=>{let e=p({name:t.name,subtitle:t.content?t.content.substring(0,80)+"...":"(No prompt text)",isDefault:!0});k.appendChild(e)})}async function E(){let t=await b();if(B.innerHTML="",t.length===0){D.style.display="block";return}D.style.display="none",t.forEach((e,o)=>{let s=p({name:e.name,subtitle:e.content.substring(0,80)+"...",isDefault:!1,onEdit:()=>U(e,o),onDelete:()=>st(o)});B.appendChild(s)})}async function et(){A.innerHTML="",Object.values(L).forEach(t=>{let e=p({name:t.name,subtitle:t.url,isDefault:!0,badge:`${(t.characterLimit/1e3).toFixed(0)}k chars`});A.appendChild(e)})}async function C(){let t=await f();if(O.innerHTML="",Object.keys(t).length===0){F.style.display="block";return}F.style.display="none",Object.values(t).forEach(e=>{let o=p({name:e.name,subtitle:e.url,isDefault:!1,badge:`${(e.characterLimit/1e3).toFixed(0)}k chars`,onEdit:()=>$(e),onDelete:()=>it(e.id)});O.appendChild(o)})}function p({name:t,subtitle:e,isDefault:o,badge:s,onEdit:g,onDelete:ut}){let d=document.createElement("div");d.className=`list-item ${o?"default":""}`;let y=`
            <div class="item-content">
                <div class="item-name">${c(t)}</div>
                <div class="item-subtitle">${c(e)}</div>
            </div>
        `;return s&&(y+=`<span class="item-badge">${s}</span>`),o?y+='<span class="item-badge">Default</span>':y+=`
                <div class="item-actions">
                    <button class="btn-icon edit-btn" title="Edit">\u270F\uFE0F</button>
                    <button class="btn-icon danger delete-btn" title="Delete">\u{1F5D1}\uFE0F</button>
                </div>
            `,d.innerHTML=y,o||(d.querySelector(".edit-btn").addEventListener("click",g),d.querySelector(".delete-btn").addEventListener("click",ut)),d}function U(t=null,e=-1){m="prompt",i=e,H.textContent=t?"Edit Prompt":"Add Prompt",R.innerHTML=`
            <div class="form-group">
                <label for="prompt-name">Prompt Name</label>
                <input type="text" id="prompt-name" class="form-input" 
                    placeholder="e.g., Explain Like I'm 5" 
                    value="${t?c(t.name):""}">
            </div>
            <div class="form-group">
                <label for="prompt-content">Prompt Content</label>
                <textarea id="prompt-content" class="form-textarea" 
                    placeholder="Enter your prompt instructions...">${t?c(t.content):""}</textarea>
                <p class="form-help">This text will be prepended to the extracted content when sent to the chatbot.</p>
            </div>
        `,l.classList.add("show"),document.getElementById("prompt-name").focus()}function $(t=null){m="chatbot",i=t?t.id:null,H.textContent=t?"Edit Chatbot":"Add Chatbot",R.innerHTML=`
            <div class="form-group">
                <label for="chatbot-name">Chatbot Name</label>
                <input type="text" id="chatbot-name" class="form-input" 
                    placeholder="e.g., My Custom AI" 
                    value="${t?c(t.name):""}">
            </div>
            <div class="form-group">
                <label for="chatbot-url">Chat URL</label>
                <input type="url" id="chatbot-url" class="form-input" 
                    placeholder="https://example.com/chat" 
                    value="${t?c(t.url):""}">
                <p class="form-help">The URL where you can paste and chat with the AI.</p>
            </div>
            <div class="form-group">
                <label for="chatbot-limit">Character Limit</label>
                <input type="number" id="chatbot-limit" class="form-input" 
                    placeholder="40000" 
                    value="${t?t.characterLimit:"40000"}">
                <p class="form-help">Maximum characters the chatbot accepts. Default is 40,000.</p>
            </div>
        `,l.classList.add("show"),document.getElementById("chatbot-name").focus()}function u(){l.classList.remove("show"),m=null,i=null}async function ot(){m==="prompt"?await nt():m==="chatbot"&&await at()}async function nt(){let t=document.getElementById("prompt-name").value.trim(),e=document.getElementById("prompt-content").value.trim();if(!t){a("Please enter a prompt name","error");return}let o=await b(),s={id:i>=0?o[i].id:`custom-${Date.now()}`,name:t,content:e};i>=0?o[i]=s:o.push(s),await S(o),await E(),u(),a(i>=0?"Prompt updated!":"Prompt added!","success")}async function st(t){if(!confirm("Are you sure you want to delete this prompt?"))return;let e=await b();e.splice(t,1),await S(e),await E(),a("Prompt deleted","success")}async function at(){let t=document.getElementById("chatbot-name").value.trim(),e=document.getElementById("chatbot-url").value.trim(),o=parseInt(document.getElementById("chatbot-limit").value)||4e4;if(!t||!e){a("Please fill in all fields","error");return}try{new URL(e)}catch{a("Please enter a valid URL","error");return}let s=await f(),g=i||`custom-${Date.now()}`;s[g]={id:g,name:t,url:e,characterLimit:o},await T(s),await C(),u(),a(i?"Chatbot updated!":"Chatbot added!","success")}async function it(t){if(!confirm("Are you sure you want to delete this chatbot?"))return;let e=await f();delete e[t],await T(e),await C(),a("Chatbot deleted","success")}function ct(){navigator.userAgent.includes("Firefox")?chrome.tabs.create({url:"about:addons"}):chrome.tabs.create({url:"chrome://extensions/shortcuts"})}async function rt(){try{let t=await _(),e=new Blob([JSON.stringify(t,null,2)],{type:"application/json"}),o=URL.createObjectURL(e),s=document.createElement("a");s.href=o,s.download=`content-extractor-backup-${new Date().toISOString().split("T")[0]}.json`,document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(o),a("Settings exported successfully!","success")}catch(t){a("Export failed: "+t.message,"error")}}async function lt(t){let e=t.target.files[0];if(e){try{let o=await e.text(),s=JSON.parse(o);if(!s.version)throw new Error("Invalid backup file format");await G(s),await w(),a("Settings imported successfully!","success")}catch(o){a("Import failed: "+o.message,"error")}t.target.value=""}}async function mt(){confirm("Are you sure you want to reset all settings? This will delete all custom prompts and chatbots.")&&confirm("This action cannot be undone. Are you absolutely sure?")&&(await chrome.storage.sync.clear(),await chrome.storage.sync.set({initialized:!0,settings:r,customChatbots:{},customPrompts:[]}),await w(),a("All settings have been reset","success"))}function a(t,e="info"){v.textContent=t,v.className=`toast ${e} show`,setTimeout(()=>{v.classList.remove("show")},3e3)}function c(t){let e=document.createElement("div");return e.textContent=t,e.innerHTML}});})();
