// ========================================
// 爸爸的照顧網站 - script.js
// 所有資料都存在瀏覽器的 localStorage 裡
// ========================================

// 儲存在 localStorage 的 key 名稱
const STORAGE_KEY = "dadCareData";

// 六個區塊的設定：
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
    fields: [
      { key: "date", type: "date" },
      { key: "time", type: "time" },
      { key: "hospital", type: "text" },
      { key: "doctor", type: "text" },
      { key: "companion", type: "text" }, // 陪同者，可以留白，可重複編輯
      { key: "note", type: "text" },
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
// 讀取 / 儲存資料的小工具
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
let allData = loadData();

// ---------------------------------------
// 從 Google 行事曆匯入的看診資料
// 只在「第一次開啟網站」時自動加入一次，
// 之後不會重複匯入，也不會蓋掉您自己新增或刪除的資料
// ---------------------------------------

const SEED_FLAG_KEY = "dadCareSeeded_visit_20260920";

const SEED_DATA = {
  visit: [
    {
      date: "2026-10-12",
      time: "10:30",
      hospital: "耳鼻喉科（聽力檢測）",
      doctor: "",
      companion: "",
      note: "聽力檢測2（第二次）｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
    {
      date: "2026-11-26",
      time: "10:00",
      hospital: "神經內科",
      doctor: "",
      companion: "",
      note: "門診看診（41號）｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
  ],
};

// 執行匯入：只做一次
function importSeedDataOnce() {
  const alreadySeeded = localStorage.getItem(SEED_FLAG_KEY);
  if (alreadySeeded) {
    return; // 已經匯入過了，不再重複
  }

  Object.keys(SEED_DATA).forEach((category) => {
    SEED_DATA[category].forEach((item) => {
      allData[category].push(item);
    });
  });

  saveData(allData);
  localStorage.setItem(SEED_FLAG_KEY, "true"); // 標記已匯入
}

// ---------------------------------------
// 第二批匯入：住院準備、手術、出院、長照評估
// 原本規劃放在「開刀時間表」分頁，但該分頁已移除，
// 統一併入「看診記錄」分頁
// ---------------------------------------

const SEED_FLAG_KEY_2 = "dadCareSeeded_visit_20260920_v2";

const SEED_DATA_2 = {
  visit: [
    {
      date: "2026-09-23",
      time: "15:00",
      hospital: "臺北醫學大學附設醫院（北醫）",
      doctor: "",
      companion: "",
      note: "住院準備｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
    {
      date: "2026-09-24",
      time: "10:00",
      hospital: "臺北醫學大學附設醫院（北醫）",
      doctor: "",
      companion: "",
      note: "鎖骨手術｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
    {
      date: "2026-09-25",
      time: "10:00",
      hospital: "臺北醫學大學附設醫院（北醫）",
      doctor: "",
      companion: "",
      note: "出院｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
    {
      date: "2026-09-30",
      time: "09:30",
      hospital: "長照評估",
      doctor: "",
      companion: "",
      note: "長照2.0評估｜自 Google 行事曆（potong.shih@gmail.com）自動匯入",
    },
  ],
};

// 執行第二批匯入：只做一次
function importSeedDataOnce2() {
  const alreadySeeded = localStorage.getItem(SEED_FLAG_KEY_2);
  if (alreadySeeded) {
    return; // 已經匯入過了，不再重複
  }

  Object.keys(SEED_DATA_2).forEach((category) => {
    SEED_DATA_2[category].forEach((item) => {
      allData[category].push(item);
    });
  });

  saveData(allData);
  localStorage.setItem(SEED_FLAG_KEY_2, "true"); // 標記已匯入
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

// 依照分類，把資料重新畫到畫面上
function renderList(category) {
  const tbody = document.getElementById(category + "-list");
  tbody.innerHTML = ""; // 先清空

  const items = allData[category];
  const fields = CONFIG[category].fields;

  items.forEach((item, index) => {
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
      startEdit(category, index);
    });
    actionTd.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "刪除";
    delBtn.className = "delete-btn";
    delBtn.addEventListener("click", () => {
      // 從陣列中移除這一筆資料，並存回 localStorage
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
function startEdit(category, index) {
  const tbody = document.getElementById(category + "-list");
  const fields = CONFIG[category].fields;
  const item = allData[category][index];

  // 找到第 index 列（表格列的順序跟資料陣列順序一致）
  const tr = tbody.children[index];
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
    renderList(category);
  });
}

// ---------------------------------------
// 表單送出：新增一筆資料
// ---------------------------------------

function setupForm(category) {
  const form = document.getElementById(category + "-form");

  form.addEventListener("submit", (event) => {
    event.preventDefault(); // 防止表單重新整理頁面

    const formData = new FormData(form);
    const newItem = {};

    // 把表單裡每個欄位的值抓出來，存成一個物件
    CONFIG[category].fields.forEach((field) => {
      newItem[field.key] = formData.get(field.key) || "";
    });

    allData[category].push(newItem);
    saveData(allData);
    renderList(category);

    form.reset(); // 清空表單，方便繼續新增下一筆
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

document.addEventListener("DOMContentLoaded", () => {
  setupTabs();

  Object.keys(CONFIG).forEach((category) => {
    setupForm(category);
  });

  importSeedDataOnce(); // 匯入從行事曆抓來的看診資料（只做一次）
  importSeedDataOnce2(); // 匯入住院準備／手術／出院／長照評估（只做一次）
  renderAll();
});
