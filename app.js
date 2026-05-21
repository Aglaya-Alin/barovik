import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";

// Конфигурация подхватывается из .env (через Vite или аналогичный сборщик)
const firebaseConfig = {
  apiKey: "AIzaSyCGqrrcKahUtg1UfOyjBisbc4e_vb49Rtg",
  authDomain: "proj1-f8878.firebaseapp.com",
  projectId: "proj1-f8878",
  storageBucket: "proj1-f8878.firebasestorage.app",
  messagingSenderId: "259555764950",
  appId: "1:259555764950:web:d420a9945a39745f2cf777"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const state = {
    dict: "cancer_types",
    rows: [],
    sortKey: null,
    sortDir: "asc",
    selectedId: null,
    editing: null,
    cancerTypes: [] // Кэш для связей
};

const columns = {
    cancer_types: [
        { key: "name", label: "Название рака", type: "text" },
        { key: "mortality", label: "Смертность (%)", type: "number", step: "0.01" }, // Шаг 0.01
        { key: "desc", label: "Описание", type: "textarea" }
    ],
    users: [
        { key: "name", label: "ФИО", type: "text" },
        { key: "age", label: "Возраст", type: "number", step: "1" },
        { key: "gender", label: "Пол", type: "select", options: ["m", "f"] },
        { key: "cancerIds", label: "Тип рака (FK)", type: "ref_multiple" }, // Храним ID в value
        { key: "diagDate", label: "Дата диагноза", type: "date" }
    ]
};

// --- СОРТИРОВКА ПО КОЛОНКАМ (ЧЕСТНАЯ) ---
function getSortedRows() {
    if (!state.sortKey) return state.rows;
    const colConfig = columns[state.dict].find(c => c.key === state.sortKey);

    return [...state.rows].sort((a, b) => {
        let av = a[state.sortKey];
        let bv = b[state.sortKey];

        // 1. Сортировка чисел (включая 0.01)
        if (colConfig?.type === "number") {
            const numA = parseFloat(av) || 0;
            const numB = parseFloat(bv) || 0;
            return state.sortDir === "asc" ? numA - numB : numB - numA;
        }

        // 2. Сортировка дат
        if (colConfig?.type === "date") {
            const dateA = new Date(av || 0);
            const dateB = new Date(bv || 0);
            return state.sortDir === "asc" ? dateA - dateB : dateB - dateA;
        }

        // 3. Сортировка строк (с учетом регистра и языка)
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
        return state.sortDir === "asc" ? av.localeCompare(bv, 'ru') : bv.localeCompare(av, 'ru');
    });
}

// --- ФОРМИРОВАНИЕ ПОЛЕЙ ФОРМЫ ---
async function renderFields() {
    const container = document.getElementById("formFields");
    container.innerHTML = "";
    const record = state.editing || {};

    for (const c of columns[state.dict]) {
        let control = "";
        const val = record[c.key] || "";

        if (c.type === "ref_multiple") {
            // ВАЖНО: value="${ct.id}" обеспечивает хранение ID из базы
            const options = state.cancerTypes.map(ct => 
                `<option value="${ct.id}" ${val && val.includes(ct.id) ? 'selected' : ''}>
                    ${ct.name} (ID: ${ct.id.slice(0,5)}...)
                </option>`
            ).join("");
            control = `<select name="${c.key}" multiple required>${options}</select>`;
        } 
        else if (c.type === "number") {
            // step="0.01" позволяет стрелочкам менять число на одну сотую
            control = `<input type="number" name="${c.key}" step="${c.step}" value="${val}" required>`;
        }
        else if (c.type === "textarea") {
            control = `<textarea name="${c.key}">${val}</textarea>`;
        }
        else if (c.type === "date") {
            // Календарь автоматически запрещает "невозможные" даты
            control = `<input type="date" name="${c.key}" value="${val}" required>`;
        }
        else if (c.type === "select") {
            const opts = c.options.map(o => `<option value="${o}" ${o === val ? 'selected' : ''}>${o === 'm' ? 'Мужской' : 'Женский'}</option>`).join("");
            control = `<select name="${c.key}">${opts}</select>`;
        }
        else {
            control = `<input type="text" name="${c.key}" value="${val}" required>`;
        }

        container.innerHTML += `<div class="field"><label>${c.label}</label>${control}</div>`;
    }
}

// --- СОХРАНЕНИЕ ДАННЫХ ---
document.getElementById("recordForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {};

    columns[state.dict].forEach(c => {
        if (c.type === "ref_multiple") {
            data[c.key] = fd.getAll(c.key); // Сохраняем массив ID
        } else if (c.type === "number") {
            data[c.key] = parseFloat(fd.get(c.key)); // Сохраняем как действительное число
        } else {
            data[c.key] = fd.get(c.key);
        }
    });

    try {
        if (state.editing) {
            await updateDoc(doc(db, state.dict, state.editing.id), data);
        } else {
            await addDoc(collection(db, state.dict), data);
        }
        document.getElementById("recordDialog").close();
        refreshAll();
    } catch (err) { alert("Ошибка: " + err.message); }
};

// --- ФУНКЦИИ ОБНОВЛЕНИЯ И ТАБЛИЦЫ ---

async function refreshAll() {
    // Подгружаем кэш типов рака для выпадающих списков
    const ctSnap = await getDocs(collection(db, "cancer_types"));
    state.cancerTypes = ctSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Подгружаем данные текущего справочника
    const snap = await getDocs(collection(db, state.dict));
    state.rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    renderTable();
}

function renderTable() {
    const wrap = document.getElementById("tableWrap");
    const cols = columns[state.dict];
    const rows = getSortedRows();

    if (rows.length === 0) {
        wrap.innerHTML = `<div class="empty-state">Нет данных</div>`;
        return;
    }

    let html = `<table><thead><tr>`;
    cols.forEach(c => {
        const arrow = state.sortKey === c.key ? (state.sortDir === "asc" ? " ▴" : " ▾") : "";
        html += `<th onclick="window.handleSort('${c.key}')">${c.label}${arrow}</th>`;
    });
    html += `</tr></thead><tbody>`;

    rows.forEach(row => {
        const isSelected = row.id === state.selectedId ? "class='selected'" : "";
        html += `<tr ${isSelected} onclick="window.handleRowClick('${row.id}')">`;
        cols.forEach(c => {
            let val = row[c.key];
            if (c.type === "date") val = val ? new Date(val).toLocaleDateString("ru-RU") : "—";
            if (c.type === "ref_multiple") {
                // Ищем имя в кэше по ID. Если два рака называются одинаково, ID их разделит.
                val = (val || []).map(id => state.cancerTypes.find(ct => ct.id === id)?.name || "—").join(", ");
            }
            if (c.key === "mortality" && val !== undefined) val = parseFloat(val).toFixed(2);
            html += `<td>${val || "—"}</td>`;
        });
        html += `</tr>`;
    });
    wrap.innerHTML = html + `</tbody></table>`;
}

// Глобальные хендлеры
window.handleSort = (key) => {
    state.sortDir = (state.sortKey === key && state.sortDir === "asc") ? "desc" : "asc";
    state.sortKey = key;
    renderTable();
};

window.handleRowClick = (id) => {
    state.selectedId = id;
    renderTable();
};

// ... (остальные кнопки addBtn, editBtn, deleteBtn подключаются как раньше)
document.getElementById("dictionarySelect").onchange = (e) => {
    state.dict = e.target.value;
    state.selectedId = null;
    refreshAll();
};

refreshAll();