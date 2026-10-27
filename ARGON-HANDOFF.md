# LuxCheck 本機版：Argon 協作交接

交接日期：2026-10-27（Asia/Taipei）。本文件供 Argon 直接接續維護本機 LuxCheck。

## 1. 專案位置與目前狀態

- 主程式與本機部署目錄：`D:\codex\APP開發\LuxCheck`
- 使用網址：`http://127.0.0.1:4190/`
- 健康檢查：`GET http://127.0.0.1:4190/health`
- 本次實查：首頁 HTTP 200、CAD 入口存在、健康檢查回報 LuxCheck／4190，程序命令列指向上述目錄的 `server.cjs`。
- 本機版本：`local-cad-20261026`。本次比對 `deployment/cad-release-manifest.json` 的 16 個核心檔案，SHA-256 全部相符。
- 此目錄未含 `.git`；不要假設本機 CAD 增強功能已同步到 GitHub。遠端目前版本本次未查驗。
- 原始來源：`https://github.com/new210360-create/LuxCheck`，下載基準 commit：`ebb6e693e39d964b704f15aad94f16a85cc8d49a`。
- 目前只綁定 `127.0.0.1`，沒有設定開機自動啟動。這是一個獨立的本機照明工具。

## 2. 使用者已確定的需求

1. 可上傳 CAD，帶入實際空間尺度與辦公桌位置。
2. 所有辦公桌以 0.75 m（75 cm）桌面計算；其餘區域以地面 0 m 計算。
3. 匯入後可設定燈具發光面距地面的高度進行模擬。
4. 可混用軌道燈、崁燈等燈具，並調整投射傾角、旋轉方向、流明、光束角及調光。
5. 尺度、桌面辨識、燈具配置必須能隨案件儲存與重開。

目前均已實作，實際使用者 CAD 圖尚未提供驗證。下一個優先驗收項目是以真實案件核對尺寸、邊界、桌面圖塊與照度結果。

## 3. 架構與檔案分工

技術為原生 HTML／CSS／JavaScript，使用 `window.LX` 共用模組；2D 使用 Canvas，3D 使用本機 Three.js。後端為原生 Node.js HTTP。沒有前端編譯步驟，也不需在此目錄執行 npm install。

```text
D:\codex\APP開發\LuxCheck\
├─ index.html                   主介面、CAD 匯入對話框、腳本載入順序
├─ css\style.css                深色介面、CAD 預覽、分區結果樣式
├─ js\
│  ├─ main.js                   LX.app 狀態、UI、燈具操作、復原／重做、匯出
│  ├─ cad.js                    DXF 解析後幾何、圖塊展開、輪廓、尺度、桌面
│  ├─ cad-ui.js                 CAD 上傳、圖層／圖塊選擇、預覽、校正、圈選
│  ├─ calc.js                   逐點照度、分區高度／統計、UGR、自動佈燈
│  ├─ photometry.js             IES／LDT 配光解析、通用配光、內插
│  ├─ library.js                預設燈具庫，含軌道燈與崁燈
│  ├─ standards.js              參考檢核值與空間類型
│  ├─ render2d.js               2D CAD 底圖、桌面輪廓、熱圖、等照度線、操作
│  ├─ view3d.js                 3D 空間、75 cm 桌面、燈具與各高度熱圖
│  ├─ report.js                 報告新視窗、分區結果、瀏覽器列印／另存 PDF
│  └─ storage.js                IndexedDB 自動儲存與舊 localStorage 讀取
├─ vendor\                     Three.js r147、OrbitControls、dxf-parser 1.1.2、授權
├─ samples\                    範例 IES 配光檔
├─ server.cjs                   靜態檔服務、健康檢查、DWG 轉換入口
├─ cad-convert.cjs              使用 AutoCAD Core Console 將 DWG 轉為 DXF
├─ Start-LuxCheck.ps1            檢查服務、啟動隱藏程序、開啟瀏覽器
├─ Stop-LuxCheck.ps1             確認程序路徑後停止本服務
├─ 開啟LuxCheck.cmd              使用者雙擊啟動入口
├─ 停止LuxCheck.cmd              使用者雙擊停止入口
├─ server.log / server-error.log 服務日誌
├─ deployment\                 版本雜湊、測試腳本、測試圖與截圖、驗證結果
├─ README-本機部署.md            安裝、操作、限制說明
└─ ARGON-HANDOFF.md              本交接文件
```

主要資料流程：

```text
DXF 檔 ───────────────────────────────┐
DWG 檔 → POST /api/cad/convert         │
        → 本機 AutoCAD → DXF ─────────┤
                                     ↓
 dxf-parser → cad.js 幾何 → cad-ui.js 核對單位／邊界／桌面
                                     ↓
                      LX.app.project（以公尺表示）
                                     ↓
                calc.js 桌面 0.75 m／地面 0 m 計算
                                     ↓
           2D／3D／分區表／PNG／燈具 CSV／PDF 報告
                                     ↓
                  IndexedDB 自動儲存／JSON 匯出
```

`main.js` 非同步讀取專案後發送 `luxcheck-ready`，`cad-ui.js` 接到事件才安裝 CAD 介面與結果更新。修改啟動順序時要保留這項依賴。

## 4. 案件資料實際存在哪裡

**程式資料夾不等於使用者案件資料庫。**

- 自動儲存：使用者目前瀏覽器設定檔、來源 `http://127.0.0.1:4190` 的 IndexedDB。
- IndexedDB 名稱：`luxcheck-local`；object store：`projects`；key：`current`。
- 這是目前案件的單一自動儲存槽，尚未建立多案件清單或伺服器端案件資料夾。
- 若 IndexedDB 沒有案件，啟動時才嘗試讀取舊 `localStorage['luxcheck.project.v1']`。
- 換瀏覽器、換設定檔、改用 `localhost` 或不同 port，都是不同儲存來源。
- 「儲存」按鈕會下載完整 `.luxcheck.json`；實際存放路徑由瀏覽器下載設定決定，不會自動寫到主程式目錄。
- `deployment/cad-test-project.json`、`cad-test-mm.dxf`、`cad-test-native.dwg` 等均是測試資料，不是使用者真實案件。
- DWG 上傳副本及轉換 DXF 位於執行帳號 `%TEMP%\luxcheck-cad-*`，轉換結束會清理。原始 DWG／DXF 應由使用者另行保留；案件 JSON 保存的是解析後幾何、辨識設定及來源雜湊，不含原始 CAD 檔案的完整內容。

接續實際案件前，請使用者在原瀏覽器點「儲存」，保留匯出的 JSON 及原始 CAD。只複製 `LuxCheck` 程式目錄，不會帶走瀏覽器中的目前案件。

目前專案資料重點：

```text
project
  version, name
  room: polygon, L, W, height, wp, margin, mf, rhoC, rhoW, rhoF, grid ...
  standardId, target: Em / UGR / U0 / Ra, lpdLimit, floorTarget
  library: 燈具型號與配光
  fixtures[]: id, typeId, x, y, z, lumens, watts, beam, rot, tilt, dim, on
  cad:
    filename, sourceHash, unit, scale, origin, roles
    sourcePaths, background, sourceWarnings, ignored
    desks[]: id, name, polygon, height, layer, block, sourceId
```

平面 x/y 與燈高 z 使用公尺；`fixtures[].z` 是發光面距地面高度。CAD 原座標經原點平移、單位換算與 Y 軸翻轉後供畫布使用。重校正同一 CAD 的尺寸時，保留燈具會依原 CAD 座標重新換算位置。

CAD 模式 `room.wp=0`，每個格點另判斷是否落在桌面 polygon，桌面高度固定 0.75；不能只讀 `room.wp` 便假設全部在地面，也不能只把桌子在 3D 視覺上抬高。

## 5. 計算與 CAD 行為

- DXF／DWG 上傳限制 30 MB。DXF 在瀏覽器解析；DWG 在同機後端轉換，不使用雲端轉換服務。
- 可選封閉輪廓為空間；也可手動圈選。圖層、圖塊與點選共同決定桌面，名稱比對只是預選，須在預覽核對。
- 支援 LINE、LWPOLYLINE／POLYLINE、圓弧段、ARC、CIRCLE、ELLIPSE、INSERT 與巢狀／旋轉／縮放圖塊；簡單無分叉線段環可組成輪廓。
- 桌面照度保留邊緣格點；牆邊排除帶只作用於 CAD 地面區域。
- 主要平均照度與均齊度使用桌面；沒有桌面時改用地面。各桌面與地面另有獨立統計與判定。
- 地面預設目標 100 lx、U₀ 0.4，100 lx 可調。這是起始設計設定，不代表適用所有空間的法規結論。
- 綜合判定包含各個桌面與地面；桌面無格點會標示未通過，需縮小格點。
- 燈具可逐盞調整、同型號套用或全體批次調整。軌道燈的 `tilt` 與 `rot` 會進入配光方向計算。
- 直接光採逐點法；間接光為均勻近似，UGR 為觀察點估算。

已知限制：家具／隔間尚未參與光線遮擋；HATCH、SPLINE、外部參考等不能假設已完整轉為計算幾何。曲線為取樣線段，文字與尺寸標註不作空間辨識依據。正式用途仍需實圖、實測尺度與配光檔複核。

## 6. 後端與環境

| 項目 | 目前設定 |
| --- | --- |
| Node | `C:\Users\AR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` |
| AutoCAD | `C:\Program Files\Autodesk\AutoCAD 2025\accoreconsole.exe` |
| Listener | `127.0.0.1:4190`，寫在 `server.cjs` |
| 靜態路由 | `/`、`index.html`、`css/`、`js/`、`vendor/`、`samples/` 允許的檔案 |
| 健康檢查 | `GET /health` → app／port／pid |
| DWG 轉換 | `POST /api/cad/convert`，body 是 DWG bytes，Content-Type 為 `application/octet-stream` |
| 轉換限制 | 同時一件、120 秒 timeout、輸出大小限制 100 MB |
| 轉換日誌 | `deployment/last-dwg-conversion.log` |
| 前端依賴 | 本機 `vendor`，正常載入不需要 CDN |

沒有後端案件 CRUD API、集中式案件儲存、帳號驗證或多人編輯機制。若後續要供多人或跨電腦使用，需另行設計這些功能。

在 PowerShell 執行：

```powershell
Set-Location -LiteralPath 'D:\codex\APP開發\LuxCheck'

# 啟動；加 -NoBrowser 可不開啟瀏覽器
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-LuxCheck.ps1 -NoBrowser

# 唯讀確認
Invoke-RestMethod 'http://127.0.0.1:4190/health'

# 修改後端後，以專用腳本重啟
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Stop-LuxCheck.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-LuxCheck.ps1 -NoBrowser
```

前端檔案由 Node 直接提供，修改後重新載入頁面即可；修改 `server.cjs` 或 `cad-convert.cjs` 應重啟服務。修改儲存結構前先匯出使用者案件 JSON。

## 7. 驗證證據與可重跑測試

上一輪已完成的驗證：12 × 8 m／96 m²／3 張桌面、毫米換算、旋轉圖塊、LINE 封閉環、桌面／地面數值、原生 AutoCAD DWG 轉換、混用軌道燈與崁燈、高度／傾角、JSON 重開、IndexedDB 重載、復原、報告、PNG、尺寸校正後燈具位置保留、錯誤 DWG 不覆蓋現有專案。

證據：

- `deployment/cad-ui-verification.json`
- `deployment/cad-boundary-verification.json`
- `deployment/cad-release-manifest.json`
- `deployment/cad-verified-2d.png`、`cad-verified-3d.png`、`dwg-import-preview.png`
- `deployment/cad-test-report.pdf`

這些為上一輪的測試結果；2026-10-27 本次交接只重新檢查服務、檔案及核心雜湊，沒有重新跑整套操作測試。

```powershell
Set-Location -LiteralPath 'D:\codex\APP開發\LuxCheck'
$nodePath = 'C:\Users\AR\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $nodePath .\deployment\test-cad-geometry.cjs
& $nodePath .\deployment\verify-cad-ui.cjs
& $nodePath .\deployment\verify-cad-boundary.cjs
```

瀏覽器測試使用獨立的無頭 Edge context，不讀使用者日常瀏覽器設定檔。測試腳本目前引用本機 bundled Playwright 絕對路徑；搬機時需調整。完整 UI 測試需要本機服務、Edge、AutoCAD 及 `deployment/cad-test-native.dwg`。要重建原生 DWG 測試圖，使用 `deployment/make-native-dwg.cjs`；`make-dwg.scr` 是早期嘗試殘留，不是目前驗證入口。

## 8. 備份與協作方式

- CAD 升級前完整程式備份：`D:\codex\APP開發\system-backups\LuxCheck-before-cad-20261026-151437`。
- 該備份是 CAD 功能加入之前的版本，不是目前 CAD 版的完整回復包。Argon 首次修改前請另外備份目前目錄及使用者匯出的 JSON。
- `deployment/source-manifest.json` 記錄下載時的上游檔案；`cad-release-manifest.json` 記錄本機 CAD 版核心 SHA-256。不要把兩者視為同一版本。
- 先比對核心檔案與服務命令列，再動手修改；若檔案已被其他協作者更新，先讀取變更再合併。
- 建議同一時間只由一位協作者發布／重啟；分工前約定要修改的檔案，避免同改 `main.js`、`calc.js`、`cad-ui.js` 等共用檔案。
- 此次協作範圍為 LuxCheck 目錄。不要因停止 LuxCheck 而終止所有 Node 程序；使用專用 Stop 腳本。
- 完成變更後寫明改動檔案、測試結果、已知限制與備份路徑，並另產生新版本雜湊紀錄，保留舊版紀錄供追溯。

建議 Argon 起手工作：讀本文件 → 比對 16 個核心檔案 → 確認 4190 程序 → 取得真實 CAD 與案件 JSON → 核對實際尺度及桌面位置 → 依具體問題修改對應模組。
