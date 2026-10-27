(function(LX){
 'use strict';
 let database;
 function open(){
  if(!database)database=new Promise((resolve,reject)=>{
   const req=indexedDB.open('luxcheck-local',1);
   req.onupgradeneeded=()=>req.result.createObjectStore('projects');
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  return database;
 }
 async function read(){
  try{const db=await open();const value=await new Promise((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});if(value)return value;}catch(e){console.warn('IndexedDB read:',e);}
  try{return JSON.parse(localStorage.getItem('luxcheck.project.v1')||'null');}catch{return null;}
 }
 async function save(project){
  const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('儲存中斷'));});
 }
 LX.storage={read,save};
})(window.LX=window.LX||{});
