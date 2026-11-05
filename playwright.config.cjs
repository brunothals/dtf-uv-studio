const {defineConfig}=require('@playwright/test');
const fs=require('node:fs');
const candidates=[process.env.CHROMIUM_PATH,'/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
const executablePath=candidates.find(p=>fs.existsSync(p));
module.exports=defineConfig({testDir:'./tests/browser',workers:2,use:{baseURL:'http://127.0.0.1:3000',headless:true,launchOptions:executablePath?{executablePath}:{}},webServer:[{command:'python3 -m http.server 3000 --bind 0.0.0.0',url:'http://127.0.0.1:3000',reuseExistingServer:true},{command:'npm run dev:montadora -- --port 5174 --strictPort',url:'http://127.0.0.1:5174',reuseExistingServer:true}],projects:[{name:'desktop',use:{viewport:{width:1280,height:900}}},{name:'mobile',use:{viewport:{width:390,height:844}}}]});
