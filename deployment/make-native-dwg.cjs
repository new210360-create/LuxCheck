const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFile}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luxcheck-native-qa-')),out=path.join(dir,'cad-test.dwg').replace(/\\/g,'/');
const script=`(setvar "FILEDIA" 0)
(setvar "CMDECHO" 0)
(setvar "INSUNITS" 4)
(defun lc-rect (lay pts) (entmake (append (list '(0 . "LWPOLYLINE") '(100 . "AcDbEntity") (cons 8 lay) '(100 . "AcDbPolyline") (cons 90 (length pts)) '(70 . 1)) (mapcar '(lambda (p) (cons 10 p)) pts))))
(lc-rect "ROOM-BOUNDARY" '((10000 20000) (22000 20000) (22000 28000) (10000 28000)))
(lc-rect "DESK" '((12000 22000) (13400 22000) (13400 22700) (12000 22700)))
(entmake '((0 . "BLOCK") (2 . "DESK-1400") (70 . 0) (10 0 0 0)))
(lc-rect "0" '((0 0) (1400 0) (1400 700) (0 700)))
(entmake '((0 . "ENDBLK")))
(entmake '((0 . "INSERT") (2 . "DESK-1400") (8 . "FURNITURE") (10 17000 23000 0) (41 . 1.0) (42 . 1.0) (43 . 1.0) (50 . 1.5707963267948966)))
(lc-rect "DESK" '((19000 25000) (20600 25000) (20600 25800) (19000 25800)))
(lc-rect "CHAIR" '((12000 21000) (12600 21000) (12600 21600) (12000 21600)))
(command "_.SAVEAS" "_2018" "${out}")
(command "_.QUIT" "_N")
`;
const scr=path.join(dir,'make.scr');fs.writeFileSync(scr,script,'ascii');
execFile('C:/Program Files/Autodesk/AutoCAD 2025/accoreconsole.exe',['/i','C:/Users/AR/AppData/Local/Autodesk/AutoCAD 2025/R25.0/cht/Template/acadiso.dwt','/s',scr,'/l','en-US'],{cwd:dir,timeout:60000,windowsHide:true,encoding:'buffer',maxBuffer:5e6},(error,stdout,stderr)=>{
 fs.writeFileSync(path.join(__dirname,'native-fixture.log'),stdout.toString('utf16le')+'\n'+stderr.toString('utf16le'));
 if(error||!fs.existsSync(out)){console.error(error?.message||'DWG not generated');console.error(stdout.toString('utf16le'));process.exitCode=1;return;}
 fs.copyFileSync(out,path.join(__dirname,'cad-test-native.dwg'));console.log('Created native DWG '+fs.statSync(out).size+' bytes');
 fs.rmSync(dir,{recursive:true,force:true});
});
