// ========================================
// 爸媽的照顧網站 - script.js
// 病歷／檢查排程／照顧／長照申請進度：存在瀏覽器的 localStorage 裡
// 看診時間表：改成連線 Supabase 資料庫（test0920 專案），
//           這樣換一台電腦打開網站，看診時間表也會是最新的
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

// 從 Supabase 讀取「目前選擇的人物」的看診記錄（依日期、時間排序）
async function fetchVisitsFromSupabase() {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("visits")
    .select("*")
    .eq("person", currentPerson)
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

// 照顧者下拉選單的選項（第一個空字串代表「留白」）
const CAREGIVER_OPTIONS = ["", "甄", "瑤", "慈", "書", "沛"];

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

// 儲存在 localStorage 的 key 名稱（病歷／用藥／照顧／長照申請進度會用到）
const STORAGE_KEY = "dadCareData";

// 各分類的欄位設定：
// 每個欄位包含 key（存資料用的名稱）跟 type（編輯時要顯示哪種輸入框）
// type 可以是 "date"、"time"、"text"、"select"
// 如果是 select，要另外提供 options（選項清單）
const CONFIG = {
  medical: {
    fields: [
      { key: "date", type: "date" },
      { key: "title", type: "text" },
      { key: "note", type: "text" },
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
      { key: "note", type: "text" }, // 備註，保留空白
    ],
  },
  care: {
    fields: [
      { key: "date", type: "date" },
      { key: "content", type: "text" },
      { key: "note", type: "text" },
    ],
  },
  ltc: {
    fields: [
      { key: "item", type: "text" },
      {
        key: "status",
        type: "select",
        options: ["申請中", "審核中", "已核准", "已完成"],
      },
      { key: "date", type: "date" },
      { key: "note", type: "text" },
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
      { key: "note", type: "text" },
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
// 檢查排程（檢驗單／檢查單／放射單）的初始資料
// 只在「第一次開啟網站」時自動加入一次，之後不會重複匯入，
// 也不會蓋掉使用者自己新增／刪除／編輯過的資料
// ---------------------------------------

const EXAM_SEED_FLAG_KEY = "dadCareSeeded_exam_20260920";

// 這 5 張截圖是爸爸的資料，所以每一筆都標記 person: "dad"
const EXAM_SEED_DATA = {
  labTest: [
    { department: "泌尿科", doctor: "林孝友", validFrom: "2026-05-16", validTo: "2026-11-11", specimen: "血液", person: "dad" },
    { department: "泌尿科", doctor: "林孝友", validFrom: "2026-08-03", validTo: "2027-01-29", specimen: "血液", person: "dad" },
    { department: "內分泌科", doctor: "翁瑄甫", validFrom: "2026-08-03", validTo: "2027-01-29", specimen: "血液", person: "dad" },
    { department: "內分泌科", doctor: "翁瑄甫", validFrom: "2026-08-03", validTo: "2027-01-29", specimen: "尿液", person: "dad" },
    { department: "胸腔內科", doctor: "周百謙", validFrom: "2026-09-10", validTo: "2027-03-08", specimen: "血液", person: "dad" },
  ],
  examCheck: [
    { item: "杜卜勒彩色心臟血流圖（DOPPLER）", doctor: "蔡松航", examDatetime: "2026-09-23T15:01", location: "心臟功能室(三大樓6樓)", person: "dad" },
    { item: "超音波心臟圖（單面，雙面）超聲心動圖", doctor: "蔡松航", examDatetime: "2026-09-23T15:01", location: "心臟功能室(三大樓6樓)", person: "dad" },
  ],
  radiology: [
    { department: "胸腔內科", doctor: "周百謙", examDate: "2026-09-10", location: "", person: "dad" },
    { department: "胸腔內科", doctor: "周百謙", examDate: "2026-09-10", location: "", person: "dad" },
  ],
};

function importExamSeedDataOnce() {
  const alreadySeeded = localStorage.getItem(EXAM_SEED_FLAG_KEY);
  if (alreadySeeded) {
    return; // 已經匯入過了，不再重複
  }

  Object.keys(EXAM_SEED_DATA).forEach((category) => {
    EXAM_SEED_DATA[category].forEach((item) => {
      allData[category].push(item);
    });
  });

  saveData(allData);
  localStorage.setItem(EXAM_SEED_FLAG_KEY, "true"); // 標記已匯入
}

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
  } else {
    input = document.createElement("input");
    input.type = field.type; // date、time 或 text
    input.value = currentValue || "";
  }

  input.dataset.fieldKey = field.key; // 記住這個輸入框對應哪個欄位
  input.className = "edit-input";
  td.appendChild(input);
  return td;
}

// 目前各分類的搜尋條件（只有 visit 會用到日期起迄）
// 例如 { visit: { start: "2026-01-01", end: "2026-12-31" } }
const searchFilters = {};

// 判斷這筆資料是不是「目前選擇的人物」的資料
// 舊資料沒有標記 person 欄位，一律當作是爸爸的資料
function matchesPersonFilter(item) {
  const itemPerson = item.person || "dad";
  return itemPerson === currentPerson;
}

// 手機螢幕比較小，日期只顯示「月/日」，不顯示年份
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
  return `${pieces[1]}/${pieces[2]}`; // "2026-09-23" -> "09/23"
}

// 星期幾的中文名稱，索引對應 JavaScript 的 Date.getDay()（0 是星期日）
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

// 看診時間表用的日期格式：月/日 加上星期幾，例如 "9/23(三)"
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

  return `${month}/${day}(${weekday})`; // 不補零，例如 "9/23(三)"
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

  rows = rows.filter((row) => matchesPersonFilter(row.item)); // 只顯示目前選擇的人物的資料
  rows = rows.filter((row) => matchesSearchFilter(category, row.item)); // 看診時間表的日期起迄、照顧者篩選

  rows.forEach(({ item, index }) => {
    const tr = document.createElement("tr");

    // 一般顯示模式：每個欄位放一個純文字儲存格
    fields.forEach((field) => {
      // 看診時間表的日期欄位：顯示「月/日(星期幾)」，例如 "9/23(三)"
      const displayValue =
        category === "visit" && field.key === "date"
          ? formatDateWithWeekday(item[field.key])
          : item[field.key];
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
      delBtn.addEventListener("click", () => {
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

// 看診時間表專用的編輯模式：只能編輯「照顧者①」「照顧者②」「備註」，
// 其他欄位（日期、時間、醫院/科別、醫師）都是從 Google 行事曆同步來的，維持唯讀
function startEditVisitRow(index, tr) {
  const fields = CONFIG.visit.fields;
  const item = allData.visit[index];
  const editableKeys = ["caregiver1", "caregiver2", "note"];

  tr.innerHTML = ""; // 清空這一列，改用輸入框（或唯讀文字）重畫

  fields.forEach((field) => {
    if (editableKeys.includes(field.key)) {
      tr.appendChild(createEditCell(field, item[field.key]));
    } else {
      // 唯讀欄位：日期一樣顯示成「月/日(星期幾)」
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

  // 依欄位建立輸入框
  fields.forEach((field) => {
    tr.appendChild(createEditCell(field, item[field.key]));
  });

  // 「儲存」跟「取消」按鈕
  const actionTd = document.createElement("td");

  const saveBtn = document.createElement("button");
  saveBtn.textContent = "儲存";
  saveBtn.className = "edit-btn";
  saveBtn.addEventListener("click", () => {
    // 把每個輸入框目前的值讀出來，更新回資料裡
    const inputs = tr.querySelectorAll("[data-field-key]");
    inputs.forEach((input) => {
      item[input.dataset.fieldKey] = input.value;
    });

    saveData(allData);
    renderList(category);
  });
  actionTd.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "取消";
  cancelBtn.className = "delete-btn";
  cancelBtn.addEventListener("click", () => {
    renderList(category); // 不儲存，直接重畫回原本的資料
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
    renderList(category);
  });
  renderExamList();
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

  // 依「有效期限」由遠到近排序
  rows.sort((a, b) => {
    const dateA = getExamRefDate(a.category, a.item);
    const dateB = getExamRefDate(b.category, b.item);
    return dateB.localeCompare(dateA);
  });

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
      newItem[field.key] = formData.get(field.key) || "";
    });
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
  const searchBtn = document.getElementById("visit-search-btn");
  const clearBtn = document.getElementById("visit-search-clear-btn");

  // 保護機制：如果 index.html 版本不對、找不到搜尋列的元件，
  // 就直接跳過設定，避免整個網站的程式碼中斷、其他分頁也不能用
  if (!startInput || !endInput || !caregiverInput || !statusInput || !searchBtn || !clearBtn) {
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

  searchBtn.addEventListener("click", () => {
    searchFilters.visit = {
      start: startInput.value, // 空字串代表不限制起始日
      end: endInput.value, // 空字串代表不限制結束日
      caregiver: caregiverInput.value, // 空字串代表不限照顧者
      status: statusInput.value, // 未過期／全部／已過期
    };
    renderList("visit");
  });

  // 「顯示範圍」跟檢查排程一樣，改變下拉選單就立刻套用，不用按搜尋
  statusInput.addEventListener("change", () => {
    searchFilters.visit.status = statusInput.value;
    renderList("visit");
  });

  clearBtn.addEventListener("click", () => {
    startInput.value = "";
    caregiverInput.value = "";
    endInput.value = "";
    statusInput.value = "valid"; // 顯示範圍也一併重設回預設的「未過期」
    searchFilters.visit = { start: "", end: "", caregiver: "", status: "valid" };
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

      // 重新畫出病歷／檢查排程／照顧／長照申請進度（這些存在 localStorage，切換很快）
      renderAll();

      // 看診時間表存在 Supabase，需要重新抓「這個人」的資料
      if (supabaseClient) {
        const personName = currentPerson === "dad" ? "爸爸" : "媽媽";
        setVisitSyncStatus(`看診時間表讀取中…（${personName}）`);
        await refreshVisitList();
        setVisitSyncStatus(`✅ 看診時間表已連線 Supabase（${personName}）`);
      }
    });
  });
}

// ---------------------------------------
// 初始化：頁面載入完成後執行
// ---------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupPersonSwitcher(); // 設定爸爸／媽媽的人物切換
  setupExamFilters(); // 設定「檢查排程」的篩選區（單據類別、顯示範圍）

  Object.keys(CONFIG).forEach((category) => {
    setupForm(category);
  });

  setupVisitSearch(); // 設定看診記錄的日期搜尋功能

  importExamSeedDataOnce(); // 匯入檢驗單／檢查單／放射單的初始資料（只做一次）

  // 先把病歷／檢查排程／照顧／長照申請進度畫出來（這些存在 localStorage，讀取很快）
  renderAll();

  // 看診記錄改成連線 Supabase，需要一點時間讀取，讀取完再畫一次
  if (supabaseClient) {
    setVisitSyncStatus("看診記錄讀取中…");
    await refreshVisitList();
    setVisitSyncStatus("✅ 看診記錄已連線 Supabase（test0920 專案）");
  } else {
    setVisitSyncStatus("⚠️ Supabase 函式庫載入失敗，看診記錄暫時無法使用，請確認網路連線後重新整理頁面。");
  }
});
