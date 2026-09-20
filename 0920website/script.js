// ========================================
// 爸爸的照顧網站 - script.js
// 病歷／用藥／照顧／長照申請進度：存在瀏覽器的 localStorage 裡
// 看診記錄：改成連線 Supabase 資料庫（test0920 專案），
//           這樣換一台電腦打開網站，看診記錄也會是最新的
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
// caregiver1、caregiver2、note、id
// 網頁表單／表格用的欄位名稱：date、time、hospital、doctor、
// caregiver1、caregiver2、note

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
  };
}

// 從 Supabase 讀取全部看診記錄（依日期、時間排序）
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

// 照顧者下拉選單的選項（第一個空字串代表「留白」）
const CAREGIVER_OPTIONS = ["", "甄", "瑤", "慈", "書", "沛"];

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
  medicine: {
    fields: [
      { key: "name", type: "text" },
      { key: "dose", type: "text" },
      { key: "time", type: "text" },
      { key: "note", type: "text" },
    ],
  },
  visit: {
    // 這個分類的資料不是存在 localStorage，而是存在 Supabase
    fields: [
      { key: "date", type: "date" },
      { key: "time", type: "time" },
      { key: "hospital", type: "text" },
      { key: "doctor", type: "text" },
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

// 判斷這筆資料是否符合搜尋條件（目前只檢查日期起迄）
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
  return true;
}

// 依照分類，把資料重新畫到畫面上
function renderList(category) {
  const tbody = document.getElementById(category + "-list");
  tbody.innerHTML = ""; // 先清空

  const items = allData[category];
  const fields = CONFIG[category].fields;

  items.forEach((item, index) => {
    // 不符合搜尋條件的資料就跳過，不畫出來
    // （index 還是用完整陣列的順序，所以編輯／刪除不會抓錯資料）
    if (!matchesSearchFilter(category, item)) {
      return;
    }

    const tr = document.createElement("tr");

    // 一般顯示模式：每個欄位放一個純文字儲存格
    fields.forEach((field) => {
      tr.appendChild(createDisplayCell(item[field.key]));
    });

    // 最後一格放「編輯」跟「刪除」按鈕
    const actionTd = document.createElement("td");

    const editBtn = document.createElement("button");
    editBtn.textContent = "編輯";
    editBtn.className = "edit-btn";
    editBtn.addEventListener("click", () => {
      startEdit(category, index, tr);
    });
    actionTd.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "刪除";
    delBtn.className = "delete-btn";
    delBtn.addEventListener("click", async () => {
      if (category === "visit") {
        // 看診記錄：從 Supabase 刪除
        if (!supabaseClient) {
          alert("目前無法連線到 Supabase，請確認網路連線後再試一次。");
          return;
        }
        const { error } = await supabaseClient
          .from("visits")
          .delete()
          .eq("id", item.id);
        if (error) {
          console.error("刪除看診記錄失敗：", error);
          alert("刪除看診記錄失敗，請稍後再試。");
          return;
        }
        await refreshVisitList();
        return;
      }

      // 其他分類：從陣列中移除這一筆資料，並存回 localStorage
      allData[category].splice(index, 1);
      saveData(allData);
      renderList(category);
    });
    actionTd.appendChild(delBtn);

    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

// 把某一列切換成「編輯模式」
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
  saveBtn.addEventListener("click", async () => {
    // 把每個輸入框目前的值讀出來，更新回資料裡
    const inputs = tr.querySelectorAll("[data-field-key]");
    inputs.forEach((input) => {
      item[input.dataset.fieldKey] = input.value;
    });

    if (category === "visit") {
      // 看診記錄：更新到 Supabase
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
    renderList(category); // 不儲存，直接重畫回原本的資料
  });
  actionTd.appendChild(cancelBtn);

  tr.appendChild(actionTd);
}

// 畫面一開始載入時，把每個區塊全部畫出來
function renderAll() {
  Object.keys(CONFIG).forEach((category) => {
    renderList(category);
  });
}

// ---------------------------------------
// 表單送出：新增一筆資料
// ---------------------------------------

function setupForm(category) {
  const form = document.getElementById(category + "-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // 防止表單重新整理頁面

    const formData = new FormData(form);
    const newItem = {};

    // 把表單裡每個欄位的值抓出來，存成一個物件
    CONFIG[category].fields.forEach((field) => {
      newItem[field.key] = formData.get(field.key) || "";
    });

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
  const searchBtn = document.getElementById("visit-search-btn");
  const clearBtn = document.getElementById("visit-search-clear-btn");

  // 保護機制：如果 index.html 版本不對、找不到搜尋列的元件，
  // 就直接跳過設定，避免整個網站的程式碼中斷、其他分頁也不能用
  if (!startInput || !endInput || !caregiverInput || !searchBtn || !clearBtn) {
    console.warn("找不到看診記錄的搜尋列元件，已略過搜尋功能設定。");
    return;
  }

  searchBtn.addEventListener("click", () => {
    searchFilters.visit = {
      start: startInput.value, // 空字串代表不限制起始日
      end: endInput.value, // 空字串代表不限制結束日
      caregiver: caregiverInput.value, // 空字串代表不限照顧者
    };
    renderList("visit");
  });

  clearBtn.addEventListener("click", () => {
    delete searchFilters.visit; // 取消篩選，顯示全部
    startInput.value = "";
    caregiverInput.value = "";
    endInput.value = "";
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

// ---------------------------------------
// 初始化：頁面載入完成後執行
// ---------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();

  Object.keys(CONFIG).forEach((category) => {
    setupForm(category);
  });

  setupVisitSearch(); // 設定看診記錄的日期搜尋功能

  // 先把病歷／用藥／照顧／長照申請進度畫出來（這些存在 localStorage，讀取很快）
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
