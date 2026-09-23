// ========================================
// 爸媽的照顧網站 - script.js
// 全部分頁（看診時間表／病歷資料／檢查排程／照顧記錄／長照申請進度／購物墊款清單）都連線
// Supabase 資料庫（test0920 專案），這樣不管用哪一台電腦或手機打開網站，看到的都是同一份最新資料
// 網站同時記錄「爸爸」跟「媽媽」的資料，每一筆資料都有 person 欄位標記，
// 點上方照片切換人物時，畫面只會顯示那個人的資料
// ========================================

// ---------------------------------------
// Supabase 連線設定
// ---------------------------------------

const SUPABASE_URL = "https://xkbbhgguctgkkgoogtlf.supabase.co";
// 這是「anon key」，只能讀寫我們開放的看診記錄資料表，屬於公開金鑰，
// 放在前端網頁裡是正常的用法（不是密碼）
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhrYmJoZ2d1Y3Rna2tnb29ndGxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4ODAxNDgsImV4cCI6MjEwNTQ1NjE0OH0.dhwY7Vbp9l7KWbuxgUwV1ex9Q9A-1_RTW-Bnxw4iFzw";

// 建立 Supabase 用戶端（window.supabase 是從 index.html 載入的官方函式庫）
let supabaseClient = null;
if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.error("Supabase 函式庫沒有載入成功，看診記錄將無法使用。");
}

// 更新畫面最上方的連線狀態文字
function setVisitSyncStatus(text) {
  const el = document.getElementById("visit-sync-status");
  if (el) {
    el.textContent = text;
  }
}

// ---------------------------------------
// 資料格式轉換：網頁上用的欄位名稱 <-> Supabase 資料表的欄位名稱
// ---------------------------------------

// Supabase 的 visits 資料表：visit_date、visit_time、hospital、doctor、
// caregiver1、caregiver2、note、person、id
// 網頁表單／表格用的欄位名稱：date、time、hospital、doctor、
// caregiver1、caregiver2、note、person

// 把從 Supabase 讀回來的一列資料，轉成網頁畫面用的格式
function mapRowToVisitItem(row) {
  return {
    id: row.id, // 記住這筆資料在資料庫裡的編號，之後編輯／刪除要用
    date: row.visit_date || "",
    time: row.visit_time ? row.visit_time.substring(0, 5) : "", // "10:30:00" -> "10:30"
    hospital: row.hospital || "",
    doctor: row.doctor || "",
    caregiver1: row.caregiver1 || "",
    caregiver2: row.caregiver2 || "",
    note: row.note || "",
    person: row.person || "dad",
  };
}

// 把網頁畫面上的一筆資料，轉成要寫進 Supabase 的格式
function mapVisitItemToRow(item) {
  return {
    visit_date: item.date || null,
    visit_time: item.time || null,
    hospital: item.hospital || "",
    doctor: item.doctor || "",
    caregiver1: item.caregiver1 || "",
    caregiver2: item.caregiver2 || "",
    note: item.note || "",
    person: item.person || "dad",
  };
}

// 從 Supabase 讀取看診記錄（爸爸媽媽的資料都讀出來，依日期、時間排序）
// 看診時間表有自己的「對象」下拉選單可以篩選，所以這裡不先用 currentPerson 過濾，
// 全部讀回來、交給畫面渲染時再依下拉選單決定要顯示誰的資料
async function fetchVisitsFromSupabase() {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("visits")
    .select("*")
    .order("visit_date", { ascending: true })
    .order("visit_time", { ascending: true });

  if (error) {
    console.error("讀取看診記錄失敗：", error);
    setVisitSyncStatus("⚠️ 讀取看診記錄失敗，請確認網路連線後重新整理頁面。");
    return [];
  }

  return data.map(mapRowToVisitItem);
}

// 重新從 Supabase 抓最新的看診記錄，並且重畫看診記錄那個表格
async function refreshVisitList() {
  allData.visit = await fetchVisitsFromSupabase();
  renderList("visit");
}

// ---------------------------------------
// 病歷資料／檢查排程／照顧記錄／長照申請進度／購物墊款清單：都改成連線 Supabase（test0920 專案）
// 這些分類的資料表欄位名稱都跟網頁上用的欄位名稱完全一樣，所以不需要另外寫轉換函式，
// 直接把 Supabase 讀回來的資料當作 allData[category] 使用即可
// （看診時間表比較特別，欄位名稱不一樣，另外用 mapRowToVisitItem／mapVisitItemToRow 轉換）
// ---------------------------------------

// 這些分類都改成連線 Supabase，不再存 localStorage
const SUPABASE_SYNCED_CATEGORIES = [
  "medical",
  "ltc",
  "shopping",
  "labTest",
  "examCheck",
  "radiology",
  "care",
  "advance",
];

// 對應到 Supabase 裡的資料表名稱
const SUPABASE_TABLE_NAME = {
  medical: "medical_records",
  ltc: "ltc_records",
  shopping: "shopping_items",
  labTest: "lab_tests",
  examCheck: "exam_checks",
  radiology: "radiology_records",
  care: "care_records",
  advance: "advance_records",
};

// 從 Supabase 讀取某個分類底下的資料（爸爸媽媽的都讀出來，依新增順序排序）
// 病歷資料還是依照上方頭像切換的 currentPerson 過濾；
// 長照申請進度、需要購買清單則有自己的「對象」下拉選單，所以這裡都先讀全部資料，
// 實際要顯示誰的，交給畫面渲染時再決定
async function fetchCategoryFromSupabase(category) {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from(SUPABASE_TABLE_NAME[category])
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`讀取「${category}」資料失敗：`, error);
    return [];
  }

  return data;
}

// 重新從 Supabase 抓某個分類的最新資料，並且重畫對應的表格
async function refreshCategoryList(category) {
  allData[category] = await fetchCategoryFromSupabase(category);

  if (category === "medical") {
    renderMedicalList();
  } else if (category === "shopping") {
    renderShoppingList();
  } else if (EXAM_CATEGORIES.includes(category)) {
    // 檢驗單／檢查單／放射單是合併成同一個表格顯示的，改用 renderExamList
    renderExamList();
  } else {
    renderList(category);
  }
}

// 新增一筆資料到 Supabase（medical／ltc／shopping 共用）
async function insertCategoryItem(category, newItem) {
  if (!supabaseClient) {
    alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
    return;
  }
  const { error } = await supabaseClient.from(SUPABASE_TABLE_NAME[category]).insert(newItem);
  if (error) {
    console.error(`新增「${category}」資料失敗：`, error);
    alert("新增失敗，請稍後再試。");
    return;
  }
  await refreshCategoryList(category);
}

// 更新一筆資料到 Supabase（medical／ltc／shopping 共用），依 id 找到那一列
async function updateCategoryItem(category, item, changes) {
  if (!supabaseClient) {
    alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
    return;
  }
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE_NAME[category])
    .update(changes)
    .eq("id", item.id);
  if (error) {
    console.error(`更新「${category}」資料失敗：`, error);
    alert("更新失敗，請稍後再試。");
    return;
  }
  await refreshCategoryList(category);
}

// 刪除一筆資料（medical／ltc／shopping 共用），依 id 找到那一列
async function deleteCategoryItem(category, item) {
  if (!supabaseClient) {
    alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
    return;
  }
  const { error } = await supabaseClient
    .from(SUPABASE_TABLE_NAME[category])
    .delete()
    .eq("id", item.id);
  if (error) {
    console.error(`刪除「${category}」資料失敗：`, error);
    alert("刪除失敗，請稍後再試。");
    return;
  }
  await refreshCategoryList(category);
}

// 照顧者下拉選單的選項（第一個空字串代表「留白」）
const CAREGIVER_OPTIONS = ["", "甄", "瑤", "慈", "書", "沛"];

// 病歷資料的病症分類選項（第一個空字串代表「留白」，方便把不同時期的病歷依科別分組）
const MEDICAL_CATEGORY_OPTIONS = [
  "",
  "神經內科",
  "泌尿科",
  "內分泌科",
  "耳鼻喉科",
  "脊椎骨科",
  "其他",
];

// 分組顯示時的分類順序（「其他」已經包含在上面的選項清單裡了）
const MEDICAL_GROUP_ORDER = MEDICAL_CATEGORY_OPTIONS.filter((c) => c);

// 依標題裡的關鍵字，猜出這筆病歷屬於哪個分類
// （舊資料在新增「分類」欄位之前就已經存在，沒有分類資訊，所以用關鍵字判斷）
function inferMedicalCategory(item) {
  if (item.category) {
    return item.category; // 已經有分類就直接用
  }
  const text = (item.title || "") + (item.note || "");
  if (text.includes("血壓") || text.includes("血糖") || text.includes("糖尿")) {
    return "內分泌科";
  }
  if (text.includes("攝護腺") || text.includes("泌尿")) {
    return "泌尿科";
  }
  if (text.includes("失智") || text.includes("神經內科")) {
    return "神經內科";
  }
  if (text.includes("骨折") || text.includes("跌倒")) {
    return "脊椎骨科";
  }
  if (text.includes("聽力") || text.includes("耳鼻喉")) {
    return "耳鼻喉科";
  }
  return "其他";
}

// 目前選擇要看誰的資料，預設是爸爸；點上方照片可以切換
let currentPerson = "dad";

// 檢查排程底下的三個子分類
const EXAM_CATEGORIES = ["labTest", "examCheck", "radiology"];

// 每個子分類拿來判斷「有效期限」的欄位
// 檢驗單看「有效期限迄」，檢查單／放射單則看「檢查日期」
const EXAM_DATE_FIELD = {
  labTest: "validTo",
  examCheck: "examDatetime",
  radiology: "examDate",
};

// 檢查排程目前的篩選條件：單據類別（all / labTest / examCheck / radiology）
// 跟顯示範圍（valid=未過期 / all=全部 / expired=已過期）
const examFilters = {
  category: "all",
  status: "valid",
};

// 舊版留下來的 localStorage key 名稱，現在所有分類都已經改連線 Supabase，
// 這裡保留只是避免其他還沒清乾淨的地方讀取時出錯
const STORAGE_KEY = "dadCareData";

// 各分類的欄位設定：
// 每個欄位包含 key（存資料用的名稱）跟 type（編輯時要顯示哪種輸入框）
// type 可以是 "date"、"time"、"text"、"textarea"、"select"
// "textarea" 是多行文字框，可以按 Enter 換行（備註欄位都用這個）
// 如果是 select，要另外提供 options（選項清單）
const CONFIG = {
  medical: {
    fields: [
      { key: "category", type: "select", options: MEDICAL_CATEGORY_OPTIONS },
      { key: "date", type: "date" },
      { key: "title", type: "text" },
      { key: "note", type: "textarea" },
    ],
  },
  // 檢查排程底下的三個子分類：檢驗單、檢查單、放射單
  labTest: {
    fields: [
      { key: "department", type: "text" },
      { key: "doctor", type: "text" },
      { key: "validFrom", type: "date" },
      { key: "validTo", type: "date" },
      { key: "specimen", type: "text" },
    ],
  },
  examCheck: {
    fields: [
      { key: "item", type: "text" },
      { key: "doctor", type: "text" },
      { key: "examDatetime", type: "datetime-local" },
      { key: "location", type: "text" },
    ],
  },
  radiology: {
    fields: [
      { key: "department", type: "text" },
      { key: "doctor", type: "text" },
      { key: "examDate", type: "date" },
      { key: "location", type: "text" },
    ],
  },
  visit: {
    // 這個分類的資料不是存在 localStorage，而是存在 Supabase
    fields: [
      { key: "date", type: "date" },
      { key: "time", type: "time" },
      { key: "hospital", type: "text" },
      // 醫師欄位不在網站上顯示／編輯，資料仍保留在 Supabase 裡（見 mapRowToVisitItem）
      // 照顧者：兩個獨立欄位（列表跟編輯都各自顯示），
      // 讓不同的人可以各自選擇哪一天來照顧爸爸
      { key: "caregiver1", type: "select", options: CAREGIVER_OPTIONS },
      { key: "caregiver2", type: "select", options: CAREGIVER_OPTIONS },
      { key: "note", type: "textarea" }, // 備註，保留空白
    ],
  },
  care: {
    fields: [
      { key: "date", type: "date" },
      { key: "content", type: "text" },
      { key: "note", type: "textarea" },
    ],
  },
  ltc: {
    fields: [
      { key: "item", type: "text" },
      {
        key: "status",
        type: "select",
        options: ["待決議", "申請中", "審核中", "已核准", "已完成"],
      },
      { key: "date", type: "date" },
      { key: "note", type: "textarea" },
    ],
  },
  // 代墊款：欄位順序依「日期 → 項目 → 金額 → 代墊款人 → 備註」呈現，
  // 方便一眼看出「什麼時候、代墊了什麼、花多少錢、誰先墊的」
  advance: {
    fields: [
      { key: "date", type: "date" },
      {
        key: "item",
        type: "select",
        options: ["輔具", "長照服務", "診療費", "醫療物資"],
      },
      { key: "amount", type: "number" },
      { key: "payer", type: "select", options: ["甄", "瑤", "慈", "書", "沛"] },
      { key: "note", type: "textarea" },
    ],
  },
  // 需要購買清單：欄位順序「是否已購買 → 項目 → 備註」，
  // 已購買可以直接在列表上打勾，不用進到編輯模式
  shopping: {
    fields: [
      { key: "purchased", type: "checkbox" },
      { key: "item", type: "text" },
      { key: "note", type: "textarea" },
    ],
  },
};

// ---------------------------------------
// 讀取 / 儲存資料的小工具（病歷／用藥／照顧／長照申請進度用）
// ---------------------------------------

// 從 localStorage 讀出全部資料，如果沒有資料就給預設空陣列
function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // 第一次使用，建立每個分類的空陣列
    const empty = {};
    Object.keys(CONFIG).forEach((key) => {
      empty[key] = [];
    });
    return empty;
  }
  return JSON.parse(raw);
}

// 把資料寫回 localStorage
function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// 目前所有資料，放在記憶體裡方便操作
// （visit 這個分類一開始是空陣列，等連上 Supabase 讀到資料後才會填進來）
let allData = loadData();

// 保護機制：如果網站更新後多了新的分類（例如新增檢驗單／檢查單／放射單），
// 但使用者瀏覽器裡存的還是舊資料、沒有這些分類，這裡幫忙補上空陣列，
// 避免程式讀到 undefined 而整個中斷
Object.keys(CONFIG).forEach((key) => {
  if (!allData[key]) {
    allData[key] = [];
  }
});

// ---------------------------------------
// 畫面渲染：把資料畫成表格列
// ---------------------------------------

// 建立一般顯示用的儲存格（純文字）
function createDisplayCell(text) {
  const td = document.createElement("td");
  td.textContent = text || "";
  return td;
}

// 建立編輯模式用的儲存格（依欄位 type 建立對應的輸入元件）
function createEditCell(field, currentValue) {
  const td = document.createElement("td");
  let input;

  if (field.type === "select") {
    input = document.createElement("select");
    field.options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      if (optionValue === currentValue) {
        option.selected = true;
      }
      input.appendChild(option);
    });
  } else if (field.type === "textarea") {
    // 備註欄位用多行文字框，讓使用者可以按 Enter 換行
    input = document.createElement("textarea");
    input.rows = 3;
    input.value = currentValue || "";
  } else if (field.type === "checkbox") {
    // 「是否已購買」用打勾方塊，不是輸入文字
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!currentValue;
  } else {
    input = document.createElement("input");
    input.type = field.type; // date、time 或 text
    input.value = currentValue || "";
  }

  input.dataset.fieldKey = field.key; // 記住這個輸入框對應哪個欄位
  if (field.type !== "checkbox") {
    input.className = "edit-input";
  }
  td.appendChild(input);
  return td;
}

// 目前各分類的搜尋條件（只有 visit 會用到日期起迄）
// 例如 { visit: { start: "2026-01-01", end: "2026-12-31" } }
const searchFilters = {};

// 病歷資料目前選擇的搜尋分類，"all" 代表全部都顯示
let medicalSearchCategory = "all";

// ---------------------------------------
// 日期排序：每個頁簽的表頭都可以點「日期」文字切換升冪／降冪
// ---------------------------------------

// 各分類目前的日期排序方向，"desc" 是新到舊（或遠到近），"asc" 是舊到新（或近到遠）
// 長照申請進度預設「desc」：從最遠的日期開始，往過去排
const dateSortDirection = {
  medical: "desc",
  exam: "desc",
  visit: "asc",
  care: "desc",
  ltc: "desc",
  advance: "desc",
};

// 依目前的排序方向，回傳表頭要顯示的箭頭符號
function dateSortArrow(category) {
  return dateSortDirection[category] === "asc" ? " ▲" : " ▼";
}

// 點一下「日期」表頭，切換升冪／降冪，並重新畫出對應的表格
function toggleDateSort(category) {
  dateSortDirection[category] = dateSortDirection[category] === "asc" ? "desc" : "asc";

  if (category === "medical") {
    renderMedicalList();
  } else if (category === "exam") {
    renderExamList();
  } else {
    renderList(category);
  }
}

// 更新表頭上的箭頭符號，顯示目前是升冪還是降冪（每次重畫表格都要呼叫一次）
function updateDateSortHeaderArrow(category) {
  const th = document.getElementById(category + "-date-header");
  if (th) {
    th.textContent = "日期" + dateSortArrow(category);
  }
}

// 幫「日期」表頭加上可以點擊排序的功能（只在網頁載入時設定一次）
function setupDateSortHeader(category) {
  const th = document.getElementById(category + "-date-header");
  if (!th) {
    return;
  }
  th.addEventListener("click", () => {
    toggleDateSort(category);
  });
}

// 判斷這筆資料是不是「目前選擇的人物」的資料
// 舊資料沒有標記 person 欄位，一律當作是爸爸的資料
function matchesPersonFilter(item) {
  const itemPerson = item.person || "dad";
  return itemPerson === currentPerson;
}

// ---------------------------------------
// 「對象」下拉選單：看診時間表、長照申請進度、購物/墊款清單這三個頁簽，
// 除了上方頭像可以切換爸爸／媽媽，還可以另外用下拉選單選「全部」，
// 方便小孩不用一直切換頭像，就能同時看到兩人的資料
// advance（已代墊款項）跟 shopping（需要購買清單）在同一個頁簽裡，共用同一個下拉選單
// ---------------------------------------

const TAB_PERSON_FILTER_CATEGORIES = {
  visit: "visit",
  ltc: "ltc",
  advance: "advance",
  shopping: "advance",
};

// 各頁簽目前選擇的「對象」："all"（全部）、"dad"（爸爸）、"mom"（媽媽）
// 預設值會跟著上方頭像切換的人物走（見 applyPersonDefaultToTabFilters）
const tabPersonFilter = {
  visit: "dad",
  ltc: "dad",
  advance: "dad",
};

// 「對象」欄位要顯示的中文字
function personLabel(person) {
  return (person || "dad") === "mom" ? "媽媽" : "爸爸";
}

// 判斷這筆資料是否符合「對象」下拉選單目前的篩選條件
function matchesTabPersonFilter(category, item) {
  const filterKey = TAB_PERSON_FILTER_CATEGORIES[category];
  const filterValue = filterKey ? tabPersonFilter[filterKey] : null;
  if (!filterValue || filterValue === "all") {
    return true; // 選「全部」，或這個分類沒有下拉選單，都不過濾
  }
  return (item.person || "dad") === filterValue;
}

// ---------------------------------------
// 關鍵字搜尋：每個頁簽的搜尋列都可以輸入關鍵字，直接比對這個分類（CONFIG 裡）
// 設定的所有文字欄位，只要有一個欄位包含關鍵字（不分大小寫）就算符合
// ---------------------------------------

// 各頁簽目前輸入的關鍵字，key 是 CONFIG 裡的分類名稱；"exam" 比較特別，
// 因為檢查排程是三個分類（labTest／examCheck／radiology）合併顯示，共用同一個關鍵字
const keywordFilters = {
  medical: "",
  exam: "",
  visit: "",
  care: "",
  ltc: "",
  advance: "",
  shopping: "",
};

// 判斷某個分類的一筆資料，欄位內容是否包含指定的關鍵字
function textIncludesKeyword(category, item, keyword) {
  if (!keyword) {
    return true; // 沒有輸入關鍵字，全部顯示
  }
  const fields = (CONFIG[category] && CONFIG[category].fields) || [];
  const combinedText = fields
    .filter((field) => field.type !== "checkbox") // 「已購買」是打勾方塊，不用比對文字
    .map((field) => String(item[field.key] || ""))
    .join(" ")
    .toLowerCase();
  return combinedText.includes(keyword);
}

// 一般分類（病歷資料／看診時間表／照顧記錄／長照申請進度／購物墊款清單）的關鍵字比對，
// 直接用分類自己的關鍵字篩選狀態
function matchesKeywordFilter(category, item) {
  const keyword = (keywordFilters[category] || "").trim().toLowerCase();
  return textIncludesKeyword(category, item, keyword);
}

// 檢查排程專用：三個分類（檢驗單／檢查單／放射單）共用「exam」這個關鍵字篩選狀態，
// 但各自的欄位設定不同，所以比對時要傳入這一列實際的分類
function matchesExamKeywordFilter(category, item) {
  const keyword = (keywordFilters.exam || "").trim().toLowerCase();
  return textIncludesKeyword(category, item, keyword);
}

// 日期格式：完整顯示「年/月/日」，例如 "2026/09/23"
// 支援 "2026-09-23" 或 "2026-09-23T15:01" 這兩種格式
function formatShortDate(rawValue) {
  if (!rawValue) {
    return "";
  }
  const datePart = rawValue.substring(0, 10); // 只取 YYYY-MM-DD 的部分
  const pieces = datePart.split("-");
  if (pieces.length !== 3) {
    return rawValue; // 格式不如預期，就直接顯示原始值，避免顯示錯誤
  }
  return `${pieces[0]}/${pieces[1]}/${pieces[2]}`; // "2026-09-23" -> "2026/09/23"
}

// 星期幾的中文名稱，索引對應 JavaScript 的 Date.getDay()（0 是星期日）
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

// 看診時間表用的日期格式：年/月/日 加上星期幾，例如 "2026/9/23(三)"
// 支援 "2026-09-23" 或 "2026-09-23T15:01" 這兩種格式
function formatDateWithWeekday(rawValue) {
  if (!rawValue) {
    return "";
  }
  const datePart = rawValue.substring(0, 10); // 只取 YYYY-MM-DD 的部分
  const pieces = datePart.split("-");
  if (pieces.length !== 3) {
    return rawValue; // 格式不如預期，就直接顯示原始值，避免顯示錯誤
  }

  const year = Number(pieces[0]);
  const month = Number(pieces[1]);
  const day = Number(pieces[2]);
  const dateObj = new Date(year, month - 1, day);
  const weekday = WEEKDAY_LABELS[dateObj.getDay()];

  return `${year}/${month}/${day}(${weekday})`; // 月、日不補零，例如 "2026/9/23(三)"
}

// 取得今天的日期字串（YYYY-MM-DD），用來判斷資料是否過期
function getTodayStr() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// 判斷某個日期字串（只看年月日）是否符合「顯示範圍」的篩選：
// status 可以是 "valid"（未過期，預設）、"all"（全部）、"expired"（已過期）
// 檢查排程、看診時間表都共用這個函式
function matchesStatusFilter(status, dateStr) {
  if (status === "all") {
    return true; // 全部（含已過期）都顯示
  }

  const refDate = (dateStr || "").substring(0, 10);
  const isExpired = refDate !== "" && refDate < getTodayStr();

  if (status === "expired") {
    return isExpired; // 只顯示已過期
  }
  return !isExpired; // 預設「未過期」：沒有填日期的也當作未過期一起顯示
}

// 判斷這筆資料是否符合搜尋條件（日期起迄、照顧者、顯示範圍）
function matchesSearchFilter(category, item) {
  const filter = searchFilters[category];
  if (!filter) {
    return true; // 沒有設定搜尋條件，全部顯示
  }
  if (filter.start && item.date && item.date < filter.start) {
    return false;
  }
  if (filter.end && item.date && item.date > filter.end) {
    return false;
  }
  // 照顧者篩選：照顧者①或②只要有一個符合選擇的人，就算通過
  if (filter.caregiver) {
    const isCaregiver1 = item.caregiver1 === filter.caregiver;
    const isCaregiver2 = item.caregiver2 === filter.caregiver;
    if (!isCaregiver1 && !isCaregiver2) {
      return false;
    }
  }
  // 顯示範圍篩選：未過期／全部／已過期（目前只有看診時間表會用到）
  if (filter.status && !matchesStatusFilter(filter.status, item.date)) {
    return false;
  }
  return true;
}

// 取得這筆檢查排程資料的「有效期限」日期（只取年月日，方便比較大小）
function getExamRefDate(category, item) {
  const fieldKey = EXAM_DATE_FIELD[category];
  const rawValue = item[fieldKey] || "";
  return rawValue.substring(0, 10); // "2026-09-23T15:01" -> "2026-09-23"
}

// 判斷這筆檢查排程資料是否符合目前選的「顯示範圍」
function matchesExamStatusFilter(category, item) {
  return matchesStatusFilter(examFilters.status, getExamRefDate(category, item));
}

// 依照分類，把資料重新畫到畫面上（檢查排程的三個分類改用 renderExamList，不會呼叫這個函式）
function renderList(category) {
  const tbody = document.getElementById(category + "-list");
  if (!tbody) {
    return;
  }
  tbody.innerHTML = ""; // 先清空

  const fields = CONFIG[category].fields;

  // 先把資料跟「原始索引」綁在一起，這樣之後篩選完，
  // 編輯／刪除按鈕還是能正確對應到 allData 裡的正確位置
  let rows = allData[category].map((item, index) => ({ item, index }));

  // 看診時間表／長照申請進度／購物墊款清單：用各自的「對象」下拉選單篩選；
  // 其他分類（例如照顧記錄）還是跟著上方頭像切換的 currentPerson
  if (TAB_PERSON_FILTER_CATEGORIES[category]) {
    rows = rows.filter((row) => matchesTabPersonFilter(category, row.item));
  } else {
    rows = rows.filter((row) => matchesPersonFilter(row.item));
  }
  rows = rows.filter((row) => matchesSearchFilter(category, row.item)); // 看診時間表的日期起迄、照顧者篩選
  rows = rows.filter((row) => matchesKeywordFilter(category, row.item)); // 關鍵字搜尋

  // 依「日期」欄位排序，方向由點擊表頭決定（見 dateSortDirection）
  if (fields.some((field) => field.key === "date")) {
    const direction = dateSortDirection[category] || "desc";
    rows.sort((a, b) => {
      const cmp = (a.item.date || "").localeCompare(b.item.date || "");
      return direction === "asc" ? cmp : -cmp;
    });
  }

  updateDateSortHeaderArrow(category);

  rows.forEach(({ item, index }) => {
    const tr = document.createElement("tr");

    // 有「對象」下拉選單的分類（看診時間表／長照申請進度／購物墊款清單），
    // 表格第一欄先放「對象」文字，方便一次看多人資料時分辨是誰的
    if (TAB_PERSON_FILTER_CATEGORIES[category]) {
      tr.appendChild(createDisplayCell(personLabel(item.person)));
    }

    // 一般顯示模式：每個欄位放一個純文字儲存格
    fields.forEach((field) => {
      // 看診時間表的日期欄位：顯示「年/月/日(星期幾)」，例如 "2026/9/23(三)"
      // 病歷資料、長照申請進度的日期欄位：顯示「年/月/日」
      let displayValue = item[field.key];
      if (field.key === "date") {
        if (category === "visit") {
          displayValue = formatDateWithWeekday(item[field.key]);
        } else if (category === "medical" || category === "ltc") {
          displayValue = formatShortDate(item[field.key]);
        }
      }
      tr.appendChild(createDisplayCell(displayValue));
    });

    // 最後一格放「編輯」按鈕（看診時間表只能編輯，其他分類還可以刪除）
    const actionTd = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.textContent = "編輯";
    editBtn.className = "edit-btn";
    editBtn.addEventListener("click", () => {
      if (category === "visit") {
        // 看診時間表是從 Google 行事曆同步來的，只開放編輯照顧者①②、備註
        startEditVisitRow(index, tr);
      } else {
        startEdit(category, index, tr);
      }
    });
    actionTd.appendChild(editBtn);

    if (category !== "visit") {
      // 看診時間表的資料來自 Google 行事曆同步，不開放在網站上刪除
      const delBtn = document.createElement("button");
      delBtn.textContent = "刪除";
      delBtn.className = "delete-btn";
      delBtn.addEventListener("click", async () => {
        // 刪除前先跳出視窗提醒，使用者再次按「確定」才會真的刪除，避免手滑點到
        if (!(await confirmDelete("確定要刪除這筆資料嗎？刪除後無法復原。"))) {
          return;
        }
        if (SUPABASE_SYNCED_CATEGORIES.includes(category)) {
          await deleteCategoryItem(category, item); // 長照申請進度：改成連線 Supabase 刪除
          return;
        }
        allData[category].splice(index, 1);
        saveData(allData);
        renderList(category);
      });
      actionTd.appendChild(delBtn);
    }

    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

// 把一段備註濃縮成一行摘要文字，太長就截斷加上「…」
function summarizeMedicalNote(note, maxLen) {
  if (!note) {
    return "";
  }
  const oneLine = note.replace(/\n/g, "　"); // 換行改成全形空白，避免摘要被拆成好幾行
  if (oneLine.length <= maxLen) {
    return oneLine;
  }
  return oneLine.slice(0, maxLen) + "…";
}

// 整體病況摘要：不是寫死的文字，而是每次都依照「各分類目前最新一筆病歷」自動整理，
// 只要新增或修改病歷資料，摘要就會跟著自動更新，家人一眼就能看到目前最新狀況
function renderMedicalSummary() {
  const el = document.getElementById("medical-summary-text");
  if (!el) {
    return;
  }

  const rows = allData.medical.filter((item) => matchesPersonFilter(item));

  if (rows.length === 0) {
    el.textContent = "目前尚無病歷資料。";
    return;
  }

  // 各病症其實會互相影響（失智／聽力／血糖腎功能／跌倒），
  // 所以不逐一條列，改成一段整體狀況說明
  // 「最新進度」這一段會自動抓「目前最新一筆病歷」，其他病歷更新後會跟著改變
  const sorted = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const latest = sorted[0];
  const latestDateLabel = formatShortDate(latest.date);
  const latestNote = summarizeMedicalNote(latest.note, 80);

  const paragraph =
    "爸爸目前同時有失智、聽力退化、血糖／血壓控制不佳、攝護腺泌尿問題，以及跌倒骨折復原等多項狀況，彼此會互相影響：" +
    "腦部退化需要外界刺激，聽力變差會減少刺激而加重失智；血糖控制不佳則會讓腎功能持續惡化，需要長期留意。\n" +
    `最新進度（${latestDateLabel}）：${latest.title}${latestNote ? "－" + latestNote : ""}\n` +
    "照顧注意事項：忌甜食、勿吃太飽、多喝水；白天多安排活動、避免久坐；留意跌倒風險；並持續追蹤聽力檢測與助聽器評估進度。";

  el.textContent = paragraph;
}

// 病歷資料專用的畫面渲染：依「病症分類」分組顯示，
// 同一分類裡的資料再依日期新到舊排序，方便看出同一種病症不同時期的變化
function renderMedicalList() {
  renderMedicalSummary(); // 每次重畫病歷列表，順便重新整理一次摘要

  const container = document.getElementById("medical-groups");
  if (!container) {
    return;
  }
  container.innerHTML = ""; // 先清空

  // 把資料跟「原始索引」綁在一起，這樣編輯／刪除才能對應到 allData.medical 正確的位置
  let rows = allData.medical.map((item, index) => ({ item, index }));
  rows = rows.filter((row) => matchesPersonFilter(row.item)); // 只顯示目前選擇的人物的資料
  rows = rows.filter((row) => matchesKeywordFilter("medical", row.item)); // 關鍵字搜尋

  // 病症分類搜尋：選「全部」以外的分類時，只留下該分類的資料
  const groupOrderToShow =
    medicalSearchCategory === "all" ? MEDICAL_GROUP_ORDER : [medicalSearchCategory];

  groupOrderToShow.forEach((categoryName) => {
    const groupRows = rows.filter((row) => inferMedicalCategory(row.item) === categoryName);
    if (groupRows.length === 0) {
      return; // 這個分類目前沒有資料，就不顯示這一區塊
    }

    // 依目前選擇的排序方向排序（預設新到舊，可以點表頭「日期」切換）
    const medicalDirection = dateSortDirection.medical || "desc";
    groupRows.sort((a, b) => {
      const cmp = (a.item.date || "").localeCompare(b.item.date || "");
      return medicalDirection === "asc" ? cmp : -cmp;
    });

    const groupTitle = document.createElement("h3");
    groupTitle.className = "medical-group-title";
    groupTitle.textContent = categoryName;
    container.appendChild(groupTitle);

    const table = document.createElement("table");
    table.className = "medical-table";
    table.innerHTML = "<thead><tr><th>分類</th><th class=\"date-sort-header\">日期</th><th>病症 / 診斷</th><th>備註</th><th></th></tr></thead>";

    // 「日期」表頭可以點擊切換升冪／降冪，並顯示目前排序方向的箭頭
    const dateHeader = table.querySelector("thead th.date-sort-header");
    dateHeader.textContent = "日期" + dateSortArrow("medical");
    dateHeader.addEventListener("click", () => {
      toggleDateSort("medical");
    });

    const tbody = document.createElement("tbody");
    table.appendChild(tbody);

    groupRows.forEach(({ item, index }) => {
      const tr = document.createElement("tr");

      tr.appendChild(createDisplayCell(inferMedicalCategory(item)));
      tr.appendChild(createDisplayCell(formatShortDate(item.date)));
      tr.appendChild(createDisplayCell(item.title));
      tr.appendChild(createDisplayCell(item.note));

      const actionTd = document.createElement("td");

      const editBtn = document.createElement("button");
      editBtn.textContent = "編輯";
      editBtn.className = "edit-btn";
      editBtn.addEventListener("click", () => {
        startEdit("medical", index, tr);
      });
      actionTd.appendChild(editBtn);

      const delBtn = document.createElement("button");
      delBtn.textContent = "刪除";
      delBtn.className = "delete-btn";
      delBtn.addEventListener("click", async () => {
        if (!(await confirmDelete("確定要刪除這筆資料嗎？刪除後無法復原。"))) {
          return;
        }
        await deleteCategoryItem("medical", item); // 改成連線 Supabase 刪除
      });
      actionTd.appendChild(delBtn);

      tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  });
}

// 需要購買清單專用的畫面渲染：「是否已購買」直接顯示打勾方塊，
// 點一下就切換勾選狀態並儲存，不用進到編輯模式
function renderShoppingList() {
  const tbody = document.getElementById("shopping-list");
  if (!tbody) {
    return;
  }
  tbody.innerHTML = ""; // 先清空

  let rows = allData.shopping.map((item, index) => ({ item, index }));
  rows = rows.filter((row) => matchesTabPersonFilter("shopping", row.item)); // 用「對象」下拉選單篩選
  // 「已代墊款項」「需要購買清單」共用同一個關鍵字（都算在「advance」這個頁簽底下）
  rows = rows.filter((row) => {
    const keyword = (keywordFilters.advance || "").trim().toLowerCase();
    return textIncludesKeyword("shopping", row.item, keyword);
  });

  rows.forEach(({ item, index }) => {
    const tr = document.createElement("tr");

    // 「是否已購買」：直接放打勾方塊，點一下馬上生效
    const checkTd = document.createElement("td");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!item.purchased;
    checkbox.addEventListener("change", async () => {
      // 直接更新 Supabase，不用進到編輯模式
      await updateCategoryItem("shopping", item, { purchased: checkbox.checked });
    });
    checkTd.appendChild(checkbox);
    tr.appendChild(checkTd);

    tr.appendChild(createDisplayCell(personLabel(item.person))); // 「對象」欄位，方便一次看兩人資料時分辨

    tr.appendChild(createDisplayCell(item.item));
    tr.appendChild(createDisplayCell(item.note));

    const actionTd = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.textContent = "編輯";
    editBtn.className = "edit-btn";
    editBtn.addEventListener("click", () => {
      startEdit("shopping", index, tr);
    });
    actionTd.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "刪除";
    delBtn.className = "delete-btn";
    delBtn.addEventListener("click", async () => {
      if (!(await confirmDelete("確定要刪除這筆資料嗎？刪除後無法復原。"))) {
        return;
      }
      await deleteCategoryItem("shopping", item); // 改成連線 Supabase 刪除
    });
    actionTd.appendChild(delBtn);

    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

// 看診時間表專用的編輯模式：只能編輯「照顧者①」「照顧者②」「備註」，
// 其他欄位（日期、時間、醫院/科別、醫師）都是從 Google 行事曆同步來的，維持唯讀
function startEditVisitRow(index, tr) {
  const fields = CONFIG.visit.fields;
  const item = allData.visit[index];
  const editableKeys = ["caregiver1", "caregiver2", "note"];

  tr.innerHTML = ""; // 清空這一列，改用輸入框（或唯讀文字）重畫

  tr.appendChild(createDisplayCell(personLabel(item.person))); // 「對象」欄位維持唯讀

  fields.forEach((field) => {
    if (editableKeys.includes(field.key)) {
      tr.appendChild(createEditCell(field, item[field.key]));
    } else {
      // 唯讀欄位：日期一樣顯示成「年/月/日(星期幾)」
      const displayValue =
        field.key === "date" ? formatDateWithWeekday(item[field.key]) : item[field.key];
      tr.appendChild(createDisplayCell(displayValue));
    }
  });

  // 「儲存」跟「取消」按鈕
  const actionTd = document.createElement("td");

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "儲存";
  saveBtn.className = "edit-btn";
  saveBtn.addEventListener("click", async () => {
    const inputs = tr.querySelectorAll("[data-field-key]");
    inputs.forEach((input) => {
      item[input.dataset.fieldKey] = input.value;
    });

    if (!supabaseClient) {
      alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
      return;
    }
    const { error } = await supabaseClient
      .from("visits")
      .update(mapVisitItemToRow(item))
      .eq("id", item.id);
    if (error) {
      console.error("更新看診記錄失敗：", error);
      alert("更新看診記錄失敗，請稍後再試。");
      return;
    }
    await refreshVisitList();
  });
  actionTd.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "delete-btn";
  cancelBtn.addEventListener("click", () => {
    renderList("visit"); // 不儲存，直接重畫回原本的資料
  });
  actionTd.appendChild(cancelBtn);

  tr.appendChild(actionTd);
}

// 把某一列切換成「編輯模式」（看診時間表不會用到這個函式，改用 startEditVisitRow）
// tr：要編輯的那個表格列元素（由呼叫端直接傳入，避免搜尋篩選後索引對不上）
function startEdit(category, index, tr) {
  const fields = CONFIG[category].fields;
  const item = allData[category][index];

  tr.innerHTML = ""; // 清空這一列，改用輸入框重畫

  // 長照申請進度／已代墊款項：「對象」欄位排在最前面，維持唯讀
  if (category === "ltc" || category === "advance") {
    tr.appendChild(createDisplayCell(personLabel(item.person)));
  }

  // 依欄位建立輸入框
  fields.forEach((field, fieldIndex) => {
    tr.appendChild(createEditCell(field, item[field.key]));
    // 需要購買清單：「對象」欄位排在「已購買」之後，所以第一個欄位建立完就插入
    if (category === "shopping" && fieldIndex === 0) {
      tr.appendChild(createDisplayCell(personLabel(item.person)));
    }
  });

  // 「儲存」跟「取消」按鈕
  const actionTd = document.createElement("td");

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "儲存";
  saveBtn.className = "edit-btn";
  saveBtn.addEventListener("click", async () => {
    // 把每個輸入框目前的值讀出來，更新回資料裡
    // 打勾方塊要讀 checked，不是 value
    const changes = {};
    const inputs = tr.querySelectorAll("[data-field-key]");
    inputs.forEach((input) => {
      const value = input.type === "checkbox" ? input.checked : input.value;
      item[input.dataset.fieldKey] = value;
      changes[input.dataset.fieldKey] = value;
    });

    if (SUPABASE_SYNCED_CATEGORIES.includes(category)) {
      // 病歷資料／長照申請進度／需要購買清單：改成連線 Supabase 更新
      await updateCategoryItem(category, item, changes);
      return;
    }

    saveData(allData);
    renderList(category);
  });
  actionTd.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "delete-btn";
  cancelBtn.addEventListener("click", () => {
    // 不儲存，直接重畫回原本的資料
    if (category === "medical") {
      renderMedicalList();
    } else if (category === "shopping") {
      renderShoppingList();
    } else {
      renderList(category);
    }
  });
  actionTd.appendChild(cancelBtn);

  tr.appendChild(actionTd);
}

// 畫面一開始載入時，把每個區塊全部畫出來
function renderAll() {
  Object.keys(CONFIG).forEach((category) => {
    if (EXAM_CATEGORIES.includes(category)) {
      return; // 檢查排程改用下面的 renderExamList，合併成同一個表格顯示
    }
    if (SUPABASE_SYNCED_CATEGORIES.includes(category)) {
      return; // 已經連線 Supabase 的分類，改用 refreshAllSupabaseCategories 處理
    }
    renderList(category);
  });
  renderExamList();
}

// 重新從 Supabase 抓所有已連線分類（病歷資料／檢查排程／照顧記錄／長照申請進度／購物墊款清單）的最新資料
async function refreshAllSupabaseCategories() {
  await Promise.all(SUPABASE_SYNCED_CATEGORIES.map((category) => refreshCategoryList(category)));
}

// ---------------------------------------
// 檢查排程：把檢驗單／檢查單／放射單合併成同一個表格
// ---------------------------------------

// 依分類取得「類別」欄位要顯示的中文名稱
function getExamCategoryLabel(category) {
  const labels = { labTest: "檢驗單", examCheck: "檢查單", radiology: "放射單" };
  return labels[category] || category;
}

// 依分類取得「科別／項目」欄位的值
function getExamNameValue(category, item) {
  return category === "examCheck" ? item.item : item.department;
}

// 依分類取得「地點／檢體」欄位的值
function getExamLocationValue(category, item) {
  return category === "labTest" ? item.specimen : item.location;
}

// 建立「日期」欄位要顯示的內容：檢驗單有起訖日，上下兩行呈現；其他分類只有一個日期
function buildExamDateCell(category, item) {
  const wrapper = document.createElement("div");
  wrapper.className = "date-range";

  if (category === "labTest") {
    const fromLine = document.createElement("div");
    fromLine.textContent = formatShortDate(item.validFrom) || "－";
    const toLine = document.createElement("div");
    toLine.textContent = formatShortDate(item.validTo) || "－";
    wrapper.appendChild(fromLine);
    wrapper.appendChild(toLine);
    return wrapper;
  }

  const line = document.createElement("div");
  if (category === "examCheck") {
    const datePart = formatShortDate(item.examDatetime);
    const timePart = (item.examDatetime || "").substring(11, 16); // "HH:MM"
    line.textContent = timePart ? `${datePart} ${timePart}` : datePart;
  } else {
    line.textContent = formatShortDate(item.examDate);
  }
  wrapper.appendChild(line);
  return wrapper;
}

// 把檢驗單／檢查單／放射單合併起來，依篩選條件、有效期限排序後畫成同一個表格
function renderExamList() {
  const tbody = document.getElementById("exam-list");
  if (!tbody) {
    return;
  }
  tbody.innerHTML = "";

  // 把三個分類的資料合併成一個陣列，記住各自的分類跟原始索引（編輯／刪除要用）
  let rows = [];
  EXAM_CATEGORIES.forEach((category) => {
    allData[category].forEach((item, index) => {
      rows.push({ category, item, index });
    });
  });

  rows = rows.filter((row) => matchesPersonFilter(row.item)); // 只顯示目前選擇的人物
  rows = rows.filter(
    (row) => examFilters.category === "all" || examFilters.category === row.category
  );
  rows = rows.filter((row) => matchesExamStatusFilter(row.category, row.item));
  rows = rows.filter((row) => matchesExamKeywordFilter(row.category, row.item)); // 關鍵字搜尋

  // 依「有效期限」排序，方向由點擊表頭決定（見 dateSortDirection）
  const examDirection = dateSortDirection.exam || "desc";
  rows.sort((a, b) => {
    const dateA = getExamRefDate(a.category, a.item);
    const dateB = getExamRefDate(b.category, b.item);
    const cmp = dateA.localeCompare(dateB);
    return examDirection === "asc" ? cmp : -cmp;
  });

  updateDateSortHeaderArrow("exam");

  rows.forEach(({ category, item, index }) => {
    const tr = document.createElement("tr");

    tr.appendChild(createDisplayCell(getExamCategoryLabel(category)));
    tr.appendChild(createDisplayCell(getExamNameValue(category, item)));
    tr.appendChild(createDisplayCell(item.doctor));

    const dateTd = document.createElement("td");
    dateTd.appendChild(buildExamDateCell(category, item));
    tr.appendChild(dateTd);

    tr.appendChild(createDisplayCell(getExamLocationValue(category, item)));

    // 檢查排程的資料都是從醫院系統匯入的，不開放編輯／刪除，所以沒有操作欄位
    tbody.appendChild(tr);
  });
}

// ---------------------------------------
// 表單送出：新增一筆資料
// ---------------------------------------

function setupForm(category) {
  const form = document.getElementById(category + "-form");
  if (!form) {
    // 這個分類沒有新增表單（例如檢查排程的資料都是匯入的，不開放手動新增）
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // 防止表單重新整理頁面

    const formData = new FormData(form);
    const newItem = {};

    // 把表單裡每個欄位的值抓出來，存成一個物件
    CONFIG[category].fields.forEach((field) => {
      if (field.type === "checkbox") {
        return; // 新增表單裡沒有「是否已購買」的打勾方塊，新項目一律預設「未購買」
      }
      newItem[field.key] = formData.get(field.key) || "";
    });
    if (category === "shopping") {
      newItem.purchased = false; // 新增的購買項目，預設都是還沒買
    }
    newItem.person = currentPerson; // 標記這筆資料是「目前選擇的人物」的資料

    if (category === "visit") {
      // 看診記錄：新增到 Supabase
      if (!supabaseClient) {
        alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
        return;
      }
      const { error } = await supabaseClient
        .from("visits")
        .insert(mapVisitItemToRow(newItem));
      if (error) {
        console.error("新增看診記錄失敗：", error);
        alert("新增看診記錄失敗，請稍後再試。");
        return;
      }
      form.reset();
      await refreshVisitList();
      return;
    }

    if (SUPABASE_SYNCED_CATEGORIES.includes(category)) {
      // 病歷資料／長照申請進度／需要購買清單：新增到 Supabase
      await insertCategoryItem(category, newItem);
      form.reset();
      return;
    }

    allData[category].push(newItem);
    saveData(allData);
    renderList(category);

    form.reset(); // 清空表單，方便繼續新增下一筆
  });
}

// ---------------------------------------
// 看診記錄的搜尋功能（依日期起迄、照顧者篩選）
// 搜尋條件是合併的：照顧者不分①②，只要符合其中一個就算通過（見 matchesSearchFilter）
// 但表格列表本身仍然維持「照顧者①」「照顧者②」兩個獨立欄位
// ---------------------------------------

function setupVisitSearch() {
  const startInput = document.getElementById("visit-search-start");
  const endInput = document.getElementById("visit-search-end");
  const caregiverInput = document.getElementById("visit-search-caregiver");
  const statusInput = document.getElementById("visit-search-status");
  const keywordInput = document.getElementById("visit-keyword-search");
  const searchBtn = document.getElementById("visit-search-btn");

  // 保護機制：如果 index.html 版本不對、找不到搜尋列的元件，
  // 就直接跳過設定，避免整個網站的程式碼中斷、其他分頁也不能用
  if (!startInput || !endInput || !caregiverInput || !statusInput || !keywordInput || !searchBtn) {
    console.warn("找不到看診記錄的搜尋列元件，已略過搜尋功能設定。");
    return;
  }

  // 畫面一開始就先套用預設的「顯示範圍」（未過期），不用等使用者按搜尋
  searchFilters.visit = {
    start: "",
    end: "",
    caregiver: "",
    status: statusInput.value,
  };

  const runVisitSearch = () => {
    searchFilters.visit = {
      start: startInput.value, // 空字串代表不限制起始日
      end: endInput.value, // 空字串代表不限制結束日
      caregiver: caregiverInput.value, // 空字串代表不限照顧者
      status: statusInput.value, // 未過期／全部／已過期
    };
    keywordFilters.visit = keywordInput.value; // 要按「搜尋」才正式套用關鍵字
    renderList("visit");
  };

  searchBtn.addEventListener("click", runVisitSearch);
  // 在關鍵字欄位按 Enter，效果跟按「搜尋」按鈕一樣
  keywordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runVisitSearch();
    }
  });

  // 「顯示範圍」跟檢查排程一樣，改變下拉選單就立刻套用，不用按搜尋
  statusInput.addEventListener("change", () => {
    searchFilters.visit.status = statusInput.value;
    renderList("visit");
  });
}

// ---------------------------------------
// 分頁切換
// ---------------------------------------

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".tab-content");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;

      // 先把全部按鈕跟內容都取消 active
      buttons.forEach((b) => b.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      // 再把點到的那個設成 active
      btn.classList.add("active");
      document.getElementById(target).classList.add("active");
    });
  });
}

// 「病歷資料」的搜尋區：切換病症分類時，重新畫一次分組表格
function setupMedicalSearch() {
  const categorySelect = document.getElementById("medical-search-category");
  if (!categorySelect) {
    console.warn("找不到病歷資料的搜尋列元件，已略過搜尋功能設定。");
    return;
  }

  categorySelect.addEventListener("change", () => {
    medicalSearchCategory = categorySelect.value;
    renderMedicalList();
  });
}

// 設定每個頁簽搜尋列裡的「關鍵字」輸入框：要按旁邊的「搜尋」按鈕（或按 Enter）才會正式套用篩選，
// 不是打字的時候就即時篩選，避免資料一直跳動
// 看診時間表比較特別：關鍵字跟原本的「搜尋」按鈕共用，設定寫在 setupVisitSearch 裡
function setupKeywordSearchInputs() {
  const keywordInputConfig = [
    { inputId: "medical-keyword-search", btnId: "medical-keyword-search-btn", tabKey: "medical", render: renderMedicalList },
    { inputId: "exam-keyword-search", btnId: "exam-keyword-search-btn", tabKey: "exam", render: renderExamList },
    { inputId: "care-keyword-search", btnId: "care-keyword-search-btn", tabKey: "care", render: () => renderList("care") },
    { inputId: "ltc-keyword-search", btnId: "ltc-keyword-search-btn", tabKey: "ltc", render: () => renderList("ltc") },
    {
      inputId: "advance-keyword-search",
      btnId: "advance-keyword-search-btn",
      tabKey: "advance",
      render: () => {
        renderList("advance");
        renderShoppingList(); // 「需要購買清單」共用同一個關鍵字，也要一起重畫
      },
    },
  ];

  keywordInputConfig.forEach(({ inputId, btnId, tabKey, render }) => {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) {
      console.warn(`找不到「${inputId}」關鍵字搜尋欄位或按鈕，已略過設定。`);
      return;
    }

    const runSearch = () => {
      keywordFilters[tabKey] = input.value;
      render();
    };

    btn.addEventListener("click", runSearch);
    // 在輸入框裡按 Enter，效果跟按「搜尋」按鈕一樣，方便使用
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  });
}

// 「檢查排程」的篩選區：切換單據類別或顯示範圍時，重新畫一次合併後的表格
function setupExamFilters() {
  const categorySelect = document.getElementById("exam-filter-category");
  const statusSelect = document.getElementById("exam-filter-status");

  if (!categorySelect || !statusSelect) {
    console.warn("找不到檢查排程的篩選元件，已略過篩選功能設定。");
    return;
  }

  categorySelect.addEventListener("change", () => {
    examFilters.category = categorySelect.value;
    renderExamList();
  });

  statusSelect.addEventListener("change", () => {
    examFilters.status = statusSelect.value;
    renderExamList();
  });
}

// 設定看診時間表／長照申請進度／購物墊款清單這三個頁簽的「對象」下拉選單
// 選擇「全部」可以同時看到爸爸媽媽的資料，方便小孩不用切換頭像也能查看
function setupTabPersonFilters() {
  const visitSelect = document.getElementById("visit-person-filter");
  const ltcSelect = document.getElementById("ltc-person-filter");
  const advanceSelect = document.getElementById("advance-person-filter");

  if (!visitSelect || !ltcSelect || !advanceSelect) {
    console.warn("找不到「對象」篩選下拉選單，已略過設定。");
    return;
  }

  visitSelect.addEventListener("change", () => {
    tabPersonFilter.visit = visitSelect.value;
    renderList("visit");
  });

  ltcSelect.addEventListener("change", () => {
    tabPersonFilter.ltc = ltcSelect.value;
    renderList("ltc");
  });

  advanceSelect.addEventListener("change", () => {
    tabPersonFilter.advance = advanceSelect.value;
    renderList("advance");
    renderShoppingList();
  });
}

// 這三個下拉選單各自對應的 id
const TAB_PERSON_FILTER_SELECT_IDS = {
  visit: "visit-person-filter",
  ltc: "ltc-person-filter",
  advance: "advance-person-filter",
};

// 下拉選單選項要顯示的中文字
const TAB_PERSON_FILTER_OPTION_LABELS = { dad: "爸爸", mom: "媽媽", all: "全部" };

// 依照目前選擇的人物（上方頭像），重新排列三個「對象」下拉選單的選項：
// 只留「目前人物」（排第一個、預設選中）跟「全部」（排第二個）這兩個選項
function updateTabPersonFilterSelectOptions() {
  const optionOrder = [currentPerson, "all"];

  Object.keys(TAB_PERSON_FILTER_SELECT_IDS).forEach((tabKey) => {
    const select = document.getElementById(TAB_PERSON_FILTER_SELECT_IDS[tabKey]);
    if (!select) {
      return;
    }
    select.innerHTML = ""; // 清空原本的選項，改用新的順序重建
    optionOrder.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = TAB_PERSON_FILTER_OPTION_LABELS[value];
      select.appendChild(option);
    });
    select.value = tabPersonFilter[tabKey];
  });
}

// 切換上方頭像（爸爸／媽媽）時呼叫：把三個「對象」下拉選單的預設值都改成目前選擇的人物，
// 並且重新排列選項順序，方便使用者一打開就是看目前選擇的這個人
function applyPersonDefaultToTabFilters() {
  Object.keys(TAB_PERSON_FILTER_SELECT_IDS).forEach((tabKey) => {
    tabPersonFilter[tabKey] = currentPerson;
  });
  updateTabPersonFilterSelectOptions();
}

// ---------------------------------------
// 人物切換：爸爸／媽媽
// ---------------------------------------

function setupPersonSwitcher() {
  const buttons = document.querySelectorAll(".person-btn");
  if (buttons.length === 0) {
    console.warn("找不到人物切換的按鈕，已略過設定。");
    return;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const person = btn.dataset.person;
      if (person === currentPerson) {
        return; // 已經是目前選擇的人物，不用重新載入
      }
      currentPerson = person;

      // 更新按鈕的選中樣式
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      // 看診時間表／長照申請進度／購物墊款清單的「對象」下拉選單，預設也跟著切換成這個人
      applyPersonDefaultToTabFilters();

      renderAll(); // 重畫看診時間表（其他分類等下面重新抓 Supabase 資料後會一起重畫）

      // 全部分頁都存在 Supabase，切換人物後重新抓一次最新資料
      if (supabaseClient) {
        const personName = currentPerson === "dad" ? "爸爸" : "媽媽";
        setVisitSyncStatus(`資料讀取中…（${personName}）`);
        await Promise.all([refreshVisitList(), refreshAllSupabaseCategories()]);
        setVisitSyncStatus(`✅ 已連線 Supabase（${personName}）`);
      }
    });
  });
}

// ---------------------------------------
// 拍照新增：檢查排程、看診時間表都可以拍照，自動辨識文字並幫忙填欄位
// 用 Tesseract.js（從 CDN 載入）直接在瀏覽器裡辨識文字，不需要另外架伺服器
// 辨識結果只是「參考」，一定會先顯示在表單裡讓使用者確認／修改，
// 按「確認新增」才會真的存進資料，並且會先檢查有沒有跟現有資料重複
// ---------------------------------------

let cameraStream = null; // 目前開啟中的相機串流，關閉視窗時要記得停掉
let cameraTargetTab = null; // 這次拍照是要給哪個頁簽用："exam" 或 "visit"

// 開啟相機視窗，請求使用者的相機權限
async function openCameraModal(targetTab) {
  cameraTargetTab = targetTab;
  const modal = document.getElementById("camera-modal");
  const video = document.getElementById("camera-video");

  try {
    // facingMode: "environment" 表示優先使用手機的後鏡頭，比較方便拍文件
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    });
    video.srcObject = cameraStream;
    video.style.display = "block";
  } catch (err) {
    // 開不了相機也沒關係，視窗還是打開，讓使用者改用「照片」按鈕從相簿選圖片
    console.error("開啟相機失敗：", err);
    video.style.display = "none";
  }

  modal.style.display = "flex";
}

// 關閉相機視窗，並且把相機關掉，避免持續佔用鏡頭
function closeCameraModal() {
  document.getElementById("camera-modal").style.display = "none";
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
}

// 顯示／隱藏「辨識中」提示視窗
function setOcrLoading(isLoading) {
  document.getElementById("ocr-loading-modal").style.display = isLoading ? "flex" : "none";
}

// 顯示「資料重複」提示視窗
function showDuplicateModal(message) {
  document.getElementById("duplicate-modal-message").textContent = message;
  document.getElementById("duplicate-modal").style.display = "flex";
}

// 刪除確認視窗：用自己畫的視窗取代瀏覽器內建的 confirm()，
// 這樣才不會跳出瀏覽器自己加上的網址列文字，畫面也能跟網站風格一致。
// 回傳一個 Promise，使用者按「確定刪除」會是 true，按「取消」會是 false。
function confirmDelete(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("delete-confirm-modal");
    const messageEl = document.getElementById("delete-confirm-message");
    const okBtn = document.getElementById("delete-confirm-ok-btn");
    const cancelBtn = document.getElementById("delete-confirm-cancel-btn");

    messageEl.textContent = message || "確定要刪除這筆資料嗎？刪除後無法復原。";
    modal.style.display = "flex";

    // 每次都重新綁定按鈕事件，避免舊的事件重複觸發
    function cleanup(result) {
      modal.style.display = "none";
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(result);
    }
    function onOk() {
      cleanup(true);
    }
    function onCancel() {
      cleanup(false);
    }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
}

// 從辨識出來的一大段文字裡，找出「日期」「時間」，剩下的文字當作名稱/科別的參考值
// 支援 "2026-09-23"、"2026/09/23"、"09/23" 這幾種常見格式
function parseOcrText(text) {
  const dateMatches = text.match(/\d{2,4}[-/]\d{1,2}[-/]\d{1,2}/g) || [];
  const timeMatches = text.match(/\d{1,2}:\d{2}/g) || [];

  // 把辨識出來的日期統一轉成 "YYYY-MM-DD"，才能直接填進 <input type="date">
  function normalizeDate(raw) {
    const parts = raw.split(/[-/]/);
    let year = parts[0];
    let month = parts[1];
    let day = parts[2];
    if (parts.length === 2) {
      // 只辨識到「月/日」，沒有年份，就用今年當年份
      year = String(new Date().getFullYear());
      month = parts[0];
      day = parts[1];
    }
    if (year.length === 2) {
      year = "20" + year; // 兩位數年份，補成西元年
    }
    return `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // 找出「看起來不是日期、也不是時間」的第一行文字，當作名稱／科別的參考值
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  const nameLine =
    lines.find(
      (line) => !/^\d{2,4}[-/]\d{1,2}[-/]\d{1,2}$/.test(line) && !/^\d{1,2}:\d{2}$/.test(line)
    ) || "";

  return {
    date1: dateMatches[0] ? normalizeDate(dateMatches[0]) : "",
    date2: dateMatches[1] ? normalizeDate(dateMatches[1]) : "",
    time: timeMatches[0] || "",
    name: nameLine,
  };
}

// 把一張圖片（canvas 或圖片元素都可以）交給 Tesseract.js 辨識文字，
// 辨識完之後自動填進對應頁簽的「確認新增」表單
// （chi_tra 是繁體中文，eng 是英文／數字，兩種一起辨識效果比較好）
async function recognizeImageAndFillForm(imageSource, targetTab) {
  setOcrLoading(true);
  try {
    const result = await Tesseract.recognize(imageSource, "chi_tra+eng");
    const parsed = parseOcrText(result.data.text);
    setOcrLoading(false);
    fillManualFormFromOcr(targetTab, parsed);
  } catch (err) {
    setOcrLoading(false);
    console.error("文字辨識失敗：", err);
    alert("照片辨識失敗，請直接手動輸入資料。");
    showManualForm(targetTab);
  }
}

// 按下「拍照」：把相機目前畫面截圖到 canvas，再交給文字辨識
function capturePhotoAndRecognize() {
  if (!cameraStream) {
    alert("目前沒有開啟相機，請改按「照片」從相簿選擇圖片。");
    return;
  }
  const video = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

  const targetTab = cameraTargetTab;
  closeCameraModal();
  recognizeImageAndFillForm(canvas, targetTab);
}

// 按下「照片」：改用手機／電腦相簿裡選好的圖片，一樣交給文字辨識
function handleAlbumFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // 清空，避免下次選同一張圖片時不會觸發 change 事件
  if (!file) {
    return;
  }

  const targetTab = cameraTargetTab;
  const image = new Image();
  image.onload = () => {
    closeCameraModal();
    recognizeImageAndFillForm(image, targetTab);
  };
  image.onerror = () => {
    alert("這張圖片無法讀取，請換一張試試看。");
  };
  image.src = URL.createObjectURL(file); // 把選好的檔案轉成瀏覽器可以直接顯示的網址
}

// 把辨識結果填進對應頁簽的「確認新增」表單，並且把表單顯示出來
function fillManualFormFromOcr(targetTab, parsed) {
  if (targetTab === "visit") {
    const form = document.getElementById("visit-manual-form");
    form.elements["date"].value = parsed.date1 || "";
    form.elements["time"].value = parsed.time || "";
    form.elements["hospital"].value = parsed.name || "";
  } else if (targetTab === "exam") {
    const form = document.getElementById("exam-manual-form");
    form.elements["name"].value = parsed.name || "";
    form.elements["date1"].value = parsed.date1 || "";
    form.elements["date2"].value = parsed.date2 || "";
  }
  showManualForm(targetTab);
}

// 顯示「確認新增」表單，讓使用者檢查／修改辨識結果後再送出
function showManualForm(targetTab) {
  const formId = targetTab === "visit" ? "visit-manual-form" : "exam-manual-form";
  document.getElementById(formId).style.display = "flex";
}

// 隱藏「確認新增」表單，並且清空裡面的內容
function hideManualForm(targetTab) {
  const formId = targetTab === "visit" ? "visit-manual-form" : "exam-manual-form";
  const form = document.getElementById(formId);
  form.style.display = "none";
  form.reset();
}

// ---- 看診時間表：拍照新增的重複檢查與送出 ----

// 判斷這筆看診預約跟目前列表裡的資料是不是重複：同一天、且醫院／科別的關鍵字很像就算重複
function isVisitDuplicate(date, hospital) {
  return allData.visit.some(
    (item) =>
      matchesPersonFilter(item) &&
      item.date === date &&
      item.hospital &&
      hospital &&
      item.hospital.includes(hospital.slice(0, 4))
  );
}

async function submitVisitManualForm(event) {
  event.preventDefault();
  const form = event.target;
  const newItem = {
    date: form.elements["date"].value,
    time: form.elements["time"].value,
    hospital: form.elements["hospital"].value,
    caregiver1: form.elements["caregiver1"].value,
    caregiver2: form.elements["caregiver2"].value,
    note: form.elements["note"].value,
    person: currentPerson,
  };

  if (isVisitDuplicate(newItem.date, newItem.hospital)) {
    showDuplicateModal(
      `看診時間表裡已經有「${newItem.date} ${newItem.hospital}」這一筆資料了，這次先不新增，請確認是否重複。`
    );
    return;
  }

  if (!supabaseClient) {
    alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
    return;
  }
  const { error } = await supabaseClient.from("visits").insert(mapVisitItemToRow(newItem));
  if (error) {
    console.error("新增看診記錄失敗：", error);
    alert("新增看診記錄失敗，請稍後再試。");
    return;
  }
  hideManualForm("visit");
  await refreshVisitList();
}

// ---- 檢查排程：拍照新增的重複檢查與送出 ----

// 判斷這筆檢查／檢驗資料跟同一分類裡的資料是不是重複：同一天、且名稱關鍵字很像就算重複
function isExamDuplicate(category, dateValue, name) {
  const dateField = EXAM_DATE_FIELD[category];
  return allData[category].some((item) => {
    if (!matchesPersonFilter(item)) {
      return false;
    }
    const itemDate = (item[dateField] || "").substring(0, 10);
    const itemName = category === "examCheck" ? item.item : item.department;
    return itemDate === dateValue && itemName && name && itemName.includes(name.slice(0, 4));
  });
}

async function submitExamManualForm(event) {
  event.preventDefault();
  const form = event.target;
  const category = form.elements["examType"].value; // labTest / examCheck / radiology
  const name = form.elements["name"].value;
  const doctor = form.elements["doctor"].value;
  const date1 = form.elements["date1"].value;
  const date2 = form.elements["date2"].value;
  const place = form.elements["place"].value;

  if (isExamDuplicate(category, date1, name)) {
    showDuplicateModal(
      `檢查排程裡已經有「${date1} ${name}」這一筆資料了，這次先不新增，請確認是否重複。`
    );
    return;
  }

  // 依單據類別，把共用欄位（科別／項目、日期）對應到各分類自己的欄位名稱
  let newItem = { doctor, person: currentPerson };
  if (category === "labTest") {
    newItem = { ...newItem, department: name, validFrom: date1, validTo: date2, specimen: place };
  } else if (category === "examCheck") {
    newItem = { ...newItem, item: name, examDatetime: date1, location: place };
  } else {
    newItem = { ...newItem, department: name, examDate: date1, location: place };
  }

  await insertCategoryItem(category, newItem); // 新增到 Supabase（lab_tests／exam_checks／radiology_records）
  hideManualForm("exam");
}

// 設定拍照新增功能：按鈕、相機視窗、確認表單、資料重複提示視窗
function setupCameraFeature() {
  const examCameraBtn = document.getElementById("exam-camera-btn");
  const visitCameraBtn = document.getElementById("visit-camera-btn");
  const captureBtn = document.getElementById("camera-capture-btn");
  const albumBtn = document.getElementById("camera-album-btn");
  const albumInput = document.getElementById("camera-album-input");
  const cancelBtn = document.getElementById("camera-cancel-btn");
  const examForm = document.getElementById("exam-manual-form");
  const visitForm = document.getElementById("visit-manual-form");
  const examCancelBtn = document.getElementById("exam-manual-cancel-btn");
  const visitCancelBtn = document.getElementById("visit-manual-cancel-btn");
  const duplicateCloseBtn = document.getElementById("duplicate-modal-close-btn");

  // 保護機制：如果 index.html 版本不對、找不到拍照新增的元件，就直接跳過設定
  if (!examCameraBtn || !visitCameraBtn || !captureBtn || !albumBtn || !albumInput || !examForm || !visitForm) {
    console.warn("找不到拍照新增功能的元件，已略過設定。");
    return;
  }

  examCameraBtn.addEventListener("click", () => openCameraModal("exam"));
  visitCameraBtn.addEventListener("click", () => openCameraModal("visit"));
  captureBtn.addEventListener("click", capturePhotoAndRecognize);
  albumBtn.addEventListener("click", () => albumInput.click()); // 點「照片」按鈕，觸發隱藏的檔案選擇框
  albumInput.addEventListener("change", handleAlbumFileSelected);
  cancelBtn.addEventListener("click", closeCameraModal);

  examForm.addEventListener("submit", submitExamManualForm);
  visitForm.addEventListener("submit", submitVisitManualForm);
  examCancelBtn.addEventListener("click", () => hideManualForm("exam"));
  visitCancelBtn.addEventListener("click", () => hideManualForm("visit"));

  duplicateCloseBtn.addEventListener("click", () => {
    document.getElementById("duplicate-modal").style.display = "none";
  });
}

// ---------------------------------------
// 初始化：頁面載入完成後執行
// ---------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPersonSwitcher(); // 設定爸爸／媽媽的人物切換
  setupExamFilters(); // 設定「檢查排程」的篩選區（單據類別、顯示範圍）
  setupMedicalSearch(); // 設定「病歷資料」的搜尋區（病症分類）

  Object.keys(CONFIG).forEach((category) => {
    setupForm(category);
  });

  setupVisitSearch(); // 設定看診記錄的日期搜尋功能
  setupCameraFeature(); // 設定「拍照新增」功能（檢查排程、看診時間表）
  setupTabPersonFilters(); // 設定看診時間表／長照申請進度／購物墊款清單的「對象」下拉選單
  setupKeywordSearchInputs(); // 設定每個頁簽搜尋列的「關鍵字」搜尋欄位
  applyPersonDefaultToTabFilters(); // 一開始預設看「爸爸」的資料，下拉選單順序也對應調整

  // 幫每個頁簽的「日期」表頭加上點擊排序功能（病歷資料的表頭是動態產生的，不用在這裡設定）
  ["exam", "visit", "care", "ltc", "advance"].forEach((category) => {
    setupDateSortHeader(category);
  });

  // 一開始先畫一次畫面（此時 Supabase 資料還沒讀回來，大部分表格會是空的）
  renderAll();

  // 病歷資料／檢查排程／看診時間表／照顧記錄／長照申請進度／購物墊款清單，
  // 全部都改成連線 Supabase，需要一點時間讀取，讀取完再畫出來
  if (supabaseClient) {
    setVisitSyncStatus("資料讀取中…");
    await Promise.all([refreshVisitList(), refreshAllSupabaseCategories()]);
    setVisitSyncStatus("✅ 已連線 Supabase（test0920 專案）");
  } else {
    setVisitSyncStatus("⚠️ Supabase 函式庫載入失敗，網站的資料暫時無法讀取，請確認網路連線後重新整理頁面。");
  }
});
